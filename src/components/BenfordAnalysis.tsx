import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { analyzeWithFlash, hasApiKey } from '@/lib/geminiClient';
import { Download, Loader2, BarChart3, Calculator, Coins } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface BenfordResult {
  digit: number;
  actualCount: number;
  actualPercent: number;
  benfordPercent: number;
  difference: number;
}

interface BenfordAnalysisProps {
  accountData: LedgerRow[];
  accountName: string;
  amountColumns: string[];
}

const cleanAmount = (val: any) => 
  typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) || 0 : 
  typeof val === 'number' ? val : 0;

export const BenfordAnalysis: React.FC<BenfordAnalysisProps> = ({ 
  accountData, 
  accountName, 
  amountColumns 
}) => {
  const { toast } = useToast();
  const [selectedColumn, setSelectedColumn] = useState<string>(amountColumns[0] || '');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [benfordResults, setBenfordResults] = useState<BenfordResult[] | null>(null);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [sourceData, setSourceData] = useState<LedgerRow[]>([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [linePoints, setLinePoints] = useState<string>('');
  const [totalCost, setTotalCost] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);

  const detailTransactions = useMemo(() => {
    if (!selectedDigit || !selectedColumn) return [];
    return sourceData.filter(row => {
      const amount = cleanAmount(row[selectedColumn]);
      if (amount <= 0) return false;
      const firstDigit = parseInt(String(amount)[0], 10);
      return firstDigit === selectedDigit;
    });
  }, [selectedDigit, selectedColumn, sourceData]);

  // Calculate line points for Benford distribution
  useEffect(() => {
    const calculatePoints = () => {
      if (!benfordResults || !chartContainerRef.current) {
        setLinePoints('');
        return;
      }

      const container = chartContainerRef.current;
      const containerWidth = container.offsetWidth;
      const containerHeight = container.offsetHeight;
      const columnWidth = containerWidth / 9;
      const barAreaHeight = containerHeight - 20; // Subtract space for digit labels

      const points = benfordResults.map((res, idx) => {
        const x = (idx + 0.5) * columnWidth;
        const y = containerHeight - (res.benfordPercent / 35) * barAreaHeight;
        return `${x},${y}`;
      }).join(' ');

      setLinePoints(points);
    };

    calculatePoints();

    // Recalculate on window resize
    window.addEventListener('resize', calculatePoints);
    return () => window.removeEventListener('resize', calculatePoints);
  }, [benfordResults]);

  // 예상 비용 계산
  const calculateEstimate = (): number => {
    if (!accountData || accountData.length === 0) {
      setEstimatedCost(null);
      return 0;
    }

    // 벤포트 분석 프롬프트 크기 추정
    const promptTemplate = `
# 벤포드 법칙 분석 결과

## 계정 정보
- 계정과목: ${accountName}
- 금액 기준열: ${selectedColumn}
- 총 데이터 수: ${accountData.length.toLocaleString()}건

## 첫째 자리 수 분포

| 첫째 자리 | 실제 건수 | 실제 분포(%) | 벤포드 분포(%) | 차이(%) |
|----------|----------|-------------|---------------|---------|
[분포 데이터]

## 요구사항
당신은 숙련된 회계 감사인입니다. 위 벤포드 법칙 분석 결과를 검토하고 다음을 제공해주세요:

1. **전반적 평가**: 실제 분포가 벤포드 법칙에 얼마나 부합하는지 평가
2. **특이사항**: 차이가 5% 이상인 수가 있다면, 그 의미와 잠재적 위험 분석
3. **권고사항**: 추가 조사가 필요한 영역이나 주의해야 할 점

한국어로 답변하고, 마크다운 형식으로 작성해주세요.
금액은 천 단위 구분 기호(,)를 사용해주세요.
`;

    // 실제 프롬프트 크기 추정 (계정명, 열명, 데이터 수 포함)
    const charCount = promptTemplate.length + accountName.length + selectedColumn.length + String(accountData.length).length + 500;
    const tokenCount = charCount / 3;
    
    // Gemini Flash 모델 가격 (2024년 기준)
    // Input: $0.075 per 1M tokens
    // Output: $0.30 per 1M tokens (평균 1000 토큰 출력 가정)
    const inputCostUSD = (tokenCount / 1000000) * 0.075;
    const outputCostUSD = (1000 / 1000000) * 0.30;
    const totalUSD = inputCostUSD + outputCostUSD;
    const totalKRW = totalUSD * 1400; // USD to KRW 환율 (1400원 가정)

    const cost = Number(totalKRW.toFixed(2));
    setEstimatedCost(cost);
    return cost;
  };

  const handleAnalysis = async () => {
    if (!selectedColumn) {
      toast({
        title: '오류',
        description: '금액 열을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setBenfordResults(null);
    setAiInsight('');

    try {
      // 1. Extract first digits
      const firstDigits = accountData
        .map(row => cleanAmount(row[selectedColumn]))
        .filter(amount => amount > 0)
        .map(amount => parseInt(String(amount)[0], 10));

      const totalCount = firstDigits.length;

      if (totalCount < 50) {
        toast({
          title: '경고',
          description: '데이터가 50개 미만입니다. 분석 결과의 신뢰도가 낮을 수 있습니다.',
          variant: 'destructive',
        });
      }

      // 2. Calculate distribution
      const counts = new Array(10).fill(0);
      firstDigits.forEach(digit => {
        if (digit >= 1 && digit <= 9) {
          counts[digit]++;
        }
      });

      const benfordPercents = [0, 30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
      const results: BenfordResult[] = [];
      
      for (let i = 1; i <= 9; i++) {
        const actualPercent = totalCount > 0 ? (counts[i] / totalCount) * 100 : 0;
        results.push({
          digit: i,
          actualCount: counts[i],
          actualPercent: parseFloat(actualPercent.toFixed(1)),
          benfordPercent: benfordPercents[i],
          difference: parseFloat((actualPercent - benfordPercents[i]).toFixed(1)),
        });
      }

      setBenfordResults(results);
      setSourceData(accountData);

      // 3. Get AI Analysis
      if (!hasApiKey()) {
        toast({
          title: 'API Key 필요',
          description: 'AI 분석을 위해 Google Gemini API Key를 설정해주세요.',
          variant: 'destructive',
        });
        return;
      }
      
      const prompt = `
# 벤포드 법칙 분석 결과

## 계정 정보
- 계정과목: ${accountName}
- 금액 기준열: ${selectedColumn}
- 총 데이터 수: ${totalCount.toLocaleString()}건

## 첫째 자리 수 분포

| 첫째 자리 | 실제 건수 | 실제 분포(%) | 벤포드 분포(%) | 차이(%) |
|----------|----------|-------------|---------------|---------|
${results.map(r => `| ${r.digit} | ${r.actualCount.toLocaleString()} | ${r.actualPercent.toFixed(1)} | ${r.benfordPercent.toFixed(1)} | ${r.difference > 0 ? '+' : ''}${r.difference.toFixed(1)} |`).join('\n')}

## 요구사항
당신은 숙련된 회계 감사인입니다. 위 벤포드 법칙 분석 결과를 검토하고 다음을 제공해주세요:

1. **전반적 평가**: 실제 분포가 벤포드 법칙에 얼마나 부합하는지 평가
2. **특이사항**: 차이가 5% 이상인 수가 있다면, 그 의미와 잠재적 위험 분석
3. **권고사항**: 추가 조사가 필요한 영역이나 주의해야 할 점

한국어로 답변하고, 마크다운 형식으로 작성해주세요.
금액은 천 단위 구분 기호(,)를 사용해주세요.
`;

      const analysis = await analyzeWithFlash(prompt);
      setAiInsight(analysis);
      
      // 비용 계산 및 누적
      const promptCharCount = prompt.length;
      const tokenCount = promptCharCount / 3;
      const inputCostUSD = (tokenCount / 1000000) * 0.075;
      const outputCostUSD = (1000 / 1000000) * 0.30; // 평균 출력 1000 토큰 가정
      const totalUSD = inputCostUSD + outputCostUSD;
      const totalKRW = totalUSD * 1400;
      const actualCost = Number(totalKRW.toFixed(2));
      setTotalCost(prev => prev + actualCost);

    } catch (err: any) {
      toast({
        title: '오류',
        description: `벤포드 분석 중 오류: ${err.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = async () => {
    if (!benfordResults) return;

    try {
      // ExcelJS를 사용하여 워크북 생성
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('벤포드 분석');

      // 헤더 정보
      worksheet.getCell('A1').value = '분석 계정과목:';
      worksheet.getCell('B1').value = accountName;
      worksheet.getCell('A2').value = '금액 기준열:';
      worksheet.getCell('B2').value = selectedColumn;

      // 데이터 테이블
      worksheet.getCell('A4').value = '벤포드 법칙 분석 결과';
      worksheet.getRow(5).values = ['첫째 자리 수', '실제 건수', '실제 분포 (%)', '벤포드 분포 (%)', '차이 (%)'];
      worksheet.getRow(5).font = { bold: true };

      benfordResults.forEach((res, idx) => {
        const row = worksheet.getRow(6 + idx);
        row.values = [
        res.digit,
        res.actualCount,
        res.actualPercent,
        res.benfordPercent,
        res.difference
        ];
        // 차이가 5% 이상인 경우 빨간색으로 표시
        if (Math.abs(res.difference) > 5) {
          row.getCell(5).font = { color: { argb: 'FFFF0000' }, bold: true };
        }
      });

      // 차트를 이미지로 변환하여 엑셀에 삽입
      const dataEndRow = 6 + benfordResults.length;
      let lastContentRow = dataEndRow + 2; // 이미지 없을 때 AI 시작 기준

      if (chartWrapperRef.current) {
        try {
          const canvas = await html2canvas(chartWrapperRef.current, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
          });

          // Canvas를 base64 이미지로 변환
          const imageBase64 = canvas.toDataURL('image/png');
          const imageId = workbook.addImage({
            base64: imageBase64,
            extension: 'png',
          });

          // 이미지를 삽입할 위치 계산 (데이터 테이블 아래)
          const imageStartRow = dataEndRow + 3;

          // 이미지 삽입
          worksheet.addImage(imageId, {
            tl: { col: 0, row: imageStartRow },
            ext: { width: 800, height: 400 },
          });
          // 이미지가 차지하는 행 아래에 AI 의견 배치 (겹침 방지)
          lastContentRow = imageStartRow + 28;
        } catch (imageError) {
          console.warn('차트 이미지 변환 실패:', imageError);
        }
      }

      // AI 감사인 의견 항상 추가 (차트 아래에 배치)
      const aiStartRow = lastContentRow + 2;
      worksheet.getCell(`A${aiStartRow}`).value = 'AI 감사인 의견';
      worksheet.getCell(`A${aiStartRow}`).font = { bold: true, size: 12 };

      const aiContent = aiInsight && aiInsight.trim()
        ? aiInsight.trim()
        : '(AI 분석을 실행한 후 다운로드하면 의견이 포함됩니다. 벤포드 분석 실행 후 "AI 감사인 의견 요청"을 눌러주세요.)';
      const aiLines = aiContent.split('\n');
      aiLines.forEach((line, idx) => {
        const rowNum = aiStartRow + 1 + idx;
        const row = worksheet.getRow(rowNum);
        row.getCell(1).value = line || ' ';
        worksheet.mergeCells(`A${rowNum}:E${rowNum}`);
      });

      // 열 너비 설정
      worksheet.columns = [
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
      ];

      // 파일 다운로드
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `벤포드_분석_${accountName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    toast({
      title: '다운로드 완료',
      description: '분석 결과, 그래프, AI 감사인 의견을 엑셀 파일로 저장했습니다.',
    });
    } catch (error: any) {
      console.error('엑셀 다운로드 오류:', error);
      toast({
        title: '오류',
        description: `다운로드 실패: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const handleShowDetail = (digit: number) => {
    setSelectedDigit(digit);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>벤포드 법칙 분석 설정</CardTitle>
              <CardDescription>
                금액 데이터의 첫 자리 수 분포를 분석하여 이상 징후를 탐지합니다.
              </CardDescription>
            </div>
            {totalCost > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full border text-sm font-medium">
                <Coins className="w-4 h-4 text-amber-500" />
                <span>누적 AI 사용료: <span className="font-bold">₩{totalCost.toFixed(2)}</span></span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">금액 기준열</label>
            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
              <SelectTrigger>
                <SelectValue placeholder="열 선택" />
              </SelectTrigger>
              <SelectContent>
                {amountColumns.map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleAnalysis} 
              disabled={isAnalyzing || !selectedColumn}
              className="flex-1"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  분석 시작
                </>
              )}
            </Button>
            <Button 
              variant="outline"
              onClick={calculateEstimate}
              disabled={!selectedColumn || accountData.length === 0}
            >
              <Calculator className="mr-2 h-4 w-4" />
              예상 비용 확인
            </Button>
          </div>

          {estimatedCost !== null && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                예상 비용: 약 <span className="font-semibold text-foreground">₩{estimatedCost.toFixed(2)}</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {benfordResults && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>분석 결과</CardTitle>
                <CardDescription>
                  실제 분포와 벤포드 이론 분포의 비교
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                엑셀 다운로드
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Chart Visualization */}
            <div ref={chartWrapperRef} className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span>실제 분포</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                  <span>벤포드 분포</span>
                </div>
              </div>
              
              <div className="relative" style={{ height: '320px' }}>
                {/* Bar chart container */}
                <div ref={chartContainerRef} className="grid grid-cols-9 gap-2 h-full relative">
                  {benfordResults.map((res, idx) => {
                    // 컬러 팔레트 (1~9에 대해 다양한 컬러)
                    const colors = [
                      '#3b82f6', // 1 - blue
                      '#10b981', // 2 - green
                      '#f59e0b', // 3 - amber
                      '#ef4444', // 4 - red
                      '#8b5cf6', // 5 - purple
                      '#06b6d4', // 6 - cyan
                      '#ec4899', // 7 - pink
                      '#14b8a6', // 8 - teal
                      '#f97316', // 9 - orange
                    ];
                    const barColor = colors[res.digit - 1];
                    
                    return (
                      <div key={res.digit} className="flex flex-col items-center justify-end gap-1 relative">
                        <div className="flex-1 flex flex-col justify-end w-full relative">
                          {/* Actual distribution bar */}
                          <div 
                            className="rounded-t w-full transition-all hover:opacity-80 cursor-pointer shadow-sm"
                            style={{ 
                              height: `${(res.actualPercent / 35) * 100}%`,
                              backgroundColor: barColor
                            }}
                            title={`실제: ${res.actualPercent}%`}
                            onClick={() => handleShowDetail(res.digit)}
                          />
                          
                          {/* Benford point indicator (absolute positioned above the bar) */}
                          <div
                            className="absolute w-full flex justify-center"
                            style={{
                              bottom: `${(res.benfordPercent / 35) * 100}%`,
                            }}
                          >
                            <div
                              className="w-3 h-3 rounded-full border-2 border-white shadow-md z-10 relative"
                              style={{
                                backgroundColor: '#f97316',
                                transform: 'translateY(50%)',
                              }}
                              title={`벤포드: ${res.benfordPercent}%`}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-medium">{res.digit}</span>
                      </div>
                    );
                  })}
                </div>
                
                {/* SVG overlay for connecting line */}
                {linePoints && (
                  <svg 
                    className="absolute inset-0 w-full h-full pointer-events-none" 
                    style={{ zIndex: 5 }}
                  >
                    <polyline
                      points={linePoints}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.8"
                    />
                  </svg>
                )}
              </div>
            </div>

            {/* Data Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>첫째 자리</TableHead>
                    <TableHead className="text-right">실제 건수</TableHead>
                    <TableHead className="text-right">실제 분포 (%)</TableHead>
                    <TableHead className="text-right">벤포드 분포 (%)</TableHead>
                    <TableHead className="text-right">차이 (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {benfordResults.map(res => (
                    <TableRow 
                      key={res.digit}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleShowDetail(res.digit)}
                    >
                      <TableCell className="font-medium">{res.digit}</TableCell>
                      <TableCell className="text-right">{res.actualCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{res.actualPercent.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{res.benfordPercent.toFixed(1)}</TableCell>
                      <TableCell 
                        className="text-right font-medium"
                        style={{ color: Math.abs(res.difference) > 5 ? 'var(--destructive)' : 'inherit' }}
                      >
                        {res.difference > 0 ? '+' : ''}{res.difference.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* AI Insight */}
            {aiInsight && (
              <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="text-lg">AI 감사인 의견</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm">{aiInsight}</div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              첫째 자리 {selectedDigit}번 상세 내역 ({detailTransactions.length}건)
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {detailTransactions.length > 0 && 
                    Object.keys(detailTransactions[0]).map(key => (
                      <TableHead key={key}>{key}</TableHead>
                    ))
                  }
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailTransactions.slice(0, 100).map((row, idx) => (
                  <TableRow key={idx}>
                    {Object.values(row).map((val, j) => (
                      <TableCell key={j}>
                        {val instanceof Date ? val.toLocaleDateString() : String(val ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {detailTransactions.length > 100 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                상위 100건만 표시됩니다.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { analyzeWithFlash, hasApiKey } from '@/lib/geminiClient';
import { Download, Loader2, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';

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

  const detailTransactions = useMemo(() => {
    if (!selectedDigit || !selectedColumn) return [];
    return sourceData.filter(row => {
      const amount = cleanAmount(row[selectedColumn]);
      if (amount <= 0) return false;
      const firstDigit = parseInt(String(amount)[0], 10);
      return firstDigit === selectedDigit;
    });
  }, [selectedDigit, selectedColumn, sourceData]);

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

  const handleDownload = () => {
    if (!benfordResults) return;

    const wb = XLSX.utils.book_new();
    const wsData: (string | number)[][] = [
      ['분석 계정과목:', accountName],
      ['금액 기준열:', selectedColumn],
      [],
      ['벤포드 법칙 분석 결과'],
      ['첫째 자리 수', '실제 건수', '실제 분포 (%)', '벤포드 분포 (%)', '차이 (%)']
    ];

    benfordResults.forEach(res => {
      wsData.push([
        res.digit,
        res.actualCount,
        res.actualPercent,
        res.benfordPercent,
        res.difference
      ]);
    });

    if (aiInsight) {
      wsData.push([]);
      wsData.push(['AI 감사인 의견']);
      const aiLines = aiInsight.split('\n');
      aiLines.forEach(line => {
        wsData.push([line || ' ']);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, '벤포드 분석');
    XLSX.writeFile(wb, `벤포드_분석_${accountName}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '분석 결과를 엑셀 파일로 저장했습니다.',
    });
  };

  const handleShowDetail = (digit: number) => {
    setSelectedDigit(digit);
    setIsDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>벤포드 법칙 분석 설정</CardTitle>
          <CardDescription>
            금액 데이터의 첫 자리 수 분포를 분석하여 이상 징후를 탐지합니다.
          </CardDescription>
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

          <Button 
            onClick={handleAnalysis} 
            disabled={isAnalyzing || !selectedColumn}
            className="w-full"
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
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-primary rounded"></div>
                  <span>실제 분포</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-muted rounded"></div>
                  <span>벤포드 분포</span>
                </div>
              </div>
              
              <div className="grid grid-cols-9 gap-2 h-64">
                {benfordResults.map(res => (
                  <div key={res.digit} className="flex flex-col items-center justify-end gap-1">
                    <div className="flex-1 flex flex-col justify-end gap-1 w-full">
                      <div 
                        className="bg-primary rounded-t w-full transition-all hover:opacity-80 cursor-pointer"
                        style={{ height: `${(res.actualPercent / 35) * 100}%` }}
                        title={`실제: ${res.actualPercent}%`}
                        onClick={() => handleShowDetail(res.digit)}
                      />
                      <div 
                        className="bg-muted rounded-t w-full"
                        style={{ height: `${(res.benfordPercent / 35) * 100}%` }}
                        title={`벤포드: ${res.benfordPercent}%`}
                      />
                    </div>
                    <span className="text-xs font-medium">{res.digit}</span>
                  </div>
                ))}
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

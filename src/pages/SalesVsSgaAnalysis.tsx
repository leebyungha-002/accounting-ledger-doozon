import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TrendingUp, Download, Sparkles, Loader2, DollarSign } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { analyzeWithFlash, hasApiKey, estimateTokens, estimateCost } from '@/lib/geminiClient';
import { getUsageSummary, type UsageSummary } from '@/lib/usageTracker';
import { 
  getSalesVsSgaMonthlySummary, 
  convertLedgerRowToTransaction,
  Transaction,
  formatCurrency
} from '@/lib/accountHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface SalesVsSgaAnalysisProps {
  workbook: XLSX.WorkBook;
  accountNames: string[];
  onBack: () => void;
}

const cleanAmount = (val: any): number => {
  if (typeof val === 'string') {
    return parseFloat(val.replace(/,/g, '')) || 0;
  }
  return typeof val === 'number' ? val : 0;
};

const robustFindHeader = (headers: string[], keywords: string[]): string | undefined => {
  for (const h of headers) {
    const cleanedHeader = (h || "").toLowerCase().replace(/\s/g, '').replace(/^\d+[_.-]?/, '');
    for (const kw of keywords) {
      const cleanedKw = kw.toLowerCase().replace(/\s/g, '');
      if (cleanedHeader === cleanedKw) {
        return h;
      }
    }
  }
  return headers.find(h => {
    const cleanedHeader = (h || "").toLowerCase().replace(/\s/g, '').replace(/^\d+[_.-]?/, '');
    return keywords.some(kw => {
      const cleanedKw = kw.toLowerCase().replace(/\s/g, '');
      return cleanedHeader.includes(cleanedKw);
    });
  });
};

const parseDate = (value: any): Date | null => {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.match(/^(?<month>\d{1,2})[-/](?<day>\d{1,2})$/);
    if (match && match.groups) {
      const currentYear = new Date().getFullYear();
      const month = parseInt(match.groups.month, 10) - 1;
      const day = parseInt(match.groups.day, 10);
      const d = new Date(currentYear, month, day);
      if (d.getFullYear() === currentYear && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
    // YYYY-MM-DD 형식 시도
    const dateObj = new Date(value);
    if (!isNaN(dateObj.getTime())) {
      return dateObj;
    }
  }
  if (typeof value === 'number' && value > 1 && value < 50000) {
    try {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) return date;
    } catch (e) { /* ignore */ }
  }
  return null;
};

const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[] } => {
  if (!worksheet) return { data: [], headers: [] };
  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet);
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  return { data: rawData, headers };
};

export const SalesVsSgaAnalysis: React.FC<SalesVsSgaAnalysisProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [showCostDialog, setShowCostDialog] = useState<boolean>(false);
  const [usageSummary, setUsageSummary] = useState<UsageSummary>(getUsageSummary());

  // 모든 시트에서 거래 데이터 수집
  const allTransactions = useMemo(() => {
    const transactions: Transaction[] = [];

    accountNames.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data: rows, headers } = getDataFromSheet(sheet);

      const dateHeader = robustFindHeader(headers, ['일자', '날짜', '거래일', 'date']) ||
                         headers.find(h => h.includes('일자') || h.includes('날짜'));
      const debitHeader = robustFindHeader(headers, ['차변', 'debit', '차변금액']) ||
                          headers.find(h => h.includes('차변'));
      const creditHeader = robustFindHeader(headers, ['대변', 'credit', '대변금액']) ||
                           headers.find(h => h.includes('대변'));
      const descriptionHeader = robustFindHeader(headers, ['적요', '내용', '설명', 'description', 'memo']) ||
                                headers.find(h => h.includes('적요') || h.includes('내용'));

      if (!dateHeader) return;

      rows.forEach(row => {
        const transaction = convertLedgerRowToTransaction(
          row,
          accountName,
          dateHeader,
          debitHeader || '',
          creditHeader || '',
          descriptionHeader
        );

        if (transaction) {
          transactions.push(transaction);
        }
      });
    });

    return transactions;
  }, [workbook, accountNames]);

  // 매출 vs 판관비 월별 데이터
  const monthlyData = useMemo(() => {
    return getSalesVsSgaMonthlySummary(allTransactions);
  }, [allTransactions]);

  // 실제 데이터가 있는 월만 필터링
  const filteredMonthlyData = useMemo(() => {
    return monthlyData.filter(d => d.sales !== 0 || d.sga !== 0);
  }, [monthlyData]);

  // AI 분석 실행
  const handleAnalysis = async () => {
    if (!hasApiKey()) {
      toast({
        title: 'API Key 필요',
        description: '먼저 Google Gemini API Key를 설정해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (allTransactions.length === 0) {
      toast({
        title: '오류',
        description: '분석할 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult('');

    try {
      // 월별 데이터를 테이블 형식으로 변환
      const tableStr = monthlyData.map(d => 
        `| ${d.month} | 매출: ${formatCurrency(d.sales)} | 판관비: ${formatCurrency(d.sga)} | 운반비(Logistics): ${formatCurrency(d.logistics)} | 판관비율: ${d.ratio.toFixed(1)}% |`
      ).join('\n');

      // 예상 요금 계산
      const prompt = `당신은 기업 재무 분석 전문가(CFO) 및 회계 감리 대응 전문가입니다.

**핵심 분석 목표: 매출과 판관비의 상관관계 및 이상 징후 포착**

다음은 매출 대 판관비 월별 집계 및 운반비 현황 데이터입니다:

| 월 | 매출액 | 판관비 총액 | 운반관련비용 | 매출액 대비 판관비율 |
|---|---|---|---|---|
${tableStr}

**중요 지시사항:**
- 제공된 데이터는 실제 데이터가 있는 기간만 포함됩니다.
- 일부 월의 데이터가 누락되어 있어도 이는 정상입니다 (예: 반기 데이터만 있는 경우).
- 연속적인 월 누락이 있어도 "심각한 불균형"이나 "심각한 문제"로 해석하지 마세요.
- 제공된 데이터가 있는 기간만 분석하고, 데이터가 없는 월은 무시하세요.

분석 지침:

1. **매출-판관비 연동성:** 일반적으로 매출이 증가하면 변동비 성격의 판관비도 증가해야 합니다. 이 패턴이 깨지는 구간(예: 매출 급증에도 판관비 감소, 매출 감소에도 판관비 급증)을 찾아내세요.

2. **운반비 역상관 이상 탐지:** 특히 **'매출이 증가했으나 운반비/물류비가 감소하는 경우'** 또는 그 반대의 경우를 집중적으로 찾아내어 잠재적인 매출 누락이나 비용 이연 가능성을 경고하세요.

3. **수익성 분석:** 판관비율 추이를 보고 수익성 악화 우려가 있는 달을 지적하세요.

모든 답변은 **한국어(Korean)**로 작성하세요.

분석 보고서 포함 내용:

1. ### 📊 추세 및 현황 요약
   - 월별 흐름 요약 및 특이점 (데이터가 있는 기간만 기준)

2. ### 🔍 심층 진단 (핵심)
   - 매출과 운반비/판관비의 상관관계 이상 징후를 집중적으로 다루세요.
   - 주요 고액 거래나 이상 패턴을 식별하세요.

3. ### ⚠️ 리스크 및 기회
   - 리스크 등급(높음/중간/낮음)과 이유.

4. ### 💡 조치 사항 및 전문가 제언
   - 구체적인 소명 준비 자료나 개선 방안.

**주의:** 데이터가 없는 월에 대한 언급이나 "심각한 불균형", "심각한 문제" 같은 표현은 사용하지 마세요. 제공된 데이터 기간만 분석하세요.`;

      // 예상 요금 계산
      const estimatedTokens = estimateTokens(prompt);
      const estimatedCostKRW = estimateCost(estimatedTokens);

      const result = await analyzeWithFlash(prompt);
      setAnalysisResult(result);

      // 사용 이력 저장
      const actualCost = estimateCost(estimatedTokens, 2000, true);
      const { addUsageRecord } = await import('@/lib/usageTracker');
      addUsageRecord({
        accountName: '매출대판관비',
        analysisType: '매출 대 판관비 분석',
        totalCount: allTransactions.length,
        sampleSize: allTransactions.length,
        samplingRatio: 100,
        tokensUsed: estimatedTokens + 2000,
        costKRW: actualCost,
        model: 'gemini-2.0-flash',
      });
      setUsageSummary(getUsageSummary());

      toast({
        title: '분석 완료',
        description: '매출 대 판관비 AI 분석이 완료되었습니다.',
      });
    } catch (error: any) {
      console.error('매출대판관비 AI 분석 오류:', error);
      toast({
        title: '분석 실패',
        description: error.message || 'AI 분석 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 엑셀 다운로드
  const downloadExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      
      // 월별 데이터 시트
      const wsData: any[][] = [
        ['매출 대 판관비 월별 분석'],
        [],
        ['월', '매출액', '판관비 총액', '운반관련비용', '매출액 대비 판관비율(%)'],
      ];

      monthlyData.forEach(d => {
        wsData.push([
          d.month,
          d.sales,
          d.sga,
          d.logistics,
          d.ratio.toFixed(2)
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 10 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 }
      ];
      
      XLSX.utils.book_append_sheet(wb, ws, '매출대판관비');
      XLSX.writeFile(wb, `매출대판관비분석_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: '다운로드 완료',
        description: '매출 대 판관비 분석 결과를 다운로드했습니다.',
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `다운로드 실패: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                매출 대 판관비 분석
              </CardTitle>
              <CardDescription className="mt-2">
                매출과 판관비의 상관관계를 분석하고, 운반비 역상관 이상 징후를 탐지합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={handleAnalysis} 
              disabled={isAnalyzing || allTransactions.length === 0}
              className="flex-1"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 분석 시작
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setUsageSummary(getUsageSummary());
                setShowCostDialog(true);
              }}
              disabled={allTransactions.length === 0}
            >
              <DollarSign className="mr-2 h-4 w-4" />
              요금 확인
            </Button>
            {filteredMonthlyData.length > 0 && (
              <Button onClick={downloadExcel} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                엑셀 다운로드
              </Button>
            )}
          </div>

          {filteredMonthlyData.length === 0 && (
            <div className="p-4 bg-muted rounded-md text-center text-sm text-muted-foreground">
              매출 또는 판관비 데이터가 없습니다. 원장 파일을 확인해주세요.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 월별 데이터 차트 */}
      {filteredMonthlyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>매출 vs 판관비 월별 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={filteredMonthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
                <Bar dataKey="sales" fill="#8884d8" name="매출액" />
                <Bar dataKey="sga" fill="#82ca9d" name="판관비" />
                <Bar dataKey="logistics" fill="#ffc658" name="운반비" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 월별 데이터 테이블 */}
      {filteredMonthlyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>월별 상세 데이터</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>월</TableHead>
                    <TableHead className="text-right">매출액</TableHead>
                    <TableHead className="text-right">판관비</TableHead>
                    <TableHead className="text-right">운반비</TableHead>
                    <TableHead className="text-right">판관비율</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMonthlyData.map((data, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{data.month}</TableCell>
                      <TableCell className="text-right">{formatCurrency(data.sales)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(data.sga)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(data.logistics)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={data.ratio > 20 ? "destructive" : data.ratio > 15 ? "default" : "secondary"}>
                          {data.ratio.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 분석 결과 */}
      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI 분석 결과
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
              {analysisResult}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 요금 확인 Dialog */}
      <Dialog open={showCostDialog} onOpenChange={setShowCostDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              AI 분석 요금 정보
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 예상 요금 */}
            {allTransactions.length > 0 && (() => {
              const samplePrompt = monthlyData.map(d => 
                `| ${d.month} | 매출: ${formatCurrency(d.sales)} | 판관비: ${formatCurrency(d.sga)} | 운반비(Logistics): ${formatCurrency(d.logistics)} | 판관비율: ${d.ratio.toFixed(1)}% |`
              ).join('\n');
              const testPrompt = `당신은 기업 재무 분석 전문가(CFO) 및 회계 감리 대응 전문가입니다.\n\n**핵심 분석 목표: 매출과 판관비의 상관관계 및 이상 징후 포착**\n\n다음은 매출 대 판관비 월별 집계 및 운반비 현황 데이터입니다:\n\n| 월 | 매출액 | 판관비 총액 | 운반관련비용 | 매출액 대비 판관비율 |\n|---|---|---|---|---|\n${samplePrompt}\n\n...`;
              const estimatedTokens = estimateTokens(testPrompt);
              const estimatedCostKRW = estimateCost(estimatedTokens);
              
              return (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">이번 분석 예상 요금</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">예상 토큰:</span>
                      <span className="font-semibold">{estimatedTokens.toLocaleString()}개</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">예상 비용:</span>
                      <span className="font-bold text-lg text-orange-600 dark:text-orange-400">
                        ₩{estimatedCostKRW.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>데이터 건수:</span>
                      <span>{allTransactions.length.toLocaleString()}건</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* 누적 요금 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">누적 사용 요금</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">전체 누적</div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      ₩{usageSummary.totalCost.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      총 {usageSummary.totalAnalyses}회 분석
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">오늘 사용</div>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      ₩{usageSummary.todayCost.toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">이번 달 사용</div>
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      ₩{usageSummary.thisMonthCost.toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">평균 비용</div>
                    <div className="text-sm font-semibold">
                      ₩{usageSummary.totalAnalyses > 0 
                        ? Math.round(usageSummary.totalCost / usageSummary.totalAnalyses).toLocaleString()
                        : '0'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 안내 */}
            <div className="p-3 bg-muted rounded-md text-xs text-muted-foreground">
              <p>• 예상 요금은 실제 사용량과 다를 수 있습니다.</p>
              <p>• Gemini 2.5 Flash 모델 기준으로 계산됩니다.</p>
              <p>• 무료 티어의 경우 분당 15회 요청 제한이 있습니다.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


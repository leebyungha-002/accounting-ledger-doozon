import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface ProfitLossAnalysisProps {
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

const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[] } => {
  if (!worksheet) return { data: [], headers: [] };
  
  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet);
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  
  return { data: rawData, headers };
};

export const ProfitLossAnalysis: React.FC<ProfitLossAnalysisProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();

  // 수익/비용 계정 자동 분류 및 집계
  const plData = useMemo(() => {
    const revenue: { account: string; amount: number }[] = [];
    const cogs: { account: string; amount: number }[] = [];
    const expenses: { account: string; amount: number }[] = [];
    
    accountNames.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data, headers } = getDataFromSheet(sheet);
      
      const debitHeader = headers.find(h => h.includes('차변'));
      const creditHeader = headers.find(h => h.includes('대변'));
      
      let total = 0;
      data.forEach(row => {
        const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
        const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
        total += debit + credit;
      });
      
      if (total === 0) return;
      
      // 수익 계정 (대변 발생)
      if (
        accountName.includes('매출') || 
        accountName.includes('수익') || 
        accountName.includes('이자수익') ||
        accountName.includes('배당금수익') ||
        accountName.includes('임대료')
      ) {
        revenue.push({ account: accountName, amount: total });
      }
      // 매출원가
      else if (
        accountName.includes('매출원가') ||
        accountName.includes('제품매출원가') ||
        accountName.includes('상품매출원가')
      ) {
        cogs.push({ account: accountName, amount: total });
      }
      // 판관비
      else if (
        accountName.includes('판매비') || accountName.includes('관리비') ||
        accountName.includes('급여') || accountName.includes('복리후생비') ||
        accountName.includes('여비교통비') || accountName.includes('접대비') ||
        accountName.includes('통신비') || accountName.includes('세금과공과') ||
        accountName.includes('감가상각비') || accountName.includes('지급임차료') ||
        accountName.includes('수선비') || accountName.includes('보험료') ||
        accountName.includes('차량유지비') || accountName.includes('운반비') ||
        accountName.includes('소모품비') || accountName.includes('도서인쇄비') ||
        accountName.includes('수도광열비') || accountName.includes('지급수수료') ||
        accountName.includes('광고선전비') || accountName.includes('대손상각비')
      ) {
        expenses.push({ account: accountName, amount: total });
      }
    });
    
    const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
    const totalCOGS = cogs.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    
    const grossProfit = totalRevenue - totalCOGS;
    const operatingProfit = grossProfit - totalExpenses;
    
    return {
      revenue,
      cogs,
      expenses,
      totalRevenue,
      totalCOGS,
      totalExpenses,
      grossProfit,
      operatingProfit,
    };
  }, [workbook, accountNames]);

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [
      ['추정 손익계산서'],
      [],
      ['구분', '계정과목', '금액'],
      [],
      ['매출'],
      ...plData.revenue.map(item => ['', item.account, item.amount]),
      ['', '매출 합계', plData.totalRevenue],
      [],
      ['매출원가'],
      ...plData.cogs.map(item => ['', item.account, item.amount]),
      ['', '매출원가 합계', plData.totalCOGS],
      [],
      ['', '매출총이익', plData.grossProfit],
      [],
      ['판매비와 관리비'],
      ...plData.expenses.map(item => ['', item.account, item.amount]),
      ['', '판관비 합계', plData.totalExpenses],
      [],
      ['', '영업이익', plData.operatingProfit],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(wb, ws, '손익계산서');
    XLSX.writeFile(wb, `추정손익계산서_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '추정 손익계산서를 다운로드했습니다.',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                추정 손익 분석
              </CardTitle>
              <CardDescription className="mt-2">
                업로드된 계정별원장을 바탕으로 수익과 비용을 자동 분류하여 대략적인 손익을 계산합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadExcel}>
            <Download className="mr-2 h-4 w-4" />
            손익계산서 다운로드
          </Button>
        </CardContent>
      </Card>

      {/* 손익계산서 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">매출</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              ₩{plData.totalRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">매출원가</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              ₩{plData.totalCOGS.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">매출총이익</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              ₩{plData.grossProfit.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              이익률: {plData.totalRevenue > 0 ? ((plData.grossProfit / plData.totalRevenue) * 100).toFixed(1) : 0}%
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">영업이익</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${plData.operatingProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
              ₩{plData.operatingProfit.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              이익률: {plData.totalRevenue > 0 ? ((plData.operatingProfit / plData.totalRevenue) * 100).toFixed(1) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 상세 내역 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 매출 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              매출 ({plData.revenue.length}개)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {plData.revenue.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-blue-50 dark:bg-blue-950">
                  <span className="text-sm">{item.account}</span>
                  <span className="text-sm font-medium">₩{item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex items-center justify-between p-2 rounded bg-blue-100 dark:bg-blue-900 font-bold">
                <span className="text-sm">합계</span>
                <span className="text-sm">₩{plData.totalRevenue.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 매출원가 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-orange-600" />
              매출원가 ({plData.cogs.length}개)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {plData.cogs.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-orange-50 dark:bg-orange-950">
                  <span className="text-sm">{item.account}</span>
                  <span className="text-sm font-medium">₩{item.amount.toLocaleString()}</span>
                </div>
              ))}
              {plData.cogs.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  매출원가 계정 없음
                </div>
              )}
              <div className="flex items-center justify-between p-2 rounded bg-orange-100 dark:bg-orange-900 font-bold">
                <span className="text-sm">합계</span>
                <span className="text-sm">₩{plData.totalCOGS.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 판관비 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              판관비 ({plData.expenses.length}개)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {plData.expenses.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-950">
                  <span className="text-sm">{item.account}</span>
                  <span className="text-sm font-medium">₩{item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex items-center justify-between p-2 rounded bg-red-100 dark:bg-red-900 font-bold">
                <span className="text-sm">합계</span>
                <span className="text-sm">₩{plData.totalExpenses.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

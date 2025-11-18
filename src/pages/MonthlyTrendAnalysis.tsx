import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TrendingUp, Download, BarChart3 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface MonthlyTrendAnalysisProps {
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

export const MonthlyTrendAnalysis: React.FC<MonthlyTrendAnalysisProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  // 매출/비용 계정 자동 분류
  const categorizedAccounts = useMemo(() => {
    const sales: string[] = [];
    const expenses: string[] = [];
    const manufacturing: string[] = [];
    
    accountNames.forEach(name => {
      if (name.includes('매출') || name.includes('수익') || name.includes('판매')) {
        sales.push(name);
      } else if (
        name.includes('판매비') || name.includes('관리비') ||
        name.includes('급여') || name.includes('복리후생비') ||
        name.includes('여비교통비') || name.includes('접대비') ||
        name.includes('통신비') || name.includes('세금과공과') ||
        name.includes('감가상각비') || name.includes('지급임차료') ||
        name.includes('수선비') || name.includes('보험료') ||
        name.includes('차량유지비') || name.includes('운반비') ||
        name.includes('소모품비') || name.includes('도서인쇄비') ||
        name.includes('수도광열비')
      ) {
        expenses.push(name);
      } else if (
        name.includes('원재료') || name.includes('제조원가') ||
        name.includes('재공품') || name.includes('외주가공')
      ) {
        manufacturing.push(name);
      }
    });
    
    return { sales, expenses, manufacturing };
  }, [accountNames]);

  // 월별 데이터 집계
  const monthlyData = useMemo(() => {
    const data: { [account: string]: { [month: number]: number } } = {};
    
    selectedAccounts.forEach(account => {
      data[account] = {};
      for (let i = 1; i <= 12; i++) {
        data[account][i] = 0;
      }
    });

    selectedAccounts.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data: rows, headers } = getDataFromSheet(sheet);
      
      const dateHeader = headers.find(h => h.includes('일자') || h.includes('날짜'));
      const debitHeader = headers.find(h => h.includes('차변'));
      const creditHeader = headers.find(h => h.includes('대변'));
      
      if (!dateHeader) return;
      
      rows.forEach(row => {
        const date = row[dateHeader];
        if (!(date instanceof Date)) return;
        
        const month = date.getMonth() + 1;
        const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
        const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
        
        // 매출 계정은 대변, 비용 계정은 차변
        const amount = categorizedAccounts.sales.includes(accountName) ? credit : debit;
        
        if (amount > 0) {
          data[accountName][month] += amount;
        }
      });
    });

    return data;
  }, [workbook, selectedAccounts, categorizedAccounts]);

  // 월별 합계
  const monthlyTotals = useMemo(() => {
    const totals: { [month: number]: number } = {};
    for (let i = 1; i <= 12; i++) {
      totals[i] = 0;
    }
    
    Object.values(monthlyData).forEach(accountData => {
      Object.entries(accountData).forEach(([month, amount]) => {
        totals[parseInt(month)] += amount;
      });
    });
    
    return totals;
  }, [monthlyData]);

  const handleToggleAccount = (account: string) => {
    const newSet = new Set(selectedAccounts);
    if (newSet.has(account)) {
      newSet.delete(account);
    } else {
      newSet.add(account);
    }
    setSelectedAccounts(newSet);
  };

  const handleSelectAll = (category: string[]) => {
    const newSet = new Set(selectedAccounts);
    category.forEach(acc => newSet.add(acc));
    setSelectedAccounts(newSet);
  };

  const handleDeselectAll = () => {
    setSelectedAccounts(new Set());
  };

  const downloadExcel = () => {
    if (selectedAccounts.size === 0) {
      toast({
        title: '오류',
        description: '다운로드할 계정을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [
      ['월별 추이 분석'],
      [],
      ['계정과목', ...Array.from({ length: 12 }, (_, i) => `${i + 1}월`)],
    ];

    Array.from(selectedAccounts).forEach(account => {
      const row = [account];
      for (let i = 1; i <= 12; i++) {
        row.push(monthlyData[account]?.[i] || 0);
      }
      wsData.push(row);
    });

    wsData.push([]);
    wsData.push(['합계', ...Array.from({ length: 12 }, (_, i) => monthlyTotals[i + 1])]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 25 }, ...Array(12).fill({ wch: 15 })];
    
    XLSX.utils.book_append_sheet(wb, ws, '월별추이');
    XLSX.writeFile(wb, `월별추이분석_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '월별 추이 분석 결과를 다운로드했습니다.',
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
                매출/판관비 월별 추이 분석
              </CardTitle>
              <CardDescription className="mt-2">
                매출, 판관비, 제조원가 계정을 선택하고 월별 추이를 시각화합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 계정 선택 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 매출 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">매출 계정</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(categorizedAccounts.sales)}
                  >
                    전체 선택
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                {categorizedAccounts.sales.map(account => (
                  <div key={account} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sales-${account}`}
                      checked={selectedAccounts.has(account)}
                      onCheckedChange={() => handleToggleAccount(account)}
                    />
                    <label
                      htmlFor={`sales-${account}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {account}
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* 판관비 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">판관비 계정</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(categorizedAccounts.expenses)}
                  >
                    전체 선택
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                {categorizedAccounts.expenses.map(account => (
                  <div key={account} className="flex items-center space-x-2">
                    <Checkbox
                      id={`expense-${account}`}
                      checked={selectedAccounts.has(account)}
                      onCheckedChange={() => handleToggleAccount(account)}
                    />
                    <label
                      htmlFor={`expense-${account}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {account}
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* 제조원가 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">제조원가 계정</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(categorizedAccounts.manufacturing)}
                  >
                    전체 선택
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                {categorizedAccounts.manufacturing.map(account => (
                  <div key={account} className="flex items-center space-x-2">
                    <Checkbox
                      id={`mfg-${account}`}
                      checked={selectedAccounts.has(account)}
                      onCheckedChange={() => handleToggleAccount(account)}
                    />
                    <label
                      htmlFor={`mfg-${account}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {account}
                    </label>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleDeselectAll} variant="outline">
              선택 해제
            </Button>
            <Button onClick={downloadExcel} disabled={selectedAccounts.size === 0}>
              <Download className="mr-2 h-4 w-4" />
              엑셀 다운로드
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 월별 데이터 테이블 */}
      {selectedAccounts.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              월별 추이 ({selectedAccounts.size}개 계정)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">계정과목</TableHead>
                    {Array.from({ length: 12 }, (_, i) => (
                      <TableHead key={i} className="text-right">{i + 1}월</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(selectedAccounts).map(account => (
                    <TableRow key={account}>
                      <TableCell className="font-medium">{account}</TableCell>
                      {Array.from({ length: 12 }, (_, i) => (
                        <TableCell key={i} className="text-right">
                          {(monthlyData[account]?.[i + 1] || 0).toLocaleString()}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted font-bold">
                    <TableCell>합계</TableCell>
                    {Array.from({ length: 12 }, (_, i) => (
                      <TableCell key={i} className="text-right">
                        {monthlyTotals[i + 1].toLocaleString()}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

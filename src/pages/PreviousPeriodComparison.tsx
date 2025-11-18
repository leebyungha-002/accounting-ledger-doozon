import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Scale, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface PreviousPeriodComparisonProps {
  currentWorkbook: XLSX.WorkBook;
  previousWorkbook: XLSX.WorkBook | null;
  currentAccounts: string[];
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

export const PreviousPeriodComparison: React.FC<PreviousPeriodComparisonProps> = ({
  currentWorkbook,
  previousWorkbook,
  currentAccounts,
  onBack,
}) => {
  const { toast } = useToast();

  const comparisonData = useMemo(() => {
    if (!previousWorkbook) return [];

    const results: {
      account: string;
      currentAmount: number;
      previousAmount: number;
      change: number;
      changePercent: number;
    }[] = [];

    currentAccounts.forEach(accountName => {
      const currentSheet = currentWorkbook.Sheets[accountName];
      const previousSheet = previousWorkbook.Sheets[accountName];

      const { data: currentData, headers: currentHeaders } = getDataFromSheet(currentSheet);
      const { data: previousData, headers: previousHeaders } = getDataFromSheet(previousSheet);

      if (currentData.length === 0) return;

      // 차변/대변 합계 계산
      const currentDebitHeader = currentHeaders.find(h => h.includes('차변'));
      const currentCreditHeader = currentHeaders.find(h => h.includes('대변'));
      const previousDebitHeader = previousHeaders.find(h => h.includes('차변'));
      const previousCreditHeader = previousHeaders.find(h => h.includes('대변'));

      let currentAmount = 0;
      currentData.forEach(row => {
        const debit = currentDebitHeader ? cleanAmount(row[currentDebitHeader]) : 0;
        const credit = currentCreditHeader ? cleanAmount(row[currentCreditHeader]) : 0;
        currentAmount += debit + credit;
      });

      let previousAmount = 0;
      if (previousData.length > 0) {
        previousData.forEach(row => {
          const debit = previousDebitHeader ? cleanAmount(row[previousDebitHeader]) : 0;
          const credit = previousCreditHeader ? cleanAmount(row[previousCreditHeader]) : 0;
          previousAmount += debit + credit;
        });
      }

      if (currentAmount === 0 && previousAmount === 0) return;

      const change = currentAmount - previousAmount;
      const changePercent = previousAmount !== 0 ? (change / previousAmount) * 100 : (currentAmount > 0 ? 100 : 0);

      results.push({
        account: accountName,
        currentAmount,
        previousAmount,
        change,
        changePercent,
      });
    });

    // 변동률 절대값 기준으로 정렬
    return results.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  }, [currentWorkbook, previousWorkbook, currentAccounts]);

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [
      ['전기 비교 분석'],
      [],
      ['계정과목', '당기', '전기', '증감액', '증감률(%)'],
      ...comparisonData.map(item => [
        item.account,
        item.currentAmount,
        item.previousAmount,
        item.change,
        item.changePercent.toFixed(1),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(wb, ws, '전기비교');
    XLSX.writeFile(wb, `전기비교분석_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '전기 비교 분석 결과를 다운로드했습니다.',
    });
  };

  if (!previousWorkbook) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                전기 데이터 비교 분석
              </CardTitle>
              <CardDescription className="mt-2">
                전기 계정별원장 데이터를 업로드하여 비교 분석합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Scale className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">전기 데이터가 업로드되지 않았습니다.</p>
            <p className="text-sm text-muted-foreground mt-2">
              초기 화면에서 "전기 추가하기"를 통해 전기 데이터를 업로드해주세요.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                전기 데이터 비교 분석
              </CardTitle>
              <CardDescription className="mt-2">
                당기와 전기 데이터를 비교하여 증감 현황을 분석합니다.
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
            비교표 다운로드
          </Button>
        </CardContent>
      </Card>

      {/* 비교 결과 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>계정별 증감 현황 ({comparisonData.length}개)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>계정과목</TableHead>
                  <TableHead className="text-right">당기</TableHead>
                  <TableHead className="text-right">전기</TableHead>
                  <TableHead className="text-right">증감액</TableHead>
                  <TableHead className="text-right">증감률</TableHead>
                  <TableHead>변동</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonData.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.account}</TableCell>
                    <TableCell className="text-right">{item.currentAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{item.previousAmount.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-medium ${item.change >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {item.change >= 0 ? '+' : ''}{item.change.toLocaleString()}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${item.changePercent >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      {Math.abs(item.changePercent) >= 20 ? (
                        <Badge variant="destructive" className="gap-1">
                          {item.changePercent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          주요 변동
                        </Badge>
                      ) : Math.abs(item.changePercent) >= 10 ? (
                        <Badge variant="secondary" className="gap-1">
                          {item.changePercent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          변동
                        </Badge>
                      ) : (
                        <Badge variant="outline">안정</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

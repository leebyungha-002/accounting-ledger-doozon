import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Search, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface TransactionSearchProps {
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

export const TransactionSearch: React.FC<TransactionSearchProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [searchVendor, setSearchVendor] = useState<string>('');
  const [searchDescription, setSearchDescription] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchResults, setSearchResults] = useState<LedgerRow[]>([]);

  const allData = useMemo(() => {
    const result: { account: string; data: LedgerRow[]; headers: string[] }[] = [];
    
    accountNames.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data, headers } = getDataFromSheet(sheet);
      if (data.length > 0) {
        result.push({ account: accountName, data, headers });
      }
    });
    
    return result;
  }, [workbook, accountNames]);

  const handleSearch = () => {
    let results: LedgerRow[] = [];

    const accountsToSearch = selectedAccount ? [selectedAccount] : accountNames;

    accountsToSearch.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data, headers } = getDataFromSheet(sheet);

      const vendorHeader = headers.find(h => h.includes('거래처') || h.includes('업체'));
      const descHeader = headers.find(h => h.includes('적요') || h.includes('내용') || h.includes('비고'));
      const dateHeader = headers.find(h => h.includes('일자') || h.includes('날짜'));
      const debitHeader = headers.find(h => h.includes('차변'));
      const creditHeader = headers.find(h => h.includes('대변'));

      data.forEach(row => {
        let match = true;

        // 거래처 필터
        if (searchVendor && vendorHeader) {
          const vendor = String(row[vendorHeader] || '').toLowerCase();
          if (!vendor.includes(searchVendor.toLowerCase())) {
            match = false;
          }
        }

        // 적요 필터
        if (searchDescription && descHeader) {
          const desc = String(row[descHeader] || '').toLowerCase();
          if (!desc.includes(searchDescription.toLowerCase())) {
            match = false;
          }
        }

        // 금액 필터
        if (minAmount || maxAmount) {
          const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
          const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
          const amount = Math.max(debit, credit);

          if (minAmount && amount < parseFloat(minAmount)) {
            match = false;
          }
          if (maxAmount && amount > parseFloat(maxAmount)) {
            match = false;
          }
        }

        // 날짜 필터
        if ((startDate || endDate) && dateHeader) {
          const date = row[dateHeader];
          if (date instanceof Date) {
            if (startDate && date < new Date(startDate)) {
              match = false;
            }
            if (endDate && date > new Date(endDate)) {
              match = false;
            }
          }
        }

        if (match) {
          results.push({ ...row, '계정과목': accountName });
        }
      });
    });

    setSearchResults(results);
    toast({
      title: '검색 완료',
      description: `${results.length}건의 거래를 찾았습니다.`,
    });
  };

  const downloadResults = () => {
    if (searchResults.length === 0) {
      toast({
        title: '오류',
        description: '먼저 검색을 실행해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(searchResults);
    
    XLSX.utils.book_append_sheet(wb, ws, '검색결과');
    XLSX.writeFile(wb, `거래검색_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '검색 결과를 다운로드했습니다.',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                상세 거래 검색
              </CardTitle>
              <CardDescription className="mt-2">
                거래처, 금액, 날짜, 적요 등 다양한 조건으로 거래를 검색합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 계정 선택 */}
            <div className="space-y-2">
              <Label>계정과목 (선택 시 해당 계정만)</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="전체 계정" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">전체 계정</SelectItem>
                  {accountNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 거래처 검색 */}
            <div className="space-y-2">
              <Label>거래처명 (부분 일치)</Label>
              <Input
                placeholder="예: 삼성"
                value={searchVendor}
                onChange={(e) => setSearchVendor(e.target.value)}
              />
            </div>

            {/* 적요 검색 */}
            <div className="space-y-2">
              <Label>적요 (부분 일치)</Label>
              <Input
                placeholder="예: 구매"
                value={searchDescription}
                onChange={(e) => setSearchDescription(e.target.value)}
              />
            </div>

            {/* 최소 금액 */}
            <div className="space-y-2">
              <Label>최소 금액</Label>
              <Input
                type="number"
                placeholder="0"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>

            {/* 최대 금액 */}
            <div className="space-y-2">
              <Label>최대 금액</Label>
              <Input
                type="number"
                placeholder="무제한"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>

            {/* 시작 날짜 */}
            <div className="space-y-2">
              <Label>시작 날짜</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* 종료 날짜 */}
            <div className="space-y-2">
              <Label>종료 날짜</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              검색
            </Button>
            {searchResults.length > 0 && (
              <Button onClick={downloadResults} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                결과 다운로드
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 검색 결과 */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>검색 결과 ({searchResults.length.toLocaleString()}건)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(searchResults[0] || {}).map(key => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.slice(0, 200).map((row, idx) => (
                    <TableRow key={idx}>
                      {Object.values(row).map((val, j) => (
                        <TableCell key={j} className="text-sm">
                          {val instanceof Date ? val.toLocaleDateString() : String(val ?? '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {searchResults.length > 200 && (
              <p className="text-sm text-muted-foreground text-center mt-4">
                상위 200건만 표시됩니다. 전체 결과는 다운로드로 확인하세요.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

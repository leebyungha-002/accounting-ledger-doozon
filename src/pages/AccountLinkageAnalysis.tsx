import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Activity, TrendingUp, TrendingDown, RefreshCw, Check, ChevronsUpDown, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDataFromSheet, LedgerRow } from '@/lib/excelHelpers';
import { robustFindHeader, cleanAmount } from '@/lib/headerUtils';
import {
  ACCOUNT_KEYWORDS,
  DEBIT_KEYWORDS,
  CREDIT_KEYWORDS,
  VENDOR_KEYWORDS
} from '@/lib/columnMapping';

interface AccountLinkageAnalysisProps {
  workbook: XLSX.WorkBook;
  accountNames: string[];
  onBack: () => void;
}

interface ClientStat {
  name: string;
  count: number;
  amount: number;
  percentage: number;
}

export const AccountLinkageAnalysis: React.FC<AccountLinkageAnalysisProps> = ({
  workbook,
  accountNames,
  onBack
}) => {
  const [selectedAccount, setSelectedAccount] = useState<string>(accountNames[0] || '');
  const [debitStats, setDebitStats] = useState<ClientStat[]>([]);
  const [creditStats, setCreditStats] = useState<ClientStat[]>([]);
  const [totalDebit, setTotalDebit] = useState<number>(0);
  const [totalCredit, setTotalCredit] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (accountNames.length > 0 && !selectedAccount) {
      setSelectedAccount(accountNames[0]);
    }
  }, [accountNames]);

  useEffect(() => {
    analyzeData();
  }, [selectedAccount, workbook]);

  const analyzeData = () => {
    if (!workbook || !selectedAccount) return;

    setIsLoading(true);
    
    // Process in a timeout to allow UI update
    setTimeout(() => {
      try {
        const sheetName = workbook.SheetNames[0]; // Assume data is in the first sheet or relevant sheets
        // Ideally we iterate all sheets or find the one with data. 
        // AdvancedLedgerAnalysis typically handles single sheet or multi-sheet.
        // We will assume the structure follows getDataFromSheet logic.
        
        let allRows: LedgerRow[] = [];
        let headers: string[] = [];
        let orderedHeaders: string[] = [];

        // Aggregate data from all sheets if needed, or just finding the one with the account
        // If accountNames matches SheetNames (legacy mode), we pick that sheet.
        // If SingleSheetMode, we filter by account column.
        
        const isSheetByName = workbook.SheetNames.includes(selectedAccount);
        
        if (isSheetByName) {
            const sheet = workbook.Sheets[selectedAccount];
            const result = getDataFromSheet(sheet);
            allRows = result.data;
            headers = result.headers;
            orderedHeaders = result.orderedHeaders;
        } else {
             // Single sheet with account column
             // We need to look through all sheets (usually just one main data sheet)
             // and filter by account name
             workbook.SheetNames.forEach(name => {
                 const sheet = workbook.Sheets[name];
                 const result = getDataFromSheet(sheet);
                 if (result.data.length > 0) {
                     // Check if this sheet has the selected account
                     const accountHeader = robustFindHeader(result.orderedHeaders, ACCOUNT_KEYWORDS);
                     if (accountHeader) {
                         const filtered = result.data.filter(row => {
                             const val = row[accountHeader];
                             return val && String(val).trim() === selectedAccount;
                         });
                         if (filtered.length > 0) {
                             allRows = [...allRows, ...filtered];
                             if (headers.length === 0) {
                                 headers = result.headers;
                                 orderedHeaders = result.orderedHeaders;
                             }
                         }
                     }
                 }
             });
        }

        if (allRows.length === 0) {
            setDebitStats([]);
            setCreditStats([]);
            setIsLoading(false);
            return;
        }

        const debitHeader = robustFindHeader(orderedHeaders, DEBIT_KEYWORDS);
        const creditHeader = robustFindHeader(orderedHeaders, CREDIT_KEYWORDS);
        const clientHeader = robustFindHeader(orderedHeaders, VENDOR_KEYWORDS);

        if (!debitHeader && !creditHeader) {
             console.error("Could not find debit/credit headers");
             setIsLoading(false);
             return;
        }

        const debitMap = new Map<string, { count: number; amount: number }>();
        const creditMap = new Map<string, { count: number; amount: number }>();
        let sumDebit = 0;
        let sumCredit = 0;

        allRows.forEach(row => {
            const clientRaw = clientHeader ? row[clientHeader] : '미지정 거래처';
            const client = (clientRaw && String(clientRaw).trim()) || '미지정 거래처';
            
            const debitVal = debitHeader ? cleanAmount(row[debitHeader]) : 0;
            const creditVal = creditHeader ? cleanAmount(row[creditHeader]) : 0;

            // 마이너스 금액도 집계에 반영 (0이 아닌 경우만)
            if (debitVal !== 0) {
                const current = debitMap.get(client) || { count: 0, amount: 0 };
                debitMap.set(client, { count: current.count + 1, amount: current.amount + debitVal });
                sumDebit += debitVal;
            }

            if (creditVal !== 0) {
                const current = creditMap.get(client) || { count: 0, amount: 0 };
                creditMap.set(client, { count: current.count + 1, amount: current.amount + creditVal });
                sumCredit += creditVal;
            }
        });

        const processStats = (map: Map<string, { count: number; amount: number }>, total: number) => {
            return Array.from(map.entries())
                .map(([name, stat]) => ({
                    name,
                    count: stat.count,
                    amount: stat.amount,
                    percentage: total > 0 ? (stat.amount / total) * 100 : 0
                }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10);
        };

        setDebitStats(processStats(debitMap, sumDebit));
        setCreditStats(processStats(creditMap, sumCredit));
        setTotalDebit(sumDebit);
        setTotalCredit(sumCredit);

      } catch (error) {
          console.error("Error analyzing linkage:", error);
      } finally {
          setIsLoading(false);
      }
    }, 100);
  };

  const handleDownload = () => {
    if (debitStats.length === 0 && creditStats.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Debit Sheet
    const debitData = debitStats.map((stat, index) => ({
      순위: index + 1,
      거래처명: stat.name,
      건수: stat.count,
      금액: stat.amount,
      비율: `${stat.percentage.toFixed(2)}%`
    }));
    const debitWs = XLSX.utils.json_to_sheet(debitData);
    XLSX.utils.book_append_sheet(wb, debitWs, "차변 거래처");

    // Credit Sheet
    const creditData = creditStats.map((stat, index) => ({
      순위: index + 1,
      거래처명: stat.name,
      건수: stat.count,
      금액: stat.amount,
      비율: `${stat.percentage.toFixed(2)}%`
    }));
    const creditWs = XLSX.utils.json_to_sheet(creditData);
    XLSX.utils.book_append_sheet(wb, creditWs, "대변 거래처");

    XLSX.writeFile(wb, `${selectedAccount}_거래처분석.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold tracking-tight">계정 연관 거래처 분석</h2>
        </div>
        <div className="flex items-center gap-4">
           <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-[280px] justify-between"
              >
                {selectedAccount
                  ? accountNames.find((account) => account === selectedAccount)
                  : "계정과목 선택..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0">
              <Command>
                <CommandInput placeholder="계정과목 검색..." />
                <CommandList>
                  <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                  <CommandGroup>
                    {accountNames.map((account) => (
                      <CommandItem
                        key={account}
                        value={account}
                        onSelect={(currentValue) => {
                          setSelectedAccount(currentValue === selectedAccount ? "" : currentValue);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedAccount === account ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {account}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={analyzeData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            분석 실행
          </Button>
          {(debitStats.length > 0 || creditStats.length > 0) && (
            <Button variant="outline" onClick={handleDownload} disabled={isLoading}>
              <Download className="h-4 w-4 mr-2" />
              엑셀 다운로드
            </Button>
          )}
        </div>
      </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Debit Side Analysis */}
            <Card>
                <CardHeader className="bg-red-50 dark:bg-red-950/20">
                    <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <TrendingUp className="h-5 w-5" />
                        차변(Debit) 상위 거래처 Top 10
                    </CardTitle>
                    <CardDescription>
                        지출/자산증가 발생 상위 거래처 분석
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="text-sm font-medium mb-4 text-right">
                        총 차변 합계: {totalDebit.toLocaleString()}원
                    </div>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">순위</TableHead>
                                    <TableHead>거래처명</TableHead>
                                    <TableHead className="text-right">건수</TableHead>
                                    <TableHead className="text-right">금액</TableHead>
                                    <TableHead className="text-right">비율</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {debitStats.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            데이터가 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    debitStats.map((stat, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{index + 1}</TableCell>
                                            <TableCell>{stat.name}</TableCell>
                                            <TableCell className="text-right">{stat.count.toLocaleString()}건</TableCell>
                                            <TableCell className="text-right">{stat.amount.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{stat.percentage.toFixed(1)}%</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Credit Side Analysis */}
            <Card>
                <CardHeader className="bg-blue-50 dark:bg-blue-950/20">
                    <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                        <TrendingDown className="h-5 w-5" />
                        대변(Credit) 상위 거래처 Top 10
                    </CardTitle>
                    <CardDescription>
                        수입/부채증가 발생 상위 거래처 분석
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="text-sm font-medium mb-4 text-right">
                        총 대변 합계: {totalCredit.toLocaleString()}원
                    </div>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">순위</TableHead>
                                    <TableHead>거래처명</TableHead>
                                    <TableHead className="text-right">건수</TableHead>
                                    <TableHead className="text-right">금액</TableHead>
                                    <TableHead className="text-right">비율</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {creditStats.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            데이터가 없습니다.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    creditStats.map((stat, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{index + 1}</TableCell>
                                            <TableCell>{stat.name}</TableCell>
                                            <TableCell className="text-right">{stat.count.toLocaleString()}건</TableCell>
                                            <TableCell className="text-right">{stat.amount.toLocaleString()}</TableCell>
                                            <TableCell className="text-right">{stat.percentage.toFixed(1)}%</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
  );
};

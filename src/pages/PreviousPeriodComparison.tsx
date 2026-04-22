import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Scale, TrendingUp, TrendingDown, Download, Check, ChevronsUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { getDataFromSheet as getDataFromSheetExcel } from '@/lib/excelHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

const robustFindHeader = (headers: string[], keywords: string[]): string | undefined => {
  // 먼저 정확히 일치하는 헤더를 찾기
  for (const h of headers) {
    const cleanedHeader = (h || "").toLowerCase().replace(/\s/g, '').replace(/^\d+[_.-]?/, '');
    for (const kw of keywords) {
      const cleanedKw = kw.toLowerCase().replace(/\s/g, '');
      // 정확히 일치하는 경우 우선 반환
      if (cleanedHeader === cleanedKw) {
        return h;
      }
    }
  }
  // 정확히 일치하는 것이 없으면 포함하는 경우 찾기
  return headers.find(h => {
    const cleanedHeader = (h || "").toLowerCase().replace(/\s/g, '').replace(/^\d+[_.-]?/, '');
    return keywords.some(kw => {
      const cleanedKw = kw.toLowerCase().replace(/\s/g, '');
      return cleanedHeader.includes(cleanedKw);
    });
  });
};

// 헤더가 첫 행에 있는지 확인 (차변/대변/거래처/일자 등 계정별원장 특유 키워드가 있으면 유효한 헤더로 간주)
const hasLedgerHeaders = (headers: string[]): boolean => {
  const joined = headers.map(h => String(h || '').toLowerCase().replace(/\s/g, '')).join(' ');
  return (
    joined.includes('차변') || joined.includes('대변') ||
    joined.includes('거래처') || joined.includes('거래처명') ||
    joined.includes('일자') || joined.includes('날짜') ||
    joined.includes('debit') || joined.includes('credit')
  );
};

// 계정별원장 시트 읽기: 전기처럼 첫 행이 헤더인 경우를 우선 처리, 실패 시 excelHelpers 헤더 탐지 사용
const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[] } => {
  if (!worksheet) return { data: [], headers: [] };

  // 1) 첫 행 = 헤더로 시도 (전기 계정별원장이 보통 이 구조)
  const rawFirst = XLSX.utils.sheet_to_json<LedgerRow>(worksheet);
  const headersFirst = rawFirst.length > 0 ? Object.keys(rawFirst[0]) : [];
  if (rawFirst.length > 0 && hasLedgerHeaders(headersFirst)) {
    return { data: rawFirst, headers: headersFirst };
  }

  // 2) 실패 시 헤더 행 자동 탐지 (당기 등 제목 행이 있는 경우)
  const result = getDataFromSheetExcel(worksheet);
  const headers = result.orderedHeaders?.length ? result.orderedHeaders : result.headers;
  return { data: result.data, headers };
};

export const PreviousPeriodComparison: React.FC<PreviousPeriodComparisonProps> = ({
  currentWorkbook,
  previousWorkbook,
  currentAccounts,
  onBack,
}) => {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [accountComboboxOpen, setAccountComboboxOpen] = useState<boolean>(false);
  const [amountFilter, setAmountFilter] = useState<'all' | 'debit' | 'credit'>('all');

  // 선택된 계정의 거래처별 비교 데이터
  const comparisonData = useMemo(() => {
    if (!previousWorkbook || !selectedAccount) return [];

    const currentSheet = currentWorkbook.Sheets[selectedAccount];
    
    // 전기 시트 찾기 - 정확한 이름으로 먼저 시도
    let previousSheet = previousWorkbook.Sheets[selectedAccount];
    
    // 전기 시트가 없으면 유사한 이름 찾기
    if (!previousSheet) {
      const previousSheetNames = Object.keys(previousWorkbook.Sheets);
      
      // 계정명에서 숫자 접두사 제거하고 주요 부분 추출
      // 예: "1. 제품매출(매출)" → "제품매출(매출)"
      const normalizeAccountName = (name: string): string => {
        // 앞의 숫자와 점, 공백 제거 (예: "1. ", "2.", "123. " 등)
        let normalized = name.replace(/^\d+[\.\s]*/, '').trim();
        return normalized;
      };
      
      const normalizedSelectedAccount = normalizeAccountName(selectedAccount);
      
      // 유사한 이름 찾기 (정확히 일치하는 것 우선, 부분 일치도 시도)
      let similarSheet = previousSheetNames.find(name => {
        const normalizedName = normalizeAccountName(name);
        // 정규화된 이름이 정확히 일치하는지 확인
        return normalizedName === normalizedSelectedAccount;
      });
      
      // 정확히 일치하는 것이 없으면 부분 일치 시도
      if (!similarSheet) {
        similarSheet = previousSheetNames.find(name => {
          const normalizedName = normalizeAccountName(name);
          // 정규화된 이름이 포함되어 있는지 확인 (양방향)
          return normalizedName.includes(normalizedSelectedAccount) || 
                 normalizedSelectedAccount.includes(normalizedName);
        });
      }
      
      if (similarSheet) {
        previousSheet = previousWorkbook.Sheets[similarSheet];
        console.log(`🔍 전기 시트 찾기 성공: "${selectedAccount}" → "${similarSheet}"`);
      } else {
        console.warn(`⚠️ 전기 데이터에서 계정 "${selectedAccount}"를 찾을 수 없습니다.`, {
          정규화된계정명: normalizedSelectedAccount,
          전기시트목록: previousSheetNames.slice(0, 30).map(n => ({ 원본: n, 정규화: normalizeAccountName(n) })),
          선택된계정: selectedAccount,
          전체시트수: previousSheetNames.length
        });
      }
    } else {
      console.log(`✅ 전기 시트 찾기 성공 (정확한 이름): "${selectedAccount}"`);
    }

    if (!currentSheet) return [];

      const { data: currentData, headers: currentHeaders } = getDataFromSheet(currentSheet);
    const { data: previousData, headers: previousHeaders } = getDataFromSheet(previousSheet || undefined);

    console.log(`📊 [${selectedAccount}] 데이터 로드:`, {
      당기데이터행수: currentData.length,
      전기데이터행수: previousData.length,
      당기헤더: currentHeaders,
      전기헤더: previousHeaders,
      전기시트존재: !!previousSheet
    });

    if (currentData.length === 0) return [];

    // 헤더 찾기 (더 강력한 검색)
    const currentDebitHeader = robustFindHeader(currentHeaders, ['차변', 'debit', '차변금액', '차  변']) ||
                               currentHeaders.find(h => h.toLowerCase().replace(/\s/g, '').includes('차변'));
    const currentCreditHeader = robustFindHeader(currentHeaders, ['대변', 'credit', '대변금액', '대  변']) ||
                                currentHeaders.find(h => h.toLowerCase().replace(/\s/g, '').includes('대변'));
    const previousDebitHeader = robustFindHeader(previousHeaders, ['차변', 'debit', '차변금액', '차  변']) ||
                                previousHeaders.find(h => h.toLowerCase().replace(/\s/g, '').includes('차변'));
    const previousCreditHeader = robustFindHeader(previousHeaders, ['대변', 'credit', '대변금액', '대  변']) ||
                                 previousHeaders.find(h => h.toLowerCase().replace(/\s/g, '').includes('대변'));
    
    console.log(`🔍 [${selectedAccount}] 헤더 찾기 결과:`, {
      당기차변: currentDebitHeader || '❌ 없음',
      당기대변: currentCreditHeader || '❌ 없음',
      전기차변: previousDebitHeader || '❌ 없음',
      전기대변: previousCreditHeader || '❌ 없음',
      전기헤더목록: previousHeaders
    });

    const vendorHeader = robustFindHeader(currentHeaders, ['거래처명', '거래처', '업체', '회사', 'vendor', 'customer']) ||
                         currentHeaders.find(h => 
                           h.includes('거래처') || h.includes('업체') || h.includes('회사') || 
                           h.toLowerCase().includes('vendor') || h.toLowerCase().includes('customer')
                         );
    const previousVendorHeader = robustFindHeader(previousHeaders, ['거래처명', '거래처', '업체', '회사', 'vendor', 'customer']) ||
                                previousHeaders.find(h => 
                                  h.includes('거래처') || h.includes('업체') || h.includes('회사') || 
                                  h.toLowerCase().includes('vendor') || h.toLowerCase().includes('customer')
                                );

    if (!vendorHeader) return [];

    // 거래처가 비어 있는 경우 표시용 라벨 (전기이월 행 등도 집계되도록)
    const EMPTY_VENDOR_LABEL = '(거래처 없음)';

    // 거래처별 금액 집계
    const vendorMap = new Map<string, {
      currentDebit: number;
      currentCredit: number;
      previousDebit: number;
      previousCredit: number;
    }>();

    // 당기 데이터 처리
      currentData.forEach(row => {
      const vendor = String(row[vendorHeader] || '').trim() || EMPTY_VENDOR_LABEL;

      if (!vendorMap.has(vendor)) {
        vendorMap.set(vendor, {
          currentDebit: 0,
          currentCredit: 0,
          previousDebit: 0,
          previousCredit: 0,
        });
      }

      const vendorData = vendorMap.get(vendor)!;
        const debit = currentDebitHeader ? cleanAmount(row[currentDebitHeader]) : 0;
        const credit = currentCreditHeader ? cleanAmount(row[currentCreditHeader]) : 0;
      vendorData.currentDebit += debit;
      vendorData.currentCredit += credit;
    });

    // 전기 데이터 처리
    if (previousSheet && previousData.length > 0) {
      if (!previousVendorHeader) {
        console.warn(`⚠️ [${selectedAccount}] 전기 데이터에서 거래처 헤더를 찾을 수 없습니다.`, {
          전기헤더: previousHeaders
        });
      }
      
      if (!previousDebitHeader && !previousCreditHeader) {
        console.warn(`⚠️ [${selectedAccount}] 전기 데이터에서 차변/대변 헤더를 찾을 수 없습니다.`, {
          전기헤더: previousHeaders,
          전기헤더상세: previousHeaders.map((h, i) => `${i}: "${h}"`)
        });
      }

      // 거래처 헤더가 있고, 차변 또는 대변 헤더 중 하나라도 있으면 처리
      if (previousVendorHeader && (previousDebitHeader || previousCreditHeader)) {
        let processedCount = 0;
        previousData.forEach(row => {
          const vendor = String(row[previousVendorHeader] || '').trim() || EMPTY_VENDOR_LABEL;

          if (!vendorMap.has(vendor)) {
            vendorMap.set(vendor, {
              currentDebit: 0,
              currentCredit: 0,
              previousDebit: 0,
              previousCredit: 0,
            });
          }

          const vendorData = vendorMap.get(vendor)!;
          const debit = previousDebitHeader ? cleanAmount(row[previousDebitHeader]) : 0;
          const credit = previousCreditHeader ? cleanAmount(row[previousCreditHeader]) : 0;
          vendorData.previousDebit += debit;
          vendorData.previousCredit += credit;
          // 마이너스 금액만 있는 행도 집계 건수에 포함
          if (debit !== 0 || credit !== 0) {
            processedCount++;
          }
        });
        console.log(`✅ [${selectedAccount}] 전기 데이터 처리 완료: ${processedCount}건의 거래 처리`);
      } else {
        console.warn(`⚠️ [${selectedAccount}] 전기 데이터 처리 불가: 필요한 헤더가 없습니다.`, {
          거래처헤더: previousVendorHeader || '❌ 없음',
          차변헤더: previousDebitHeader || '❌ 없음',
          대변헤더: previousCreditHeader || '❌ 없음'
        });
      }
    } else if (previousSheet) {
      console.warn(`⚠️ [${selectedAccount}] 전기 데이터가 비어있습니다.`);
    } else {
      console.warn(`⚠️ [${selectedAccount}] 전기 시트를 찾을 수 없습니다.`, {
        당기계정명: selectedAccount,
        전기시트목록: Object.keys(previousWorkbook.Sheets).slice(0, 20)
      });
    }

    // 결과 배열 생성
    const results: {
      vendor: string;
      currentAmount: number;
      previousAmount: number;
      currentDebit: number;
      currentCredit: number;
      previousDebit: number;
      previousCredit: number;
      change: number;
      changePercent: number;
    }[] = [];

    vendorMap.forEach((data, vendor) => {
      // 금액 필터 적용
      let currentAmount = 0;
      let previousAmount = 0;
      
      if (amountFilter === 'debit') {
        currentAmount = data.currentDebit;
        previousAmount = data.previousDebit;
      } else if (amountFilter === 'credit') {
        currentAmount = data.currentCredit;
        previousAmount = data.previousCredit;
      } else {
        // all: 차변 + 대변
        currentAmount = data.currentDebit + data.currentCredit;
        previousAmount = data.previousDebit + data.previousCredit;
      }

      if (currentAmount === 0 && previousAmount === 0) return;

      const change = currentAmount - previousAmount;
      const changePercent = previousAmount !== 0 ? (change / previousAmount) * 100 : (currentAmount > 0 ? 100 : 0);

      results.push({
        vendor,
        currentAmount,
        previousAmount,
        currentDebit: data.currentDebit,
        currentCredit: data.currentCredit,
        previousDebit: data.previousDebit,
        previousCredit: data.previousCredit,
        change,
        changePercent,
      });
    });

    // 변동률 절대값 기준으로 정렬
    return results.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  }, [currentWorkbook, previousWorkbook, selectedAccount, amountFilter]);

  const downloadExcel = () => {
    if (!selectedAccount) {
      toast({
        title: '오류',
        description: '계정명을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [
      ['전기 비교 분석'],
      [`계정과목: ${selectedAccount}`],
      [],
      ['거래처', '당기', '전기', '증감액', '증감률(%)'],
      ...comparisonData.map(item => [
        item.vendor,
        item.currentAmount,
        item.previousAmount,
        item.change,
        item.changePercent.toFixed(1),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(wb, ws, '전기비교');
    XLSX.writeFile(wb, `전기비교분석_${selectedAccount}_${new Date().toISOString().split('T')[0]}.xlsx`);

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
    <div className="space-y-4 max-w-[80%] mx-auto">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Scale className="h-4 w-4 text-primary" />
                전기 데이터 비교 분석
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                당기와 전기 데이터를 비교하여 증감 현황을 분석합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 검색 및 필터 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 계정명 검색 - 자동완성 */}
            <div className="space-y-1.5">
              <Label className="text-xs">계정명 선택 (필수)</Label>
              <Popover open={accountComboboxOpen} onOpenChange={setAccountComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={accountComboboxOpen}
                    className="w-full justify-between h-9"
                    size="sm"
                  >
                    <span className="text-xs">{selectedAccount || "계정명을 선택하거나 입력하세요"}</span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="계정명 검색..." 
                      value={selectedAccount}
                      onValueChange={setSelectedAccount}
                      className="h-9"
                    />
                    <CommandList>
                      <CommandEmpty>계정을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {currentAccounts
                          .filter(account => 
                            !selectedAccount || 
                            account.toLowerCase().includes(selectedAccount.toLowerCase())
                          )
                          .slice(0, 100)
                          .map((account) => (
                            <CommandItem
                              key={account}
                              value={account}
                              onSelect={() => {
                                setSelectedAccount(account);
                                setAccountComboboxOpen(false);
                              }}
                              className="text-xs"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5",
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
              {selectedAccount && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSelectedAccount('')}
                >
                  초기화
                </Button>
              )}
            </div>

            {/* 금액 유형 선택 */}
            <div className="space-y-1.5">
              <Label className="text-xs">금액 유형</Label>
              <RadioGroup value={amountFilter} onValueChange={(value) => setAmountFilter(value as 'all' | 'debit' | 'credit')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="all" className="h-4 w-4" />
                  <Label htmlFor="all" className="cursor-pointer text-xs">차변+대변 모두</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="debit" id="debit" className="h-4 w-4" />
                  <Label htmlFor="debit" className="cursor-pointer text-xs">차변만</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="credit" id="credit" className="h-4 w-4" />
                  <Label htmlFor="credit" className="cursor-pointer text-xs">대변만</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {selectedAccount && (
          <Button onClick={downloadExcel} size="sm">
            <Download className="mr-2 h-3.5 w-3.5" />
            비교표 다운로드
          </Button>
          )}
        </CardContent>
      </Card>

      {/* 비교 결과 테이블 */}
      {selectedAccount && (
      <Card>
        <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {selectedAccount} - 거래처별 증감 현황 ({comparisonData.length}개)
            </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
            {comparisonData.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-xs">선택한 계정에 거래처 데이터가 없습니다.</p>
              </div>
            ) : (
          <>
            {/* 거래처별 당기/전기 비교 그래프 (상위 10개) */}
            {comparisonData.length > 0 && (
              <div className="rounded-md border p-4 bg-background">
                <h4 className="text-sm font-semibold mb-4 text-center">거래처별 당기/전기 비교 (상위 10개)</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart 
                    data={comparisonData
                      .sort((a, b) => Math.abs(b.currentAmount) - Math.abs(a.currentAmount))
                      .slice(0, 10)
                      .map(item => ({
                        거래처: item.vendor.length > 10 ? item.vendor.substring(0, 10) + '...' : item.vendor,
                        당기: item.currentAmount,
                        전기: item.previousAmount,
                      }))}
                    margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="거래처" 
                      tick={{ fontSize: 10 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                    />
                    <Tooltip 
                      formatter={(value: number) => value.toLocaleString()}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="당기" fill="#3b82f6" name="당기" />
                    <Bar dataKey="전기" fill="#94a3b8" name="전기" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {/* 비교 결과 테이블 */}
          <div className="rounded-md border max-h-[480px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                      <TableHead className="text-xs">거래처</TableHead>
                  <TableHead className="text-right text-xs">당기</TableHead>
                  <TableHead className="text-right text-xs">전기</TableHead>
                  <TableHead className="text-right text-xs">증감액</TableHead>
                  <TableHead className="text-right text-xs">증감률</TableHead>
                  <TableHead className="text-xs">변동</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonData.map((item, idx) => (
                  <TableRow key={idx}>
                        <TableCell className="font-medium text-xs">{item.vendor}</TableCell>
                    <TableCell className="text-right text-xs">{item.currentAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs">{item.previousAmount.toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-medium text-xs ${item.change >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {item.change >= 0 ? '+' : ''}{item.change.toLocaleString()}
                    </TableCell>
                    <TableCell className={`text-right font-medium text-xs ${item.changePercent >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      {Math.abs(item.changePercent) >= 20 ? (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          {item.changePercent > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          주요 변동
                        </Badge>
                      ) : Math.abs(item.changePercent) >= 10 ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          {item.changePercent > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          변동
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">안정</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
          </>
            )}
          </CardContent>
        </Card>
      )}

      {!selectedAccount && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <p className="text-xs">계정명을 선택하면 해당 계정의 거래처별 당기/전기 비교 분석이 표시됩니다.</p>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
};

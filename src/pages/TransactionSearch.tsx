import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Search, Download, Check, ChevronsUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

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

const robustFindHeader = (headers: string[], keywords: string[]): string | undefined => 
  headers.find(h => {
    const cleanedHeader = (h || "").toLowerCase().replace(/\s/g, '').replace(/^\d+[_.-]?/, '');
    return keywords.some(kw => {
      const cleanedKw = kw.toLowerCase().replace(/\s/g, '');
      return cleanedHeader.includes(cleanedKw);
    });
  });

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

  const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  if (sheetDataAsArrays.length < 2) return { data: [], headers: [] };

  let headerIndex = -1;
  const searchLimit = Math.min(20, sheetDataAsArrays.length);
  const dateKeywords = ['일자', '날짜', '거래일', 'date'];
  const otherHeaderKeywords = ['적요', '거래처', '차변', '대변', '잔액', '금액', '코드', '내용', '비고'];

  for (let i = 0; i < searchLimit; i++) {
    const potentialHeaderRow = sheetDataAsArrays[i];
    if (!potentialHeaderRow || potentialHeaderRow.length < 3) continue;

    const headerContent = potentialHeaderRow.map(cell => String(cell || '').trim().toLowerCase()).join('|');
    const hasDateKeyword = dateKeywords.some(kw => headerContent.includes(kw));
    const otherKeywordCount = otherHeaderKeywords.filter(kw => headerContent.includes(kw)).length;

    if (hasDateKeyword && otherKeywordCount >= 2) {
      const lookaheadLimit = Math.min(i + 6, sheetDataAsArrays.length);
      for (let j = i + 1; j < lookaheadLimit; j++) {
        const dataRowCandidate = sheetDataAsArrays[j];
        if (dataRowCandidate && parseDate(dataRowCandidate[0]) !== null) {
          headerIndex = i;
          break;
        }
      }
    }
    if (headerIndex !== -1) break;
  }

  if (headerIndex === -1) {
    for (let i = 0; i < searchLimit; i++) {
      const row = sheetDataAsArrays[i];
      if (!row || row.length < 2) continue;
      const rowContent = row.map(cell => String(cell || '').trim().toLowerCase()).join(' ');
      if (dateKeywords.some(kw => rowContent.includes(kw)) && otherHeaderKeywords.filter(kw => rowContent.includes(kw)).length >= 2) {
        if (i + 1 < sheetDataAsArrays.length && sheetDataAsArrays[i + 1]?.some(cell => cell !== null)) {
          headerIndex = i;
          break;
        }
      }
    }
  }

  if (headerIndex === -1) {
    let maxNonEmptyCells = 0;
    let potentialHeaderIndex = -1;
    for (let i = 0; i < searchLimit; i++) {
      const row = sheetDataAsArrays[i];
      if (!row) continue;
      const nonEmptyCells = row.filter(cell => cell !== null && String(cell).trim() !== '');
      if (nonEmptyCells.length === 1 && String(nonEmptyCells[0]).trim() === '계정별원장') continue;
      if (nonEmptyCells.length >= maxNonEmptyCells && nonEmptyCells.length >= 3) {
        maxNonEmptyCells = nonEmptyCells.length;
        potentialHeaderIndex = i;
      }
    }
    headerIndex = potentialHeaderIndex;
  }

  if (headerIndex === -1) return { data: [], headers: [] };

  // 원본 Excel 헤더 행을 그대로 사용 (모든 컬럼 포함)
  const orderedHeaders = (sheetDataAsArrays[headerIndex] || []).map(h => String(h || '').trim());
  
  // 헤더 행 다음부터 데이터 시작
  const rawDataArray = sheetDataAsArrays.slice(headerIndex + 1).filter(row => {
    // 빈 행 제거
    return row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
  });
  
  // 수동으로 데이터 객체 생성 (orderedHeaders의 모든 컬럼 포함)
  const rawData: LedgerRow[] = rawDataArray.map(row => {
    const obj: LedgerRow = {};
    orderedHeaders.forEach((header, index) => {
      // 헤더가 있으면 해당 인덱스의 데이터를 사용 (빈 값도 포함)
      if (header && header.trim() !== '') {
        obj[header] = row[index] !== null && row[index] !== undefined ? row[index] : '';
      }
    });
    return obj;
  });

  // 필터링: 합계행, 빈행, 헤더 중복 제거
  const data = rawData.filter(row => {
    // 1. 합계 행 제거: [전 기 이 월], [월 계], [누 계] 등
    const firstValue = Object.values(row)[0];
    if (firstValue && String(firstValue).includes('[') && String(firstValue).includes(']')) {
      return false;
    }
    
    // 2. 헤더 중복 제거 (두 번째 페이지 등)
    const dateHeader = robustFindHeader(orderedHeaders, dateKeywords);
    if (dateHeader && (row[dateHeader] === dateHeader || row[dateHeader] === '일  자' || row[dateHeader] === '일자')) {
      return false;
    }
    
    // 3. 완전 빈 행 제거 강화
    const hasData = Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      return str !== '' && str !== '0' && str !== '-';
    });
    if (!hasData) return false;
    
    return true;
  });

  const dateHeader = robustFindHeader(orderedHeaders, dateKeywords);
  if (dateHeader) {
    data.forEach(row => {
      const parsed = parseDate(row[dateHeader]);
      if (parsed) {
        row[dateHeader] = parsed;
      }
    });
  }

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  
  return { data, headers };
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
  const [vendorComboboxOpen, setVendorComboboxOpen] = useState(false);
  const [descriptionComboboxOpen, setDescriptionComboboxOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<'detail' | 'monthly'>('detail');
  const [amountFilter, setAmountFilter] = useState<'all' | 'debit' | 'credit'>('all');

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

  // 모든 거래처 목록 추출 (자동완성용)
  const vendorList = useMemo(() => {
    const vendorSet = new Set<string>();
    
    allData.forEach(({ data, headers }) => {
      const vendorHeader = robustFindHeader(headers, ['거래처', '업체', '회사', 'vendor', 'customer']) ||
                           headers.find(h => 
                             h.includes('거래처') || h.includes('업체') || h.includes('회사') || 
                             h.toLowerCase().includes('vendor') || h.toLowerCase().includes('customer')
                           );
      
      if (vendorHeader) {
        data.forEach(row => {
          const vendor = String(row[vendorHeader] || '').trim();
          if (vendor && vendor !== '') {
            vendorSet.add(vendor);
          }
        });
      }
    });
    
    return Array.from(vendorSet).sort();
  }, [allData]);

  // 모든 적요 목록 추출 (자동완성용)
  const descriptionList = useMemo(() => {
    const descSet = new Set<string>();
    
    allData.forEach(({ data, headers }) => {
      const descHeader = headers.find(h => 
        h.includes('적요') || h.includes('내용') || h.includes('비고') ||
        h.toLowerCase().includes('description') || h.toLowerCase().includes('remark')
      );
      
      if (descHeader) {
        data.forEach(row => {
          const desc = String(row[descHeader] || '').trim();
          if (desc && desc !== '') {
            descSet.add(desc);
          }
        });
      }
    });
    
    return Array.from(descSet).sort();
  }, [allData]);

  // 월합계 데이터 계산
  const monthlyData = useMemo(() => {
    if (displayMode !== 'monthly' || searchResults.length === 0) return null;

    const dateHeader = Object.keys(searchResults[0] || {}).find(h => 
      h.includes('일자') || h.includes('날짜')
    );
    const debitHeader = Object.keys(searchResults[0] || {}).find(h => 
      h.includes('차변')
    );
    const creditHeader = Object.keys(searchResults[0] || {}).find(h => 
      h.includes('대변')
    );

    if (!dateHeader) return null;

    const monthlyMap = new Map<string, { 
      debit: number; 
      credit: number; 
      count: number;
      accounts: Set<string>;
    }>();

    searchResults.forEach(row => {
      const date = row[dateHeader];
      if (!(date instanceof Date)) return;

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
      const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
      const account = String(row['계정과목'] || '');

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { debit: 0, credit: 0, count: 0, accounts: new Set() });
      }

      const monthly = monthlyMap.get(monthKey)!;
      monthly.debit += debit;
      monthly.credit += credit;
      monthly.count++;
      if (account) monthly.accounts.add(account);
    });

    return Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        월: month,
        차변: data.debit,
        대변: data.credit,
        잔액: data.debit - data.credit,
        건수: data.count,
        계정수: data.accounts.size,
      }))
      .sort((a, b) => a.월.localeCompare(b.월));
  }, [searchResults, displayMode]);

  const handleSearch = () => {
    // 계정명이 선택되지 않았을 때, 거래처나 적요 중 하나라도 입력되어야 검색 가능
    if (!selectedAccount && !searchVendor && !searchDescription) {
      toast({
        title: '검색 조건 오류',
        description: '계정명이 선택되지 않았을 경우, 거래처나 적요 중 하나 이상을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    let results: LedgerRow[] = [];

    const accountsToSearch = selectedAccount ? [selectedAccount] : accountNames;

    accountsToSearch.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data, headers } = getDataFromSheet(sheet);

      const vendorHeader = robustFindHeader(headers, ['거래처', '업체', '회사', 'vendor', 'customer']) || 
                           headers.find(h => h.includes('거래처') || h.includes('업체'));
      const descHeader = robustFindHeader(headers, ['적요', '내용', '비고', 'description', 'remark']) ||
                         headers.find(h => h.includes('적요') || h.includes('내용') || h.includes('비고'));
      const dateHeader = robustFindHeader(headers, ['일자', '날짜', '거래일', 'date']) ||
                         headers.find(h => h.includes('일자') || h.includes('날짜'));
      const debitHeader = robustFindHeader(headers, ['차변', 'debit', '차변금액']) ||
                          headers.find(h => h.includes('차변'));
      const creditHeader = robustFindHeader(headers, ['대변', 'credit', '대변금액']) ||
                           headers.find(h => h.includes('대변'));

      // 디버깅: 거래처 검색 시 로그 출력
      if (searchVendor && vendorHeader) {
        console.log(`🔍 [${accountName}] 거래처 헤더: "${vendorHeader}", 검색어: "${searchVendor}"`);
        console.log(`🔍 [${accountName}] 데이터 건수: ${data.length}`);
      }

      data.forEach(row => {
        let match = true;

        // 거래처 필터
        if (searchVendor && vendorHeader) {
          const vendor = String(row[vendorHeader] || '').trim();
          const searchTerm = searchVendor.trim();
          // 대소문자 구분 없이 부분 일치 검색
          const vendorLower = vendor.toLowerCase();
          const searchLower = searchTerm.toLowerCase();
          if (!vendorLower.includes(searchLower)) {
            match = false;
          } else {
            // 매칭된 경우 디버깅 로그 (처음 몇 개만)
            if (results.length < 5) {
              console.log(`✅ 매칭 발견: "${vendor}" (검색어: "${searchTerm}")`);
            }
          }
        }

        // 적요 필터
        if (searchDescription && descHeader) {
          const desc = String(row[descHeader] || '').toLowerCase();
          if (!desc.includes(searchDescription.toLowerCase())) {
            match = false;
          }
        }

        // 차변/대변 필터
        const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
        const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
        
        if (amountFilter === 'debit' && debit === 0) {
          match = false;
        }
        if (amountFilter === 'credit' && credit === 0) {
          match = false;
        }
        if (amountFilter === 'all' && debit === 0 && credit === 0) {
          match = false;
        }

        // 금액 필터
        if (minAmount || maxAmount) {
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
    
    if (displayMode === 'monthly' && monthlyData) {
      // 월합계 다운로드
      const ws = XLSX.utils.json_to_sheet(monthlyData);
      XLSX.utils.book_append_sheet(wb, ws, '월합계');
      XLSX.writeFile(wb, `거래검색_월합계_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      // 상세내역 다운로드
      const ws = XLSX.utils.json_to_sheet(searchResults);
      XLSX.utils.book_append_sheet(wb, ws, '검색결과');
      XLSX.writeFile(wb, `거래검색_상세내역_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

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
              <Label>계정과목 (선택사항 - 미선택 시 거래처/적요 필수)</Label>
              <Select value={selectedAccount || undefined} onValueChange={(value) => setSelectedAccount(value || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="전체 계정 (선택 안 함)" />
                </SelectTrigger>
                <SelectContent>
                  {accountNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 거래처 검색 - 자동완성 */}
            <div className="space-y-2">
              <Label>거래처명 (부분 일치)</Label>
              <Popover open={vendorComboboxOpen} onOpenChange={setVendorComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vendorComboboxOpen}
                    className="w-full justify-between"
                  >
                    {searchVendor || "거래처를 선택하거나 입력하세요"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="거래처 검색..." 
                      value={searchVendor}
                      onValueChange={setSearchVendor}
                    />
                    <CommandList>
                      <CommandEmpty>거래처를 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {vendorList
                          .filter(vendor => 
                            !searchVendor || 
                            vendor.toLowerCase().includes(searchVendor.toLowerCase())
                          )
                          .slice(0, 100)
                          .map((vendor) => (
                            <CommandItem
                              key={vendor}
                              value={vendor}
                              onSelect={() => {
                                setSearchVendor(vendor);
                                setVendorComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  searchVendor === vendor ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {vendor}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {searchVendor && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSearchVendor('')}
                >
                  초기화
                </Button>
              )}
            </div>

            {/* 적요 검색 - 자동완성 */}
            <div className="space-y-2">
              <Label>적요 (부분 일치)</Label>
              <Popover open={descriptionComboboxOpen} onOpenChange={setDescriptionComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={descriptionComboboxOpen}
                    className="w-full justify-between"
                  >
                    {searchDescription || "적요를 선택하거나 입력하세요"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="적요 검색..." 
                      value={searchDescription}
                      onValueChange={setSearchDescription}
                    />
                    <CommandList>
                      <CommandEmpty>적요를 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {descriptionList
                          .filter(desc => 
                            !searchDescription || 
                            desc.toLowerCase().includes(searchDescription.toLowerCase())
                          )
                          .slice(0, 100)
                          .map((desc) => (
                            <CommandItem
                              key={desc}
                              value={desc}
                              onSelect={() => {
                                setSearchDescription(desc);
                                setDescriptionComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  searchDescription === desc ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {desc}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {searchDescription && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSearchDescription('')}
                >
                  초기화
                </Button>
              )}
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

            {/* 차변/대변 필터 */}
            <div className="space-y-2">
              <Label>금액 유형</Label>
              <RadioGroup value={amountFilter} onValueChange={(value) => setAmountFilter(value as 'all' | 'debit' | 'credit')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="amount-all" />
                  <Label htmlFor="amount-all" className="font-normal cursor-pointer">차변+대변 모두</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="debit" id="amount-debit" />
                  <Label htmlFor="amount-debit" className="font-normal cursor-pointer">차변만</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="credit" id="amount-credit" />
                  <Label htmlFor="amount-credit" className="font-normal cursor-pointer">대변만</Label>
                </div>
              </RadioGroup>
            </div>

            {/* 표시 방식 선택 */}
            <div className="space-y-2">
              <Label>표시 방식</Label>
              <RadioGroup value={displayMode} onValueChange={(value) => setDisplayMode(value as 'detail' | 'monthly')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="detail" id="display-detail" />
                  <Label htmlFor="display-detail" className="font-normal cursor-pointer">상세내역</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="display-monthly" />
                  <Label htmlFor="display-monthly" className="font-normal cursor-pointer">월합계</Label>
                </div>
              </RadioGroup>
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
              <CardTitle>
                검색 결과 ({displayMode === 'monthly' && monthlyData 
                  ? monthlyData.length.toLocaleString() + '개월' 
                  : searchResults.length.toLocaleString() + '건'})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {displayMode === 'monthly' && monthlyData ? (
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>월</TableHead>
                        <TableHead className="text-right">차변</TableHead>
                        <TableHead className="text-right">대변</TableHead>
                        <TableHead className="text-right">잔액</TableHead>
                        <TableHead className="text-right">건수</TableHead>
                        <TableHead className="text-right">계정수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.월}</TableCell>
                          <TableCell className="text-right">{row.차변.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.대변.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{row.잔액.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.건수.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.계정수.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
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
              )}
              {displayMode === 'detail' && searchResults.length > 200 && (
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

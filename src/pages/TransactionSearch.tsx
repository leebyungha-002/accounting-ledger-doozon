import React, { useState, useMemo, useEffect } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { findDebitCreditHeaders, robustFindHeader } from '@/lib/headerUtils';
import { maskAccountNumbersInRows } from '@/lib/anonymization';
import { 
  DATE_KEYWORDS, 
  VENDOR_KEYWORDS, 
  DESCRIPTION_KEYWORDS, 
  ACCOUNT_KEYWORDS,
  DEBIT_KEYWORDS,
  CREDIT_KEYWORDS
} from '@/lib/columnMapping';

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



const parseDate = (value: any): Date | null => {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    // YYYY-MM-DD, YYYY/MM/DD
    const ymd = trimmed.match(/^(?<y>\d{4})[-/](?<month>\d{1,2})[-/](?<day>\d{1,2})$/);
    if (ymd && ymd.groups) {
      const y = parseInt(ymd.groups.y, 10);
      const month = parseInt(ymd.groups.month, 10) - 1;
      const day = parseInt(ymd.groups.day, 10);
      const d = new Date(y, month, day);
      if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
    // YYYY.MM.DD
    const ymdDot = trimmed.match(/^(?<y>\d{4})\.(?<month>\d{1,2})\.(?<day>\d{1,2})$/);
    if (ymdDot && ymdDot.groups) {
      const y = parseInt(ymdDot.groups.y, 10);
      const month = parseInt(ymdDot.groups.month, 10) - 1;
      const day = parseInt(ymdDot.groups.day, 10);
      const d = new Date(y, month, day);
      if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
    // YYYYMMDD (8자리)
    if (/^\d{8}$/.test(trimmed)) {
      const y = parseInt(trimmed.slice(0, 4), 10);
      const month = parseInt(trimmed.slice(4, 6), 10) - 1;
      const day = parseInt(trimmed.slice(6, 8), 10);
      const d = new Date(y, month, day);
      if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
    // MM-DD, MM/DD (당해)
    const match = trimmed.match(/^(?<month>\d{1,2})[-/](?<day>\d{1,2})$/);
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
  const otherHeaderKeywords = ['적요', '거래처', '차변', '대변', '잔액', '금액', '코드', '내용', '비고'];

  for (let i = 0; i < searchLimit; i++) {
    const potentialHeaderRow = sheetDataAsArrays[i];
    if (!potentialHeaderRow || potentialHeaderRow.length < 3) continue;

    const headerContent = potentialHeaderRow.map(cell => String(cell || '').trim().toLowerCase()).join('|');
    const hasDateKeyword = DATE_KEYWORDS.some(kw => headerContent.includes(kw));
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
      if (DATE_KEYWORDS.some(kw => rowContent.includes(kw)) && otherHeaderKeywords.filter(kw => rowContent.includes(kw)).length >= 2) {
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
    // 1. 합계 행 제거: 모든 컬럼의 값을 확인하여 월계/누계 행 제거
    const isMonthlyOrCumulative = Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      // 공백 제거 후 정규화
      const normalized = str.replace(/\s/g, '');
      // 다양한 형태의 월계/누계 확인
      return normalized.includes('월계') || 
             normalized.includes('누계') ||
             normalized.includes('[월계]') || 
             normalized.includes('[누계]') ||
             normalized === '월계' ||
             normalized === '누계' ||
             str.includes('[ 월계 ]') ||
             str.includes('[ 누계 ]') ||
             str.includes('[월 계]') ||
             str.includes('[누 계]') ||
             str.includes('[ 전 기 이 월 ]') ||
             str.includes('[ 전기이월 ]');
    });
    
    if (isMonthlyOrCumulative) {
      return false;
    }
    
    // 2. 헤더 중복 제거 (두 번째 페이지 등)
    const dateHeader = robustFindHeader(orderedHeaders, DATE_KEYWORDS);
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

  const dateHeader = robustFindHeader(orderedHeaders, DATE_KEYWORDS);
  if (dateHeader) {
    data.forEach(row => {
      const parsed = parseDate(row[dateHeader]);
      if (parsed) {
        row[dateHeader] = parsed;
      }
    });
  }

  // 예금계정/차입금계정의 계좌번호 마스킹 ('계정명'을 우선순위로)
  const accountNameHeader = robustFindHeader(orderedHeaders, ACCOUNT_KEYWORDS);
  const maskedData = maskAccountNumbersInRows(data, accountNameHeader);

  const headers = maskedData.length > 0 ? Object.keys(maskedData[0]) : [];
  
  return { data: maskedData, headers };
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
  const [accountComboboxOpen, setAccountComboboxOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<'detail' | 'monthly' | 'vendor'>('detail');
  const [amountFilter, setAmountFilter] = useState<'all' | 'debit' | 'credit'>('all');
  const [selectedVendorForDrilldown, setSelectedVendorForDrilldown] = useState<string | null>(null);
  const [monthlyDrilldown, setMonthlyDrilldown] = useState<{ month: string; side: 'debit' | 'credit'; vendor?: string } | null>(null);

  // 복수 입력 시 콤보 입력란에는 '마지막 세그먼트'만 표시 (쉼표 입력 시 '찾을 수 없습니다' 방지)
  const accountInputValue = (selectedAccount.split(',').pop() ?? '').trim();
  const vendorInputValue = (searchVendor.split(',').pop() ?? '').trim();

  // 표시 방식 변경 시 드릴다운 초기화
  useEffect(() => {
    setSelectedVendorForDrilldown(null);
    setMonthlyDrilldown(null);
  }, [displayMode]);

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
      const vendorHeader = robustFindHeader(headers, VENDOR_KEYWORDS);
      
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
      const descHeader = robustFindHeader(headers, DESCRIPTION_KEYWORDS);
      
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

  // 거래처별 합계 데이터 계산
  const vendorData = useMemo(() => {
    if (displayMode !== 'vendor' || searchResults.length === 0) return null;

    const vendorHeader = Object.keys(searchResults[0] || {}).find(h => 
      h.includes('거래처') || h.includes('업체') || h.includes('회사') ||
      h.toLowerCase().includes('vendor') || h.toLowerCase().includes('customer')
    );
    const debitHeader = Object.keys(searchResults[0] || {}).find(h => 
      h.includes('차변')
    );
    const creditHeader = Object.keys(searchResults[0] || {}).find(h => 
      h.includes('대변')
    );

    if (!vendorHeader) return null;

    const vendorMap = new Map<string, { 
      debit: number; 
      credit: number; 
      balance: number;
      count: number;
      accounts: Set<string>;
    }>();

    searchResults.forEach(row => {
      const vendor = String(row[vendorHeader] || '').trim();
      if (!vendor || vendor === '') return;

      const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
      const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
      const account = String(row['계정과목'] || '');

      if (!vendorMap.has(vendor)) {
        vendorMap.set(vendor, { debit: 0, credit: 0, balance: 0, count: 0, accounts: new Set() });
      }

      const vendorInfo = vendorMap.get(vendor)!;
      vendorInfo.debit += debit;
      vendorInfo.credit += credit;
      vendorInfo.balance += (debit - credit);
      vendorInfo.count++;
      if (account) vendorInfo.accounts.add(account);
    });

    return Array.from(vendorMap.entries())
      .map(([vendor, data]) => ({
        거래처: vendor,
        차변: data.debit,
        대변: data.credit,
        잔액: data.balance,
        건수: data.count,
        계정수: data.accounts.size,
      }))
      .sort((a, b) => (b.차변 + b.대변) - (a.차변 + a.대변));
  }, [searchResults, displayMode]);

  // 월합계 데이터 계산 — 거래처별로 구분
  const monthlyData = useMemo(() => {
    if (displayMode !== 'monthly' || searchResults.length === 0) return null;

    const headers = Object.keys(searchResults[0] || {});
    const dateHeader = robustFindHeader(headers, DATE_KEYWORDS) ||
      headers.find((h: string) => h.includes('일자') || h.includes('날짜') || h.toLowerCase().includes('date'));
    const vendorHeader = robustFindHeader(headers, VENDOR_KEYWORDS) ||
      headers.find((h: string) => h.includes('거래처') || h.toLowerCase().includes('vendor'));
    const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, searchResults, dateHeader);

    if (!dateHeader) return null;

    const vendorMonthMap = new Map<string, Map<string, { debit: number; credit: number; count: number }>>();

    searchResults.forEach(row => {
      let date = row[dateHeader];
      if (!(date instanceof Date)) date = parseDate(date);
      if (!(date instanceof Date)) return;

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const vendor = vendorHeader ? String(row[vendorHeader] || '').trim() || '(거래처 없음)' : '(거래처 없음)';
      const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
      const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;

      if (!vendorMonthMap.has(vendor)) {
        vendorMonthMap.set(vendor, new Map());
      }
      const monthMap = vendorMonthMap.get(vendor)!;
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { debit: 0, credit: 0, count: 0 });
      }
      const data = monthMap.get(monthKey)!;
      data.debit += debit;
      data.credit += credit;
      data.count++;
    });

    const rows: { 거래처: string; 월: string; 차변: number; 대변: number; 잔액: number; 건수: number; isSubtotal?: boolean; isTotal?: boolean }[] = [];
    const vendors = Array.from(vendorMonthMap.keys()).sort();
    let grandDebit = 0, grandCredit = 0, grandCount = 0;

    vendors.forEach(v => {
      const monthMap = vendorMonthMap.get(v)!;
      const months = Array.from(monthMap.keys()).sort();
      let subDebit = 0, subCredit = 0, subCount = 0;
      months.forEach(monthKey => {
        const d = monthMap.get(monthKey)!;
        rows.push({
          거래처: v,
          월: monthKey,
          차변: d.debit,
          대변: d.credit,
          잔액: d.debit - d.credit,
          건수: d.count,
        });
        subDebit += d.debit;
        subCredit += d.credit;
        subCount += d.count;
      });
      rows.push({
        거래처: v,
        월: '소계',
        차변: subDebit,
        대변: subCredit,
        잔액: subDebit - subCredit,
        건수: subCount,
        isSubtotal: true,
      });
      grandDebit += subDebit;
      grandCredit += subCredit;
      grandCount += subCount;
    });

    rows.push({
      거래처: '',
      월: '합계',
      차변: grandDebit,
      대변: grandCredit,
      잔액: grandDebit - grandCredit,
      건수: grandCount,
      isTotal: true,
    });

    return rows;
  }, [searchResults, displayMode]);

  // 월합계에서 차변/대변 클릭 시 해당 월·해당 측(·거래처) 상세 내역
  const monthlyDrilldownRows = useMemo(() => {
    if (!monthlyDrilldown || searchResults.length === 0) return [];
    const headers = Object.keys(searchResults[0] || {});
    const dateHeader = robustFindHeader(headers, DATE_KEYWORDS) ||
      headers.find((h: string) => h.includes('일자') || h.includes('날짜') || h.toLowerCase().includes('date'));
    const vendorHeader = robustFindHeader(headers, VENDOR_KEYWORDS) ||
      headers.find((h: string) => h.includes('거래처') || h.toLowerCase().includes('vendor'));
    const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, searchResults, dateHeader);
    if (!dateHeader) return [];
    const isMonthKey = /^\d{4}-\d{2}$/.test(monthlyDrilldown.month);
    return searchResults.filter(row => {
      if (monthlyDrilldown.vendor !== undefined && monthlyDrilldown.vendor !== '' && vendorHeader) {
        const rowVendor = String(row[vendorHeader] || '').trim();
        if (rowVendor !== monthlyDrilldown.vendor) return false;
      }
      if (!isMonthKey) return false;
      const [y, m] = monthlyDrilldown.month.split('-').map(Number);
      let date = row[dateHeader];
      if (!(date instanceof Date)) date = parseDate(date);
      if (!(date instanceof Date)) return false;
      if (date.getFullYear() !== y || date.getMonth() + 1 !== m) return false;
      const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
      const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
      if (monthlyDrilldown.side === 'debit') return debit !== 0;
      return credit !== 0;
    });
  }, [monthlyDrilldown, searchResults]);

  // 월계/누계 행 여부
  const isMonthlyOrCumulativeRow = (row: LedgerRow): boolean =>
    Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      const normalized = str.replace(/\s/g, '');
      return normalized.includes('월계') || normalized.includes('누계') ||
        normalized.includes('[월계]') || normalized.includes('[누계]') ||
        normalized === '월계' || normalized === '누계' ||
        str.includes('[ 월계 ]') || str.includes('[ 누계 ]') ||
        str.includes('[월 계]') || str.includes('[누 계]');
    });

  // 행에서 거래처 값 추출 (시트별 헤더가 달라도 공통 키 후보 검사)
  const getVendorFromRow = (row: LedgerRow): string => {
    const keys = Object.keys(row);
    const h = keys.find(k =>
      k === '거래처명' || (k && (k.includes('거래처') || k.includes('업체') || k.includes('회사') ||
        k.toLowerCase().includes('vendor') || k.toLowerCase().includes('customer')))
    );
    return h ? String(row[h] ?? '').trim() : '';
  };

  // 복수 계정 + 복수 거래처 선택 시: 계정별 → 거래처별 그룹 및 소계
  const groupedByAccountAndVendor = useMemo(() => {
    const accounts = parseMultiInput(selectedAccount);
    const vendors = parseMultiInput(searchVendor);
    if (accounts.length <= 1 || vendors.length <= 1 || searchResults.length === 0) return null;

    const headers = Object.keys(searchResults[0] || {});
    const dateHeader = robustFindHeader(headers, DATE_KEYWORDS) ||
      headers.find((h: string) => h.includes('일자') || h.includes('날짜') || h.toLowerCase().includes('date'));
    const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, searchResults, dateHeader);

    const filtered = searchResults.filter(row => !isMonthlyOrCumulativeRow(row));
    const accountOrder: string[] = [];
    const byAccount = new Map<string, {
      vendorOrder: string[];
      byVendor: Map<string, { rows: LedgerRow[]; debit: number; credit: number; count: number }>;
      debit: number;
      credit: number;
      count: number;
    }>();

    let grandDebit = 0, grandCredit = 0, grandCount = 0;

    filtered.forEach(row => {
      const account = String(row['계정과목'] ?? '').trim() || '(계정 없음)';
      const vendor = getVendorFromRow(row) || '(거래처 없음)';
      const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
      const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;

      if (!byAccount.has(account)) {
        accountOrder.push(account);
        byAccount.set(account, {
          vendorOrder: [],
          byVendor: new Map(),
          debit: 0,
          credit: 0,
          count: 0,
        });
      }
      const accData = byAccount.get(account)!;
      if (!accData.byVendor.has(vendor)) {
        accData.vendorOrder.push(vendor);
        accData.byVendor.set(vendor, { rows: [], debit: 0, credit: 0, count: 0 });
      }
      const venData = accData.byVendor.get(vendor)!;
      venData.rows.push(row);
      venData.debit += debit;
      venData.credit += credit;
      venData.count += 1;
      accData.debit += debit;
      accData.credit += credit;
      accData.count += 1;
      grandDebit += debit;
      grandCredit += credit;
      grandCount += 1;
    });

    return {
      accountOrder,
      byAccount,
      grandDebit,
      grandCredit,
      grandCount,
      headers: headers.filter(k => !k.includes('잔액') && !k.toLowerCase().includes('balance')),
      debitHeader: debitHeader ?? null,
      creditHeader: creditHeader ?? null,
    };
  }, [searchResults, selectedAccount, searchVendor]);

  // 쉼표로 구분된 복수 값 파싱 (앞뒤 공백 제거, 빈 문자열 제외)
  const parseMultiInput = (input: string): string[] =>
    (input || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

  const handleSearch = () => {
    const selectedAccountsArray = parseMultiInput(selectedAccount);
    const searchVendorsArray = parseMultiInput(searchVendor);

    if (selectedAccountsArray.length === 0 && searchVendorsArray.length === 0 && !searchDescription) {
      toast({
        title: '검색 조건 오류',
        description: '계정명, 거래처, 적요 중 하나 이상을 입력해주세요. 계정/거래처는 쉼표로 구분해 복수 입력 가능합니다.',
        variant: 'destructive',
      });
      return;
    }

    let results: LedgerRow[] = [];

    // 복수 계정: 입력된 항목과 일치·포함되는 시트만 검색 (비어 있으면 전체)
    const accountsToSearch =
      selectedAccountsArray.length === 0
        ? accountNames
        : accountNames.filter(an => {
            const a = an.toLowerCase();
            return selectedAccountsArray.some(sa => {
              const s = sa.trim().toLowerCase();
              return a === s || a.includes(s) || s.includes(a);
            });
          });

    if (accountsToSearch.length === 0) {
      toast({
        title: '검색 조건 오류',
        description: '입력한 계정명과 일치하는 계정이 없습니다. 계정명을 확인하거나 쉼표로 구분해 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    accountsToSearch.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data, headers } = getDataFromSheet(sheet);

      const vendorHeader =
        headers.find((h: string) => (h && (h === '거래처명' || h.includes('거래처명')))) ||
        robustFindHeader(headers, VENDOR_KEYWORDS) ||
        headers.find((h: string) => h && (h.includes('거래처') || h.toLowerCase().includes('vendor')));
      const descHeader = robustFindHeader(headers, DESCRIPTION_KEYWORDS);
      const dateHeader = robustFindHeader(headers, DATE_KEYWORDS);
      const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, data, dateHeader);

      // 거래처를 입력했는데 이 시트에 거래처 컬럼이 없으면 필터 불가 → 해당 시트 행은 제외
      if (searchVendorsArray.length > 0 && !vendorHeader) return;

      data.forEach(row => {
        let match = true;

        // 거래처 필터: 전체 검색어 우선(쉼표 포함 이름 ex. "GRAPHY SMA, INC"), 그 다음 세그먼트 중 긴 것만 매칭(짧은 "INC" 등으로 타 회사 제외)
        if (searchVendorsArray.length > 0 && vendorHeader) {
          const vendor = String(row[vendorHeader] || '').trim();
          const vendorLower = vendor.toLowerCase().replace(/\s+/g, ' ');
          const fullSearch = searchVendor.trim().toLowerCase().replace(/\s+/g, ' ');
          const normalizedVendor = vendorLower.replace(/\s/g, '');
          let matchesVendor = false;
          if (fullSearch && (vendorLower.includes(fullSearch) || normalizedVendor.includes(fullSearch.replace(/\s/g, '')))) {
            matchesVendor = true;
          }
          if (!matchesVendor) {
            matchesVendor = searchVendorsArray.some(sv => {
              const term = sv.trim().toLowerCase();
              if (!term) return false;
              if (term.length < 4) return false;
              return vendorLower.includes(term) || normalizedVendor.includes(term.replace(/\s/g, ''));
            });
          }
          if (!matchesVendor) match = false;
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

    // 월계/누계 행 제거
    const filteredResults = results.filter(row => {
      const isMonthlyOrCumulative = Object.values(row).some(val => {
        if (val === null || val === undefined) return false;
        const str = String(val).trim();
        const normalized = str.replace(/\s/g, '');
        return normalized.includes('월계') || 
               normalized.includes('누계') ||
               normalized.includes('[월계]') || 
               normalized.includes('[누계]') ||
               normalized === '월계' ||
               normalized === '누계' ||
               str.includes('[ 월계 ]') ||
               str.includes('[ 누계 ]') ||
               str.includes('[월 계]') ||
               str.includes('[누 계]');
      });
      return !isMonthlyOrCumulative;
    });

    setSearchResults(filteredResults);
    toast({
      title: '검색 완료',
      description: `${filteredResults.length}건의 거래를 찾았습니다.`,
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
      // 월합계 다운로드 — 계정명 컬럼 추가
      const accountLabel = parseMultiInput(selectedAccount).length > 0
        ? parseMultiInput(selectedAccount).join(', ')
        : '전체';
      const monthlyWithAccount = monthlyData.map(row => ({ 계정명: accountLabel, ...row }));
      const ws = XLSX.utils.json_to_sheet(monthlyWithAccount);
      XLSX.utils.book_append_sheet(wb, ws, '월합계');
      XLSX.writeFile(wb, `거래검색_월합계_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else if (displayMode === 'vendor' && vendorData) {
      // 거래처별 합계 다운로드
      const ws = XLSX.utils.json_to_sheet(vendorData);
      XLSX.utils.book_append_sheet(wb, ws, '거래처별합계');
      XLSX.writeFile(wb, `거래검색_거래처별합계_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      // 상세내역 다운로드 - 계정명을 첫 번째 컬럼으로 추가
      const dataWithAccount = searchResults.map(row => {
        const accountName = row['계정과목'] || '';
        const result: any = { '계정과목': accountName };
        Object.keys(row).forEach(key => {
          if (key !== '계정과목') {
            result[key] = row[key];
          }
        });
        return result;
      });
      const ws = XLSX.utils.json_to_sheet(dataWithAccount);
      XLSX.utils.book_append_sheet(wb, ws, '검색결과');
      
      // 파일명에 계정명 포함 (파일명에 사용할 수 없는 문자 제거)
      const sanitizeFileName = (name: string): string => {
        return name.replace(/[<>:"/\\|?*]/g, '_').trim();
      };
      
      const parsedAccounts = parseMultiInput(selectedAccount);
      let accountNameForFile = '';
      if (parsedAccounts.length === 1) {
        accountNameForFile = sanitizeFileName(parsedAccounts[0]);
      } else if (parsedAccounts.length > 1) {
        accountNameForFile = '다중계정';
      } else if (searchResults.length > 0) {
        // 검색 결과에서 고유한 계정명 추출
        const uniqueAccounts = new Set(
          searchResults
            .map(row => row['계정과목'])
            .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
        );
        if (uniqueAccounts.size === 1) {
          accountNameForFile = sanitizeFileName(Array.from(uniqueAccounts)[0]);
        } else if (uniqueAccounts.size > 1) {
          accountNameForFile = '다중계정';
        }
      }
      
      const fileName = accountNameForFile 
        ? `거래검색_${accountNameForFile}_상세내역_${new Date().toISOString().split('T')[0]}.xlsx`
        : `거래검색_상세내역_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
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
            {/* 계정 선택 - 자동완성 */}
            <div className="space-y-2">
              <Label>계정과목 (쉼표로 구분해 복수 입력 가능, 미선택 시 거래처/적요 필수)</Label>
              <Popover open={accountComboboxOpen} onOpenChange={setAccountComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={accountComboboxOpen}
                    className="w-full justify-between"
                  >
                    <span className="truncate text-left">{selectedAccount.replace(/,\s*$/, '') || "계정을 선택하거나 입력 (예: 계정1, 계정2)"}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="계정명 검색 또는 쉼표로 복수 입력..."
                      value={accountInputValue}
                      onValueChange={(val) => {
                        const parts = selectedAccount.split(',').map(s => s.trim());
                        if (val.includes(',')) {
                          const [before, ...after] = val.split(',').map(s => s.trim());
                          const committed = parts.slice(0, -1).filter(Boolean);
                          if (before) committed.push(before);
                          const next = after.join(',').trim();
                          setSelectedAccount(committed.join(', ') + (next ? ', ' + next : ', '));
                        } else {
                          const rest = parts.slice(0, -1);
                          setSelectedAccount([...rest, val].join(', '));
                        }
                      }}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {accountInputValue ? `"${accountInputValue}" 계정을 찾을 수 없습니다. 직접 입력하여 사용할 수 있습니다.` : '계정을 찾을 수 없습니다.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {accountNames
                          .filter(account => {
                            return !accountInputValue || account.toLowerCase().includes(accountInputValue.toLowerCase());
                          })
                          .slice(0, 100)
                          .map((account) => (
                            <CommandItem
                              key={account}
                              value={account}
                              onSelect={() => {
                                const parsed = parseMultiInput(selectedAccount);
                                const onlyKnownAccounts = parsed.filter(p => accountNames.includes(p));
                                if (onlyKnownAccounts.includes(account)) {
                                  setSelectedAccount(onlyKnownAccounts.filter(p => p !== account).join(', '));
                                } else {
                                  setSelectedAccount([...onlyKnownAccounts, account].join(', '));
                                }
                                setAccountComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  parseMultiInput(selectedAccount).includes(account) ? "opacity-100" : "opacity-0"
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

            {/* 거래처 검색 - 자동완성, 복수 입력 가능 */}
            <div className="space-y-2">
              <Label>거래처명 (쉼표로 구분해 복수 입력 가능, 부분 일치)</Label>
              <Popover open={vendorComboboxOpen} onOpenChange={setVendorComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vendorComboboxOpen}
                    className="w-full justify-between"
                  >
                    <span className="truncate text-left">{searchVendor.replace(/,\s*$/, '') || "거래처를 선택하거나 입력 (예: 거래처1, 거래처2)"}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="거래처 검색 또는 쉼표로 복수 입력..."
                      value={vendorInputValue}
                      onValueChange={(val) => {
                        const parts = searchVendor.split(',').map(s => s.trim());
                        if (val.includes(',')) {
                          const [before, ...after] = val.split(',').map(s => s.trim());
                          const committed = parts.slice(0, -1).filter(Boolean);
                          if (before) committed.push(before);
                          const next = after.join(',').trim();
                          setSearchVendor(committed.join(', ') + (next ? ', ' + next : ', '));
                        } else {
                          const rest = parts.slice(0, -1);
                          setSearchVendor([...rest, val].join(', '));
                        }
                      }}
                    />
                    <CommandList>
                      <CommandEmpty>거래처를 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {vendorList
                          .filter(vendor => {
                            return !vendorInputValue || vendor.toLowerCase().includes(vendorInputValue.toLowerCase());
                          })
                          .slice(0, 100)
                          .map((vendor) => (
                            <CommandItem
                              key={vendor}
                              value={vendor}
                              onSelect={() => {
                                const parsed = parseMultiInput(searchVendor);
                                const onlyKnownVendors = parsed.filter(p => vendorList.includes(p));
                                if (onlyKnownVendors.includes(vendor)) {
                                  setSearchVendor(onlyKnownVendors.filter(p => p !== vendor).join(', '));
                                } else {
                                  setSearchVendor([...onlyKnownVendors, vendor].join(', '));
                                }
                                setVendorComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  parseMultiInput(searchVendor).includes(vendor) ? "opacity-100" : "opacity-0"
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
              <RadioGroup value={displayMode} onValueChange={(value) => {
                setDisplayMode(value as 'detail' | 'monthly' | 'vendor');
              }}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="detail" id="display-detail" />
                  <Label htmlFor="display-detail" className="font-normal cursor-pointer">상세내역</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="display-monthly" />
                  <Label htmlFor="display-monthly" className="font-normal cursor-pointer">월합계</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="vendor" id="display-vendor" />
                  <Label htmlFor="display-vendor" className="font-normal cursor-pointer">거래처별 합계</Label>
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
                  : displayMode === 'vendor' && vendorData
                  ? vendorData.length.toLocaleString() + '개 거래처'
                  : searchResults.length.toLocaleString() + '건'})
              </CardTitle>
          </CardHeader>
          <CardContent>
              {displayMode === 'vendor' && vendorData ? (
                <div className="space-y-4">
            <div className="rounded-md border max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                          <TableHead>거래처</TableHead>
                          <TableHead className="text-right">차변</TableHead>
                          <TableHead className="text-right">대변</TableHead>
                          <TableHead className="text-right">잔액</TableHead>
                          <TableHead className="text-right">건수</TableHead>
                          <TableHead className="text-right">계정수</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vendorData.map((row, idx) => (
                          <TableRow 
                            key={idx}
                            className={selectedVendorForDrilldown === row.거래처 ? 'bg-blue-50 dark:bg-blue-950' : ''}
                          >
                            <TableCell 
                              className="font-medium cursor-pointer hover:underline text-blue-600 dark:text-blue-400"
                              onClick={() => {
                                if (selectedVendorForDrilldown === row.거래처) {
                                  setSelectedVendorForDrilldown(null);
                                } else {
                                  setSelectedVendorForDrilldown(row.거래처);
                                }
                              }}
                            >
                              {row.거래처}
                            </TableCell>
                            <TableCell className="text-right">{row.차변.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{row.대변.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">{row.잔액.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{row.건수.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{row.계정수.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                        {/* 합계 행 */}
                        <TableRow className="font-bold bg-muted">
                          <TableCell>합계</TableCell>
                          <TableCell className="text-right">
                            {vendorData.reduce((sum, row) => sum + row.차변, 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {vendorData.reduce((sum, row) => sum + row.대변, 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {vendorData.reduce((sum, row) => sum + row.잔액, 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {vendorData.reduce((sum, row) => sum + row.건수, 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">-</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* 거래처별 상세 내역 드릴다운 */}
                  {selectedVendorForDrilldown && (
                    <Card className="border-blue-200 dark:border-blue-800">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            거래처: {selectedVendorForDrilldown} - 상세 내역
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedVendorForDrilldown(null)}
                          >
                            닫기
                          </Button>
                        </div>
          </CardHeader>
          <CardContent>
                        <div className="flex justify-end mb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const vendorResults = searchResults.filter(row => {
                                const vendorHeader = Object.keys(row).find(h => 
                                  h.includes('거래처') || h.includes('업체') || h.includes('회사')
                                );
                                return vendorHeader && String(row[vendorHeader] || '').trim() === selectedVendorForDrilldown;
                              });
                              
                              const wb = XLSX.utils.book_new();
                              const ws = XLSX.utils.json_to_sheet(vendorResults);
                              XLSX.utils.book_append_sheet(wb, ws, '상세내역');
                              XLSX.writeFile(wb, `거래처_${selectedVendorForDrilldown}_상세내역_${new Date().toISOString().split('T')[0]}.xlsx`);
                              
                              toast({
                                title: '다운로드 완료',
                                description: '거래처 상세 내역을 다운로드했습니다.',
                              });
                            }}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            엑셀 다운로드
                          </Button>
                        </div>
                        <div className="rounded-md border max-h-[400px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {Object.keys(searchResults[0] || {})
                                  .filter(key => !key.includes('잔액') && !key.toLowerCase().includes('balance'))
                                  .map(key => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                              {searchResults
                                .filter(row => {
                                  // 월계/누계 행 제거
                                  const isMonthlyOrCumulative = Object.values(row).some(val => {
                                    if (val === null || val === undefined) return false;
                                    const str = String(val).trim();
                                    const normalized = str.replace(/\s/g, '');
                                    return normalized.includes('월계') || 
                                           normalized.includes('누계') ||
                                           normalized.includes('[월계]') || 
                                           normalized.includes('[누계]') ||
                                           normalized === '월계' ||
                                           normalized === '누계' ||
                                           str.includes('[ 월계 ]') ||
                                           str.includes('[ 누계 ]') ||
                                           str.includes('[월 계]') ||
                                           str.includes('[누 계]');
                                  });
                                  if (isMonthlyOrCumulative) return false;
                                  
                                  // 거래처 필터
                                  const vendorHeader = Object.keys(row).find(h => 
                                    h.includes('거래처') || h.includes('업체') || h.includes('회사')
                                  );
                                  return vendorHeader && String(row[vendorHeader] || '').trim() === selectedVendorForDrilldown;
                                })
                                .slice(0, 100)
                                .map((row, idx) => {
                                  const headers = Object.keys(searchResults[0] || {})
                                    .filter(key => !key.includes('잔액') && !key.toLowerCase().includes('balance'));
                                  return (
                    <TableRow key={idx}>
                                      {headers.map((key, j) => {
                                        const val = row[key];
                                        const isAmountColumn = key.includes('차변') || 
                                                              key.includes('대변') || 
                                                              key.includes('금액') ||
                                                              key.toLowerCase().includes('amount') ||
                                                              key.toLowerCase().includes('debit') ||
                                                              key.toLowerCase().includes('credit');
                                        
                                        const isNumber = typeof val === 'number';
                                        const isNumericString = typeof val === 'string' && String(val).trim() !== ''
                                          && !isNaN(parseFloat(String(val).replace(/,/g, '')));
                                        if (isAmountColumn && (isNumber || isNumericString)) {
                                          const numVal = isNumber ? Number(val) : parseFloat(String(val).replace(/,/g, ''));
                                          if (!isNaN(numVal) && numVal !== 0) {
                                            return (
                                              <TableCell key={j} className="text-sm text-right">
                                                {numVal.toLocaleString()}
                                              </TableCell>
                                            );
                                          }
                                        }
                                        
                                        if (val instanceof Date) {
                                          return (
                                            <TableCell key={j} className="text-sm">
                                              {val.toLocaleDateString()}
                                            </TableCell>
                                          );
                                        }
                                        
                                        return (
                        <TableCell key={j} className="text-sm">
                                            {String(val ?? '')}
                        </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                  );
                                })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : displayMode === 'monthly' ? (
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  {monthlyData && monthlyData.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>거래처</TableHead>
                          <TableHead>월</TableHead>
                          <TableHead className="text-right">차변</TableHead>
                          <TableHead className="text-right">대변</TableHead>
                          <TableHead className="text-right">잔액</TableHead>
                          <TableHead className="text-right">건수</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyData.map((row, idx) => {
                          const isDataRow = !row.isSubtotal && !row.isTotal;
                          const rowClass = row.isTotal ? 'bg-muted font-bold' : row.isSubtotal ? 'bg-muted/70 font-medium' : '';
                          return (
                            <TableRow key={idx} className={rowClass}>
                              <TableCell className="font-medium">{row.거래처}</TableCell>
                              <TableCell className="font-medium">{row.월}</TableCell>
                              <TableCell
                                className={cn(
                                  'text-right',
                                  isDataRow && 'cursor-pointer hover:bg-muted hover:underline'
                                )}
                                onClick={isDataRow ? () => setMonthlyDrilldown({ month: row.월, side: 'debit', vendor: row.거래처 }) : undefined}
                              >
                                {row.차변.toLocaleString()}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-right',
                                  isDataRow && 'cursor-pointer hover:bg-muted hover:underline'
                                )}
                                onClick={isDataRow ? () => setMonthlyDrilldown({ month: row.월, side: 'credit', vendor: row.거래처 }) : undefined}
                              >
                                {row.대변.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-medium">{row.잔액.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{row.건수.toLocaleString()}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      {monthlyData && monthlyData.length === 0
                        ? '검색 결과에서 날짜를 인식할 수 있는 행이 없어 월별 합계를 표시할 수 없습니다. 날짜 컬럼(일자/날짜)과 형식(예: 2025/12/10)을 확인해 주세요.'
                        : '검색 결과에서 날짜 컬럼을 찾을 수 없어 월별 합계를 표시할 수 없습니다. 일자/날짜 컬럼이 있는지 확인해 주세요.'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(searchResults[0] || {})
                          .filter(key => !key.includes('잔액') && !key.toLowerCase().includes('balance'))
                          .map(key => (
                            <TableHead key={key}>{key}</TableHead>
                          ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedByAccountAndVendor ? (
                        <>
                          {groupedByAccountAndVendor.accountOrder.map((account) => {
                            const accData = groupedByAccountAndVendor.byAccount.get(account)!;
                            return (
                              <React.Fragment key={account}>
                                <TableRow className="bg-muted/60 font-medium">
                                  {groupedByAccountAndVendor.headers.map((key, j) => (
                                    <TableCell key={j} className="text-sm">
                                      {j === 0 ? `계정: ${account}` : ''}
                                    </TableCell>
                                  ))}
                                </TableRow>
                                {accData.vendorOrder.map((vendor) => {
                                  const venData = accData.byVendor.get(vendor)!;
                                  return (
                                    <React.Fragment key={vendor}>
                                      <TableRow className="bg-muted/40 font-medium">
                                        {groupedByAccountAndVendor.headers.map((key, j) => (
                                          <TableCell key={j} className="text-sm">
                                            {j === 0 ? `거래처: ${vendor}` : ''}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                      {venData.rows.slice(0, 200).map((row, idx) => {
                                        const headers = groupedByAccountAndVendor.headers;
                                        return (
                                          <TableRow key={`${account}-${vendor}-${idx}`}>
                                            {headers.map((key, j) => {
                                              const val = row[key];
                                              const isAmountColumn = key.includes('차변') || key.includes('대변') || key.includes('금액')
                                                || key.toLowerCase().includes('amount') || key.toLowerCase().includes('debit') || key.toLowerCase().includes('credit');
                                              const isNumber = typeof val === 'number';
                                              const isNumericString = typeof val === 'string' && String(val).trim() !== ''
                                                && !isNaN(parseFloat(String(val).replace(/,/g, '')));
                                              if (isAmountColumn && (isNumber || isNumericString)) {
                                                const numVal = isNumber ? Number(val) : parseFloat(String(val).replace(/,/g, ''));
                                                if (!isNaN(numVal) && numVal !== 0) {
                                                  return <TableCell key={j} className="text-sm text-right">{numVal.toLocaleString()}</TableCell>;
                                                }
                                              }
                                              if (val instanceof Date) {
                                                return <TableCell key={j} className="text-sm">{val.toLocaleDateString()}</TableCell>;
                                              }
                                              return <TableCell key={j} className="text-sm">{String(val ?? '')}</TableCell>;
                                            })}
                                          </TableRow>
                                        );
                                      })}
                                      <TableRow className="font-medium bg-muted/30">
                                        {groupedByAccountAndVendor.headers.map((key, j) => {
                                          if (j === 0) return <TableCell key={j} className="text-sm">소계 ({venData.count}건)</TableCell>;
                                          if (key === groupedByAccountAndVendor.debitHeader) return <TableCell key={j} className="text-sm text-right">{venData.debit.toLocaleString()}</TableCell>;
                                          if (key === groupedByAccountAndVendor.creditHeader) return <TableCell key={j} className="text-sm text-right">{venData.credit.toLocaleString()}</TableCell>;
                                          return <TableCell key={j} />;
                                        })}
                                      </TableRow>
                                    </React.Fragment>
                                  );
                                })}
                                <TableRow className="font-bold bg-muted/50">
                                  {groupedByAccountAndVendor.headers.map((key, j) => {
                                    if (j === 0) return <TableCell key={j} className="text-sm">계정 소계</TableCell>;
                                    if (key === groupedByAccountAndVendor.debitHeader) return <TableCell key={j} className="text-sm text-right">{accData.debit.toLocaleString()}</TableCell>;
                                    if (key === groupedByAccountAndVendor.creditHeader) return <TableCell key={j} className="text-sm text-right">{accData.credit.toLocaleString()}</TableCell>;
                                    return <TableCell key={j} />;
                                  })}
                                </TableRow>
                              </React.Fragment>
                            );
                          })}
                          <TableRow className="font-bold bg-muted">
                            {groupedByAccountAndVendor.headers.map((key, j) => {
                              if (j === 0) return <TableCell key={j} className="text-sm">합계</TableCell>;
                              if (key === groupedByAccountAndVendor.debitHeader) return <TableCell key={j} className="text-sm text-right">{groupedByAccountAndVendor.grandDebit.toLocaleString()}</TableCell>;
                              if (key === groupedByAccountAndVendor.creditHeader) return <TableCell key={j} className="text-sm text-right">{groupedByAccountAndVendor.grandCredit.toLocaleString()}</TableCell>;
                              return <TableCell key={j} />;
                            })}
                          </TableRow>
                        </>
                      ) : (
                        searchResults
                          .filter(row => !isMonthlyOrCumulativeRow(row))
                          .slice(0, 200)
                          .map((row, idx) => {
                            const headers = Object.keys(searchResults[0] || {})
                              .filter(key => !key.includes('잔액') && !key.toLowerCase().includes('balance'));
                            return (
                              <TableRow key={idx}>
                                {headers.map((key, j) => {
                                  const val = row[key];
                                  const isAmountColumn = key.includes('차변') || 
                                        key.includes('대변') || 
                                        key.includes('금액') ||
                                        key.toLowerCase().includes('amount') ||
                                        key.toLowerCase().includes('debit') ||
                                        key.toLowerCase().includes('credit');
                                  const isNumber = typeof val === 'number';
                                  const isNumericString = typeof val === 'string' && String(val).trim() !== ''
                                    && !isNaN(parseFloat(String(val).replace(/,/g, '')));
                                  if (isAmountColumn && (isNumber || isNumericString)) {
                                    const numVal = isNumber ? Number(val) : parseFloat(String(val).replace(/,/g, ''));
                                    if (!isNaN(numVal) && numVal !== 0) {
                                      return (
                                        <TableCell key={j} className="text-sm text-right">
                                          {numVal.toLocaleString()}
                                        </TableCell>
                                      );
                                    }
                                  }
                                  if (val instanceof Date) {
                                    return (
                                      <TableCell key={j} className="text-sm">
                                        {val.toLocaleDateString()}
                                      </TableCell>
                                    );
                                  }
                                  return (
                                    <TableCell key={j} className="text-sm">
                                      {String(val ?? '')}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })
                      )}
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

      {/* 월합계 차변/대변 클릭 시 상세 내역 */}
      <Dialog open={!!monthlyDrilldown} onOpenChange={(open) => !open && setMonthlyDrilldown(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {monthlyDrilldown && (
                <>
                  {monthlyDrilldown.month} {monthlyDrilldown.side === 'debit' ? '차변' : '대변'} 상세 내역
                  {monthlyDrilldown.vendor && monthlyDrilldown.vendor !== '(거래처 없음)' && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      · {monthlyDrilldown.vendor}
                    </span>
                  )}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({monthlyDrilldownRows.length}건)
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded border">
            {monthlyDrilldownRows.length > 0 ? (
              (() => {
                const drilldownKeys = Object.keys(monthlyDrilldownRows[0]).filter(
                  key => !String(key).includes('잔액') && !String(key).toLowerCase().includes('balance')
                );
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {drilldownKeys.map(key => (
                          <TableHead key={key}>{key}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyDrilldownRows.map((row, idx) => (
                        <TableRow key={idx}>
                          {drilldownKeys.map(key => {
                            const val = row[key];
                            const isAmount = key.includes('차변') || key.includes('대변') || key.includes('금액');
                            const numVal = isAmount && (typeof val === 'number' || (typeof val === 'string' && /[\d,.-]/.test(String(val))))
                              ? (typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, '')))
                              : null;
                            return (
                              <TableCell key={key} className={isAmount && numVal != null ? 'text-right' : ''}>
                                {val instanceof Date
                                  ? val.toLocaleDateString()
                                  : numVal != null && !isNaN(numVal)
                                    ? numVal.toLocaleString()
                                    : String(val ?? '')}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()
            ) : (
              <p className="p-4 text-sm text-muted-foreground text-center">내역이 없습니다.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

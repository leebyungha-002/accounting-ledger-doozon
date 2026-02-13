/**
 * AI Insights 컴포넌트
 * Google AI Studio에서 가져온 AIInsights.tsx를 현재 프로젝트에 맞게 변환
 * 
 * 주요 기능:
 * - 일반사항 분석 (General Analysis)
 * - 공휴일전표 분석 (Holiday Analysis)
 * - 상대계정 분석 (Counter Account Analysis)
 * - 적요 적합성 분석 (Appropriateness Analysis)
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  JournalEntry, 
  GeneralAnalysisResult, 
  HolidayAnalysisResult, 
  CounterAccountAnalysisResult, 
  AppropriatenessAnalysisResult 
} from '@/types/analysis';
import { 
  analyzeGeneral, 
  analyzeHoliday, 
  analyzeAppropriateness, 
  suggestAppropriateMinAmount 
} from '@/services/geminiAnalysisService';
import { CalendarX, FileSearch, Building2, Sparkles, AlertTriangle, Loader2, CheckCircle2, XCircle, X, Maximize2, ArrowLeft, Download, Coins, Calculator, ArrowRightLeft, ListFilter, Search, Filter, ChevronRight, FileWarning, BarChart3, TrendingUp, DollarSign, ChevronsUpDown, FileDown, Bug } from 'lucide-react';
import { VisualizationAnalysis } from './VisualizationAnalysis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { checkSpacing } from '@/utils/checkSpacing';
import { calculateReduction } from '@/utils/calculateReduction';
import { checkDialogWidth } from '@/utils/checkDialogWidth';

interface AIInsightsProps {
  entries: JournalEntry[];
  onBackToHome?: () => void;
  ledgerWorkbook?: XLSX.WorkBook | null; // 계정별원장 데이터 (선택적)
  getDataFromSheet?: (worksheet: XLSX.WorkSheet | undefined) => { data: any[], headers: string[], orderedHeaders: string[] }; // 시트 데이터 추출 함수
}

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';
type AnalysisType = 'general' | 'holiday' | 'counter' | 'appropriateness' | 'visualization' | 'trend' | 'cashflow';

// Helper to determine day type
const checkDayType = (dateStr: string): 'weekday' | 'sat' | 'sun' | 'holiday' => {
  // 날짜 문자열 정규화 ('YYYY-MM-DD' 형식으로 변환)
  let normalizedDateStr = dateStr.trim();
  
  // 이미 'YYYY-MM-DD' 형식인 경우
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateStr)) {
    // 그대로 사용
  } 
  // 'YYYYMMDD' 형식인 경우
  else if (/^\d{8}$/.test(normalizedDateStr.replace(/\D/g, ''))) {
    const cleaned = normalizedDateStr.replace(/\D/g, '');
    normalizedDateStr = `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
  }
  // 다른 형식 시도
  else {
    normalizedDateStr = normalizedDateStr.split('T')[0].split(' ')[0];
  }
  
  // Date 객체로 변환
  const date = new Date(normalizedDateStr);
  
  // 유효하지 않은 날짜인 경우
  if (isNaN(date.getTime())) {
    console.warn(`날짜 파싱 실패: ${dateStr} -> ${normalizedDateStr}`);
    return 'weekday';
  }
  
  const day = date.getDay();
  
  // Fixed Korean Holidays (MM-DD)
  const fixedHolidays = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  const md = `${month}-${dayOfMonth}`;
  
  // YYYY-MM-DD 형식으로 공휴일 확인
  const dateStrFormatted = normalizedDateStr;
  
  const lunarHolidays = [
    '2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', // Seollal
    '2024-05-15', // Buddha
    '2024-09-16', '2024-09-17', '2024-09-18', // Chuseok
    '2025-01-28', '2025-01-29', '2025-01-30', // Seollal
    '2025-10-06', '2025-10-07', '2025-10-08', // Chuseok
  ];

  if (fixedHolidays.includes(md) || lunarHolidays.includes(dateStrFormatted)) return 'holiday';
  if (day === 0) return 'sun';
  if (day === 6) return 'sat';
  return 'weekday';
};

// Helper to check if a date is the last day of the month
const isLastDayOfMonth = (dateStr: string | Date): boolean => {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : (dateStr && typeof dateStr === 'object' && 'getTime' in dateStr) ? dateStr : new Date();
  if (isNaN(date.getTime())) return false;
  
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === lastDay;
};

const AIInsights: React.FC<AIInsightsProps> = ({ entries, onBackToHome, ledgerWorkbook, getDataFromSheet }) => {
  const { toast } = useToast();
  
  // 1. Clean Entries
  const cleanEntries = useMemo(() => {
    const summaryKeywords = ['월계', '누계', '합계', '총계'];
    return entries.filter(e => {
      if (!e.accountName || e.accountName === 'Unknown' || e.accountName.trim() === '') return false;
      const dateClean = String(e.date).replace(/\s/g, '');
      if (summaryKeywords.some(k => dateClean === k)) return false;
      const accClean = e.accountName.replace(/\s/g, '');
      if (summaryKeywords.includes(accClean)) return false;
      const descClean = String(e.description).replace(/\s/g, '');
      const exactSkipKeywords = ['월계', '누계'];
      if (exactSkipKeywords.includes(descClean)) return false;
      return true;
    });
  }, [entries]);

  // 2. Analysis Entries
  const analysisEntries = useMemo(() => {
    const nonOperationalKeywords = ['전기이월', '차기이월', '손익대체', '집합손익', '결산대체'];
    return cleanEntries.filter(e => {
      const descClean = String(e.description).replace(/\s/g, '');
      return !nonOperationalKeywords.includes(descClean);
    });
  }, [cleanEntries]);

  // 3. Unique Accounts for Autocomplete
  const uniqueAccountNames = useMemo(() => {
    const names = new Set(analysisEntries.map(e => e.accountName));
    return Array.from(names).sort();
  }, [analysisEntries]);

  const [activeCard, setActiveCard] = useState<AnalysisType | null>(null);
  
  // Drilldown States
  const [generalDrilldownAccount, setGeneralDrilldownAccount] = useState<string | null>(null);
  const [generalDrilldownType, setGeneralDrilldownType] = useState<'debit' | 'credit' | null>(null); // 차변/대변 상세 내역
  const [accountDrilldownType, setAccountDrilldownType] = useState<'debit' | 'credit' | null>(null); // 계정별 차변/대변 상세 내역 타입
  const [generalDrilldownShowMonthly, setGeneralDrilldownShowMonthly] = useState<boolean>(false); // 일반사항분석 월별합계 표시 여부
  const [holidayDrilldown, setHolidayDrilldown] = useState<{ account: string, type: 'sat' | 'sun' | 'holiday' | 'total' } | null>(null);
  
  // Counter Analysis Interactive States
  const [counterSearchTerm, setCounterSearchTerm] = useState('');
  const [counterSearchSide, setCounterSearchSide] = useState<'차변' | '대변'>('차변');
  const [counterSuggestions, setCounterSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [counterResult, setCounterResult] = useState<CounterAccountAnalysisResult | null>(null);
  const [counterDrilldownAccount, setCounterDrilldownAccount] = useState<string | null>(null);
  const [counterDrilldownAmountClicked, setCounterDrilldownAmountClicked] = useState<boolean>(false); // 상대계정 금액 클릭 여부
  const [selectedVoucherNumber, setSelectedVoucherNumber] = useState<string | null>(null); // 선택된 전표번호
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Options
  const [excludeEndOfMonth, setExcludeEndOfMonth] = useState<boolean>(false);
  const [appropriatenessMinAmount, setAppropriatenessMinAmount] = useState<number>(100000);
  const [suggestedMinAmount, setSuggestedMinAmount] = useState<number | null>(null);
  const [isSuggestingAmount, setIsSuggestingAmount] = useState<boolean>(false);
  const [suggestedAmountReason, setSuggestedAmountReason] = useState<string | null>(null);

  // Cost Tracking State
  const [totalCost, setTotalCost] = useState<number>(0);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null); // 예상 시간 (초)
  
  // API 요청 빈도 제한을 위한 상태
  const lastApiRequestTimeRef = useRef<number>(0);
  const isAnalysisRunningRef = useRef<boolean>(false);

  // State for Analyses
  const [generalStatus, setGeneralStatus] = useState<AnalysisStatus>('idle');
  const [generalData, setGeneralData] = useState<GeneralAnalysisResult | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [holidayStatus, setHolidayStatus] = useState<AnalysisStatus>('idle');
  const [holidayData, setHolidayData] = useState<HolidayAnalysisResult | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [counterStatus, setCounterStatus] = useState<AnalysisStatus>('idle');
  const [appropriatenessStatus, setAppropriatenessStatus] = useState<AnalysisStatus>('idle');
  const [appropriatenessData, setAppropriatenessData] = useState<AppropriatenessAnalysisResult | null>(null);
  const [appropriatenessError, setAppropriatenessError] = useState<string | null>(null);

  // 월별 트렌드 분석 - 선택된 계정명 state
  const [trendSelectedAccount, setTrendSelectedAccount] = useState<string>('');
  const [trendAccountOpen, setTrendAccountOpen] = useState(false);
  
  // 월별 트렌드 그래프 PDF 다운로드용 ref
  const trendAmountChartRef = useRef<HTMLDivElement>(null);
  const trendCountChartRef = useRef<HTMLDivElement>(null);

  // 드릴다운 ref
  const generalDrilldownRef = useRef<HTMLDivElement>(null);
  const generalTypeDrilldownRef = useRef<HTMLDivElement>(null);
  const holidayDrilldownRef = useRef<HTMLDivElement>(null);
  const counterDrilldownRef = useRef<HTMLDivElement>(null);
  
  // 드릴다운 상태 변경 추적 및 자동 스크롤
  useEffect(() => {
    console.log('🔍 드릴다운 상태 변경:', {
      generalDrilldownAccount,
      generalDrilldownType,
      accountDrilldownType,
      holidayDrilldown,
      activeCard
    });
    
    // 드릴다운이 활성화되면 스크롤
    if (generalDrilldownAccount && generalDrilldownRef.current) {
      setTimeout(() => {
        console.log('📜 일반 계정별 드릴다운으로 스크롤');
        generalDrilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } else if (generalDrilldownType && generalTypeDrilldownRef.current) {
      setTimeout(() => {
        console.log('📜 일반 차변/대변 드릴다운으로 스크롤');
        generalTypeDrilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } else if (holidayDrilldown && holidayDrilldownRef.current) {
      setTimeout(() => {
        console.log('📜 공휴일 드릴다운으로 스크롤');
        holidayDrilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } else if (counterDrilldownAccount && counterDrilldownRef.current) {
      setTimeout(() => {
        console.log('📜 상대계정 드릴다운으로 스크롤');
        counterDrilldownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [generalDrilldownAccount, generalDrilldownType, accountDrilldownType, holidayDrilldown, counterDrilldownAccount, activeCard]);

  // 월별 트렌드 분석 데이터
  const monthlyTrendData = useMemo(() => {
    const monthlyMap = new Map<string, { debit: number; credit: number; count: number; debitCount: number; creditCount: number }>();
    
    // 선택된 계정명으로 필터링
    let filteredEntries = analysisEntries;
    if (trendSelectedAccount && trendSelectedAccount.trim()) {
      filteredEntries = analysisEntries.filter(e => e.accountName === trendSelectedAccount);
    }
    
    filteredEntries.forEach(entry => {
      const dateStr = String(entry.date);
      let date: Date;
      
      if (dateStr.includes('T')) {
        date = new Date(dateStr.split('T')[0]);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        date = new Date(dateStr);
      } else if (/^\d{8}$/.test(dateStr.replace(/\D/g, ''))) {
        const cleaned = dateStr.replace(/\D/g, '');
        date = new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`);
      } else {
        date = new Date(dateStr);
      }
      
      if (isNaN(date.getTime())) return;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const current = monthlyMap.get(monthKey) || { debit: 0, credit: 0, count: 0, debitCount: 0, creditCount: 0 };
      
      const debitAmount = entry.debit || 0;
      const creditAmount = entry.credit || 0;
      
      monthlyMap.set(monthKey, {
        debit: current.debit + debitAmount,
        credit: current.credit + creditAmount,
        count: current.count + 1,
        debitCount: current.debitCount + (debitAmount > 0 ? 1 : 0),
        creditCount: current.creditCount + (creditAmount > 0 ? 1 : 0)
      });
    });
    
    const sorted = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        debit: data.debit,
        credit: data.credit,
        net: data.credit - data.debit, // 대변 - 차변 = 순이익
        count: data.count,
        debitCount: data.debitCount,
        creditCount: data.creditCount,
        avgDebit: data.debit / (data.debitCount || 1) || 0,
        avgCredit: data.credit / (data.creditCount || 1) || 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    return sorted;
  }, [analysisEntries, trendSelectedAccount]);

  // 현금 흐름 분석 데이터
  const cashFlowData = useMemo(() => {
    // 현금 관련 계정 키워드
    const cashAccountKeywords = ['보통예금', '당좌예금', '현금', '수신', '자금', '예금', '계좌'];
    
    // 현금 계정 필터링
    const cashEntries = analysisEntries.filter(entry => 
      cashAccountKeywords.some(keyword => entry.accountName.includes(keyword))
    );
    
    // 월별 현금 흐름 계산
    const monthlyCashMap = new Map<string, { inflow: number; outflow: number; net: number; count: number }>();
    
    cashEntries.forEach(entry => {
      const dateStr = String(entry.date);
      let date: Date;
      
      if (dateStr.includes('T')) {
        date = new Date(dateStr.split('T')[0]);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        date = new Date(dateStr);
      } else if (/^\d{8}$/.test(dateStr.replace(/\D/g, ''))) {
        const cleaned = dateStr.replace(/\D/g, '');
        date = new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`);
      } else {
        date = new Date(dateStr);
      }
      
      if (isNaN(date.getTime())) return;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const current = monthlyCashMap.get(monthKey) || { inflow: 0, outflow: 0, net: 0, count: 0 };
      
      // 차변 = 유출, 대변 = 유입
      const inflow = entry.credit || 0;
      const outflow = entry.debit || 0;
      
      monthlyCashMap.set(monthKey, {
        inflow: current.inflow + inflow,
        outflow: current.outflow + outflow,
        net: current.net + (inflow - outflow),
        count: current.count + 1
      });
    });
    
    const sorted = Array.from(monthlyCashMap.entries())
      .map(([month, data]) => ({
        month,
        inflow: data.inflow,
        outflow: data.outflow,
        net: data.net,
        count: data.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    // 주요 현금 유입/유출 계정 분석
    const accountInflow = new Map<string, number>();
    const accountOutflow = new Map<string, number>();
    
    cashEntries.forEach(entry => {
      if (entry.credit > 0) {
        accountInflow.set(entry.accountName, (accountInflow.get(entry.accountName) || 0) + entry.credit);
      }
      if (entry.debit > 0) {
        accountOutflow.set(entry.accountName, (accountOutflow.get(entry.accountName) || 0) + entry.debit);
      }
    });
    
    const topInflowAccounts = Array.from(accountInflow.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
    
    const topOutflowAccounts = Array.from(accountOutflow.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
    
    return {
      monthly: sorted,
      topInflowAccounts,
      topOutflowAccounts,
      totalInflow: sorted.reduce((sum, m) => sum + m.inflow, 0),
      totalOutflow: sorted.reduce((sum, m) => sum + m.outflow, 0),
      totalNet: sorted.reduce((sum, m) => sum + m.net, 0)
    };
  }, [analysisEntries]);

  // Handle click outside for suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 계정명 정규화 함수 (숫자 제거)
  const normalizeAccountName = (accountName: string): string => {
    if (!accountName) return '';
    // 앞의 숫자와 공백 제거 (예: "101 현금" -> "현금")
    return String(accountName).replace(/^\d+\s*/, '').trim();
  };

  // 계정명 매칭 함수
  const matchAccountName = (ledgerAccountName: string, journalAccountName: string): boolean => {
    const normalizedLedger = normalizeAccountName(ledgerAccountName);
    const normalizedJournal = normalizeAccountName(journalAccountName);
    
    // 정확히 일치하거나 포함 관계
    return normalizedLedger === normalizedJournal || 
           normalizedLedger.includes(normalizedJournal) || 
           normalizedJournal.includes(normalizedLedger);
  };

  // 계정 분류 함수 (재무제표 순서)
  const getAccountCategory = (accountName: string): number => {
    if (!accountName) return 999;
    const normalized = String(accountName).replace(/\s/g, '').toLowerCase();
    
    // 1. 유동성 자산 항목
    const currentAssetKeywords = ['현금', '예금', '당좌', '매출채권', '외상매출금', '외상매출', '선급금', 
      '선급비용', '재고자산', '재고', '단기투자', '유동자산', '미수금', '미수수익', '선수금', 
      '선수수익', '기타유동자산', '매입채권', '외상매입금'];
    if (currentAssetKeywords.some(kw => normalized.includes(kw)) && !normalized.includes('비유동')) {
      return 1;
    }
    
    // 2. 비유동성 자산 항목
    const nonCurrentAssetKeywords = ['유형자산', '무형자산', '투자자산', '장기투자', '비유동자산', 
      '토지', '건물', '기계장치', '차량운반구', '구축물', '영업권', '특허권', '상표권', '소프트웨어'];
    if (nonCurrentAssetKeywords.some(kw => normalized.includes(kw)) || 
        (normalized.includes('자산') && normalized.includes('비유동'))) {
      return 2;
    }
    if (normalized.includes('자산') && !normalized.includes('부채') && !normalized.includes('자본')) {
      // 자산이지만 위에서 분류되지 않은 경우 비유동자산으로 분류
      return 2;
    }
    
    // 3. 유동성 부채 항목
    const currentLiabilityKeywords = ['매입채무', '외상매입금', '미지급금', '미지급비용', '단기차입금', 
      '유동부채', '선수금', '선수수익', '예수금', '기타유동부채', '단기사채'];
    if (currentLiabilityKeywords.some(kw => normalized.includes(kw)) && !normalized.includes('비유동')) {
      return 3;
    }
    
    // 4. 비유동성 부채 항목
    const nonCurrentLiabilityKeywords = ['장기차입금', '비유동부채', '사채', '장기사채', '기타비유동부채'];
    if (nonCurrentLiabilityKeywords.some(kw => normalized.includes(kw)) || 
        (normalized.includes('부채') && normalized.includes('비유동'))) {
      return 4;
    }
    if (normalized.includes('부채') || normalized.includes('차입') || normalized.includes('대출')) {
      // 부채이지만 위에서 분류되지 않은 경우 비유동부채로 분류
      return 4;
    }
    
    // 5. 자본 항목
    const equityKeywords = ['자본', '자본금', '주식', '자본잉여금', '이익잉여금', '자본변동', 
      '기타포괄손익', '자기자본', '납입자본', '주식발행초과금', '자본조정'];
    if (equityKeywords.some(kw => normalized.includes(kw))) {
      return 5;
    }
    
    // 6. 매출 항목
    const revenueKeywords = ['매출', '매출액', '영업수익', '제품매출', '상품매출'];
    if (revenueKeywords.some(kw => normalized.includes(kw)) && !normalized.includes('원가')) {
      return 6;
    }
    
    // 7. 판매비와 관리비 항목
    const sgaKeywords = ['판매비', '관리비', '판관비', '판매관리비', '급여', '임금', '수당', 
      '복리후생비', '임차료', '임대료', '광고선전비', '운반비', '보험료', '세금과공과', 
      '감가상각비', '지급임차료', '수선비', '차량유지비', '소모품비', '도서인쇄비', 
      '수도광열비', '지급수수료', '대손상각비', '여비교통비', '접대비', '통신비'];
    if (sgaKeywords.some(kw => normalized.includes(kw))) {
      return 7;
    }
    
    // 8. 영업외수익 항목
    const nonOperatingRevenueKeywords = ['영업외수익', '이자수익', '배당수익', '임대수익', 
      '수수료수익', '기타수익', '외환차익', '유형자산처분이익'];
    if (nonOperatingRevenueKeywords.some(kw => normalized.includes(kw))) {
      return 8;
    }
    
    // 9. 영업외비용 항목
    const nonOperatingExpenseKeywords = ['영업외비용', '이자비용', '외환차손', '유형자산처분손실', 
      '기타비용', '손실', '매출원가', '제품매출원가', '상품매출원가'];
    if (nonOperatingExpenseKeywords.some(kw => normalized.includes(kw))) {
      return 9;
    }
    
    // 기타 (분류되지 않은 항목)
    return 999;
  };

  // 계정별원장에서 전기이월 항목 추출하여 기초잔액 계산
  const openingBalances = useMemo(() => {
    if (!ledgerWorkbook || !getDataFromSheet) return new Map<string, number>();

    const balances = new Map<string, number>();
    const openingKeywords = ['전기이월', '차기이월', '기초잔액', '이월잔액'];

    ledgerWorkbook.SheetNames.forEach(sheetName => {
      const worksheet = ledgerWorkbook.Sheets[sheetName];
      const { data } = getDataFromSheet(worksheet);

      // 전기이월 항목 찾기
      data.forEach(row => {
        // 적요란 또는 내용 필드에서 전기이월 키워드 확인
        const descriptionFields = ['적요', '적요란', '내용', '비고', 'description'];
        let isOpeningEntry = false;

        for (const field of descriptionFields) {
          const value = row[field];
          if (value) {
            const str = String(value).replace(/\s/g, '');
            if (openingKeywords.some(keyword => str.includes(keyword))) {
              isOpeningEntry = true;
              break;
            }
          }
        }

        if (isOpeningEntry) {
          // 차변/대변 헤더 찾기
          const debitFields = ['차변', '차   변', 'debit'];
          const creditFields = ['대변', '대   변', 'credit'];
          
          let debit = 0;
          let credit = 0;

          for (const field of debitFields) {
            if (row[field] !== undefined) {
              const val = row[field];
              if (typeof val === 'number') {
                debit = val;
                break;
              } else if (typeof val === 'string') {
                const parsed = parseFloat(val.replace(/,/g, ''));
                if (!isNaN(parsed)) {
                  debit = parsed;
                  break;
                }
              }
            }
          }

          for (const field of creditFields) {
            if (row[field] !== undefined) {
              const val = row[field];
              if (typeof val === 'number') {
                credit = val;
                break;
              } else if (typeof val === 'string') {
                const parsed = parseFloat(val.replace(/,/g, ''));
                if (!isNaN(parsed)) {
                  credit = parsed;
                  break;
                }
              }
            }
          }

          // 기초잔액 = 차변 - 대변
          const balance = debit - credit;
          
          // 시트명(계정명) 정규화하여 저장
          const normalizedSheetName = normalizeAccountName(sheetName);
          if (normalizedSheetName) {
            // 이미 존재하는 경우 합산 (여러 전기이월 항목이 있을 수 있음)
            const existing = balances.get(normalizedSheetName) || 0;
            balances.set(normalizedSheetName, existing + balance);
          }
        }
      });
    });

    return balances;
  }, [ledgerWorkbook, getDataFromSheet]);

  // --- Calculated Stats for General Analysis ---
  const generalStats = useMemo(() => {
    const totalDebit = analysisEntries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = analysisEntries.reduce((sum, e) => sum + e.credit, 0);
    const diff = totalDebit - totalCredit;
    const isBalanced = Math.abs(diff) < 1; 

    const accountMap = new Map<string, { count: number; debit: number; credit: number; openingBalance?: number }>();
    analysisEntries.forEach(e => {
      const current = accountMap.get(e.accountName) || { count: 0, debit: 0, credit: 0 };
      accountMap.set(e.accountName, {
        count: current.count + 1,
        debit: current.debit + e.debit,
        credit: current.credit + e.credit,
        openingBalance: current.openingBalance
      });
    });

    // 기초잔액 매칭
    const accountStats = Array.from(accountMap.entries()).map(([name, val]) => {
      // 분개장의 계정명과 계정별원장의 계정명 매칭
      let matchedOpeningBalance = 0;
      for (const [ledgerAccount, balance] of openingBalances.entries()) {
        if (matchAccountName(ledgerAccount, name)) {
          matchedOpeningBalance = balance;
          break;
        }
      }

      return {
        name,
        ...val,
        balance: val.debit - val.credit,
        openingBalance: matchedOpeningBalance,
        endingBalance: matchedOpeningBalance + (val.debit - val.credit), // 기초잔액 + 당기변동
        category: getAccountCategory(name) // 재무제표 순서 카테고리
      };
    }).sort((a, b) => {
      // 1순위: 재무제표 순서 (카테고리)
      if (a.category !== b.category) {
        return a.category - b.category;
      }
      // 2순위: 같은 카테고리 내에서는 금액 순 (내림차순)
      return (b.debit + b.credit) - (a.debit + a.credit);
    });

    return { totalDebit, totalCredit, diff, isBalanced, accountStats };
  }, [analysisEntries, openingBalances]);

  // --- Calculated Stats for Holiday Analysis ---
  const holidayStats = useMemo(() => {
    const map = new Map<string, { sat: number; sun: number; holiday: number; total: number }>();
    let weekdayCount = 0;
    let satCount = 0;
    let sunCount = 0;
    let holidayCount = 0;
    let excludedCount = 0;

    analysisEntries.forEach(e => {
      // 날짜 형식 정규화
      let dateStr = '';
      if (typeof e.date === 'string') {
        // 'YYYY-MM-DD' 형식으로 변환 시도
        dateStr = e.date.split('T')[0].split(' ')[0];
        // 'YYYY-MM-DD' 형식이 아닌 경우 (예: '20240101') 변환
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          // 숫자만 있는 경우 (예: 20240101)
          const dateOnly = dateStr.replace(/\D/g, '');
          if (dateOnly.length >= 8) {
            dateStr = `${dateOnly.substring(0, 4)}-${dateOnly.substring(4, 6)}-${dateOnly.substring(6, 8)}`;
          }
        }
      } else if (e.date instanceof Date) {
        dateStr = e.date.toISOString().split('T')[0];
      } else {
        dateStr = String(e.date);
      }

      // 월말 제외 체크
      if (excludeEndOfMonth && isLastDayOfMonth(dateStr)) {
        excludedCount++;
        return;
      }

      const dayType = checkDayType(dateStr);
      
      if (dayType === 'weekday') {
        weekdayCount++;
        return;
      }

      const current = map.get(e.accountName) || { sat: 0, sun: 0, holiday: 0, total: 0 };
      
      if (dayType === 'sat') {
        current.sat++;
        satCount++;
      } else if (dayType === 'sun') {
        current.sun++;
        sunCount++;
      } else if (dayType === 'holiday') {
        current.holiday++;
        holidayCount++;
      }
      current.total++;

      map.set(e.accountName, current);
    });

    // 디버깅 로그
    console.log('공휴일전표 분석 통계:', {
      전체항목수: analysisEntries.length,
      평일: weekdayCount,
      토요일: satCount,
      일요일: sunCount,
      공휴일: holidayCount,
      월말제외: excludedCount,
      집계된계정수: map.size,
      샘플날짜: analysisEntries.slice(0, 5).map(e => ({
        원본날짜: e.date,
        변환된날짜: typeof e.date === 'string' 
          ? e.date.split('T')[0].split(' ')[0] 
          : e.date instanceof Date 
            ? e.date.toISOString().split('T')[0] 
            : String(e.date),
        요일타입: checkDayType(
          typeof e.date === 'string' 
            ? e.date.split('T')[0].split(' ')[0] 
            : e.date instanceof Date 
              ? e.date.toISOString().split('T')[0] 
              : String(e.date)
        )
      }))
    });

    return Array.from(map.entries())
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.total - a.total);
  }, [analysisEntries, excludeEndOfMonth]);

  // --- Counter Account Logic (Specific Search) ---
  // 전표번호(entryNumber) 단위로 분석: 선택한 계정명과 차변/대변에 해당하는 전표번호를 찾고,
  // 각 전표번호 내에서 반대편(차변 선택시 대변)의 계정과 금액을 추출하여 전표번호별로 집계
  const runSpecificCounterAnalysis = async () => {
    if (!counterSearchTerm) return;
    setCounterStatus('loading');
    setCounterResult(null);
    setCounterDrilldownAccount(null);

    // Simulate short UI delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // 1. 선택한 계정명과 차변/대변에 해당하는 전표번호 찾기
    const targetEntries = analysisEntries.filter(e => {
      if (e.accountName !== counterSearchTerm) return false;
      return counterSearchSide === '차변' ? e.debit > 0 : e.credit > 0;
    });

    if (targetEntries.length === 0) {
      setCounterStatus('success');
      setCounterResult({
        accountName: counterSearchTerm,
        type: counterSearchSide,
        totalTransactions: 0,
        uniqueCounterAccounts: 0,
        breakdown: [],
        transactions: []
      });
      return;
    }

    // 2. entryNumber 정규화 헬퍼
    const normalizeEntryNumber = (entryNum: string | number | undefined): string | null => {
      if (!entryNum) return null;
      return String(entryNum).trim() || null;
    };

    // 3. targetEntries의 전표번호들 추출
    const targetEntryNumbers = new Set<string>();
    targetEntries.forEach(e => {
      const normalized = normalizeEntryNumber(e.entryNumber);
      if (normalized) {
        targetEntryNumbers.add(normalized);
      }
    });

    // 4. 각 전표번호별로 그룹핑하여 전체 항목 수집
    const entryNumberGroups = new Map<string, JournalEntry[]>();
    
    // targetEntryNumbers에 해당하는 모든 항목을 전표번호별로 그룹핑
    analysisEntries.forEach(e => {
      const normalized = normalizeEntryNumber(e.entryNumber);
      if (normalized && targetEntryNumbers.has(normalized)) {
        if (!entryNumberGroups.has(normalized)) {
          entryNumberGroups.set(normalized, []);
        }
        entryNumberGroups.get(normalized)!.push(e);
      }
    });

    // 5. 각 전표번호별로 상대계정 찾기 (계정명과 금액 함께 저장)
    // 전표번호별로 집계 (전표번호당 1건으로 카운트)
    const counterAccountByEntryNumber = new Map<string, Map<string, number>>(); // entryNumber -> {accountName: amount}

    targetEntryNumbers.forEach(entryNumber => {
      const group = entryNumberGroups.get(entryNumber);
      if (!group || group.length === 0) return;

      const targetInGroup = group.filter(e => {
        if (e.accountName !== counterSearchTerm) return false;
        return counterSearchSide === '차변' ? e.debit > 0 : e.credit > 0;
      });

      if (targetInGroup.length === 0) return;

      // 이 전표번호에서 반대편 계정 찾기
      // 차변을 선택했으면 대변 계정을 찾고, 대변을 선택했으면 차변 계정을 찾음
      const oppositeSide = counterSearchSide === '차변' ? '대변' : '차변';
      
      // 타겟 항목 제외하고 반대편 항목만 필터링
      const targetIds = new Set(targetInGroup.map(t => t.id).filter(id => id !== undefined));
      
      const counterAccounts = group.filter(e => {
        // 타겟 항목 자체는 제외
        if (targetIds.has(e.id as number)) {
          return false;
        }
        
        // 반대편만 추출 (차변 선택시: credit > 0인 항목, 대변 선택시: debit > 0인 항목)
        if (oppositeSide === '대변') return e.credit > 0;
        return e.debit > 0;
      });

      // 이 전표번호에서 발견된 상대계정들 (계정명과 금액 함께 저장)
      const counterAccountAmounts = new Map<string, number>(); // accountName -> amount
      counterAccounts.forEach(counter => {
        // 반대편 금액 계산:
        // - 대변 선택 시: 상대계정은 차변이므로 counter.debit 사용
        // - 차변 선택 시: 상대계정은 대변이므로 counter.credit 사용
        const amount = oppositeSide === '차변' ? counter.debit : counter.credit;
        const currentAmount = counterAccountAmounts.get(counter.accountName) || 0;
        counterAccountAmounts.set(counter.accountName, currentAmount + amount);
      });

      if (counterAccountAmounts.size > 0) {
        counterAccountByEntryNumber.set(entryNumber, counterAccountAmounts);
      }
    });

    // 6. 전체 상대계정별로 집계 (전표번호 건수와 금액 모두 집계)
    const counterFreq = new Map<string, { count: number; amount: number }>();

    counterAccountByEntryNumber.forEach((accountAmounts, entryNumber) => {
      // 각 전표번호에서 발견된 상대계정들을 카운트 및 금액 합산
      accountAmounts.forEach((amount, accountName) => {
        const current = counterFreq.get(accountName) || { count: 0, amount: 0 };
        counterFreq.set(accountName, {
          count: current.count + 1, // 전표번호 건수로 카운트
          amount: current.amount + amount // 금액 합산
        });
      });
    });

    // 7. 결과 포맷팅
    const sortedCounters = Array.from(counterFreq.entries())
      .map(([name, data]) => ({ name, count: data.count, amount: data.amount }))
      .sort((a, b) => b.count - a.count); // 건수 기준 정렬
    const totalCounterHits = sortedCounters.reduce((acc, cur) => acc + cur.count, 0);
    
    const breakdown = sortedCounters.map(({ name, count, amount }) => ({
      name,
      count,
      amount,
      percentage: totalCounterHits > 0 ? ((count / totalCounterHits) * 100).toFixed(1) + '%' : '0%'
    }));

    const resultData: CounterAccountAnalysisResult = {
      accountName: counterSearchTerm,
      type: counterSearchSide,
      totalTransactions: targetEntryNumbers.size, // 전표번호 건수
      uniqueCounterAccounts: sortedCounters.length,
      breakdown,
      transactions: targetEntries
    };

    setCounterResult(resultData);
    setCounterStatus('success');
  };

  // Helper to get counter name for a specific entry
  const getCounterAccountForEntry = (entry: JournalEntry, side: '차변' | '대변') => {
    const siblings = analysisEntries.filter(e => e.entryNumber === entry.entryNumber);
    const counters = siblings.filter(s => side === '차변' ? s.credit > 0 : s.debit > 0);
    const names = Array.from(new Set(counters.map(c => c.accountName)));
    return names.join(', ');
  };

  // 상대계정 드릴다운 데이터 — useMemo로 한 번만 계산 (렌더 시 반복 호출 방지, 프리징 완화)
  const counterDrilldownData = useMemo(() => {
    if (!counterResult || !counterDrilldownAccount) return [];
    const targetEntryNumbers = new Set<string>();
    counterResult.transactions.forEach(entry => {
      if (entry.entryNumber) targetEntryNumbers.add(String(entry.entryNumber));
    });
    const drilldownEntries: JournalEntry[] = [];
    targetEntryNumbers.forEach(entryNumber => {
      const group = analysisEntries.filter(e => String(e.entryNumber) === entryNumber);
      const targetInGroup = group.filter(e => {
        if (e.accountName !== counterResult.accountName) return false;
        return counterResult.type === '차변' ? e.debit > 0 : e.credit > 0;
      });
      if (targetInGroup.length === 0) return;
      const oppositeSide = counterResult.type === '차변' ? '대변' : '차변';
      const counterInGroup = group.filter(e => {
        if (e.accountName !== counterDrilldownAccount) return false;
        return oppositeSide === '대변' ? e.credit > 0 : e.debit > 0;
      });
      if (targetInGroup.length > 0 && counterInGroup.length > 0) drilldownEntries.push(...counterInGroup);
    });
    return drilldownEntries;
  }, [counterResult, counterDrilldownAccount, analysisEntries]);

  // 상대계정 월별 합계 — useMemo (counterDrilldownData 기반)
  const monthlyTotalsForCounterAccount = useMemo(() => {
    if (!counterResult || !counterDrilldownAccount || counterDrilldownData.length === 0) return [];
    const oppositeSide = counterResult.type === '차변' ? '대변' : '차변';
    const monthlyMap = new Map<string, { debit: number; credit: number; count: number; label: string }>();
    counterDrilldownData.forEach(entry => {
      let dateStr = String(entry.date);
      let date: Date;
      if (entry.date instanceof Date) {
        date = entry.date;
      } else if (dateStr.includes('T')) {
        date = new Date(dateStr);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        date = new Date(dateStr);
      } else if (/^\d{8}$/.test(dateStr.replace(/\D/g, ''))) {
        const cleaned = dateStr.replace(/\D/g, '');
        date = new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`);
      } else {
        const cleaned = dateStr.replace(/\D/g, '');
        date = cleaned.length >= 8
          ? new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`)
          : new Date(dateStr);
      }
      if (isNaN(date.getTime())) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
      const debitAmount = oppositeSide === '차변' ? entry.debit : 0;
      const creditAmount = oppositeSide === '대변' ? entry.credit : 0;
      const current = monthlyMap.get(monthKey);
      if (current) {
        monthlyMap.set(monthKey, {
          debit: current.debit + debitAmount,
          credit: current.credit + creditAmount,
          count: current.count + 1,
          label: current.label
        });
      } else {
        monthlyMap.set(monthKey, { debit: debitAmount, credit: creditAmount, count: 1, label: monthLabel });
      }
    });
    return Array.from(monthlyMap.entries())
      .map(([key, value]) => ({
        month: key,
        label: value.label,
        debit: value.debit,
        credit: value.credit,
        total: value.debit + value.credit,
        count: value.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [counterResult, counterDrilldownAccount, counterDrilldownData]);

  // 전표번호별 분개장 조회
  const getJournalEntriesByVoucherNumber = (voucherNumber: string | null): JournalEntry[] => {
    if (!voucherNumber) return [];
    
    // 같은 전표번호의 모든 항목 반환
    return analysisEntries.filter(e => String(e.entryNumber) === String(voucherNumber));
  };

  // --- Search Handler ---
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCounterSearchTerm(val);
    if (val.trim()) {
      const filtered = uniqueAccountNames.filter(n => n.toLowerCase().includes(val.toLowerCase()));
      setCounterSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setCounterSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (name: string) => {
    setCounterSearchTerm(name);
    setShowSuggestions(false);
  };

  const openModal = (type: AnalysisType) => {
    setActiveCard(type);
    setGeneralDrilldownAccount(null);
    setGeneralDrilldownType(null);
    setAccountDrilldownType(null);
    setGeneralDrilldownShowMonthly(false);
    setHolidayDrilldown(null);
    setEstimatedCost(null);
    setEstimatedTime(null);
    
    if (type === 'counter') {
      setCounterSearchTerm('');
      setCounterResult(null);
      setCounterStatus('idle');
      setCounterSuggestions([]);
      setCounterDrilldownAccount(null);
      setCounterDrilldownAmountClicked(false);
      setSelectedVoucherNumber(null);
    }
  };

  const closeModal = () => {
    setActiveCard(null);
    setGeneralDrilldownAccount(null);
    setGeneralDrilldownType(null);
    setAccountDrilldownType(null);
    setGeneralDrilldownShowMonthly(false);
    setHolidayDrilldown(null);
    setEstimatedCost(null);
    setEstimatedTime(null);
  };

  const calculateEstimate = (type: AnalysisType): number => {
    let entriesToAnalyze: JournalEntry[] = [];

    if (type === 'general') {
       const expenses = analysisEntries.filter(e => e.debit > 0);
       entriesToAnalyze = expenses.slice(0, 1000); 
    } else if (type === 'holiday') {
       const source = excludeEndOfMonth 
        ? analysisEntries.filter(e => !isLastDayOfMonth(String(e.date)))
        : analysisEntries;
       const expenses = source.filter(e => e.debit > 0);
       entriesToAnalyze = expenses.slice(0, 1000);
    } else if (type === 'appropriateness') {
       const expenses = analysisEntries.filter(e => 
        e.debit >= appropriatenessMinAmount && e.description.length > 1
       );
       entriesToAnalyze = expenses.slice(0, 1000);
    }

    const jsonString = JSON.stringify(entriesToAnalyze.map(e => ({
      d: e.date, a: e.accountName, v: e.vendor, m: e.debit, desc: e.description
    })));
    
    const charCount = jsonString.length + 500; 
    const tokenCount = charCount / 3;
    const inputCostUSD = (tokenCount / 1000000) * 0.075;
    const outputCostUSD = (1000 / 1000000) * 0.30;
    const totalUSD = inputCostUSD + outputCostUSD;
    const totalKRW = totalUSD * 1400; 

    const cost = Number(totalKRW.toFixed(2));
    setEstimatedCost(cost);
    
    // 예상 시간도 함께 계산
    if (type === 'general') {
      const expenses = analysisEntries.filter(e => e.debit > 0);
      const totalEntries = expenses.length;
      const sampleSize = Math.min(1000, totalEntries);
      
      // 예상 시간 계산 (초)
      // 기본 처리 시간: 15초
      // 데이터 건수에 따른 추가 시간: 1000건당 약 3초
      const baseTime = 15;
      const dataTime = Math.ceil(sampleSize / 1000) * 3;
      const estimatedSeconds = Math.min(120, Math.max(20, Math.ceil(baseTime + dataTime)));
      
      setEstimatedTime(estimatedSeconds);
    }
    
    return cost;
  };

  // 일반사항 분석 예상 시간 계산
  const calculateGeneralEstimatedTime = (): number => {
    const expenses = analysisEntries.filter(e => e.debit > 0);
    const totalEntries = expenses.length;
    const sampleSize = Math.min(1000, totalEntries);
    
    // 예상 시간 계산 (초)
    // 기본 처리 시간: 15초
    // 데이터 건수에 따른 추가 시간: 1000건당 약 3초
    const baseTime = 15;
    const dataTime = Math.ceil(sampleSize / 1000) * 3;
    const estimatedSeconds = Math.min(120, Math.max(20, Math.ceil(baseTime + dataTime)));
    
    return estimatedSeconds;
  };

  // 적합성 분석 예상 시간 계산
  const calculateEstimatedTime = (): number => {
    const filteredEntries = analysisEntries.filter(e => 
      e.debit >= appropriatenessMinAmount && e.description && e.description.length > 1
    );
    
    if (filteredEntries.length === 0) {
      return 0;
    }
    
    // 계정과목별 그룹화
    const accountGroups = new Map<string, JournalEntry[]>();
    filteredEntries.forEach(e => {
      if (!accountGroups.has(e.accountName)) {
        accountGroups.set(e.accountName, []);
      }
      accountGroups.get(e.accountName)!.push(e);
    });
    
    const accountCount = accountGroups.size;
    const totalEntries = filteredEntries.length;
    
    // 예상 시간 계산 (초)
    // 기본 처리 시간: 10초
    // 계정과목 수에 따른 추가 시간: 계정당 약 0.5초
    // 데이터 건수에 따른 추가 시간: 1000건당 약 2초
    const baseTime = 10;
    const accountTime = accountCount * 0.5;
    const dataTime = Math.ceil(totalEntries / 1000) * 2;
    
    // 최소 15초, 최대 120초
    const estimatedSeconds = Math.min(120, Math.max(15, Math.ceil(baseTime + accountTime + dataTime)));
    
    return estimatedSeconds;
  };

  const runAnalysis = async (type: AnalysisType) => {
    // 동시 요청 방지
    if (isAnalysisRunningRef.current) {
      toast({
        title: '요청 제한',
        description: '다른 분석이 진행 중입니다. 완료 후 다시 시도해주세요.',
        variant: 'destructive',
      });
      return;
    }
    
    // 요청 빈도 제한: 마지막 요청 후 최소 5초 대기 (할당량 초과 방지)
    const now = Date.now();
    const timeSinceLastRequest = now - lastApiRequestTimeRef.current;
    const minInterval = 5000; // 5초
    
    if (timeSinceLastRequest < minInterval && lastApiRequestTimeRef.current > 0) {
      const waitTime = Math.ceil((minInterval - timeSinceLastRequest) / 1000);
      toast({
        title: '요청 간격 제한',
        description: `API 할당량 보호를 위해 ${waitTime}초 후에 다시 시도해주세요.`,
        variant: 'default',
      });
      return;
    }
    
    isAnalysisRunningRef.current = true;
    lastApiRequestTimeRef.current = now;
    
    let currentCost = estimatedCost;
    if (currentCost === null && type !== 'counter') {
      currentCost = calculateEstimate(type);
    }
    
    try {
      if (type === 'general') {
        setGeneralStatus('loading');
        setGeneralError(null);
        try {
          // API 키 확인
          const { getApiKey } = await import('@/lib/geminiClient');
          const apiKey = getApiKey();
          
          if (!apiKey) {
            const errorMsg = 'API Key가 설정되지 않았습니다. 설정에서 Google Gemini API Key를 입력해주세요.';
            setGeneralError(errorMsg);
            setGeneralStatus('error');
          } else {
          
            const result = await analyzeGeneral(analysisEntries);
            if (result) {
              setGeneralData(result);
              setGeneralStatus('success');
              setTotalCost(prev => prev + (currentCost || 0.5));
            } else {
              setGeneralError('분석 결과를 가져올 수 없습니다.');
              setGeneralStatus('error');
            }
          }
        } catch (error: any) {
          console.error('❌ 일반 분석 중 오류:', error);
          let errorMessage = '분석 중 오류가 발생했습니다.';
          if (error?.message) {
            errorMessage = error.message;
          } else if (error?.status === 429) {
            errorMessage = 'API 사용량 한도 초과. 무료 티어는 분당 15회 요청 제한이 있습니다. 1-2분 후 다시 시도해주세요.';
          } else if (error?.status === 404) {
            errorMessage = '모델을 찾을 수 없습니다. API Key가 올바른지 확인해주세요.';
          } else if (error?.status === 401 || error?.status === 403) {
            errorMessage = 'API Key가 유효하지 않습니다. 설정에서 API Key를 확인하고 다시 시도해주세요.';
          }
          setGeneralError(errorMessage);
          setGeneralStatus('error');
        }
      } else if (type === 'holiday') {
        setHolidayStatus('loading');
        setHolidayError(null);
        try {
          // API 키 확인
          const { getApiKey } = await import('@/lib/geminiClient');
          const apiKey = getApiKey();
          
          if (!apiKey) {
            const errorMsg = 'API Key가 설정되지 않았습니다. 설정에서 Google Gemini API Key를 입력해주세요.';
            setHolidayError(errorMsg);
            setHolidayStatus('error');
          } else {
            const filteredEntries = excludeEndOfMonth 
              ? analysisEntries.filter(e => !isLastDayOfMonth(String(e.date)))
              : analysisEntries;
            const result = await analyzeHoliday(filteredEntries);
            if (result) {
              setHolidayData(result);
              setHolidayStatus('success');
              setTotalCost(prev => prev + (currentCost || 0.5));
            } else {
              setHolidayError('분석 결과를 가져올 수 없습니다.');
              setHolidayStatus('error');
            }
          }
        } catch (error: any) {
          console.error('❌ 공휴일 분석 중 오류:', error);
          let errorMessage = '분석 중 오류가 발생했습니다.';
          if (error?.message) {
            errorMessage = error.message;
          } else if (error?.status === 429) {
            errorMessage = 'API 사용량 한도 초과. 무료 티어는 분당 15회 요청 제한이 있습니다. 1-2분 후 다시 시도해주세요.';
          } else if (error?.status === 404) {
            errorMessage = '모델을 찾을 수 없습니다. API Key가 올바른지 확인해주세요.';
          } else if (error?.status === 401 || error?.status === 403) {
            errorMessage = 'API Key가 유효하지 않습니다. 설정에서 API Key를 확인하고 다시 시도해주세요.';
          }
          setHolidayError(errorMessage);
          setHolidayStatus('error');
        }
    } else if (type === 'appropriateness') {
      setAppropriatenessStatus('loading');
      const filteredEntries = analysisEntries.filter(e => 
        e.debit >= appropriatenessMinAmount
      );
      
      console.log('적요 적합성 분석 시작:', {
        총분개장수: analysisEntries.length,
        필터링된수: filteredEntries.length,
        최소금액: appropriatenessMinAmount,
        필터링된데이터샘플: filteredEntries.slice(0, 3).map(e => ({
          계정: e.accountName,
          적요: e.description,
          금액: e.debit
        }))
      });
      
      if (filteredEntries.length === 0) {
        const errorMsg = `분석할 데이터가 없습니다. (최소 금액: ${appropriatenessMinAmount.toLocaleString()}원)`;
        setAppropriatenessError(errorMsg);
        setAppropriatenessStatus('error');
        console.error('❌', errorMsg);
        console.error('현재 최소 금액:', appropriatenessMinAmount);
        console.error('총 분개장 항목 수:', analysisEntries.length);
        console.error('차변 항목 수:', analysisEntries.filter(e => e.debit > 0).length);
      } else {
        try {
          // API 키 확인
          const { getApiKey } = await import('@/lib/geminiClient');
          const apiKey = getApiKey();
          
          if (!apiKey) {
            const errorMsg = 'API Key가 설정되지 않았습니다. 설정에서 Google Gemini API Key를 입력해주세요.';
            setAppropriatenessError(errorMsg);
            setAppropriatenessStatus('error');
            console.error('❌', errorMsg);
            console.error('💡 localStorage 확인:', localStorage.getItem('gemini_api_key'));
          } else {
            console.log('🔍 analyzeAppropriateness 함수 호출 중...');
            const result = await analyzeAppropriateness(filteredEntries);
            console.log('📊 analyzeAppropriateness 결과:', result);
            
            if (result) {
              console.log('✅ 분석 성공:', {
                점수: result.score,
                부적합항목수: result.flaggedItems.length
              });
              setAppropriatenessData(result);
              setAppropriatenessStatus('success');
              setTotalCost(prev => prev + (currentCost || 0.5));
            } else {
              const errorMsg = '분석 결과를 가져올 수 없습니다. API 호출이 실패했거나 결과를 파싱하지 못했습니다.';
              console.error('❌', errorMsg);
              console.error('💡 가능한 원인: API 키 문제, 네트워크 오류, 또는 API 서버 문제');
              setAppropriatenessError(errorMsg);
              setAppropriatenessStatus('error');
            }
          }
        } catch (error: any) {
          console.error('❌ 적요 적합성 분석 중 예외 발생:', error);
          console.error('에러 상세:', {
            message: error?.message,
            stack: error?.stack,
            name: error?.name,
            status: error?.status,
            statusText: error?.statusText
          });
          
          let errorMessage = '분석 중 오류가 발생했습니다.';
          if (error?.message) {
            errorMessage = error.message;
          } else if (error?.status === 429) {
            errorMessage = 'API 사용량 한도 초과. 잠시 후 다시 시도해주세요.';
          } else if (error?.status === 401 || error?.status === 403) {
            errorMessage = 'API 키 인증 오류. API 키를 확인해주세요.';
          } else if (error?.message?.includes('API Key')) {
            errorMessage = 'API Key가 설정되지 않았거나 유효하지 않습니다. 설정에서 API Key를 확인해주세요.';
          }
          
          setAppropriatenessError(errorMessage);
          setAppropriatenessStatus('error');
        }
      }
    }
    } finally {
      // 모든 분석 완료 후 실행 상태 해제 (오류 발생 여부와 관계없이)
      isAnalysisRunningRef.current = false;
    }
  };

  // --- Excel Download Handlers ---
  const exportToExcel = (data: any[], fileName: string, sheetName: string, colWidths?: number[]) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    if (colWidths) {
      ws['!cols'] = colWidths.map(w => ({ wch: w }));
    }
    const safeSheetName = sheetName.replace(/[\\/?*[\]]/g, '').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `${fileName}_${dateStr}.xlsx`);
  };

  const handleGeneralDrilldownDownload = () => {
    if (!generalDrilldownAccount) return;
    let filteredEntries = analysisEntries.filter(e => e.accountName === generalDrilldownAccount);
    
    // 계정별 차변/대변 필터링
    if (accountDrilldownType === 'debit') {
      filteredEntries = filteredEntries.filter(e => e.debit > 0);
    } else if (accountDrilldownType === 'credit') {
      filteredEntries = filteredEntries.filter(e => e.credit > 0);
    }
    
    const filteredData = filteredEntries.map(e => ({
      '일자': e.date, '전표번호': e.entryNumber, '적요': e.description, '거래처': e.vendor, '차변': e.debit, '대변': e.credit
    }));
    const suffix = accountDrilldownType ? `_${accountDrilldownType === 'debit' ? '차변' : '대변'}` : '';
    exportToExcel(filteredData, `${generalDrilldownAccount}${suffix}_상세내역`, generalDrilldownAccount, [12, 15, 40, 20, 12, 12]);
  };
  
  const getAccountDrilldownData = () => {
    if (!generalDrilldownAccount) return [];
    let filteredEntries = analysisEntries.filter(e => e.accountName === generalDrilldownAccount);
    
    // 계정별 차변/대변 필터링
    if (accountDrilldownType === 'debit') {
      filteredEntries = filteredEntries.filter(e => e.debit > 0);
    } else if (accountDrilldownType === 'credit') {
      filteredEntries = filteredEntries.filter(e => e.credit > 0);
    }
    
    console.log('getAccountDrilldownData 결과:', {
      계정: generalDrilldownAccount,
      차변대변타입: accountDrilldownType,
      전체항목수: analysisEntries.length,
      해당계정항목수: analysisEntries.filter(e => e.accountName === generalDrilldownAccount).length,
      필터링된건수: filteredEntries.length,
      샘플: filteredEntries.slice(0, 3).map(e => ({
        계정: e.accountName,
        날짜: e.date,
        차변: e.debit,
        대변: e.credit
      }))
    });
    
    return filteredEntries;
  };

  // 일반사항분석 계정별 상세내역의 월별 합계 계산
  const getMonthlyTotalsForGeneralAccount = () => {
    if (!generalDrilldownAccount) {
      console.log('getMonthlyTotalsForGeneralAccount: 계정 없음');
      return [];
    }
    
    const drilldownData = getAccountDrilldownData();
    console.log('getMonthlyTotalsForGeneralAccount: 데이터 수', drilldownData.length);
    
    // 월별로 그룹핑
    const monthlyMap = new Map<string, { debit: number; credit: number; count: number; label: string }>();
    
    drilldownData.forEach(entry => {
      // 날짜 파싱
      let dateStr = String(entry.date);
      let date: Date;
      
      // 다양한 날짜 형식 처리
      if (entry.date instanceof Date) {
        date = entry.date;
      } else if (dateStr.includes('T')) {
        date = new Date(dateStr);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        date = new Date(dateStr);
      } else if (/^\d{8}$/.test(dateStr.replace(/\D/g, ''))) {
        const cleaned = dateStr.replace(/\D/g, '');
        date = new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`);
      } else {
        // 다른 형식 시도
        const cleaned = dateStr.replace(/\D/g, '');
        if (cleaned.length >= 8) {
          date = new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`);
        } else {
          date = new Date(dateStr);
        }
      }
      
      if (isNaN(date.getTime())) {
        console.warn('날짜 파싱 실패:', entry.date);
        return;
      }
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
      
      const current = monthlyMap.get(monthKey);
      if (current) {
        monthlyMap.set(monthKey, {
          debit: current.debit + entry.debit,
          credit: current.credit + entry.credit,
          count: current.count + 1,
          label: current.label
        });
      } else {
        monthlyMap.set(monthKey, {
          debit: entry.debit,
          credit: entry.credit,
          count: 1,
          label: monthLabel
        });
      }
    });
    
    // 월별로 정렬하여 반환
    return Array.from(monthlyMap.entries())
      .map(([key, value]) => ({
        month: key,
        label: value.label,
        debit: value.debit,
        credit: value.credit,
        total: value.debit + value.credit,
        count: value.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  };

  // 차변/대변 합계 상세내역의 월별 합계 계산
  const getMonthlyTotalsForDebitCredit = () => {
    if (!generalDrilldownType) return [];
    
    const drilldownData = getDebitCreditDrilldownData();
    
    // 월별로 그룹핑
    const monthlyMap = new Map<string, { debit: number; credit: number; count: number; label: string }>();
    
    drilldownData.forEach(entry => {
      // 날짜 파싱
      let dateStr = String(entry.date);
      let date: Date;
      
      // 다양한 날짜 형식 처리
      if (entry.date instanceof Date) {
        date = entry.date;
      } else if (dateStr.includes('T')) {
        date = new Date(dateStr);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        date = new Date(dateStr);
      } else if (/^\d{8}$/.test(dateStr.replace(/\D/g, ''))) {
        const cleaned = dateStr.replace(/\D/g, '');
        date = new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`);
      } else {
        // 다른 형식 시도
        const cleaned = dateStr.replace(/\D/g, '');
        if (cleaned.length >= 8) {
          date = new Date(`${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`);
        } else {
          date = new Date(dateStr);
        }
      }
      
      if (isNaN(date.getTime())) {
        console.warn('날짜 파싱 실패:', entry.date);
        return;
      }
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
      
      const current = monthlyMap.get(monthKey);
      if (current) {
        monthlyMap.set(monthKey, {
          debit: current.debit + entry.debit,
          credit: current.credit + entry.credit,
          count: current.count + 1,
          label: current.label
        });
      } else {
        monthlyMap.set(monthKey, {
          debit: entry.debit,
          credit: entry.credit,
          count: 1,
          label: monthLabel
        });
      }
    });
    
    // 월별로 정렬하여 반환
    return Array.from(monthlyMap.entries())
      .map(([key, value]) => ({
        month: key,
        label: value.label,
        debit: value.debit,
        credit: value.credit,
        total: value.debit + value.credit,
        count: value.count
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  };

  const handleDebitCreditDrilldownDownload = () => {
    if (!generalDrilldownType) return;
    const filteredData = analysisEntries
      .filter(e => generalDrilldownType === 'debit' ? e.debit > 0 : e.credit > 0)
      .map(e => ({
        '일자': e.date,
        '전표번호': e.entryNumber,
        '계정과목': e.accountName,
        '적요': e.description,
        '거래처': e.vendor,
        '차변': e.debit,
        '대변': e.credit
      }));
    const title = generalDrilldownType === 'debit' ? '차변_상세내역' : '대변_상세내역';
    exportToExcel(filteredData, title, title, [12, 15, 20, 40, 20, 12, 12]);
  };

  // 텍스트를 일정 길이로 제한하고 줄바꿈 추가하는 함수
  const wrapText = (text: string, maxLength: number = 80): string[] => {
    if (text.length <= maxLength) {
      return [text];
    }
    
    const lines: string[] = [];
    let currentLine = '';
    
    // 공백, 구두점, 마크다운 기호 등을 기준으로 분리
    const words = text.split(/(\s+|\.|,|;|:|!|\?|\)|\(|\[|\]|{|}|#|\*|-)/);
    
    for (const word of words) {
      if (!word) continue;
      
      // 현재 줄에 단어를 추가했을 때 길이 확인
      const testLine = currentLine + word;
      
      if (testLine.length <= maxLength) {
        currentLine = testLine;
      } else {
        // 현재 줄이 비어있지 않으면 저장하고 새 줄 시작
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
        }
        // 단어 자체가 maxLength보다 길면 강제로 자름
        if (word.length > maxLength) {
          // 긴 단어를 여러 줄로 분할
          let remaining = word;
          while (remaining.length > maxLength) {
            lines.push(remaining.substring(0, maxLength));
            remaining = remaining.substring(maxLength);
          }
          currentLine = remaining;
        } else {
          currentLine = word;
        }
      }
    }
    
    // 마지막 줄 추가
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    return lines.length > 0 ? lines : [text];
  };

  // AI 종합의견 엑셀 다운로드
  const handleGeneralOpinionDownload = () => {
    if (!generalData) return;
    
    // AI 종합 의견을 브라우저 화면처럼 읽기 쉽게 포맷팅
    // 텍스트를 줄바꿈 기준으로 분리하여 여러 행으로 저장
    const opinionLines = generalData.content.split('\n').filter(line => line.trim() !== '');
    
    // 헤더 행
    const data: any[] = [
      {
        '항목': 'Risk Score',
        '값': `${generalData.riskScore}/100`
      }
    ];
    
    // AI 종합 의견을 여러 행으로 저장
    // 첫 번째 행에 항목명, 나머지 행에는 빈 항목명과 의견 내용
    if (opinionLines.length > 0) {
      // 첫 번째 줄 처리 (길이 제한 적용)
      const firstLineWrapped = wrapText(opinionLines[0], 80);
      data.push({
        '항목': 'AI 종합 의견',
        '값': firstLineWrapped[0] // 첫 번째 줄
      });
      
      // 첫 번째 줄이 여러 줄로 나뉜 경우 나머지 추가
      for (let i = 1; i < firstLineWrapped.length; i++) {
        data.push({
          '항목': '',
          '값': firstLineWrapped[i]
        });
      }
      
      // 나머지 줄들을 별도 행으로 추가 (각 줄에 길이 제한 적용)
      for (let i = 1; i < opinionLines.length; i++) {
        const wrappedLines = wrapText(opinionLines[i], 80);
        wrappedLines.forEach(wrappedLine => {
          data.push({
            '항목': '', // 빈 항목명
            '값': wrappedLine
          });
        });
      }
    } else {
      // 줄바꿈이 없는 경우 원본을 길이 제한 적용하여 분할
      const wrappedLines = wrapText(generalData.content, 80);
      data.push({
        '항목': 'AI 종합 의견',
        '값': wrappedLines[0]
      });
      
      // 나머지 줄들 추가
      for (let i = 1; i < wrappedLines.length; i++) {
        data.push({
          '항목': '',
          '값': wrappedLines[i]
        });
      }
    }
    
    data.push({
      '항목': '분석 일시',
      '값': new Date().toLocaleString('ko-KR')
    });
    
    // 텍스트를 여러 행으로 나누어 저장하여 읽기 쉽게 함
    exportToExcel(data, '일반사항_AI종합의견', 'AI 종합 의견', [20, 80]);
  };

  const getDebitCreditDrilldownData = () => {
    if (!generalDrilldownType) return [];
    return analysisEntries.filter(e => 
      generalDrilldownType === 'debit' ? e.debit > 0 : e.credit > 0
    );
  };

  const handleGeneralSummaryDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const data = generalStats.accountStats.map(stat => ({
      '계정과목': stat.name, '전표 수': stat.count, '차변 합계': stat.debit, '대변 합계': stat.credit, '잔액': stat.balance
    }));
    exportToExcel(data, "계정별요약", "Sheet1", [20, 10, 15, 15, 15]);
  };

  // 월별 트렌드 그래프 PDF 다운로드 함수
  const exportChartToPDF = async (chartRef: React.RefObject<HTMLDivElement>, fileName: string, chartTitle: string) => {
    if (!chartRef.current) {
      toast({
        title: '오류',
        description: '그래프를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    // 로딩 토스트 표시
    const loadingToast = toast({
      title: 'PDF 생성 중',
      description: '그래프를 PDF로 변환하는 중입니다. 잠시만 기다려주세요...',
    });

    try {
      // html2canvas와 jsPDF를 동적으로 import
      let html2canvas, jsPDF;
      try {
        html2canvas = (await import('html2canvas')).default;
        const jspdfModule = await import('jspdf');
        
        // AdvancedLedgerAnalysis.tsx와 동일한 방식으로 import
        jsPDF = jspdfModule.jsPDF;
        
        if (!jsPDF || typeof jsPDF !== 'function') {
          throw new Error('jsPDF를 찾을 수 없습니다. jspdf 라이브러리가 올바르게 설치되었는지 확인해주세요.');
        }
        
        console.log('✅ PDF 라이브러리 로드 성공');
      } catch (importError: any) {
        console.error('❌ 라이브러리 import 오류:', importError);
        toast({
          title: '라이브러리 오류',
          description: `PDF 생성 라이브러리를 불러오지 못했습니다: ${importError.message || '알 수 없는 오류'}`,
          variant: 'destructive',
        });
        return;
      }

      // 한글 폰트 명시적으로 로드
      const loadFont = (fontFamily: string) => {
        return new Promise<void>((resolve) => {
          if (document.fonts.check(`16px "${fontFamily}"`)) {
            resolve();
            return;
          }
          document.fonts.load(`16px "${fontFamily}"`).then(() => resolve()).catch(() => resolve());
        });
      };
      
      // 여러 한글 폰트 로드 시도
      await Promise.all([
        loadFont('Noto Sans KR'),
        loadFont('Apple SD Gothic Neo'),
        loadFont('Malgun Gothic'),
        loadFont('맑은 고딕')
      ]);
      
      // 폰트 로딩 대기
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      
      // 모든 폰트가 실제로 로드될 때까지 대기
      await new Promise(resolve => {
        let attempts = 0;
        const maxAttempts = 100; // 최대 10초 대기
        const checkFonts = () => {
          attempts++;
          const fonts = Array.from(document.fonts || []);
          const loadedFonts = fonts.filter(f => f.status === 'loaded');
          const loadingFonts = fonts.filter(f => f.status === 'loading');
          
          // 로딩 중인 폰트가 없거나 최대 시도 횟수에 도달하면 완료
          if (loadingFonts.length === 0 || attempts >= maxAttempts) {
            resolve(true);
          } else {
            setTimeout(checkFonts, 100);
          }
        };
        checkFonts();
      });
      
      // 추가 대기 시간 (한글 폰트가 완전히 렌더링될 때까지)
      // 그래프가 완전히 렌더링되도록 충분한 시간 제공
      await new Promise(resolve => setTimeout(resolve, 1500));

      // SVG를 먼저 이미지로 변환하는 함수
      const svgToImage = (svgElement: SVGSVGElement): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          try {
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(url);
              resolve(img);
            };
            img.onerror = (error) => {
              URL.revokeObjectURL(url);
              reject(error);
            };
            img.src = url;
          } catch (error) {
            reject(error);
          }
        });
      };

      // SVG 요소 찾기
      const svgElement = chartRef.current?.querySelector('svg') as SVGSVGElement;
      if (svgElement) {
        // SVG의 크기 확인
        const bbox = svgElement.getBBox();
        const svgWidth = Math.max(bbox.width + bbox.x, svgElement.clientWidth || 800);
        const svgHeight = Math.max(bbox.height + bbox.y, svgElement.clientHeight || 400);
        
        // SVG에 명시적 크기 설정
        svgElement.setAttribute('width', String(svgWidth));
        svgElement.setAttribute('height', String(svgHeight));
        
        // SVG 내부의 모든 텍스트 요소에 폰트 및 색상 명시적 설정
        const allTextElements = svgElement.querySelectorAll('text, tspan');
        console.log(`📊 SVG 텍스트 요소 발견: ${allTextElements.length}개`);
        
        allTextElements.forEach((el, idx) => {
          const svgTextEl = el as SVGElement;
          const textContent = svgTextEl.textContent || '';
          const currentFill = svgTextEl.getAttribute('fill') || 'none';
          const computedStyle = window.getComputedStyle(svgTextEl);
          const fillColor = computedStyle.fill || currentFill;
          
          console.log(`텍스트 요소 ${idx + 1}: "${textContent}" - Fill: ${currentFill} / Computed: ${computedStyle.fill}`);
          
          // 폰트 설정
          svgTextEl.setAttribute('font-family', 'Arial, sans-serif');
          svgTextEl.style.fontFamily = 'Arial, sans-serif';
          
          // 텍스트가 있으면 색상 명시적 설정
          if (textContent.trim()) {
            // 투명하거나 없는 경우 검은색으로 설정
            if (!fillColor || fillColor === 'none' || fillColor === 'transparent' || fillColor === 'rgba(0, 0, 0, 0)') {
              svgTextEl.setAttribute('fill', '#000000');
              svgTextEl.style.fill = '#000000';
              console.log(`  → 색상이 없어 검은색으로 설정: "${textContent}"`);
            } else {
              svgTextEl.setAttribute('fill', fillColor);
              svgTextEl.style.fill = fillColor;
            }
            
            // 텍스트 렌더링 속성 강제
            svgTextEl.setAttribute('text-rendering', 'optimizeLegibility');
            svgTextEl.style.textRendering = 'optimizeLegibility';
          }
        });
        
        // 잠시 대기하여 렌더링 완료
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          // SVG를 이미지로 변환
          const svgImage = await svgToImage(svgElement);
          
          // Canvas에 그리기
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = svgWidth * 2; // 고해상도
          tempCanvas.height = svgHeight * 2;
          const ctx = tempCanvas.getContext('2d');
          
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(svgImage, 0, 0, tempCanvas.width, tempCanvas.height);
            
            // 이제 이 canvas를 PDF에 사용
            const imgData = tempCanvas.toDataURL('image/png');
            const imgWidth = 210; // A4 width in mm
            const imgHeight = (tempCanvas.height * imgWidth) / tempCanvas.width;
            let heightLeft = imgHeight;

            const pdf = new jsPDF('p', 'mm', 'a4');
            let position = 10;

            // 제목 추가
            if (chartTitle) {
              pdf.setFontSize(16);
              pdf.setFont('helvetica', 'bold');
              try {
                pdf.text(chartTitle, 10, position);
                position += 8; // 제목 아래 여백
              } catch (titleError) {
                console.warn('제목 추가 실패 (한글 폰트 미지원 가능):', titleError);
              }
            }

            // 이미지 추가
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= 297 - position - 10;

            // 여러 페이지가 필요한 경우
            while (heightLeft > 0) {
              position = heightLeft - imgHeight;
              pdf.addPage();
              pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
              heightLeft -= 297;
            }

            const dateStr = new Date().toISOString().split('T')[0];
            pdf.save(`${fileName}_${dateStr}.pdf`);

            toast({
              title: '성공',
              description: 'PDF가 다운로드되었습니다.',
            });
            return;
          }
        } catch (svgError) {
          console.warn('SVG 직접 변환 실패, html2canvas 사용:', svgError);
          // SVG 직접 변환이 실패하면 html2canvas 사용
        }
      }

      // html2canvas 사용 (폴백)
      // 원본 요소에 폰트 강제 적용 (캡처 전)
      const originalElement = chartRef.current;
      if (originalElement) {
        // SVG 요소의 폰트도 강제 적용
        const svgElements = originalElement.querySelectorAll('svg text, svg tspan');
        svgElements.forEach((el) => {
          const svgEl = el as SVGElement;
          svgEl.setAttribute('font-family', 'Arial, sans-serif');
          // 한글 폰트를 시스템 폰트로 설정
          const computedStyle = window.getComputedStyle(svgEl);
          svgEl.style.fontFamily = computedStyle.fontFamily || 'Arial, sans-serif';
        });
        
        // 잠시 대기하여 폰트 적용 확인
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // 그래프 영역을 이미지로 변환
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: false,
        letterRendering: true,
        foreignObjectRendering: true,
        removeContainer: false,
        onclone: (clonedDoc, element) => {
          console.log('🔍 onclone 실행 - SVG 텍스트 처리 시작');
          
          // PDF 다운로드 버튼 숨기기
          const downloadButtons = clonedDoc.querySelectorAll('button');
          downloadButtons.forEach(btn => {
            const btnElement = btn as HTMLElement;
            if (btnElement.textContent?.includes('PDF') || btnElement.textContent?.includes('다운로드')) {
              btnElement.style.display = 'none';
            }
          });
          
          // 모든 SVG 텍스트 요소 찾기
          const svgElements = clonedDoc.querySelectorAll('svg text, svg tspan');
          console.log(`📊 발견된 SVG 텍스트 요소 수: ${svgElements.length}`);
          
          svgElements.forEach((el, idx) => {
            const svgEl = el as SVGElement;
            const textContent = svgEl.textContent || '';
            const currentFill = svgEl.getAttribute('fill') || 'none';
            const computedStyle = window.getComputedStyle(svgEl);
            
            console.log(`텍스트 요소 ${idx + 1}:`, {
              텍스트: textContent,
              현재Fill: currentFill,
              ComputedFill: computedStyle.fill,
              FontFamily: computedStyle.fontFamily,
              FontSize: computedStyle.fontSize
            });
            
            // 텍스트가 있으면 강제로 스타일 적용
            if (textContent.trim()) {
              // 폰트 설정
              svgEl.setAttribute('font-family', computedStyle.fontFamily || 'Arial, sans-serif');
              svgEl.setAttribute('font-size', computedStyle.fontSize || svgEl.getAttribute('font-size') || '12px');
              
              // 색상 설정 - 투명하거나 없는 경우 검은색으로
              const fillColor = computedStyle.fill || currentFill;
              if (!fillColor || fillColor === 'none' || fillColor === 'transparent' || fillColor === 'rgba(0, 0, 0, 0)') {
                svgEl.setAttribute('fill', '#000000'); // 검은색
                svgEl.style.fill = '#000000';
                console.log(`  → 색상이 투명하여 검은색으로 변경: ${textContent}`);
              } else {
                svgEl.setAttribute('fill', fillColor);
                svgEl.style.fill = fillColor;
              }
              
              // 텍스트 렌더링 속성 강제
              svgEl.setAttribute('text-rendering', 'optimizeLegibility');
              svgEl.style.textRendering = 'optimizeLegibility';
              svgEl.setAttribute('font-weight', computedStyle.fontWeight || 'normal');
              svgEl.style.fontWeight = computedStyle.fontWeight || 'normal';
            }
          });
          
          // SVG 전체에 기본 스타일 적용
          const allSvgs = clonedDoc.querySelectorAll('svg');
          allSvgs.forEach((svg) => {
            (svg as SVGElement).setAttribute('style', 'font-family: Arial, sans-serif;');
          });
          
          console.log('✅ SVG 텍스트 처리 완료');
        },
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      // PDF 인스턴스 생성
      let pdf;
      try {
        pdf = new jsPDF('p', 'mm', 'a4');
        console.log('✅ PDF 인스턴스 생성 성공');
      } catch (pdfError: any) {
        console.error('❌ PDF 인스턴스 생성 오류:', pdfError);
        toast({
          title: 'PDF 생성 오류',
          description: `PDF를 초기화할 수 없습니다: ${pdfError.message || '알 수 없는 오류'}`,
          variant: 'destructive',
        });
        return;
      }

      // 제목 추가
      let position = 10;
      if (chartTitle) {
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        // 한글 제목을 텍스트로 추가 (간단한 방법)
        // 한글이 깨질 수 있으므로 제목을 이미지로 변환하거나, 
        // 제목이 포함된 영역을 함께 캡처하는 것이 더 나음
        // 일단 제목 텍스트 추가 시도
        try {
          pdf.text(chartTitle, 10, position);
          position += 8; // 제목 아래 여백
        } catch (titleError) {
          console.warn('제목 추가 실패 (한글 폰트 미지원 가능):', titleError);
          // 제목 추가 실패해도 계속 진행
        }
      }

      // 이미지 추가
      try {
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        console.log('✅ PDF에 이미지 추가 성공');
        heightLeft -= pageHeight - position - 10;

        // 여러 페이지가 필요한 경우
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const saveFileName = `${fileName}_${dateStr}.pdf`;
        pdf.save(saveFileName);
        console.log('✅ PDF 다운로드 성공:', saveFileName);

        toast({
          title: '성공',
          description: 'PDF가 다운로드되었습니다.',
        });
      } catch (imageError: any) {
        console.error('❌ PDF 이미지 추가/저장 오류:', imageError);
        toast({
          title: 'PDF 저장 오류',
          description: `PDF를 저장하는 중 오류가 발생했습니다: ${imageError.message || '알 수 없는 오류'}`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('PDF 생성 오류:', error);
      console.error('에러 상세:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      toast({
        title: '오류',
        description: error?.message || 'PDF 생성 중 오류가 발생했습니다. 콘솔을 확인해주세요.',
        variant: 'destructive',
      });
    }
  };

  const handleHolidayDrilldownDownload = () => {
    if (!holidayDrilldown) return;
    const filtered = getHolidayDrilldownData().map(e => ({
      '일자': e.date, '적요': e.description, '거래처': e.vendor, '차변': e.debit
    }));
    const title = `${holidayDrilldown.account}_${holidayDrilldown.type}`;
    exportToExcel(filtered, title, title, [12, 40, 20, 12]);
  };

  const handleHolidaySummaryDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const data = holidayStats.map(stat => ({
      '계정명': stat.name, '토요일': stat.sat, '일요일': stat.sun, '공휴일': stat.holiday, '합계': stat.total
    }));
    exportToExcel(data, "공휴일_집계", "Sheet1", [20, 10, 10, 10, 10]);
  };

  const handleCounterResultDownload = () => {
    if (!counterResult) return;
    const summaryData = counterResult.breakdown.map((d, idx) => ({
       '순위': idx + 1,
       '상대계정': d.name,
       '거래 건수': d.count,
       '금액': d.amount,
       '비율': d.percentage
    }));
    exportToExcel(summaryData, `${counterResult.accountName}_상대계정요약`, "상대계정목록", [8, 20, 12, 10]);
  };

  const handleCounterDrilldownDownload = () => {
    if (!counterResult || !counterDrilldownAccount) return;
    const oppositeSide = counterResult.type === '차변' ? '대변' : '차변';
    const filteredData = counterDrilldownData.map(entry => {
      // 상대계정의 실제 금액 계산
      // 대변 검색 → 상대계정은 차변 → debit 사용
      // 차변 검색 → 상대계정은 대변 → credit 사용
      const debitAmount = oppositeSide === '차변' ? entry.debit : 0;
      const creditAmount = oppositeSide === '대변' ? entry.credit : 0;
      
      return {
        '일자': entry.date,
        '전표번호': entry.entryNumber,
        '계정과목': counterResult.accountName,
        '상대계정': counterDrilldownAccount,
        '차변': debitAmount,
        '대변': creditAmount,
        '적요': entry.description,
        '거래처': entry.vendor
      };
    });
    const title = `${counterResult.accountName}_상대계정(${counterDrilldownAccount})_내역`;
    exportToExcel(filteredData, title, "상세내역", [12, 15, 20, 20, 12, 12, 40, 20]);
  };

  // 전표번호 drill-down 엑셀 다운로드
  const handleVoucherDrilldownDownload = () => {
    if (!selectedVoucherNumber) return;
    
    const voucherEntries = getJournalEntriesByVoucherNumber(selectedVoucherNumber);
    const data = voucherEntries.map(entry => ({
      '일자': entry.date,
      '전표번호': entry.entryNumber,
      '계정과목': entry.accountName,
      '차변': entry.debit,
      '대변': entry.credit,
      '적요': entry.description,
      '거래처': entry.vendor
    }));
    
    const title = `전표번호_${selectedVoucherNumber}_분개장`;
    exportToExcel(data, title, "분개장", [12, 15, 20, 12, 12, 40, 20]);
  };
  
  const handleAppropriatenessDownload = () => {
    if (!appropriatenessData) return;
    const data = appropriatenessData.flaggedItems.map(item => ({
      '일자': item.date,
      '계정과목': item.accountName,
      '적요': item.description,
      '금액': item.amount,
      'AI 지적사항': item.reason,
      '추천 계정': item.recommendedAccount || ''
    }));
    exportToExcel(data, "적요적합성분석_결과", "부적합의심내역", [12, 15, 30, 12, 40, 15]);
  };

  const getHolidayDrilldownData = () => {
    if (!holidayDrilldown) return [];
    
    const filtered = analysisEntries.filter(e => {
      // 계정명 매칭
      if (e.accountName !== holidayDrilldown.account) return false;
      
      // 날짜 형식 정규화 (holidayStats와 동일한 로직 사용)
      let dateStr = '';
      if (typeof e.date === 'string') {
        dateStr = e.date.split('T')[0].split(' ')[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const dateOnly = dateStr.replace(/\D/g, '');
          if (dateOnly.length >= 8) {
            dateStr = `${dateOnly.substring(0, 4)}-${dateOnly.substring(4, 6)}-${dateOnly.substring(6, 8)}`;
          }
        }
      } else if (e.date instanceof Date) {
        dateStr = e.date.toISOString().split('T')[0];
      } else {
        dateStr = String(e.date).split('T')[0].split(' ')[0];
      }
      
      // 월말 공휴일 제외 옵션 확인
      if (excludeEndOfMonth && isLastDayOfMonth(dateStr)) {
        return false;
      }
      
      // 요일 타입 확인
      const dayType = checkDayType(dateStr);
      
      // total인 경우: 평일이 아닌 모든 항목 (토요일, 일요일, 공휴일)
      if (holidayDrilldown.type === 'total') {
        return dayType !== 'weekday';
      }
      
      // 특정 요일 타입과 매칭
      return dayType === holidayDrilldown.type;
    });
    
    console.log('getHolidayDrilldownData 결과:', {
      drilldown: holidayDrilldown,
      전체항목수: analysisEntries.length,
      해당계정항목수: analysisEntries.filter(e => e.accountName === holidayDrilldown.account).length,
      필터링된건수: filtered.length,
      excludeEndOfMonth: excludeEndOfMonth,
      샘플: filtered.slice(0, 5).map(e => {
        let dateStr = '';
        if (typeof e.date === 'string') {
          dateStr = e.date.split('T')[0].split(' ')[0];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const dateOnly = dateStr.replace(/\D/g, '');
            if (dateOnly.length >= 8) {
              dateStr = `${dateOnly.substring(0, 4)}-${dateOnly.substring(4, 6)}-${dateOnly.substring(6, 8)}`;
            }
          }
        } else if (e.date instanceof Date) {
          dateStr = e.date.toISOString().split('T')[0];
        } else {
          dateStr = String(e.date).split('T')[0].split(' ')[0];
        }
        const dayType = checkDayType(dateStr);
        return {
          계정: e.accountName,
          날짜: e.date,
          날짜변환: dateStr,
          요일: dayType,
          월말여부: isLastDayOfMonth(dateStr)
        };
      })
    });
    
    return filtered;
  };

  const CardTrigger = ({ 
    title, 
    icon: Icon, 
    color, 
    status, 
    onClick,
    desc
  }: { 
    title: string; 
    icon: any; 
    color: string; 
    status: AnalysisStatus; 
    onClick: () => void;
    desc: string;
  }) => {
    return (
      <Card 
        onClick={onClick}
        className="cursor-pointer hover:shadow-lg transition-all h-48"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Icon className={`w-6 h-6 ${color}`} />
            {status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {status === 'loading' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="text-lg mb-2">{title}</CardTitle>
          <CardDescription className="text-sm">{desc}</CardDescription>
          <div className="mt-4 flex items-center gap-1 text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            상세보기 <Maximize2 className="w-4 h-4" />
          </div>
        </CardContent>
      </Card>
    );
  };

  // NOTE: 원본 코드가 매우 길어서 일부만 통합했습니다.
  // 전체 컴포넌트를 통합하려면 원본 코드를 기반으로 shadcn-ui 컴포넌트로 변환해야 합니다.
  // 여기서는 기본 구조와 주요 함수들만 포함했습니다.

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h3 className="text-xl font-bold">전표분석 (Entry Analysis)</h3>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full border text-sm font-medium">
          <Coins className="w-4 h-4 text-amber-500" />
          <span>누적 AI 사용료: <span className="font-bold">₩{totalCost.toFixed(2)}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
        <CardTrigger 
          title="일반사항 분석" 
          icon={Building2} 
          color="text-blue-500"
          status={generalStatus}
          onClick={() => openModal('general')}
          desc="전체적인 재무 건전성, 리스크 스코어 및 주요 계정과목 통계 요약"
        />
        <CardTrigger 
          title="공휴일전표" 
          icon={CalendarX} 
          color="text-red-500"
          status={holidayStatus}
          onClick={() => openModal('holiday')}
          desc="주말 및 공휴일에 발생한 전표 집계 및 특이 거래 내역 탐지"
        />
        <CardTrigger 
          title="상대계정 분석" 
          icon={ArrowRightLeft} 
          color="text-emerald-500"
          status={counterStatus === 'success' ? 'success' : 'idle'}
          onClick={() => openModal('counter')}
          desc="계정별/차대변별 상대계정을 분석하여 거래 패턴 및 이상 징후 식별"
        />
        <CardTrigger 
          title="적요 적합성 분석" 
          icon={FileWarning} 
          color="text-amber-500"
          status={appropriatenessStatus === 'success' ? 'success' : 'idle'}
          onClick={() => openModal('appropriateness')}
          desc="AI가 적요와 계정과목 간의 논리적 불일치를 분석하여 오류 탐지"
        />
        <CardTrigger 
          title="시각화 분석" 
          icon={BarChart3} 
          color="text-purple-500"
          status="idle"
          onClick={() => openModal('visualization')}
          desc="계정간 자금 흐름 및 거래 빈도를 시각적으로 분석"
        />
        <CardTrigger 
          title="월별 트렌드 분석" 
          icon={TrendingUp} 
          color="text-indigo-500"
          status="success"
          onClick={() => openModal('trend')}
          desc="월별 거래 금액 및 건수 추이를 분석하여 트렌드를 파악"
        />
        <CardTrigger 
          title="현금 흐름 분석" 
          icon={DollarSign} 
          color="text-green-500"
          status="success"
          onClick={() => openModal('cashflow')}
          desc="현금 계정의 유입/유출 패턴을 분석하여 자금 흐름을 파악"
        />
      </div>

      {/* Full Screen Modal */}
      <Dialog open={activeCard !== null} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent 
          className="max-w-[80vw] max-h-[98vh] w-full h-full p-0 flex flex-col overflow-hidden" 
          style={{ maxWidth: '80vw', width: '100%' }}
        >
          <DialogHeader className="px-3 py-2 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeCard === 'general' && <Building2 className="w-6 h-6 text-blue-500" />}
                {activeCard === 'holiday' && <CalendarX className="w-6 h-6 text-red-500" />}
                {activeCard === 'counter' && <ArrowRightLeft className="w-6 h-6 text-emerald-500" />}
                {activeCard === 'appropriateness' && <FileWarning className="w-6 h-6 text-amber-500" />}
                {activeCard === 'visualization' && <BarChart3 className="w-6 h-6 text-purple-500" />}
                {activeCard === 'trend' && <TrendingUp className="w-6 h-6 text-blue-500" />}
                {activeCard === 'cashflow' && <DollarSign className="w-6 h-6 text-green-500" />}
                <DialogTitle>
                  {activeCard === 'general' && '일반사항 상세 분석'}
                  {activeCard === 'holiday' && '공휴일전표 분석'}
                  {activeCard === 'counter' && '상대계정 상세 분석'}
                  {activeCard === 'appropriateness' && '적요-계정과목 적합성 분석'}
                  {activeCard === 'visualization' && '시각화 분석'}
                  {activeCard === 'trend' && '월별 트렌드 분석'}
                  {activeCard === 'cashflow' && '현금 흐름 분석'}
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const spacingResult = checkSpacing();
                    const reductionResult = calculateReduction();
                    const dialogWidthResult = checkDialogWidth();
                    console.log('=== Spacing 확인 결과 ===');
                    console.log(spacingResult);
                    
                    let toastMessage = `Spacing: ${reductionResult.totalRatio}%`;
                    if (dialogWidthResult) {
                      toastMessage += `, Dialog 폭: ${dialogWidthResult.reduction}% 감소`;
                    } else {
                      toastMessage += ` (Dialog 폭: ${(47/49*100).toFixed(1)}%)`;
                    }
                    
                    toast({
                      title: '확인 완료',
                      description: toastMessage,
                    });
                  }}
                  className="bg-yellow-50 hover:bg-yellow-100 border-yellow-300 flex items-center gap-1"
                  title="콘솔에서 Spacing 확인"
                >
                  <Bug className="h-4 w-4" />
                  Spacing 확인
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    closeModal();
                    if (onBackToHome) {
                      onBackToHome();
                    }
                  }}
                  className="flex items-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  초기화면으로
                </Button>
                <Button variant="ghost" size="icon" onClick={closeModal}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="h-[calc(98vh-80px)] px-3 py-2">
            {activeCard === 'general' && (
              <div className="space-y-2">
                <Card>
                  <CardHeader>
                    <CardTitle>AI 종합 의견</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {generalStatus === 'idle' && (
                      <div className="text-center py-2">
                        <p className="text-muted-foreground mb-4">AI 심층 분석을 실행하시겠습니까?</p>
                        <div className="flex gap-2 justify-center">
                          <Button onClick={() => runAnalysis('general')}>
                            <Sparkles className="mr-2 h-4 w-4" />
                            AI 심층 분석 실행
                          </Button>
                          <Button variant="outline" onClick={() => calculateEstimate('general')}>
                            <Calculator className="mr-2 h-4 w-4" />
                            예상 비용 확인
                          </Button>
                        </div>
                        {(estimatedCost !== null || analysisEntries.length > 0) && (
                          <div className="mt-4 space-y-1">
                            {estimatedCost !== null && (
                              <p className="text-sm text-muted-foreground">
                                예상 비용: 약 ₩{estimatedCost.toFixed(2)}
                              </p>
                            )}
                            {analysisEntries.length > 0 && (() => {
                              const estimatedTimeSeconds = calculateGeneralEstimatedTime();
                              const minutes = Math.floor(estimatedTimeSeconds / 60);
                              const seconds = estimatedTimeSeconds % 60;
                              const timeText = minutes > 0 
                                ? `${minutes}분 ${seconds}초`
                                : `${seconds}초`;
                              return (
                                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                                  ⏱️ 예상 소요 시간: 약 {timeText}
                                </p>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                    {generalStatus === 'loading' && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p className="ml-4 text-muted-foreground">AI가 데이터를 분석하고 있습니다...</p>
                      </div>
                    )}
                    {generalStatus === 'success' && generalData && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <Badge>
                            Risk Score: {generalData.riskScore}/100
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGeneralOpinionDownload}
                            className="flex items-center gap-1"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            엑셀 다운로드
                          </Button>
                        </div>
                        <p className="whitespace-pre-wrap">{generalData.content}</p>
                      </div>
                    )}
                    {generalStatus === 'error' && (
                      <div className="text-center py-4">
                        <p className="text-red-600 font-semibold mb-2">
                          {generalError || '분석 중 오류가 발생했습니다.'}
                        </p>
                        <p className="text-sm text-red-600 mb-2">
                          가능한 원인:
                        </p>
                        <ul className="text-sm text-red-600 mb-4 text-left list-disc list-inside space-y-1">
                          <li>API Key가 설정되지 않았거나 유효하지 않음</li>
                          <li>API 사용량 한도 초과 (429 오류)</li>
                          <li>모델을 찾을 수 없음 (404 오류)</li>
                          <li>네트워크 연결 문제</li>
                        </ul>
                        <div className="flex gap-2 justify-center">
                          <Button onClick={() => runAnalysis('general')} variant="outline">
                            다시 시도
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 총 차변/대변 합계 및 일치 여부 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Card 
                    className="cursor-pointer hover:shadow-lg transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('차변 합계 카드 클릭:', { totalDebit: generalStats.totalDebit });
                      setGeneralDrilldownType('debit');
                      setGeneralDrilldownShowMonthly(true);
                    }}
                  >
                    <CardContent className="pt-4">
                      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">총 차변 합계</p>
                      <p className="text-2xl font-bold text-slate-800 hover:text-blue-600 transition-colors">
                        ₩{generalStats.totalDebit.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">클릭하여 상세 내역 보기</p>
                    </CardContent>
                  </Card>
                  <Card 
                    className="cursor-pointer hover:shadow-lg transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('대변 합계 카드 클릭:', { totalCredit: generalStats.totalCredit });
                      setGeneralDrilldownType('credit');
                      setGeneralDrilldownShowMonthly(true);
                    }}
                  >
                    <CardContent className="pt-4">
                      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">총 대변 합계</p>
                      <p className="text-2xl font-bold text-slate-800 hover:text-blue-600 transition-colors">
                        ₩{generalStats.totalCredit.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">클릭하여 상세 내역 보기</p>
                    </CardContent>
                  </Card>
                  <Card className={generalStats.isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
                    <CardContent className="pt-6 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-1">
                        {generalStats.isBalanced ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span className={`font-bold ${generalStats.isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                          {generalStats.isBalanced ? '대차차이 없음' : '대차차이 발생'}
                        </span>
                      </div>
                      {!generalStats.isBalanced && (
                        <p className="text-red-600 text-sm mt-1">
                          차액: ₩{Math.abs(generalStats.diff).toLocaleString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>계정별 상세 내역 (Account Breakdown)</CardTitle>
                        <CardDescription>
                          * 항목을 클릭하면 해당 계정의 상세 전표 내역을 확인할 수 있습니다.
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const data = generalStats.accountStats.map(stat => ({
                            '계정과목': stat.name,
                            '전표 수': stat.count,
                            '기초잔액': stat.openingBalance || 0,
                            '차변 합계': stat.debit,
                            '대변 합계': stat.credit,
                            '당기변동': stat.balance,
                            '기말잔액': stat.endingBalance !== undefined ? stat.endingBalance : stat.balance
                          }));
                          exportToExcel(data, '계정별상세내역', '계정별상세내역', [20, 10, 15, 15, 15]);
                        }}
                        className="flex items-center gap-1"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        엑셀 다운로드
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>계정과목</TableHead>
                            <TableHead className="text-right">전표 수</TableHead>
                            <TableHead className="text-right">기초잔액</TableHead>
                            <TableHead className="text-right">차변 합계</TableHead>
                            <TableHead className="text-right">대변 합계</TableHead>
                            <TableHead className="text-right">당기변동</TableHead>
                            <TableHead className="text-right">기말잔액</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {generalStats.accountStats.map((stat, idx) => (
                            <TableRow 
                              key={idx}
                              className="hover:bg-muted transition-colors"
                            >
                                  <TableCell 
                                    className="font-medium cursor-pointer hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('=== 계정명 클릭 ===');
                                      console.log('계정명:', stat.name);
                                      setGeneralDrilldownAccount(stat.name);
                                      setAccountDrilldownType(null);
                                      // 계정명 클릭 시에도 월별 합계 표시 (기본값으로 true 설정)
                                      setGeneralDrilldownShowMonthly(true);
                                      console.log('✅ generalDrilldownShowMonthly를 true로 설정했습니다.');
                                    }}
                                  >
                                    {stat.name}
                                  </TableCell>
                              <TableCell className="text-right">{stat.count}</TableCell>
                              <TableCell className={`text-right ${
                                (stat.openingBalance || 0) >= 0 ? 'text-blue-600' : 'text-red-500'
                              }`}>
                                {(stat.openingBalance || 0).toLocaleString()}
                              </TableCell>
                              <TableCell 
                                className="text-right cursor-pointer hover:underline hover:text-blue-600 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('=== 차변 클릭 ===');
                                  console.log('계정명:', stat.name, '차변:', stat.debit);
                                      setGeneralDrilldownAccount(stat.name);
                                      setAccountDrilldownType('debit');
                                      setGeneralDrilldownShowMonthly(true);
                                      console.log('✅ generalDrilldownShowMonthly를 true로 설정했습니다.');
                                }}
                              >
                                {stat.debit.toLocaleString()}
                              </TableCell>
                              <TableCell 
                                className="text-right cursor-pointer hover:underline hover:text-blue-600 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('=== 대변 클릭 ===');
                                  console.log('계정명:', stat.name, '대변:', stat.credit);
                                  setGeneralDrilldownAccount(stat.name);
                                  setAccountDrilldownType('credit');
                                  setGeneralDrilldownShowMonthly(true);
                                  console.log('✅ generalDrilldownShowMonthly를 true로 설정했습니다.');
                                }}
                              >
                                {stat.credit.toLocaleString()}
                              </TableCell>
                              <TableCell className={`text-right ${
                                stat.balance >= 0 ? 'text-blue-600' : 'text-red-500'
                              }`}>
                                {stat.balance.toLocaleString()}
                              </TableCell>
                              <TableCell className={`text-right font-semibold ${
                                (stat.endingBalance || stat.balance) >= 0 ? 'text-blue-600' : 'text-red-500'
                              }`}>
                                {(stat.endingBalance !== undefined ? stat.endingBalance : stat.balance).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* 계정별 상세 내역 표시 (드릴다운) */}
                {generalDrilldownAccount && (
                  <div className="mt-6 space-y-2">
                    {/* 월별 합계 표시 - 상세내역 위에 별도 표시 */}
                    {(() => {
                      const monthlyData = getMonthlyTotalsForGeneralAccount();
                      const shouldShow = generalDrilldownShowMonthly;
                      console.log('=== 월별합계 표시 조건 확인 ===');
                      console.log('generalDrilldownShowMonthly:', generalDrilldownShowMonthly);
                      console.log('generalDrilldownAccount:', generalDrilldownAccount);
                      console.log('accountDrilldownType:', accountDrilldownType);
                      console.log('monthlyDataLength:', monthlyData.length);
                      console.log('shouldShow:', shouldShow);
                      if (!shouldShow) {
                        console.warn('⚠️ 월별합계가 표시되지 않습니다! generalDrilldownShowMonthly가 false입니다!');
                      } else {
                        console.log('✅ 월별합계가 표시됩니다!');
                      }
                      return shouldShow;
                    })() && (
                      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 mb-4">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                              월별 합계 금액
                            </CardTitle>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const monthlyData = getMonthlyTotalsForGeneralAccount();
                                const data = monthlyData.map(month => ({
                                  '월': month.label,
                                  '차변': month.debit,
                                  '대변': month.credit,
                                  '합계': month.total,
                                  '건수': month.count
                                }));
                                const suffix = accountDrilldownType ? `_${accountDrilldownType === 'debit' ? '차변' : '대변'}` : '';
                                const title = `${generalDrilldownAccount}${suffix}_월별합계`;
                                exportToExcel(data, title, "월별합계", [15, 15, 15, 15, 10]);
                              }}
                              className="flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" />
                              월별 합계 엑셀 다운로드
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>월</TableHead>
                                  <TableHead className="text-right">차변</TableHead>
                                  <TableHead className="text-right">대변</TableHead>
                                  <TableHead className="text-right">합계</TableHead>
                                  <TableHead className="text-center">건수</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(() => {
                                  const monthlyData = getMonthlyTotalsForGeneralAccount();
                                  console.log('월별 합계 데이터:', monthlyData);
                                  if (monthlyData.length > 0) {
                                    return monthlyData.map((month, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell className="font-medium">{month.label}</TableCell>
                                        <TableCell className="text-right">
                                          {month.debit > 0 ? `₩${month.debit.toLocaleString()}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {month.credit > 0 ? `₩${month.credit.toLocaleString()}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-blue-600">
                                          ₩{month.total.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center">{month.count}건</TableCell>
                                      </TableRow>
                                    ));
                                  } else {
                                    return (
                                      <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                                          월별 데이터가 없습니다.
                                        </TableCell>
                                      </TableRow>
                                    );
                                  }
                                })()}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    <Card 
                      ref={generalDrilldownRef}
                      data-drilldown="true"
                      style={{ border: '2px solid #3b82f6', backgroundColor: '#f0f9ff' }}
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                console.log('뒤로가기 버튼 클릭');
                                setGeneralDrilldownAccount(null);
                                setAccountDrilldownType(null);
                                setGeneralDrilldownShowMonthly(false);
                              }}
                              className="p-0 h-auto"
                            >
                              <ArrowLeft className="w-4 h-4 mr-1" />
                            </Button>
                            <CardTitle>
                              {generalDrilldownAccount} {accountDrilldownType ? `(${accountDrilldownType === 'debit' ? '차변' : '대변'})` : ''} 상세 내역
                            </CardTitle>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleGeneralDrilldownDownload}
                            className="flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            상세 내역 엑셀 다운로드
                          </Button>
                        </div>
                        <CardDescription>
                          {getAccountDrilldownData().length.toLocaleString()}건의 전표 내역
                          {accountDrilldownType && ` (${accountDrilldownType === 'debit' ? '차변' : '대변'}만)`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                      <div className="mb-4 flex gap-2">
                        <Button
                          variant={accountDrilldownType === null ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAccountDrilldownType(null)}
                        >
                          전체
                        </Button>
                        <Button
                          variant={accountDrilldownType === 'debit' ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAccountDrilldownType('debit')}
                        >
                          차변만
                        </Button>
                        <Button
                          variant={accountDrilldownType === 'credit' ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAccountDrilldownType('credit')}
                        >
                          대변만
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>일자</TableHead>
                              <TableHead>전표번호</TableHead>
                              <TableHead>적요</TableHead>
                              <TableHead>거래처</TableHead>
                              <TableHead className="text-right">차변</TableHead>
                              <TableHead className="text-right">대변</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getAccountDrilldownData().length > 0 ? (
                              getAccountDrilldownData().map((entry, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{String(entry.date)}</TableCell>
                                  <TableCell>{String(entry.entryNumber)}</TableCell>
                                  <TableCell>{entry.description}</TableCell>
                                  <TableCell>{entry.vendor}</TableCell>
                                  <TableCell className="text-right">{entry.debit.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{entry.credit.toLocaleString()}</TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground">
                                  상세 내역이 없습니다.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-4 text-sm text-muted-foreground">
                        총 {getAccountDrilldownData().length.toLocaleString()}건
                      </div>
                    </CardContent>
                  </Card>
                  </div>
                )}

                {/* 차변/대변 합계 상세 내역 표시 (드릴다운) */}
                {generalDrilldownType && (
                  <div className="mt-6 space-y-2">
                    {/* 월별 합계 표시 - 상세내역 위에 별도 표시 */}
                    {(() => {
                      const monthlyData = getMonthlyTotalsForDebitCredit();
                      const shouldShow = generalDrilldownShowMonthly;
                      console.log('🟢 [차변/대변 월별합계] 표시 조건 확인:', {
                        generalDrilldownShowMonthly,
                        generalDrilldownType,
                        monthlyDataLength: monthlyData.length,
                        shouldShow
                      });
                      if (!shouldShow) {
                        console.warn('⚠️ [차변/대변 월별합계] 표시되지 않음 - generalDrilldownShowMonthly가 false입니다!');
                      }
                      return shouldShow;
                    })() && (
                      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 mb-4">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                              월별 합계 금액
                            </CardTitle>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const monthlyData = getMonthlyTotalsForDebitCredit();
                                const data = monthlyData.map(month => ({
                                  '월': month.label,
                                  '차변': month.debit,
                                  '대변': month.credit,
                                  '합계': month.total,
                                  '건수': month.count
                                }));
                                const title = `${generalDrilldownType === 'debit' ? '차변' : '대변'}_월별합계`;
                                exportToExcel(data, title, "월별합계", [15, 15, 15, 15, 10]);
                              }}
                              className="flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" />
                              월별 합계 엑셀 다운로드
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>월</TableHead>
                                  <TableHead className="text-right">차변</TableHead>
                                  <TableHead className="text-right">대변</TableHead>
                                  <TableHead className="text-right">합계</TableHead>
                                  <TableHead className="text-center">건수</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(() => {
                                  const monthlyData = getMonthlyTotalsForDebitCredit();
                                  console.log('차변/대변 월별 합계 데이터:', monthlyData);
                                  if (monthlyData.length > 0) {
                                    return monthlyData.map((month, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell className="font-medium">{month.label}</TableCell>
                                        <TableCell className="text-right">
                                          {month.debit > 0 ? `₩${month.debit.toLocaleString()}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {month.credit > 0 ? `₩${month.credit.toLocaleString()}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-blue-600">
                                          ₩{month.total.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-center">{month.count}건</TableCell>
                                      </TableRow>
                                    ));
                                  } else {
                                    return (
                                      <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                                          월별 데이터가 없습니다.
                                        </TableCell>
                                      </TableRow>
                                    );
                                  }
                                })()}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    <Card 
                      ref={generalTypeDrilldownRef}
                      data-drilldown="true"
                      style={{ border: '2px solid #10b981', backgroundColor: '#f0fdf4' }}
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setGeneralDrilldownType(null);
                                setGeneralDrilldownShowMonthly(false);
                              }}
                              className="p-0 h-auto"
                            >
                              <ArrowLeft className="w-4 h-4 mr-1" />
                            </Button>
                            <CardTitle>
                              {generalDrilldownType === 'debit' ? '차변' : '대변'} 상세 내역
                            </CardTitle>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleDebitCreditDrilldownDownload}
                            className="flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            상세 내역 엑셀 다운로드
                          </Button>
                        </div>
                        <CardDescription>
                          {getDebitCreditDrilldownData().length.toLocaleString()}건의 {generalDrilldownType === 'debit' ? '차변' : '대변'} 항목
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>일자</TableHead>
                              <TableHead>전표번호</TableHead>
                              <TableHead>계정과목</TableHead>
                              <TableHead>적요</TableHead>
                              <TableHead>거래처</TableHead>
                              <TableHead className="text-right">{generalDrilldownType === 'debit' ? '차변' : '대변'}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getDebitCreditDrilldownData().length > 0 ? (
                              getDebitCreditDrilldownData().map((entry, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{String(entry.date)}</TableCell>
                                  <TableCell>{String(entry.entryNumber)}</TableCell>
                                  <TableCell className="font-medium">{entry.accountName}</TableCell>
                                  <TableCell>{entry.description}</TableCell>
                                  <TableCell>{entry.vendor}</TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {generalDrilldownType === 'debit' 
                                      ? entry.debit.toLocaleString() 
                                      : entry.credit.toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground">
                                  상세 내역이 없습니다.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-4 text-sm text-muted-foreground">
                        총 {getDebitCreditDrilldownData().length.toLocaleString()}건
                      </div>
                    </CardContent>
                  </Card>
                  </div>
                )}
              </div>
            )}

            {activeCard === 'holiday' && (
              <div className="space-y-2">
                <Card>
                  <CardHeader>
                    <CardTitle>AI 이상 징후 분석</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {holidayStatus === 'idle' && (
                      <div className="text-center py-2">
                        <Button onClick={() => runAnalysis('holiday')}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          AI 분석 실행
                        </Button>
                      </div>
                    )}
                    {holidayStatus === 'loading' && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                        <p className="ml-4 text-muted-foreground">AI가 데이터를 분석하고 있습니다...</p>
                      </div>
                    )}
                    {holidayStatus === 'success' && holidayData && (
                      <div className="space-y-2">
                        {holidayData.items.length > 0 ? (
                          holidayData.items.map((item, idx) => (
                            <div key={idx} className="p-3 bg-red-50 rounded border border-red-100">
                              {item}
                            </div>
                          ))
                        ) : (
                          <p className="text-muted-foreground">특이사항이 발견되지 않았습니다.</p>
                        )}
                      </div>
                    )}
                    {holidayStatus === 'error' && (
                      <div className="text-center py-4">
                        <p className="text-red-600 font-semibold mb-2">
                          {holidayError || '분석 중 오류가 발생했습니다.'}
                        </p>
                        <p className="text-sm text-red-600 mb-2">
                          가능한 원인:
                        </p>
                        <ul className="text-sm text-red-600 mb-4 text-left list-disc list-inside space-y-1">
                          <li>API Key가 설정되지 않았거나 유효하지 않음</li>
                          <li>API 사용량 한도 초과 (429 오류)</li>
                          <li>모델을 찾을 수 없음 (404 오류)</li>
                          <li>네트워크 연결 문제</li>
                        </ul>
                        <div className="flex gap-2 justify-center">
                          <Button onClick={() => runAnalysis('holiday')} variant="outline">
                            다시 시도
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>계정별 휴일 사용 집계</CardTitle>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="exclude-end-of-month"
                          checked={excludeEndOfMonth}
                          onCheckedChange={(checked) => setExcludeEndOfMonth(checked === true)}
                        />
                        <Label
                          htmlFor="exclude-end-of-month"
                          className="text-sm font-normal cursor-pointer"
                        >
                          월말 공휴일 제외
                        </Label>
                      </div>
                    </div>
                    <CardDescription>
                      주말 및 공휴일에 발생한 전표를 계정별로 집계합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {holidayStats.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-muted-foreground">
                            총 {holidayStats.length}개 계정, 상위 {Math.min(20, holidayStats.length)}개 표시
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleHolidaySummaryDownload}
                            className="flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            집계 엑셀 다운로드
                          </Button>
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>계정명</TableHead>
                                <TableHead className="text-center">토요일</TableHead>
                                <TableHead className="text-center">일요일</TableHead>
                                <TableHead className="text-center">공휴일</TableHead>
                                <TableHead className="text-center">합계</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {holidayStats.slice(0, 20).map((stat, idx) => (
                                <TableRow 
                                  key={idx}
                                  className="hover:bg-muted transition-colors"
                                >
                                  <TableCell 
                                    className="font-medium cursor-pointer hover:underline"
                                    onClick={() => setHolidayDrilldown({ account: stat.name, type: 'total' })}
                                  >
                                    {stat.name}
                                  </TableCell>
                                  <TableCell 
                                    className="text-center cursor-pointer hover:underline hover:text-blue-600 hover:font-bold transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHolidayDrilldown({ account: stat.name, type: 'sat' });
                                    }}
                                    title="클릭하여 토요일 상세 내역 보기"
                                  >
                                    {stat.sat}
                                  </TableCell>
                                  <TableCell 
                                    className="text-center cursor-pointer hover:underline hover:text-blue-600 hover:font-bold transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHolidayDrilldown({ account: stat.name, type: 'sun' });
                                    }}
                                    title="클릭하여 일요일 상세 내역 보기"
                                  >
                                    {stat.sun}
                                  </TableCell>
                                  <TableCell 
                                    className="text-center cursor-pointer hover:underline hover:text-blue-600 hover:font-bold transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHolidayDrilldown({ account: stat.name, type: 'holiday' });
                                    }}
                                    title="클릭하여 공휴일 상세 내역 보기"
                                  >
                                    {stat.holiday}
                                  </TableCell>
                                  <TableCell 
                                    className="text-center font-bold cursor-pointer hover:underline hover:text-blue-600 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('합계 셀 클릭:', { account: stat.name, type: 'total', total: stat.total });
                                      setHolidayDrilldown({ account: stat.name, type: 'total' });
                                    }}
                                    title="클릭하여 전체 상세 내역 보기"
                                  >
                                    {stat.total}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        주말 및 공휴일에 발생한 전표가 없습니다.
                      </div>
                    )}
                    
                    {/* 상세 내역 표시 (드릴다운) */}
                    {holidayDrilldown ? (
                      <div 
                        ref={holidayDrilldownRef}
                        data-drilldown="true"
                        className="mt-2 space-y-2 border-t-4 border-red-500 pt-2 bg-red-50 p-2 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                console.log('공휴일 뒤로가기 버튼 클릭');
                                setHolidayDrilldown(null);
                              }}
                              className="p-0 h-auto"
                            >
                              <ArrowLeft className="w-4 h-4 mr-1" />
                            </Button>
                            <h4 className="font-bold text-slate-800 text-lg">
                              상세 내역: {holidayDrilldown.account} ({holidayDrilldown.type === 'sat' ? '토요일' : holidayDrilldown.type === 'sun' ? '일요일' : holidayDrilldown.type === 'holiday' ? '공휴일' : '전체'})
                            </h4>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleHolidayDrilldownDownload}
                            className="flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            상세 내역 엑셀 다운로드
                          </Button>
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>일자</TableHead>
                                <TableHead>적요</TableHead>
                                <TableHead>거래처</TableHead>
                                <TableHead className="text-right">차변</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getHolidayDrilldownData().length > 0 ? (
                                getHolidayDrilldownData().map((entry, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell>{String(entry.date)}</TableCell>
                                    <TableCell>{entry.description}</TableCell>
                                    <TableCell>{entry.vendor}</TableCell>
                                    <TableCell className="text-right">{entry.debit.toLocaleString()}</TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                                    상세 내역이 없습니다.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          총 {getHolidayDrilldownData().length}건
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeCard === 'counter' && (
              <div className="space-y-2">
                <Card>
                  <CardHeader>
                    <CardTitle>상대계정 분석</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label>분석할 계정과목</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={counterSearchTerm}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCounterSearchTerm(val);
                              if (val.trim()) {
                                const filtered = uniqueAccountNames.filter(n =>
                                  n.toLowerCase().includes(val.toLowerCase())
                                );
                                setCounterSuggestions(filtered.slice(0, 10));
                                setShowSuggestions(true);
                              } else {
                                setCounterSuggestions([]);
                                setShowSuggestions(false);
                              }
                            }}
                            placeholder="예: 보통예금, 접대비..."
                            className="pl-10"
                          />
                          {showSuggestions && counterSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50">
                              {counterSuggestions.map((name, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => selectSuggestion(name)}
                                  className="px-3 py-1.5 hover:bg-accent cursor-pointer"
                                >
                                  {name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label>거래 방향</Label>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant={counterSearchSide === '차변' ? 'default' : 'outline'}
                            onClick={() => setCounterSearchSide('차변')}
                          >
                            차변
                          </Button>
                          <Button
                            variant={counterSearchSide === '대변' ? 'default' : 'outline'}
                            onClick={() => setCounterSearchSide('대변')}
                          >
                            대변
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button onClick={runSpecificCounterAnalysis} disabled={!counterSearchTerm}>
                          <Filter className="mr-2 h-4 w-4" />
                          분석 실행
                        </Button>
                      </div>
                    </div>

                    {counterStatus === 'success' && counterResult && (
                      <div className="space-y-2 mt-2">
                        {/* 요약 카드 3개 */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <Card>
                            <CardContent className="pt-4">
                              <p className="text-sm text-muted-foreground mb-1">총 분석 계정</p>
                              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                {counterResult.accountName}
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  counterResult.type === '차변' 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {counterResult.type}
                                </span>
                              </h3>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <p className="text-sm text-muted-foreground mb-1">총 거래 건수</p>
                              <h3 className="text-2xl font-bold text-slate-800">
                                {counterResult.totalTransactions.toLocaleString()}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-1">조건에 맞는 거래 수</p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <p className="text-sm text-muted-foreground mb-1">식별된 상대계정 수</p>
                              <h3 className="text-2xl font-bold text-slate-800">
                                {counterResult.uniqueCounterAccounts}
                              </h3>
                              <p className="text-xs text-muted-foreground mt-1">종류 (Unique Accounts)</p>
                            </CardContent>
                          </Card>
                        </div>

                        {/* 상대계정 목록 테이블 */}
                        {counterResult.breakdown.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-slate-800 text-lg">상대계정 목록 (Counter Accounts)</h4>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={handleCounterResultDownload}
                                className="flex items-center gap-1"
                              >
                                <Download className="w-3.5 h-3.5" />
                                요약 엑셀 다운로드
                              </Button>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                              <div 
                                className="overflow-x-auto"
                                onClick={(e) => {
                                  // 스크롤바 클릭 시 이벤트 전파 방지
                                  const target = e.target as HTMLElement;
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const scrollbarWidth = 17;
                                  // 오른쪽 끝 스크롤바 영역 클릭 감지
                                  if (e.clientX >= rect.right - scrollbarWidth) {
                                    e.stopPropagation();
                                    e.preventDefault();
                                  }
                                }}
                                onMouseDown={(e) => {
                                  // 스크롤바 드래그 시작 시 이벤트 전파 방지
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const scrollbarWidth = 17;
                                  if (e.clientX >= rect.right - scrollbarWidth) {
                                    e.stopPropagation();
                                  }
                                }}
                              >
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-16 text-center">순위</TableHead>
                                      <TableHead className="min-w-[200px]">상대계정</TableHead>
                                      <TableHead className="text-center min-w-[120px] whitespace-nowrap cursor-pointer hover:text-blue-600 group">
                                        거래 건수
                                      </TableHead>
                                      <TableHead className="text-right min-w-[150px] whitespace-nowrap">금액</TableHead>
                                      <TableHead className="text-right">
                                        <div className="flex flex-col items-end">
                                          <span>비율</span>
                                          <span className="text-xs text-muted-foreground font-normal">(건수 기준)</span>
                                        </div>
                                      </TableHead>
                                      <TableHead className="w-full"></TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {counterResult.breakdown.map((detail, idx) => {
                                      const percentageValue = parseFloat(detail.percentage);
                                      return (
                                        <TableRow 
                                          key={idx} 
                                          className="hover:bg-slate-50 transition-colors group"
                                        >
                                          <TableCell className="text-center text-slate-500">
                                            {idx + 1}
                                          </TableCell>
                                          <TableCell 
                                            className="font-medium text-slate-700 whitespace-nowrap cursor-pointer hover:underline"
                                            onClick={() => {
                                              console.log('=== 상대계정명 클릭 ===');
                                              console.log('상대계정명:', detail.name);
                                              setCounterDrilldownAccount(detail.name);
                                              // 계정명 클릭 시에도 월별 합계 표시
                                              setCounterDrilldownAmountClicked(true);
                                              setSelectedVoucherNumber(null);
                                              console.log('✅ counterDrilldownAmountClicked를 true로 설정했습니다.');
                                            }}
                                          >
                                            {detail.name}
                                          </TableCell>
                                          <TableCell 
                                            onClick={() => {
                                              console.log('=== 상대계정 건수 클릭 ===');
                                              console.log('상대계정명:', detail.name, '건수:', detail.count);
                                              setCounterDrilldownAccount(detail.name);
                                              // 건수 클릭 시에도 월별 합계 표시
                                              setCounterDrilldownAmountClicked(true);
                                              setSelectedVoucherNumber(null);
                                              console.log('✅ counterDrilldownAmountClicked를 true로 설정했습니다.');
                                            }}
                                            className="text-center font-bold text-blue-600 cursor-pointer hover:underline hover:text-blue-800 decoration-blue-400 underline-offset-2 whitespace-nowrap"
                                          >
                                            {detail.count}
                                          </TableCell>
                                          <TableCell 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              console.log('=== 상대계정 금액 클릭 ===');
                                              console.log('상대계정명:', detail.name, '금액:', detail.amount);
                                              setCounterDrilldownAccount(detail.name);
                                              setCounterDrilldownAmountClicked(true);
                                              console.log('✅ counterDrilldownAmountClicked를 true로 설정했습니다.');
                                            }}
                                            className="text-right font-semibold text-green-600 cursor-pointer hover:underline hover:text-green-800 whitespace-nowrap"
                                          >
                                            ₩{detail.amount.toLocaleString()}
                                          </TableCell>
                                          <TableCell className="text-right text-slate-500">
                                            {detail.percentage}
                                          </TableCell>
                                          <TableCell>
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                              <div 
                                                className="h-full bg-emerald-500 rounded-full transition-all"
                                                style={{ width: detail.percentage }}
                                              />
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                            
                            {/* 상세 내역 표시 (드릴다운) */}
                            {counterDrilldownAccount && (
                              <div className="mt-3 space-y-2">
                                {/* 월별 합계 표시 (금액 클릭 시) - 상세내역 위에 별도 표시 */}
                                {counterDrilldownAmountClicked && (
                                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 mb-4">
                                    <CardHeader className="pb-3">
                                      <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                          월별 합계 금액
                                        </CardTitle>
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => {
                                            const data = monthlyTotalsForCounterAccount.map(month => ({
                                              '월': month.label,
                                              '차변': month.debit,
                                              '대변': month.credit,
                                              '합계': month.total,
                                              '건수': month.count
                                            }));
                                            const title = `${counterResult?.accountName}_상대계정(${counterDrilldownAccount})_월별합계`;
                                            exportToExcel(data, title, "월별합계", [15, 15, 15, 15, 10]);
                                          }}
                                          className="flex items-center gap-1"
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                          월별 합계 엑셀 다운로드
                                        </Button>
                                      </div>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="overflow-x-auto">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>월</TableHead>
                                              <TableHead className="text-right">차변</TableHead>
                                              <TableHead className="text-right">대변</TableHead>
                                              <TableHead className="text-right">합계</TableHead>
                                              <TableHead className="text-center">건수</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {monthlyTotalsForCounterAccount.length > 0 ? (
                                              monthlyTotalsForCounterAccount.map((month, idx) => (
                                                <TableRow key={idx}>
                                                  <TableCell className="font-medium">{month.label}</TableCell>
                                                  <TableCell className="text-right">
                                                    {month.debit > 0 ? `₩${month.debit.toLocaleString()}` : '-'}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    {month.credit > 0 ? `₩${month.credit.toLocaleString()}` : '-'}
                                                  </TableCell>
                                                  <TableCell className="text-right font-semibold text-blue-600">
                                                    ₩{month.total.toLocaleString()}
                                                  </TableCell>
                                                  <TableCell className="text-center">{month.count}건</TableCell>
                                                </TableRow>
                                              ))
                                            ) : (
                                              <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                                  월별 데이터가 없습니다.
                                                </TableCell>
                                              </TableRow>
                                            )}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                                
                                {/* 상세 내역 박스 */}
                                <Card 
                                  ref={counterDrilldownRef}
                                  data-drilldown="true"
                                  style={{ border: '2px solid #10b981', backgroundColor: '#f0fdf4' }}
                                >
                                  <CardHeader>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setCounterDrilldownAccount(null);
                                            setCounterDrilldownAmountClicked(false);
                                            setSelectedVoucherNumber(null);
                                          }}
                                          className="p-0 h-auto"
                                        >
                                          <ArrowLeft className="w-4 h-4 mr-1" />
                                        </Button>
                                        <h4 className="font-bold text-slate-800 text-lg">
                                          상세 내역: {counterDrilldownAccount}
                                        </h4>
                                      </div>
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={handleCounterDrilldownDownload}
                                        className="flex items-center gap-1"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                        상세 내역 엑셀 다운로드
                                      </Button>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="pt-4">
                                    <div 
                                      className="overflow-x-auto"
                                      onClick={(e) => {
                                        // 스크롤바 클릭 시 이벤트 전파 방지
                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        const scrollbarWidth = 17;
                                        // 오른쪽 끝 스크롤바 영역 클릭 감지
                                        if (e.clientX >= rect.right - scrollbarWidth) {
                                          e.stopPropagation();
                                          e.preventDefault();
                                        }
                                      }}
                                      onMouseDown={(e) => {
                                        // 스크롤바 드래그 시작 시 이벤트 전파 방지
                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                        const scrollbarWidth = 17;
                                        if (e.clientX >= rect.right - scrollbarWidth) {
                                          e.stopPropagation();
                                        }
                                      }}
                                    >
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>일자</TableHead>
                                            <TableHead>전표번호</TableHead>
                                            <TableHead>계정과목</TableHead>
                                            <TableHead>상대계정</TableHead>
                                            <TableHead className="text-right">차변</TableHead>
                                            <TableHead className="text-right">대변</TableHead>
                                            <TableHead>적요</TableHead>
                                            <TableHead>거래처</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {counterDrilldownData.length > 0 ? (
                                            counterDrilldownData.map((entry, idx) => {
                                              // entry는 상대계정 항목
                                              // 대변 검색 시: 상대계정은 차변이므로 entry.debit 표시
                                              // 차변 검색 시: 상대계정은 대변이므로 entry.credit 표시
                                              const oppositeSide = counterResult?.type === '차변' ? '대변' : '차변';
                                              
                                              // 상대계정의 실제 금액
                                              // 대변 검색 → 상대계정은 차변 → debit 사용
                                              // 차변 검색 → 상대계정은 대변 → credit 사용
                                              const debitAmount = oppositeSide === '차변' ? entry.debit : 0;
                                              const creditAmount = oppositeSide === '대변' ? entry.credit : 0;
                                              
                                              return (
                                                <TableRow key={idx}>
                                                  <TableCell>{String(entry.date)}</TableCell>
                                                  <TableCell 
                                                    className="font-medium text-blue-600 cursor-pointer hover:underline hover:text-blue-800"
                                                    onClick={() => setSelectedVoucherNumber(String(entry.entryNumber))}
                                                  >
                                                    {String(entry.entryNumber)}
                                                  </TableCell>
                                                  <TableCell>{counterResult?.accountName || ''}</TableCell>
                                                  <TableCell className="font-medium">{entry.accountName}</TableCell>
                                                  <TableCell className="text-right">
                                                    {debitAmount.toLocaleString()}
                                                  </TableCell>
                                                  <TableCell className="text-right">
                                                    {creditAmount.toLocaleString()}
                                                  </TableCell>
                                                  <TableCell>{entry.description}</TableCell>
                                                  <TableCell>{entry.vendor}</TableCell>
                                                </TableRow>
                                              );
                                            })
                                          ) : (
                                            <TableRow>
                                              <TableCell colSpan={8} className="text-center text-muted-foreground">
                                                상세 내역이 없습니다.
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                    <div className="mt-4 text-sm text-muted-foreground">
                                      총 {counterDrilldownData.length.toLocaleString()}건
                                    </div>
                                  </CardContent>
                                </Card>
                                
                                {/* 전표번호 drill-down (전표번호 클릭 시) */}
                                {selectedVoucherNumber && (
                                  <div className="mt-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setSelectedVoucherNumber(null)}
                                          className="p-0 h-auto"
                                        >
                                          <ArrowLeft className="w-4 h-4 mr-1" />
                                        </Button>
                                        <h4 className="font-bold text-slate-800 text-lg">
                                          전표번호: {selectedVoucherNumber} 분개장
                                        </h4>
                                      </div>
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={handleVoucherDrilldownDownload}
                                        className="flex items-center gap-1"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                        분개장 엑셀 다운로드
                                      </Button>
                                    </div>
                                    <Card>
                                      <CardContent className="pt-4">
                                        <div className="overflow-x-auto">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>일자</TableHead>
                                                <TableHead>전표번호</TableHead>
                                                <TableHead>계정과목</TableHead>
                                                <TableHead className="text-right">차변</TableHead>
                                                <TableHead className="text-right">대변</TableHead>
                                                <TableHead>적요</TableHead>
                                                <TableHead>거래처</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {getJournalEntriesByVoucherNumber(selectedVoucherNumber).length > 0 ? (
                                                getJournalEntriesByVoucherNumber(selectedVoucherNumber).map((entry, idx) => (
                                                  <TableRow key={idx}>
                                                    <TableCell>{String(entry.date)}</TableCell>
                                                    <TableCell>{String(entry.entryNumber)}</TableCell>
                                                    <TableCell className="font-medium">{entry.accountName}</TableCell>
                                                    <TableCell className="text-right">
                                                      {entry.debit > 0 ? entry.debit.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                      {entry.credit > 0 ? entry.credit.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell>{entry.description}</TableCell>
                                                    <TableCell>{entry.vendor}</TableCell>
                                                  </TableRow>
                                                ))
                                              ) : (
                                                <TableRow>
                                                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                                                    분개장 내역이 없습니다.
                                                  </TableCell>
                                                </TableRow>
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                        <div className="mt-4 text-sm text-muted-foreground">
                                          총 {getJournalEntriesByVoucherNumber(selectedVoucherNumber).length.toLocaleString()}건
                                        </div>
                                      </CardContent>
                                    </Card>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-slate-500">
                              상대계정을 찾을 수 없습니다. (단독 전표이거나 데이터 부족)
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {counterStatus === 'loading' && (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                        <p className="ml-4 text-muted-foreground">상대계정 분석 중...</p>
                      </div>
                    )}

                    {counterStatus === 'idle' && (
                      <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mx-auto mb-4">
                          <Search className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700 mb-2">분석할 계정과목을 검색하세요</h3>
                        <p className="text-slate-500 max-w-md mx-auto">
                          위 검색창에 계정명을 입력하고 '분석 실행' 버튼을 누르면<br/>
                          해당 계정과 연결된 상대계정 내역을 상세하게 분석합니다.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeCard === 'appropriateness' && (
              <div className="space-y-2">
                <Card>
                  <CardHeader>
                    <CardTitle>적요-계정과목 적합성 분석</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {appropriatenessStatus === 'idle' && (
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>분석 최소 금액</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                setIsSuggestingAmount(true);
                                try {
                                  const result = await suggestAppropriateMinAmount(analysisEntries);
                                  setSuggestedMinAmount(result.amount);
                                  
                                  // 통계적으로 제안 이유 계산
                                  const debitEntries = analysisEntries.filter(e => e.debit > 0 && e.description && e.description.length > 1);
                                  const filteredCount = debitEntries.filter(e => e.debit >= result.amount).length;
                                  const percentage = debitEntries.length > 0 ? (filteredCount / debitEntries.length * 100).toFixed(1) : 0;
                                  
                                  // AI가 제안한 이유와 통계 정보를 결합
                                  const reason = result.reason || 'AI가 제안한 금액입니다.';
                                  setSuggestedAmountReason(
                                    `${reason} 이 금액 기준을 사용하면 약 ${filteredCount.toLocaleString()}건(${percentage}%)의 항목이 분석 대상이 되어 분석 시간과 비용을 효율적으로 관리할 수 있습니다.`
                                  );
                                } catch (error) {
                                  console.error('적정 금액 제안 오류:', error);
                                  toast({
                                    title: '오류',
                                    description: '적정 금액 제안 중 오류가 발생했습니다.',
                                    variant: 'destructive',
                                  });
                                } finally {
                                  setIsSuggestingAmount(false);
                                }
                              }}
                              disabled={isSuggestingAmount || analysisEntries.length === 0}
                              className="flex items-center gap-1"
                            >
                              {isSuggestingAmount ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  AI 제안 중...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3" />
                                  AI 제안 받기
                                </>
                              )}
                            </Button>
                          </div>
                          <Input
                            type="number"
                            value={appropriatenessMinAmount}
                            onChange={(e) => setAppropriatenessMinAmount(Number(e.target.value))}
                            className="mt-2"
                          />
                          {suggestedMinAmount && (
                            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                                    AI 제안 금액: {suggestedMinAmount.toLocaleString()}원
                                  </p>
                                  {suggestedAmountReason && (
                                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                                      {suggestedAmountReason}
                                    </p>
                                  )}
                                  {/* AI 제안 금액 기준 예상 시간 표시 */}
                                  {analysisEntries.length > 0 && (() => {
                                    const filteredEntries = analysisEntries.filter(e => 
                                      e.debit >= suggestedMinAmount && e.description && e.description.length > 1
                                    );
                                    
                                    if (filteredEntries.length > 0) {
                                      const accountGroups = new Map<string, JournalEntry[]>();
                                      filteredEntries.forEach(e => {
                                        if (!accountGroups.has(e.accountName)) {
                                          accountGroups.set(e.accountName, []);
                                        }
                                        accountGroups.get(e.accountName)!.push(e);
                                      });
                                      
                                      const accountCount = accountGroups.size;
                                      const totalEntries = filteredEntries.length;
                                      const baseTime = 10;
                                      const accountTime = accountCount * 0.5;
                                      const dataTime = Math.ceil(totalEntries / 1000) * 2;
                                      const estimatedSeconds = Math.min(120, Math.max(15, Math.ceil(baseTime + accountTime + dataTime)));
                                      
                                      const minutes = Math.floor(estimatedSeconds / 60);
                                      const seconds = estimatedSeconds % 60;
                                      const timeText = minutes > 0 
                                        ? `${minutes}분 ${seconds}초`
                                        : `${seconds}초`;
                                      
                                      return (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                                          ⏱️ 이 금액 기준 예상 소요 시간: 약 {timeText}
                                        </p>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setAppropriatenessMinAmount(suggestedMinAmount);
                                    toast({
                                      title: '적용 완료',
                                      description: `최소 금액이 ${suggestedMinAmount.toLocaleString()}원으로 설정되었습니다.`,
                                    });
                                  }}
                                  className="shrink-0"
                                >
                                  적용
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        <Button 
                          onClick={() => runAnalysis('appropriateness')}
                          disabled={analysisEntries.length === 0}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          적합성 분석 실행하기
                        </Button>
                        {analysisEntries.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">
                              현재 설정 기준으로 분석될 예상 항목 수: {
                                analysisEntries.filter(e => e.debit >= appropriatenessMinAmount && e.description && e.description.length > 1).length.toLocaleString()
                              }건
                            </div>
                            {(() => {
                              const estimatedTimeSeconds = calculateEstimatedTime();
                              const minutes = Math.floor(estimatedTimeSeconds / 60);
                              const seconds = estimatedTimeSeconds % 60;
                              const timeText = minutes > 0 
                                ? `${minutes}분 ${seconds}초`
                                : `${seconds}초`;
                              return (
                                <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                  ⏱️ 예상 소요 시간: 약 {timeText}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                    {appropriatenessStatus === 'loading' && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                      </div>
                    )}
                    {appropriatenessStatus === 'success' && appropriatenessData && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge className="text-lg px-3 py-1.5">
                            적합성 점수: {appropriatenessData.score}/100
                          </Badge>
                          {appropriatenessData.flaggedItems.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleAppropriatenessDownload}
                              className="flex items-center gap-1"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              엑셀 다운로드
                            </Button>
                          )}
                        </div>
                        {appropriatenessData.flaggedItems.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground mb-2">
                              부적합 의심 항목: {appropriatenessData.flaggedItems.length}건
                            </div>
                            {appropriatenessData.flaggedItems.map((item, idx) => (
                              <Card key={idx} className="border-amber-200">
                                <CardContent className="pt-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div>
                                      <p className="text-sm text-muted-foreground">일자</p>
                                      <p className="font-medium">{item.date}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">계정과목</p>
                                      <p className="font-medium">{item.accountName}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">적요</p>
                                      <p className="font-medium">{item.description}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">금액</p>
                                      <p className="font-medium">{item.amount.toLocaleString()}</p>
                                    </div>
                                  </div>
                                  <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200">
                                    <p className="text-sm font-medium text-amber-900 mb-1">AI 지적사항:</p>
                                    <p className="text-sm text-amber-800">{item.reason}</p>
                                    {item.recommendedAccount && (
                                      <p className="text-sm mt-2 text-amber-900">
                                        <span className="font-medium">추천 계정:</span> {item.recommendedAccount}
                                      </p>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12 bg-green-50 rounded-xl border border-green-200">
                            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-green-700 mb-2">부적합 항목 없음</h3>
                            <p className="text-green-600 max-w-md mx-auto">
                              분석한 거래 중 부적합 의심 항목이 발견되지 않았습니다.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {appropriatenessStatus === 'error' && (
                      <div className="text-center py-12 bg-red-50 rounded-xl border border-red-200">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-red-700 mb-2">분석 실패</h3>
                        <div className="max-w-md mx-auto mb-4">
                          <p className="text-red-700 font-medium mb-2">
                            {appropriatenessError || '분석 중 오류가 발생했습니다.'}
                          </p>
                          <p className="text-sm text-red-600 mb-2">
                            가능한 원인:
                          </p>
                          <ul className="text-sm text-red-500 text-left list-disc list-inside space-y-1">
                            <li>API 키가 설정되지 않았거나 잘못되었습니다 ⚠️ 가장 가능성 높음</li>
                            <li>분석할 데이터가 충분하지 않습니다 (현재 최소 금액: {appropriatenessMinAmount.toLocaleString()}원)</li>
                            <li>네트워크 오류 또는 API 서버 문제</li>
                            <li>API 사용량 한도 초과 (429 오류)</li>
                          </ul>
                          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-left">
                            <p className="text-sm font-medium text-yellow-800 mb-2">💡 API 키 설정 방법:</p>
                            <ol className="text-xs text-yellow-700 list-decimal list-inside space-y-1">
                              <li>Google AI Studio 접속: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">https://aistudio.google.com/app/apikey</a></li>
                              <li>API Key 생성 또는 기존 Key 복사</li>
                              <li>애플리케이션 상단의 설정 버튼에서 API Key 입력</li>
                              <li>입력 후 다시 분석 실행</li>
                            </ol>
                          </div>
                          <p className="text-xs text-red-400 mt-4">
                            브라우저 개발자 도구(F12)의 콘솔 탭에서 더 자세한 에러 정보를 확인할 수 있습니다.
                          </p>
                        </div>
                        <div className="flex gap-2 justify-center">
                          <Button 
                            variant="outline"
                            onClick={() => {
                              setAppropriatenessStatus('idle');
                              setAppropriatenessData(null);
                              setAppropriatenessError(null);
                            }}
                          >
                            다시 시도
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => {
                              setAppropriatenessMinAmount(0);
                              setAppropriatenessStatus('idle');
                              setAppropriatenessData(null);
                              setAppropriatenessError(null);
                            }}
                          >
                            최소 금액 초기화 후 재시도
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeCard === 'visualization' && (
              <div className="space-y-2">
                <VisualizationAnalysis entries={analysisEntries} />
              </div>
            )}

            {activeCard === 'trend' && (
              <div className="space-y-2">
                <Card>
                  <CardHeader>
                    <CardTitle>월별 거래 트렌드</CardTitle>
                    <CardDescription>
                      선택한 계정의 월별 차변/대변 거래 금액 및 건수 추이를 분석합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {/* 계정명 입력 */}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label>분석할 계정과목</Label>
                        <Popover open={trendAccountOpen} onOpenChange={setTrendAccountOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={trendAccountOpen}
                              className="w-full justify-between mt-2"
                            >
                              {trendSelectedAccount || "전체 계정"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0">
                            <Command>
                              <CommandInput placeholder="계정 검색..." />
                              <CommandList>
                                <CommandEmpty>계정을 찾을 수 없습니다.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value=""
                                    onSelect={() => {
                                      setTrendSelectedAccount('');
                                      setTrendAccountOpen(false);
                                    }}
                                  >
                                    <CheckCircle2
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        trendSelectedAccount === '' ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    전체 계정
                                  </CommandItem>
                                  {uniqueAccountNames.map((account) => (
                                    <CommandItem
                                      key={account}
                                      value={account}
                                      onSelect={() => {
                                        setTrendSelectedAccount(account);
                                        setTrendAccountOpen(false);
                                      }}
                                    >
                                      <CheckCircle2
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          trendSelectedAccount === account ? "opacity-100" : "opacity-0"
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
                      </div>
                      {trendSelectedAccount && (
                        <Button
                          variant="outline"
                          onClick={() => setTrendSelectedAccount('')}
                        >
                          초기화
                        </Button>
                      )}
                    </div>
                    {monthlyTrendData.length > 0 ? (
                      <div className="space-y-2">
                        {/* 통계 요약 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">총 분석 월수</div>
                              <div className="text-2xl font-bold">{monthlyTrendData.length}개월</div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">총 차변 합계</div>
                              <div className="text-2xl font-bold text-blue-600">
                                {monthlyTrendData.reduce((sum, m) => sum + m.debit, 0).toLocaleString()}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">총 대변 합계</div>
                              <div className="text-2xl font-bold text-green-600">
                                {monthlyTrendData.reduce((sum, m) => sum + m.credit, 0).toLocaleString()}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">순이익 (대변-차변)</div>
                              <div className={`text-2xl font-bold ${
                                monthlyTrendData.reduce((sum, m) => sum + m.net, 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {monthlyTrendData.reduce((sum, m) => sum + m.net, 0).toLocaleString()}
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* 월별 차변/대변 추이 차트 */}
                        <Card ref={trendAmountChartRef}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle>
                                월별 거래 금액 추이
                                {trendSelectedAccount && <span className="text-base font-normal text-muted-foreground ml-2">({trendSelectedAccount})</span>}
                              </CardTitle>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => exportChartToPDF(
                                  trendAmountChartRef,
                                  '월별거래금액추이',
                                  '월별 거래 금액 추이'
                                )}
                                className="flex items-center gap-1"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                PDF 다운로드
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div>
                              <ResponsiveContainer width="100%" height={400}>
                                <LineChart data={monthlyTrendData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="month" />
                                  <YAxis />
                                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                                  <Legend />
                                  <Line type="monotone" dataKey="debit" stroke="#3b82f6" name="차변" strokeWidth={2} />
                                  <Line type="monotone" dataKey="credit" stroke="#10b981" name="대변" strokeWidth={2} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        {/* 월별 거래 건수 차트 */}
                        <Card ref={trendCountChartRef}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle>
                                월별 거래 건수
                                {trendSelectedAccount && <span className="text-base font-normal text-muted-foreground ml-2">({trendSelectedAccount})</span>}
                              </CardTitle>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => exportChartToPDF(
                                  trendCountChartRef,
                                  '월별거래건수',
                                  '월별 거래 건수'
                                )}
                                className="flex items-center gap-1"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                PDF 다운로드
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div>
                              <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={monthlyTrendData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="month" />
                                  <YAxis />
                                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                                  <Legend />
                                  <Bar dataKey="debitCount" fill="#3b82f6" name="차변 건수" />
                                  <Bar dataKey="creditCount" fill="#10b981" name="대변 건수" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>

                        {/* 월별 상세 통계 테이블 */}
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle>
                                월별 상세 통계
                                {trendSelectedAccount && <span className="text-base font-normal text-muted-foreground ml-2">({trendSelectedAccount})</span>}
                              </CardTitle>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const data = monthlyTrendData.map(m => ({
                                    '월': m.month,
                                    '차변 합계': m.debit,
                                    '대변 합계': m.credit,
                                    '순이익': m.net,
                                    '거래 건수': m.count,
                                    '평균 차변': m.avgDebit,
                                    '평균 대변': m.avgCredit
                                  }));
                                  exportToExcel(data, '월별트렌드분석', '월별통계', [12, 15, 15, 15, 12, 15, 15]);
                                }}
                              >
                                <Download className="w-4 h-4 mr-2" />
                                엑셀 다운로드
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>월</TableHead>
                                    <TableHead className="text-right">차변 합계</TableHead>
                                    <TableHead className="text-right">대변 합계</TableHead>
                                    <TableHead className="text-right">순이익</TableHead>
                                    <TableHead className="text-right">차변 건수</TableHead>
                                    <TableHead className="text-right">대변 건수</TableHead>
                                    <TableHead className="text-right">총 거래 건수</TableHead>
                                    <TableHead className="text-right">평균 차변</TableHead>
                                    <TableHead className="text-right">평균 대변</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {monthlyTrendData.map((month, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">{month.month}</TableCell>
                                      <TableCell className="text-right">{month.debit.toLocaleString()}</TableCell>
                                      <TableCell className="text-right">{month.credit.toLocaleString()}</TableCell>
                                      <TableCell className={`text-right font-medium ${
                                        month.net >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {month.net.toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right text-blue-600 font-medium">{month.debitCount.toLocaleString()}</TableCell>
                                      <TableCell className="text-right text-green-600 font-medium">{month.creditCount.toLocaleString()}</TableCell>
                                      <TableCell className="text-right">{month.count.toLocaleString()}</TableCell>
                                      <TableCell className="text-right">{Math.round(month.avgDebit).toLocaleString()}</TableCell>
                                      <TableCell className="text-right">{Math.round(month.avgCredit).toLocaleString()}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        분석할 데이터가 없습니다.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeCard === 'cashflow' && (
              <div className="space-y-2">
                <Card>
                  <CardHeader>
                    <CardTitle>현금 흐름 분석</CardTitle>
                    <CardDescription>
                      현금 계정(보통예금, 당좌예금 등)의 유입/유출을 분석합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {cashFlowData.monthly.length > 0 ? (
                      <div className="space-y-2">
                        {/* 통계 요약 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">총 현금 유입</div>
                              <div className="text-2xl font-bold text-green-600">
                                {cashFlowData.totalInflow.toLocaleString()}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">총 현금 유출</div>
                              <div className="text-2xl font-bold text-red-600">
                                {cashFlowData.totalOutflow.toLocaleString()}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">순 현금 흐름</div>
                              <div className={`text-2xl font-bold ${
                                cashFlowData.totalNet >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {cashFlowData.totalNet.toLocaleString()}
                              </div>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardContent className="pt-4">
                              <div className="text-sm text-muted-foreground">분석 월수</div>
                              <div className="text-2xl font-bold">
                                {cashFlowData.monthly.length}개월
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* 월별 현금 흐름 차트 */}
                        <Card>
                          <CardHeader>
                            <CardTitle>월별 현금 흐름 추이</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={400}>
                              <BarChart data={cashFlowData.monthly}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                                <Legend />
                                <Bar dataKey="inflow" fill="#10b981" name="유입" />
                                <Bar dataKey="outflow" fill="#ef4444" name="유출" />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        {/* 순 현금 흐름 차트 */}
                        <Card>
                          <CardHeader>
                            <CardTitle>월별 순 현금 흐름</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={300}>
                              <LineChart data={cashFlowData.monthly}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis />
                                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                                <Legend />
                                <Line type="monotone" dataKey="net" stroke="#f59e0b" name="순 현금 흐름" strokeWidth={2} />
                              </LineChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        {/* 주요 현금 유입/유출 계정 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Card>
                            <CardHeader>
                              <CardTitle>주요 현금 유입 계정 (TOP 10)</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>계정명</TableHead>
                                      <TableHead className="text-right">유입 금액</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {cashFlowData.topInflowAccounts.map((account, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell>{account.name}</TableCell>
                                        <TableCell className="text-right font-medium text-green-600">
                                          {account.amount.toLocaleString()}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle>주요 현금 유출 계정 (TOP 10)</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>계정명</TableHead>
                                      <TableHead className="text-right">유출 금액</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {cashFlowData.topOutflowAccounts.map((account, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell>{account.name}</TableCell>
                                        <TableCell className="text-right font-medium text-red-600">
                                          {account.amount.toLocaleString()}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* 월별 상세 통계 */}
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle>월별 현금 흐름 상세</CardTitle>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const data = cashFlowData.monthly.map(m => ({
                                    '월': m.month,
                                    '유입': m.inflow,
                                    '유출': m.outflow,
                                    '순 흐름': m.net,
                                    '거래 건수': m.count
                                  }));
                                  exportToExcel(data, '현금흐름분석', '월별현금흐름', [12, 15, 15, 15, 12]);
                                }}
                              >
                                <Download className="w-4 h-4 mr-2" />
                                엑셀 다운로드
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>월</TableHead>
                                    <TableHead className="text-right">유입</TableHead>
                                    <TableHead className="text-right">유출</TableHead>
                                    <TableHead className="text-right">순 흐름</TableHead>
                                    <TableHead className="text-right">거래 건수</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {cashFlowData.monthly.map((month, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">{month.month}</TableCell>
                                      <TableCell className="text-right text-green-600">{month.inflow.toLocaleString()}</TableCell>
                                      <TableCell className="text-right text-red-600">{month.outflow.toLocaleString()}</TableCell>
                                      <TableCell className={`text-right font-medium ${
                                        month.net >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {month.net.toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right">{month.count.toLocaleString()}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        현금 계정 거래 데이터가 없습니다.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIInsights;
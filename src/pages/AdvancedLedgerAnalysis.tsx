import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BenfordAnalysis } from '@/components/BenfordAnalysis';
import { DualOffsetAnalysis } from './DualOffsetAnalysis';
import { DuplicateVendorAnalysis } from './DuplicateVendorAnalysis';
import { MonthlyTrendAnalysis } from './MonthlyTrendAnalysis';
import { ProfitLossAnalysis } from './ProfitLossAnalysis';
import { SamplingAnalysis } from './SamplingAnalysis';
import { PreviousPeriodComparison } from './PreviousPeriodComparison';
import { TransactionSearch } from './TransactionSearch';
import { FinancialStatementAnalysis } from './FinancialStatementAnalysis';
import { smartSample, calculateSampleSize, generateDataSummary } from '@/lib/smartSampling';
import { findDebitCreditHeaders } from '@/lib/headerUtils';
import { analyzeWithFlash, saveApiKey, getApiKey, deleteApiKey, hasApiKey, estimateTokens, estimateCost } from '@/lib/geminiClient';
import { addUsageRecord, getUsageSummary, clearUsageHistory, exportUsageToCSV, type UsageSummary } from '@/lib/usageTracker';
import {
  FileSpreadsheet,
  Upload,
  Search,
  TrendingUp,
  AlertTriangle,
  Scale,
  FileText,
  FlaskConical,
  Shield,
  BarChart3,
  Download,
  CheckCircle2,
  Loader2,
  Sparkles,
  Settings,
  Key,
  Trash2,
  Info,
  ArrowLeft,
  TrendingUp as TrendingUpIcon,
  DollarSign,
  Calendar,
  Activity
} from 'lucide-react';

// Types
type LedgerRow = { [key: string]: string | number | Date | undefined };
type View = 'selection' | 'account_analysis' | 'offset_analysis' | 'general_ledger' | 'duplicate_vendor' | 'profit_loss' | 'monthly_trend' | 'previous_period' | 'transaction_search' | 'sampling' | 'fss_risk' | 'benford' | 'financial_statement';
type SamplingMethod = 'random' | 'systematic' | 'mus';

// Helper functions
const normalizeAccountName = (name: string): string => {
  return (name || "").replace(/^\d+[_.-]?\s*/, '');
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

const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[], orderedHeaders: string[] } => {
  if (!worksheet) return { data: [], headers: [], orderedHeaders: [] };

  const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  if (sheetDataAsArrays.length < 2) return { data: [], headers: [], orderedHeaders: [] };

  let headerIndex = -1;
  const searchLimit = Math.min(20, sheetDataAsArrays.length);
  const dateKeywords = ['일자', '날짜', '거래일', 'date'];
  const otherHeaderKeywords = ['적요', '거래처', '차변', '대변', '금액', '코드', '내용', '비고'];

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

  if (headerIndex === -1) return { data: [], headers: [], orderedHeaders: [] };

  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet, { range: headerIndex });
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  const orderedHeaders = (sheetDataAsArrays[headerIndex] || []).map(h => String(h || '').trim());

  // 필터링: 합계행, 빈행, 헤더 중복 제거 (기존 데이터에 영향 없음)
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

  return { data, headers, orderedHeaders };
};

const cleanAmount = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').replace(/\s/g, '').trim();
    if (cleaned === '' || cleaned === '-' || cleaned === '0') return 0;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

/**
 * 재무제표 전용 헤더 인식 함수
 * "과목", "당기", "전기" 키워드로 헤더를 찾음
 */
const getFinancialStatementData = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[], orderedHeaders: string[] } => {
  if (!worksheet) return { data: [], headers: [], orderedHeaders: [] };

  const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  if (sheetDataAsArrays.length < 2) return { data: [], headers: [], orderedHeaders: [] };

  let headerIndex = -1;
  const searchLimit = Math.min(20, sheetDataAsArrays.length);
  const financialStatementKeywords = ['과목', '당기', '전기', '기간', '기준일'];

  // 1차 시도: 재무제표 키워드로 헤더 찾기
  for (let i = 0; i < searchLimit; i++) {
    const potentialHeaderRow = sheetDataAsArrays[i];
    if (!potentialHeaderRow || potentialHeaderRow.length < 3) continue;

    const headerContent = potentialHeaderRow.map(cell => String(cell || '').trim().toLowerCase()).join('|');
    const keywordCount = financialStatementKeywords.filter(kw => headerContent.includes(kw.toLowerCase())).length;
    
    // "과목", "당기", "전기" 중 최소 2개 이상 포함되어야 함
    if (keywordCount >= 2) {
      // "과목"과 ("당기" 또는 "전기")가 모두 있어야 함
      const hasSubject = headerContent.includes('과목');
      const hasCurrent = headerContent.includes('당기');
      const hasPrevious = headerContent.includes('전기');
      
      if (hasSubject && (hasCurrent || hasPrevious)) {
        headerIndex = i;
        break;
      }
    }
  }

  // 2차 시도: 비어있지 않은 셀이 가장 많은 행 선택
  if (headerIndex === -1) {
    let maxNonEmptyCells = 0;
    let potentialHeaderIndex = -1;
    for (let i = 0; i < searchLimit; i++) {
      const row = sheetDataAsArrays[i];
      if (!row) continue;
      const nonEmptyCells = row.filter(cell => cell !== null && String(cell).trim() !== '');
      if (nonEmptyCells.length >= maxNonEmptyCells && nonEmptyCells.length >= 3) {
        maxNonEmptyCells = nonEmptyCells.length;
        potentialHeaderIndex = i;
      }
    }
    headerIndex = potentialHeaderIndex;
  }

  if (headerIndex === -1) return { data: [], headers: [], orderedHeaders: [] };

  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet, { range: headerIndex });
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  const orderedHeaders = (sheetDataAsArrays[headerIndex] || []).map(h => String(h || '').trim());

  // 필터링: 빈 행 제거
  const data = rawData.filter(row => {
    const hasData = Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      return str !== '' && str !== '0' && str !== '-';
    });
    return hasData;
  });

  return { data, headers, orderedHeaders };
};

const AdvancedLedgerAnalysis = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousFileInputRef = useRef<HTMLInputElement>(null);
  const financialStatementFileInputRef = useRef<HTMLInputElement>(null);

  // File states
  const [fileName, setFileName] = useState<string>('');
  const [previousFileName, setPreviousFileName] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [previousWorkbook, setPreviousWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [accountNames, setAccountNames] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  
  // Financial Statement states
  const [financialStatementWorkbook, setFinancialStatementWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [financialStatementFileName, setFinancialStatementFileName] = useState<string>('');
  const [isDraggingFinancialStatement, setIsDraggingFinancialStatement] = useState<boolean>(false);
  
  // UI states
  const [currentView, setCurrentView] = useState<View>('selection');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isDraggingPrevious, setIsDraggingPrevious] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPreviousDialog, setShowPreviousDialog] = useState<boolean>(false);
  const [showPreviousUpload, setShowPreviousUpload] = useState<boolean>(false);

  // Analysis states
  const [analysisQuestion, setAnalysisQuestion] = useState<string>('이 계정의 거래 내역을 요약하고, 특이사항이 있다면 알려주세요.');
  const [analysisResult, setAnalysisResult] = useState<string>('');
  
  // API Key states
  const [showApiKeyDialog, setShowApiKeyDialog] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [apiKeyExists, setApiKeyExists] = useState<boolean>(hasApiKey());
  
  // Cost estimation states
  const [estimatedCostInfo, setEstimatedCostInfo] = useState<{
    totalCount: number;
    sampleSize: number;
    samplingRatio: number;
    estimatedTokens: number;
    estimatedCost: number;
  } | null>(null);
  
  // Usage tracking states
  const [usageSummary, setUsageSummary] = useState<UsageSummary>(getUsageSummary());
  const [showUsageDialog, setShowUsageDialog] = useState<boolean>(false);
  
  // Refresh usage summary
  const refreshUsageSummary = () => {
    setUsageSummary(getUsageSummary());
  };

  const analysisOptions = [
    { id: 'account_analysis', title: '계정별원장 AI 분석', description: '특정 계정을 선택하여 AI에게 거래내역 요약, 특이사항 분석 등 자유로운 질문을 할 수 있습니다.', icon: FileText },
    { id: 'offset_analysis', title: '외상매출/매입 상계 거래처 분석', description: '외상매출금(차변)과 외상매입금/미지급금(대변)에 동시에 나타나는 거래처를 찾아 상계 가능 여부를 분석합니다.', icon: Scale },
    { id: 'duplicate_vendor', title: '매입/매출 이중거래처 분석', description: '동일한 거래처가 매입과 매출 양쪽에서 동시에 발생하는 경우를 식별하여 잠재적 위험을 분석합니다.', icon: AlertTriangle },
    { id: 'general_ledger', title: '총계정원장 조회', description: '특정 계정의 월별 차변/대변 합계 및 잔액을 요약하고, 상세 거래내역을 조회합니다.', icon: FileSpreadsheet },
    { id: 'profit_loss', title: '추정 손익 분석', description: '업로드된 계정별원장 전체를 바탕으로 매출과 비용 계정을 자동 분류하여 대략적인 손익을 계산합니다.', icon: TrendingUp },
    { id: 'monthly_trend', title: '매출/판관비 월별 추이 분석', description: '매출, 판관비, 제조원가 계정을 자동 분류하고 월별 추이를 시각화 및 AI 요약 리포트를 제공합니다.', icon: BarChart3 },
    { id: 'previous_period', title: '전기 데이터 비교 분석', description: '전기 계정별원장 데이터를 추가로 업로드하여, 계정별/월별 변동 현황을 비교 분석합니다.', icon: Scale },
    { id: 'transaction_search', title: '상세 거래 검색', description: '거래처, 계정과목, 금액, 적요 등 다양한 조건으로 원하는 거래를 빠르게 검색하고 조회합니다.', icon: Search },
    { id: 'sampling', title: '감사 샘플링', description: '통계적 기법(MUS) 또는 비통계적 기법(랜덤, 체계적)을 사용하여 감사 테스트를 위한 샘플을 추출합니다.', icon: FlaskConical },
    { id: 'fss_risk', title: '금감원 지적사례 기반 위험 분석', description: '외부의 금감원 지적사례 텍스트 파일을 기반으로, 현재 원장에서 유사한 위험이 있는지 AI가 분석합니다.', icon: Shield },
    { id: 'benford', title: '벤포드 법칙 분석', description: '계정의 금액 데이터 첫 자리 수 분포를 분석하여 잠재적인 이상 징후나 데이터 조작 가능성을 탐지합니다.', icon: BarChart3 },
    { id: 'financial_statement', title: '재무제표 증감 분석', description: '재무상태표를 업로드하여 계정별 증감을 분석하고 재무비율을 계산합니다.', icon: TrendingUpIcon },
  ];

  const handleFile = (file: File | null | undefined) => {
    if (!file) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const isExcel = file.type.includes('spreadsheetml') || file.type.includes('ms-excel') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx');
    if (!isExcel) {
      toast({
        title: '오류',
        description: '엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const loadedWorkbook = XLSX.read(data, { type: 'array', cellDates: true });
        setWorkbook(loadedWorkbook);

        const allSheetNames = loadedWorkbook.SheetNames;
        if (allSheetNames.length === 0) {
          toast({
            title: '오류',
            description: '엑셀 파일에 시트가 없습니다.',
            variant: 'destructive',
          });
          return;
        }

        setAccountNames(allSheetNames);
        setSelectedAccount(allSheetNames[0]);
        
        toast({
          title: '성공',
          description: `${allSheetNames.length}개 시트를 불러왔습니다.`,
        });
        
        // 당기 업로드 완료 후 전기 업로드 여부 물어보기
        console.log('당기 파일 업로드 완료! Dialog를 표시합니다.');
        setTimeout(() => {
          setShowPreviousDialog(true);
          console.log('showPreviousDialog가 true로 설정되었습니다.');
        }, 100);
      } catch (err) {
        toast({
          title: '오류',
          description: '엑셀 파일 파싱 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePreviousFile = (file: File | null | undefined) => {
    if (!file) {
      setPreviousFileName('');
      setPreviousWorkbook(null);
      if (previousFileInputRef.current) previousFileInputRef.current.value = "";
      return;
    }

    const isExcel = file.type.includes('spreadsheetml') || file.type.includes('ms-excel') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx');
    if (!isExcel) {
      toast({
        title: '오류',
        description: '전기 데이터는 엑셀 파일만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setPreviousFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const loadedWorkbook = XLSX.read(data, { type: 'array', cellDates: true });
        setPreviousWorkbook(loadedWorkbook);
        
        toast({
          title: '성공',
          description: '전기 원장 파일을 불러왔습니다.',
        });
        
        // 전기 업로드 완료 후 바로 분석 메뉴로
        setCurrentView('selection');
        setShowPreviousUpload(false);
      } catch (err) {
        toast({
          title: '오류',
          description: '전기 엑셀 파일 파싱 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
        setPreviousWorkbook(null);
        setPreviousFileName('');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFinancialStatementFile = (file: File | null | undefined) => {
    if (!file) {
      if (financialStatementFileInputRef.current) financialStatementFileInputRef.current.value = "";
      return;
    }

    const isExcel = file.type.includes('spreadsheetml') || file.type.includes('ms-excel') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx');
    if (!isExcel) {
      toast({
        title: '오류',
        description: '엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setFinancialStatementFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const loadedWorkbook = XLSX.read(data, { type: 'array', cellDates: true });

        const allSheetNames = loadedWorkbook.SheetNames;
        if (allSheetNames.length === 0) {
          toast({
            title: '오류',
            description: '엑셀 파일에 시트가 없습니다.',
            variant: 'destructive',
          });
          return;
        }

        // 첫 번째 시트에서 재무제표 데이터 확인
        const firstSheet = loadedWorkbook.Sheets[allSheetNames[0]];
        const { data: financialData, headers, orderedHeaders } = getFinancialStatementData(firstSheet);
        
        // 디버깅 정보
        console.log('재무제표 업로드:', {
          sheetName: allSheetNames[0],
          dataLength: financialData.length,
          headers: headers,
          orderedHeaders: orderedHeaders,
        });
        
        // 검증 완화: 파일이 업로드되면 일단 통과 (분석 화면에서 데이터 확인)
        // 최소한 시트가 있고 데이터가 있으면 통과
        if (financialData.length === 0 && orderedHeaders.length === 0) {
          console.warn('재무제표 데이터를 읽을 수 없습니다. 빈 파일일 수 있습니다.');
          // 경고만 표시하고 진행 (분석 화면에서 처리)
        }

        setFinancialStatementWorkbook(loadedWorkbook);
        
        toast({
          title: '성공',
          description: `재무제표 파일을 불러왔습니다.${financialData.length > 0 ? ` (${financialData.length}개 항목)` : ''}`,
        });
        
        // 분석 화면으로 자동 전환
        setCurrentView('financial_statement');
      } catch (err) {
        toast({
          title: '오류',
          description: '엑셀 파일 파싱 중 오류가 발생했습니다.',
          variant: 'destructive',
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    e.preventDefault();
    e.stopPropagation();
    setter(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    e.preventDefault();
    e.stopPropagation();
    setter(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, setter: React.Dispatch<React.SetStateAction<boolean>>, handler: (file: File) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setter(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handler(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const renderUploadScreen = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Period Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              당기 계정별원장 업로드
            </CardTitle>
            <CardDescription>
              분석할 현재 기간의 계정별원장 파일을 업로드하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={(e) => handleDragEnter(e, setIsDragging)}
              onDragLeave={(e) => handleDragLeave(e, setIsDragging)}
              onDrop={(e) => handleDrop(e, setIsDragging, handleFile)}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFile(e.target.files?.[0])}
                style={{ display: 'none' }}
                accept=".xlsx, .xls"
              />
              <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
              <p className="text-sm text-muted-foreground">
                파일을 드래그하거나 클릭하여 업로드
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                엑셀 파일 (.xlsx, .xls)
              </p>
            </div>
            {fileName && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-900 dark:text-green-100">{fileName}</span>
                <Badge variant="outline" className="ml-auto bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                  업로드 완료
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Previous Period Upload - 조건부 표시 */}
        {showPreviousUpload && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                전기 계정별원장 업로드
              </CardTitle>
              <CardDescription>
                전기 데이터 비교 분석을 위한 파일을 업로드하세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDraggingPrevious ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
                onClick={() => previousFileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, setIsDraggingPrevious)}
                onDragLeave={(e) => handleDragLeave(e, setIsDraggingPrevious)}
                onDrop={(e) => handleDrop(e, setIsDraggingPrevious, handlePreviousFile)}
              >
                <input
                  type="file"
                  ref={previousFileInputRef}
                  onChange={(e) => handlePreviousFile(e.target.files?.[0])}
                  style={{ display: 'none' }}
                  accept=".xlsx, .xls"
                />
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  파일을 드래그하거나 클릭하여 업로드
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  엑셀 파일 (.xlsx, .xls)
                </p>
              </div>
              {previousFileName && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">{previousFileName}</span>
                  <Badge variant="outline" className="ml-auto bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                    업로드 완료
                  </Badge>
                </div>
              )}
              <div className="mt-4 text-center">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setShowPreviousUpload(false);
                    setCurrentView('selection');
                  }}
                >
                  전기 데이터 없이 계속하기
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const renderSelectionScreen = () => (
    <div className="space-y-6">
      {/* 업로드된 파일 정보 */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">업로드된 파일</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              setWorkbook(null);
              setFileName('');
              setPreviousWorkbook(null);
              setPreviousFileName('');
              setShowPreviousUpload(false);
              setShowPreviousDialog(false);
              setCurrentView('selection');
            }}>
              다른 파일 선택
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* 당기 파일 */}
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div className="flex-1">
                <div className="text-sm font-medium text-green-900 dark:text-green-100">당기: {fileName}</div>
                <div className="text-xs text-green-700 dark:text-green-300">{accountNames.length}개 계정과목</div>
              </div>
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                당기
              </Badge>
            </div>
            
            {/* 전기 파일 */}
            {previousFileName ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-100">전기: {previousFileName}</div>
                  <div className="text-xs text-blue-700 dark:text-blue-300">전기 비교 분석 가능</div>
                </div>
                <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                  전기
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-dashed">
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">전기 데이터 없음 (당기만 분석)</div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowPreviousUpload(true)}
                >
                  전기 추가하기
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 분석 메뉴 */}
      <Card>
        <CardHeader>
          <CardTitle>분석 메뉴 선택</CardTitle>
          <CardDescription>
            원하시는 분석을 선택하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysisOptions.map((option) => (
              <Card
                key={option.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setCurrentView(option.id as View)}
              >
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <option.icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{option.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const currentAccountData = useMemo(() => {
    if (!workbook || !selectedAccount) return [];
    const worksheet = workbook.Sheets[selectedAccount];
    const { data } = getDataFromSheet(worksheet);
    
    // 추가 필터링: 월계/누계 행 제거 (안전장치)
    const filteredData = data.filter(row => {
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
    
    return filteredData;
  }, [workbook, selectedAccount]);

  const amountColumns = useMemo(() => {
    if (currentAccountData.length === 0) return [];
    const headers = Object.keys(currentAccountData[0] || {});
    return headers.filter(h => 
      currentAccountData.some(row => 
        typeof row[h] === 'number' || 
        (typeof row[h] === 'string' && !isNaN(parseFloat(String(row[h]).replace(/,/g, ''))))
      )
    );
  }, [currentAccountData]);
  
  // Calculate cost estimation when account or question changes
  React.useEffect(() => {
    if (currentView === 'account_analysis' && currentAccountData.length > 0 && selectedAccount) {
      const totalCount = currentAccountData.length;
      const sampleSize = calculateSampleSize(totalCount);
      const samplingRatio = (sampleSize / totalCount) * 100;
      
      // Estimate prompt size (차변/대변 헤더 찾기)
      const headers = Object.keys(currentAccountData[0] || {});
      const dateHeader = headers.find(h => 
        h.includes('일자') || h.includes('날짜')
      );
      const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, currentAccountData, dateHeader);
      const dataSummary = generateDataSummary(
        currentAccountData, 
        selectedAccount, 
        amountColumns,
        debitHeader,
        creditHeader,
        dateHeader
      );
      const sampleDataSize = sampleSize * 200; // Rough estimate: 200 tokens per transaction
      const promptSize = dataSummary.length + sampleDataSize + analysisQuestion.length + 500;
      
      const estimatedTokens = estimateTokens(promptSize.toString());
      const estimatedCost = estimateCost(estimatedTokens, 2000, true);
      
      setEstimatedCostInfo({
        totalCount,
        sampleSize,
        samplingRatio,
        estimatedTokens,
        estimatedCost,
      });
    } else {
      setEstimatedCostInfo(null);
    }
  }, [currentView, currentAccountData, selectedAccount, analysisQuestion, amountColumns]);

  const renderAnalysisView = () => {
    const currentOption = analysisOptions.find(o => o.id === currentView);
    
    // Offset Analysis
    if (currentView === 'offset_analysis') {
      if (!workbook) return null;
      return (
        <DualOffsetAnalysis 
          workbook={workbook}
          accountNames={accountNames}
          onBack={() => setCurrentView('selection')}
        />
      );
    }

    // Duplicate Vendor Analysis
    if (currentView === 'duplicate_vendor') {
      if (!workbook) return null;
      return (
        <DuplicateVendorAnalysis 
          workbook={workbook}
          accountNames={accountNames}
          onBack={() => setCurrentView('selection')}
        />
      );
    }

    // Monthly Trend Analysis
    if (currentView === 'monthly_trend') {
      if (!workbook) return null;
      return (
        <MonthlyTrendAnalysis 
          workbook={workbook}
          accountNames={accountNames}
          onBack={() => setCurrentView('selection')}
        />
      );
    }

    // Profit & Loss Analysis
    if (currentView === 'profit_loss') {
      if (!workbook) return null;
      return (
        <ProfitLossAnalysis 
          workbook={workbook}
          accountNames={accountNames}
          onBack={() => setCurrentView('selection')}
        />
      );
    }

    // Sampling Analysis
    if (currentView === 'sampling') {
      if (!workbook) return null;
      return (
        <SamplingAnalysis 
          workbook={workbook}
          accountNames={accountNames}
          onBack={() => setCurrentView('selection')}
        />
      );
    }

    // Previous Period Comparison
    if (currentView === 'previous_period') {
      if (!workbook) return null;
      return (
        <PreviousPeriodComparison 
          currentWorkbook={workbook}
          previousWorkbook={previousWorkbook}
          currentAccounts={accountNames}
          onBack={() => setCurrentView('selection')}
        />
      );
    }

    // Transaction Search
    if (currentView === 'transaction_search') {
      if (!workbook) return null;
      return (
        <TransactionSearch 
          workbook={workbook}
          accountNames={accountNames}
          onBack={() => setCurrentView('selection')}
        />
      );
    }

    // Financial Statement Analysis
    if (currentView === 'financial_statement') {
      if (!financialStatementWorkbook) {
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUpIcon className="h-5 w-5" />
                    재무제표 증감 분석
                  </CardTitle>
                  <Button variant="outline" onClick={() => setCurrentView('selection')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    돌아가기
                  </Button>
                </div>
                <CardDescription>
                  재무상태표 파일을 업로드하여 계정별 증감을 분석합니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDraggingFinancialStatement ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => financialStatementFileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, setIsDraggingFinancialStatement)}
                  onDragLeave={(e) => handleDragLeave(e, setIsDraggingFinancialStatement)}
                  onDrop={(e) => handleDrop(e, setIsDraggingFinancialStatement, handleFinancialStatementFile)}
                >
                  <input
                    type="file"
                    ref={financialStatementFileInputRef}
                    onChange={(e) => handleFinancialStatementFile(e.target.files?.[0])}
                    style={{ display: 'none' }}
                    accept=".xlsx, .xls"
                  />
                  <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    재무제표 파일을 드래그하거나 클릭하여 업로드
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    엑셀 파일 (.xlsx, .xls) - "과목", "당기", "전기" 컬럼이 필요합니다.
                  </p>
                </div>
                {financialStatementFileName && (
                  <div className="mt-4 flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-900 dark:text-green-100">{financialStatementFileName}</span>
                    <Badge variant="outline" className="ml-auto bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                      업로드 완료
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      }
      return (
        <FinancialStatementAnalysis 
          workbook={financialStatementWorkbook}
          onBack={() => {
            setFinancialStatementWorkbook(null);
            setFinancialStatementFileName('');
            setCurrentView('selection');
          }}
          getFinancialStatementData={getFinancialStatementData}
          ledgerWorkbook={workbook}
          previousLedgerWorkbook={previousWorkbook}
          getDataFromSheet={getDataFromSheet}
        />
      );
    }

    // Benford Analysis (Fully Implemented)
    if (currentView === 'benford') {
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <CardTitle>{currentOption?.title}</CardTitle>
                </div>
                <Button variant="ghost" onClick={() => setCurrentView('selection')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  뒤로가기
                </Button>
              </div>
              <CardDescription>{currentOption?.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">분석할 계정과목</label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountNames.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <BenfordAnalysis 
            accountData={currentAccountData}
            accountName={selectedAccount}
            amountColumns={amountColumns}
          />
        </div>
      );
    }

    // General Ledger View
    if (currentView === 'general_ledger') {
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle>{currentOption?.title}</CardTitle>
                <Badge>완성</Badge>
              </div>
              <Button variant="ghost" onClick={() => setCurrentView('selection')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                뒤로가기
              </Button>
            </div>
            <CardDescription>{currentOption?.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">계정과목</label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedAccount && currentAccountData.length > 0 && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    const wb = XLSX.utils.book_new();
                    
                    // 월별 차변/대변 요약 데이터 준비 (화면과 동일한 로직 사용)
                    const headers = Object.keys(currentAccountData[0] || {});
                    const dateHeader = headers.find(h => {
                      const clean = h.replace(/\s/g, '').toLowerCase();
                      return clean.includes('일자') || clean.includes('날짜') || clean.includes('date');
                    });
                    const debitHeader = headers.find(h => {
                      const clean = h.replace(/\s/g, '').toLowerCase();
                      return clean.includes('차변') || clean.includes('debit') || clean === '차변' || clean === 'debit';
                    }) || headers.find(h => {
                      const clean = h.toLowerCase();
                      return clean.includes('차변') || clean.includes('debit');
                    });
                    const creditHeader = headers.find(h => {
                      const clean = h.replace(/\s/g, '').toLowerCase();
                      return clean.includes('대변') || clean.includes('credit') || clean === '대변' || clean === 'credit';
                    }) || headers.find(h => {
                      const clean = h.toLowerCase();
                      return clean.includes('대변') || clean.includes('credit');
                    });
                    
                    // 차변 헤더 자동 탐지 (화면과 동일)
                    let foundDebitHeader = debitHeader;
                    if (!foundDebitHeader && currentAccountData.length > 0) {
                      const numericColumns = new Map<string, number>();
                      currentAccountData.forEach(row => {
                        Object.entries(row).forEach(([key, value]) => {
                          if (key === creditHeader || key === dateHeader) return;
                          const cleanKey = key.replace(/\s/g, '').toLowerCase();
                          if (!cleanKey.includes('대변') && !cleanKey.includes('credit') && 
                              !cleanKey.includes('일자') && !cleanKey.includes('날짜') &&
                              !cleanKey.includes('잔액') && !cleanKey.includes('balance') &&
                              !cleanKey.includes('적요') && !cleanKey.includes('거래처') &&
                              !cleanKey.includes('코드') && !cleanKey.includes('내용')) {
                            const numVal = cleanAmount(value);
                            if (numVal !== 0) {
                              numericColumns.set(key, (numericColumns.get(key) || 0) + Math.abs(numVal));
                            }
                          }
                        });
                      });
                      if (numericColumns.size > 0) {
                        const sortedColumns = Array.from(numericColumns.entries())
                          .sort((a, b) => b[1] - a[1]);
                        foundDebitHeader = sortedColumns[0][0];
                      }
                    }
                    
                    // 대변 헤더 자동 탐지 (화면과 동일)
                    let foundCreditHeader = creditHeader;
                    if (!foundCreditHeader && currentAccountData.length > 0) {
                      const numericColumns = new Map<string, number>();
                      currentAccountData.forEach(row => {
                        Object.entries(row).forEach(([key, value]) => {
                          if (key === foundDebitHeader || key === dateHeader) return;
                          const cleanKey = key.replace(/\s/g, '').toLowerCase();
                          if (!cleanKey.includes('차변') && !cleanKey.includes('debit') && 
                              !cleanKey.includes('일자') && !cleanKey.includes('날짜') &&
                              !cleanKey.includes('잔액') && !cleanKey.includes('balance') &&
                              !cleanKey.includes('적요') && !cleanKey.includes('거래처') &&
                              !cleanKey.includes('코드') && !cleanKey.includes('내용')) {
                            const numVal = cleanAmount(value);
                            if (numVal !== 0) {
                              numericColumns.set(key, (numericColumns.get(key) || 0) + Math.abs(numVal));
                            }
                          }
                        });
                      });
                      if (numericColumns.size > 0) {
                        const sortedColumns = Array.from(numericColumns.entries())
                          .sort((a, b) => b[1] - a[1]);
                        foundCreditHeader = sortedColumns[0][0];
                      }
                    }
                    
                    // 잔액 컬럼이 차변/대변으로 잘못 인식되지 않았는지 확인
                    if (foundDebitHeader && foundDebitHeader.toLowerCase().includes('잔액')) {
                      const correctDebitHeader = headers.find(h => {
                        const clean = h.replace(/\s/g, '').toLowerCase();
                        return (clean.includes('차변') || clean.includes('debit')) && 
                               !clean.includes('잔액') && !clean.includes('balance');
                      });
                      if (correctDebitHeader) {
                        foundDebitHeader = correctDebitHeader;
                      }
                    }
                    
                    if (foundCreditHeader && foundCreditHeader.toLowerCase().includes('잔액')) {
                      const correctCreditHeader = headers.find(h => {
                        const clean = h.replace(/\s/g, '').toLowerCase();
                        return (clean.includes('대변') || clean.includes('credit')) && 
                               !clean.includes('잔액') && !clean.includes('balance');
                      });
                      if (correctCreditHeader) {
                        foundCreditHeader = correctCreditHeader;
                      }
                    }
                    
                    if (dateHeader && (foundDebitHeader || foundCreditHeader)) {
                      const monthlyDataMap = new Map<string, { debit: number; credit: number }>();
                      
                      currentAccountData.forEach(row => {
                        const date = row[dateHeader];
                        if (!(date instanceof Date)) return;
                        
                        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                        const debit = foundDebitHeader ? cleanAmount(row[foundDebitHeader]) : 0;
                        const credit = foundCreditHeader ? cleanAmount(row[foundCreditHeader]) : 0;
                        
                        if (!monthlyDataMap.has(monthKey)) {
                          monthlyDataMap.set(monthKey, { debit: 0, credit: 0 });
                        }
                        
                        const monthly = monthlyDataMap.get(monthKey)!;
                        monthly.debit += debit;
                        monthly.credit += credit;
                      });
                      
                      const sortedMonths = Array.from(monthlyDataMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                      let balance = 0;
                      
                      const monthlySummary = sortedMonths.map(([month, data]) => {
                        balance += data.debit - data.credit;
                        return {
                          월: month,
                          차변: data.debit,
                          대변: data.credit,
                          잔액: balance
                        };
                      });
                      
                      // 합계 행 추가
                      const totalDebit = sortedMonths.reduce((sum, [, data]) => sum + data.debit, 0);
                      const totalCredit = sortedMonths.reduce((sum, [, data]) => sum + data.credit, 0);
                      const finalBalance = sortedMonths.reduce((sum, [, data]) => sum + (data.debit - data.credit), 0);
                      monthlySummary.push({
                        월: '합계',
                        차변: totalDebit,
                        대변: totalCredit,
                        잔액: finalBalance
                      });
                      
                      const wsMonthly = XLSX.utils.json_to_sheet(monthlySummary);
                      XLSX.utils.book_append_sheet(wb, wsMonthly, '월별요약');
                    }
                    
                    // 상세 거래 내역도 포함 (계정명 추가)
                    const detailDataWithAccount = currentAccountData.map(row => ({
                      계정명: selectedAccount,
                      ...row
                    }));
                    const wsDetail = XLSX.utils.json_to_sheet(detailDataWithAccount);
                    XLSX.utils.book_append_sheet(wb, wsDetail, '상세내역');
                    
                    XLSX.writeFile(wb, `총계정원장_${selectedAccount}_${new Date().toISOString().split('T')[0]}.xlsx`);
                    toast({
                      title: '다운로드 완료',
                      description: '총계정원장을 다운로드했습니다.',
                    });
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  엑셀 다운로드
                </Button>
              )}
            </div>

            {selectedAccount && currentAccountData.length > 0 && (
              <div className="space-y-4">
                {/* 월별 요약 */}
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">월별 차변/대변 요약</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const headers = Object.keys(currentAccountData[0] || {});
                      
                      // 디버깅: 헤더 출력
                      console.log('📊 총계정원장 헤더:', headers);
                      
                      const dateHeader = headers.find(h => {
                        const clean = h.replace(/\s/g, '').toLowerCase();
                        return clean.includes('일자') || clean.includes('날짜') || clean.includes('date');
                      });
                      const debitHeader = headers.find(h => {
                        const clean = h.replace(/\s/g, '').toLowerCase();
                        return clean.includes('차변') || clean.includes('debit') || clean === '차변' || clean === 'debit';
                      }) || headers.find(h => {
                        // 더 유연한 검색: 공백이 있는 경우도 처리
                        const clean = h.toLowerCase();
                        return clean.includes('차변') || clean.includes('debit');
                      });
                      const creditHeader = headers.find(h => {
                        const clean = h.replace(/\s/g, '').toLowerCase();
                        return clean.includes('대변') || clean.includes('credit') || clean === '대변' || clean === 'credit';
                      }) || headers.find(h => {
                        // 더 유연한 검색: 공백이 있는 경우도 처리
                        const clean = h.toLowerCase();
                        return clean.includes('대변') || clean.includes('credit');
                      });
                      
                      // 차변 헤더를 찾지 못한 경우, 실제 데이터에서 차변 값이 있는 컬럼 찾기
                      let foundDebitHeader = debitHeader;
                      if (!foundDebitHeader && currentAccountData.length > 0) {
                        // 모든 행을 확인하여 대변이 아닌 숫자 컬럼 찾기
                        const numericColumns = new Map<string, number>();
                        
                        currentAccountData.forEach(row => {
                          Object.entries(row).forEach(([key, value]) => {
                            if (key === creditHeader || key === dateHeader) return;
                            const cleanKey = key.replace(/\s/g, '').toLowerCase();
                            // 대변, 일자, 날짜, 잔액, balance가 아닌 컬럼만 확인
                            if (!cleanKey.includes('대변') && !cleanKey.includes('credit') && 
                                !cleanKey.includes('일자') && !cleanKey.includes('날짜') &&
                                !cleanKey.includes('잔액') && !cleanKey.includes('balance') &&
                                !cleanKey.includes('적요') && !cleanKey.includes('거래처') &&
                                !cleanKey.includes('코드') && !cleanKey.includes('내용')) {
                              const numVal = cleanAmount(value);
                              if (numVal !== 0) {
                                numericColumns.set(key, (numericColumns.get(key) || 0) + Math.abs(numVal));
                              }
                            }
                          });
                        });
                        
                        // 가장 많은 값이 있는 컬럼을 차변으로 간주
                        if (numericColumns.size > 0) {
                          const sortedColumns = Array.from(numericColumns.entries())
                            .sort((a, b) => b[1] - a[1]);
                          foundDebitHeader = sortedColumns[0][0];
                          console.log(`🔍 차변 헤더 자동 발견: "${foundDebitHeader}" (총 ${sortedColumns[0][1].toLocaleString()})`);
                        }
                      }
                      
                      // 대변 헤더를 찾지 못한 경우, 실제 데이터에서 대변 값이 있는 컬럼 찾기
                      let foundCreditHeader = creditHeader;
                      if (!foundCreditHeader && currentAccountData.length > 0) {
                        // 모든 행을 확인하여 차변이 아닌 숫자 컬럼 찾기
                        const numericColumns = new Map<string, number>();
                        
                        currentAccountData.forEach(row => {
                          Object.entries(row).forEach(([key, value]) => {
                            if (key === debitHeader || key === dateHeader) return;
                            const cleanKey = key.replace(/\s/g, '').toLowerCase();
                            // 차변, 일자, 날짜, 잔액, balance가 아닌 컬럼만 확인
                            if (!cleanKey.includes('차변') && !cleanKey.includes('debit') && 
                                !cleanKey.includes('일자') && !cleanKey.includes('날짜') &&
                                !cleanKey.includes('잔액') && !cleanKey.includes('balance') &&
                                !cleanKey.includes('적요') && !cleanKey.includes('거래처') &&
                                !cleanKey.includes('코드') && !cleanKey.includes('내용')) {
                              const numVal = cleanAmount(value);
                              if (numVal !== 0) {
                                numericColumns.set(key, (numericColumns.get(key) || 0) + Math.abs(numVal));
                              }
                            }
                          });
                        });
                        
                        // 가장 많은 값이 있는 컬럼을 대변으로 간주
                        if (numericColumns.size > 0) {
                          const sortedColumns = Array.from(numericColumns.entries())
                            .sort((a, b) => b[1] - a[1]);
                          foundCreditHeader = sortedColumns[0][0];
                          console.log(`🔍 대변 헤더 자동 발견: "${foundCreditHeader}" (총 ${sortedColumns[0][1].toLocaleString()})`);
                        }
                      }
                      
                      const finalCreditHeader = foundCreditHeader;
                      
                      // 잔액 컬럼이 차변으로 잘못 인식되지 않았는지 확인
                      if (foundDebitHeader && foundDebitHeader.toLowerCase().includes('잔액')) {
                        console.error('❌ 오류: 잔액 컬럼이 차변으로 잘못 인식되었습니다!');
                        // 원래 debitHeader를 사용하거나, 차변 헤더를 다시 찾기
                        const correctDebitHeader = headers.find(h => {
                          const clean = h.replace(/\s/g, '').toLowerCase();
                          return (clean.includes('차변') || clean.includes('debit')) && 
                                 !clean.includes('잔액') && !clean.includes('balance');
                        });
                        if (correctDebitHeader) {
                          console.log(`✅ 올바른 차변 헤더로 수정: "${correctDebitHeader}"`);
                          foundDebitHeader = correctDebitHeader;
                        }
                      }
                      
                      // 잔액 컬럼이 대변으로 잘못 인식되지 않았는지 확인
                      if (foundCreditHeader && foundCreditHeader.toLowerCase().includes('잔액')) {
                        console.error('❌ 오류: 잔액 컬럼이 대변으로 잘못 인식되었습니다!');
                        // 원래 creditHeader를 사용하거나, 대변 헤더를 다시 찾기
                        const correctCreditHeader = headers.find(h => {
                          const clean = h.replace(/\s/g, '').toLowerCase();
                          return (clean.includes('대변') || clean.includes('credit')) && 
                                 !clean.includes('잔액') && !clean.includes('balance');
                        });
                        if (correctCreditHeader) {
                          console.log(`✅ 올바른 대변 헤더로 수정: "${correctCreditHeader}"`);
                          foundCreditHeader = correctCreditHeader;
                        }
                      }
                      
                      const finalDebitHeader = foundDebitHeader;
                      const finalCreditHeaderCorrected = foundCreditHeader;
                      
                      console.log('📌 찾은 헤더:', { 
                        dateHeader, 
                        debitHeader: debitHeader || '없음',
                        finalDebitHeader: finalDebitHeader || '없음',
                        creditHeader: creditHeader || '없음',
                        finalCreditHeader: finalCreditHeaderCorrected || '없음',
                        isDebitAutoDetected: !debitHeader && foundDebitHeader !== debitHeader,
                        isCreditAutoDetected: !creditHeader && foundCreditHeader !== creditHeader,
                        allHeaders: headers
                      });
                      
                      if (!dateHeader || (!finalDebitHeader && !finalCreditHeaderCorrected)) {
                        return (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                              월별 집계를 표시할 수 없습니다.
                            </p>
                            <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950 p-2 rounded">
                              <p>일자: {dateHeader || '❌ 없음'}</p>
                              <p>차변: {finalDebitHeader || '❌ 없음'}</p>
                              <p>대변: {finalCreditHeaderCorrected || '❌ 없음'}</p>
                              <p className="mt-2">전체 헤더: {headers.join(', ')}</p>
                            </div>
                          </div>
                        );
                      }
                      
                      const monthlyData = new Map<string, { debit: number; credit: number }>();
                      
                      // 디버깅: 차변/대변 데이터 확인
                      let debugDebitCount = 0;
                      let debugDebitTotal = 0;
                      let debugCreditCount = 0;
                      let debugCreditTotal = 0;
                      
                      currentAccountData.forEach(row => {
                        const date = row[dateHeader];
                        if (!(date instanceof Date)) return;
                        
                        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                        const debit = finalDebitHeader ? cleanAmount(row[finalDebitHeader]) : 0;
                        const credit = finalCreditHeaderCorrected ? cleanAmount(row[finalCreditHeaderCorrected]) : 0;
                        
                        // 디버깅: 차변 값이 있는 경우 카운트
                        if (debit !== 0) {
                          debugDebitCount++;
                          debugDebitTotal += debit;
                        }
                        
                        // 디버깅: 대변 값이 있는 경우 카운트
                        if (credit !== 0) {
                          debugCreditCount++;
                          debugCreditTotal += credit;
                        }
                        
                        // 디버깅: 첫 몇 건의 원본 데이터 확인
                        if (debugDebitCount <= 3 && debit !== 0) {
                          console.log(`🔍 차변 데이터 샘플:`, {
                            month: monthKey,
                            debitValue: debit,
                            originalValue: finalDebitHeader ? row[finalDebitHeader] : 'N/A',
                            debitHeader: finalDebitHeader
                          });
                        }
                        
                        // 디버깅: 첫 몇 건의 원본 데이터 확인
                        if (debugCreditCount <= 3 && credit !== 0) {
                          console.log(`🔍 대변 데이터 샘플:`, {
                            month: monthKey,
                            creditValue: credit,
                            originalValue: finalCreditHeaderCorrected ? row[finalCreditHeaderCorrected] : 'N/A',
                            creditHeader: finalCreditHeaderCorrected
                          });
                        }
                        
                        if (!monthlyData.has(monthKey)) {
                          monthlyData.set(monthKey, { debit: 0, credit: 0 });
                        }
                        
                        const monthly = monthlyData.get(monthKey)!;
                        monthly.debit += debit;
                        monthly.credit += credit;
                      });
                      
                      // 디버깅 로그
                      if (debugDebitCount > 0) {
                        console.log(`📊 차변 데이터 발견: ${debugDebitCount}건, 총액: ${debugDebitTotal.toLocaleString()}, 헤더: ${finalDebitHeader}`);
                      } else {
                        console.log(`⚠️ 차변 데이터 없음 - 헤더: ${finalDebitHeader || '없음'}, 샘플 데이터:`, 
                          currentAccountData.slice(0, 3).map(r => ({ 
                            debit: finalDebitHeader ? r[finalDebitHeader] : 'N/A',
                            credit: finalCreditHeaderCorrected ? r[finalCreditHeaderCorrected] : 'N/A',
                            allKeys: Object.keys(r)
                          }))
                        );
                      }
                      
                      if (debugCreditCount > 0) {
                        console.log(`📊 대변 데이터 발견: ${debugCreditCount}건, 총액: ${debugCreditTotal.toLocaleString()}, 헤더: ${finalCreditHeaderCorrected}`);
                      } else {
                        console.log(`⚠️ 대변 데이터 없음 - 헤더: ${finalCreditHeaderCorrected || '없음'}, 샘플 데이터:`, 
                          currentAccountData.slice(0, 3).map(r => ({ 
                            debit: finalDebitHeader ? r[finalDebitHeader] : 'N/A',
                            credit: finalCreditHeaderCorrected ? r[finalCreditHeaderCorrected] : 'N/A',
                            allKeys: Object.keys(r)
                          }))
                        );
                      }
                      
                      const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                      let balance = 0;
                      
                      // 합계 계산
                      const totalDebit = sortedMonths.reduce((sum, [, data]) => sum + data.debit, 0);
                      const totalCredit = sortedMonths.reduce((sum, [, data]) => sum + data.credit, 0);
                      const finalBalance = sortedMonths.reduce((sum, [, data]) => sum + (data.debit - data.credit), 0);
                      
                      return (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>월</TableHead>
                                <TableHead className="text-right">차변</TableHead>
                                <TableHead className="text-right">대변</TableHead>
                                <TableHead className="text-right">잔액</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sortedMonths.map(([month, data]) => {
                                balance += data.debit - data.credit;
                                return (
                                  <TableRow key={month}>
                                    <TableCell className="font-medium">{month}</TableCell>
                                    <TableCell className="text-right">{data.debit.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{data.credit.toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-medium">{balance.toLocaleString()}</TableCell>
                                  </TableRow>
                                );
                              })}
                              {/* 합계 행 */}
                              <TableRow className="font-bold bg-muted">
                                <TableCell>합계</TableCell>
                                <TableCell className="text-right">{totalDebit.toLocaleString()}</TableCell>
                                <TableCell className="text-right">{totalCredit.toLocaleString()}</TableCell>
                                <TableCell className="text-right">{finalBalance.toLocaleString()}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
                
                {/* 상세 거래 내역 (최근 100건) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">상세 거래 내역 (최근 100건)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(currentAccountData[0] || {}).map(key => (
                              <TableHead key={key}>{key}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentAccountData.slice(0, 100).map((row, idx) => {
                            const headers = Object.keys(currentAccountData[0] || {});
                            return (
                            <TableRow key={idx}>
                                {headers.map((key, j) => {
                                  const val = row[key];
                                  // 숫자 값인 경우 (차변, 대변, 금액 등)
                                  const numVal = cleanAmount(val);
                                  const isAmountColumn = key.includes('차변') || 
                                                        key.includes('대변') || 
                                                        key.includes('금액') ||
                                                        key.toLowerCase().includes('debit') ||
                                                        key.toLowerCase().includes('credit') ||
                                                        key.toLowerCase().includes('amount');
                                  
                                  return (
                                    <TableCell key={j} className={`text-sm ${isAmountColumn ? 'text-right' : ''}`}>
                                      {val instanceof Date 
                                        ? val.toLocaleDateString() 
                                        : isAmountColumn && numVal !== 0
                                        ? numVal.toLocaleString()
                                        : val !== null && val !== undefined
                                        ? String(val)
                                        : ''}
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
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    // Account Analysis (AI-powered)
    if (currentView === 'account_analysis') {
      return (
        <Card className="bg-gradient-to-br from-pink-50/30 via-purple-50/30 to-blue-50/30 dark:from-pink-950/10 dark:via-purple-950/10 dark:to-blue-950/10 border-2 border-pink-200/30 dark:border-pink-800/30 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-pink-100/50 via-purple-100/50 to-blue-100/50 dark:from-pink-900/20 dark:via-purple-900/20 dark:to-blue-900/20 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                <CardTitle className="text-gray-800 dark:text-gray-200">{currentOption?.title}</CardTitle>
                <Badge className="bg-pink-200/60 text-pink-800 dark:bg-pink-800/60 dark:text-pink-200">완성</Badge>
              </div>
              <Button 
                variant="ghost" 
                onClick={() => setCurrentView('selection')}
                className="hover:bg-white/60 dark:hover:bg-gray-800/60"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                뒤로가기
              </Button>
            </div>
            <CardDescription className="text-gray-600 dark:text-gray-400">{currentOption?.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">계정과목</label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="bg-white/80 dark:bg-gray-800/80 border-pink-200 dark:border-pink-800 focus:border-pink-400 dark:focus:border-pink-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white/95 dark:bg-gray-800/95">
                  {accountNames.map(name => (
                    <SelectItem key={name} value={name} className="hover:bg-pink-50 dark:hover:bg-pink-900/30">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">질문 내용</label>
              <Textarea 
                value={analysisQuestion}
                onChange={(e) => setAnalysisQuestion(e.target.value)}
                rows={4}
                placeholder="이 계정의 거래 내역을 요약하고, 특이사항이 있다면 알려주세요."
                className="bg-white/80 dark:bg-gray-800/80 border-pink-200 dark:border-pink-800 focus:border-pink-400 dark:focus:border-pink-600"
              />
            </div>

            {/* 예상 비용 정보 */}
            {estimatedCostInfo && (
              <Card className="bg-gradient-to-r from-cyan-50/60 to-teal-50/60 dark:from-cyan-950/30 dark:to-teal-950/30 border-cyan-200/50 dark:border-cyan-800/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    예상 비용 및 샘플링 정보
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">전체 거래 수</div>
                      <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                        {estimatedCostInfo.totalCount.toLocaleString()}건
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">샘플 크기</div>
                      <div className="text-lg font-bold text-green-700 dark:text-green-300">
                        {estimatedCostInfo.sampleSize.toLocaleString()}건
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">샘플링 비율</div>
                      <div className="text-lg font-bold text-purple-700 dark:text-purple-300">
                        {estimatedCostInfo.samplingRatio.toFixed(1)}%
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">예상 비용</div>
                      <div className="text-lg font-bold text-orange-700 dark:text-orange-300">
                        ₩{estimatedCostInfo.estimatedCost.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
                      <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <p>• 스마트 샘플링: 금액 상위 30%, 최신 20%, 이상치 10%, 월별 30%, 랜덤 10%</p>
                        <p>• 예상 토큰: {estimatedCostInfo.estimatedTokens.toLocaleString()}개 (입력 + 출력 2,000개)</p>
                        <p>• Gemini 2.0 Flash 모델 사용 (빠르고 저렴)</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button 
              onClick={async () => {
                if (!hasApiKey()) {
                  toast({
                    title: 'API Key 필요',
                    description: '먼저 Google Gemini API Key를 설정해주세요.',
                    variant: 'destructive',
                  });
                  setShowApiKeyDialog(true);
                  return;
                }
                
                setIsLoading(true);
                setAnalysisResult('');
                
                try {
                  // 1. 차변/대변 헤더 찾기
                  const headers = Object.keys(currentAccountData[0] || {});
                  const dateHeader = headers.find(h => 
                    h.includes('일자') || h.includes('날짜')
                  );
                  const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, currentAccountData, dateHeader);
                  
                  // 디버깅: 찾은 헤더 확인
                  console.log('📊 AI 분석 - 찾은 헤더:', {
                    debitHeader: debitHeader || '없음',
                    creditHeader: creditHeader || '없음',
                    dateHeader: dateHeader || '없음',
                    allHeaders: headers
                  });
                  
                  // 1. 샘플 크기 계산
                  const totalCount = currentAccountData.length;
                  const sampleSize = calculateSampleSize(totalCount);
                  
                  // 2. 스마트 샘플링
                  const dateColumns = Object.keys(currentAccountData[0] || {}).filter(key => 
                    key.toLowerCase().includes('일자') || key.toLowerCase().includes('날짜') || key.toLowerCase().includes('date')
                  );
                  
                  const sampledData = smartSample(
                    currentAccountData,
                    sampleSize,
                    amountColumns,
                    dateColumns,
                    debitHeader,
                    creditHeader,
                    selectedAccount
                  );
                  
                  // 3. 통계 요약 생성 (차변/대변 헤더 전달)
                  const dataSummary = generateDataSummary(
                    currentAccountData, 
                    selectedAccount, 
                    amountColumns,
                    debitHeader,
                    creditHeader,
                    dateHeader
                  );
                  
                  // 4. 프롬프트 생성 (외부감사인 관점)
                  const prompt = `
# 계정별원장 AI 분석 (외부감사 관점)

당신은 외부감사인인 회계사입니다. 아래 계정별원장 데이터를 감사 관점에서 분석해주세요.

## 전체 통계 정보
${dataSummary}

## 샘플 데이터 (${sampledData.length}/${totalCount}건)
샘플링 방법: 스마트 샘플링 (금액 상위 30%, 최신 20%, 이상치 10%, 월별 균등 30%, 랜덤 10%)

${JSON.stringify(sampledData, null, 2)}

## 분석 요구사항

위 통계 정보와 샘플 데이터를 바탕으로 다음 구조로 분석해주세요:

### 2. 계정요약
- 계정의 성격과 목적
- 분석 기간 동안의 총 거래 규모 (차변/대변 합계)
- 주요 거래 패턴 (월별 분포, 거래 빈도 등)
- 전기 대비 증감 현황 (전기 데이터가 있는 경우)

### 3. 거래특징
- 주요 거래처 및 거래 빈도
- 거래 금액의 분포 (대형 거래, 소액 거래 비중)
- 거래 시기별 특징 (월말 집중, 특정 기간 집중 등)
- 거래 형태의 특징 (정기적 거래, 일회성 거래 등)
- 거래처별 거래 패턴

### 4. 특이사항 및 위험요소 (감사 관점)
**다음 감사 위험 요소에 집중하여 분석해주세요:**

#### 4.1 발생 위험 (Occurrence Risk)
- 실제로 발생하지 않은 거래가 기록되었는지
- 대형 거래의 실물 증빙 가능성
- 비정상적으로 큰 금액의 거래 존재 여부

#### 4.2 완전성 위험 (Completeness Risk)
- 누락된 거래가 있는지 (월별 변동폭이 큰 경우)
- 특정 기간 거래가 비정상적으로 적은 경우
- 거래처별 거래 패턴의 불일치

#### 4.3 정확성 위험 (Accuracy Risk)
- 금액 계산 오류 가능성
- 차변/대변 불일치 가능성
- 계정과목 분류 오류 가능성

#### 4.4 권한 및 승인 위험 (Authorization Risk)
- 승인 없이 처리된 대형 거래
- 비정상적인 거래처와의 거래
- 내부 통제 우회 가능성

#### 4.5 분류 위험 (Classification Risk)
- 계정과목 분류 오류
- 기간 구분 오류 (당기/전기 구분)

#### 4.6 절개 위험 (Cut-off Risk)
- 기간 말일 전후 거래의 기간 구분 오류
- 월말/연말 집중 거래의 기간 구분 적정성

#### 4.7 실질적 지배력 위험 (Substance over Form)
- 특수관계인 거래처와의 거래
- 실질과 형식이 다른 거래 (예: 외상매출인데 실제로는 대출)

#### 4.8 기타 감사상 주의사항
- 이상 거래 패턴 (예: 정기 거래가 갑자기 중단)
- 거래처 집중도 (특정 거래처에 과도하게 집중)
- 금액의 변동성 (급격한 증감)
- 전기 대비 비정상적 변화

**각 위험 요소에 대해:**
- 구체적인 거래 사례를 제시하세요 (날짜, 거래처, 금액 포함)
- 위험 수준을 평가하세요 (높음/중간/낮음)
- 추가 감사 절차를 제안하세요 (예: 증빙서 검토, 거래처 확인 등)

## 작성 형식
- 한국어로 답변하고, 마크다운 형식으로 작성해주세요.
- 금액은 천 단위 구분 기호(,)를 사용해주세요.
- **매우 중요**: 금액을 해석할 때 정확한 단위를 사용해주세요. 
  - 예: 14,491,131,589원 = 약 144.91억원 (약 14.5억원이 아님, 29조가 아님)
  - 1억원 = 100,000,000원
  - 1조원 = 1,000,000,000,000원
  - 통계 정보에 표시된 "약 X억원" 형식을 참고하여 정확한 금액 단위를 사용해주세요.
- 각 섹션은 명확하게 구분하여 작성해주세요.
`;
                  
                  // 5. 토큰 및 비용 추정
                  const estimatedTokens = estimateTokens(prompt);
                  const estimatedCostKRW = estimateCost(estimatedTokens);
                  
                  console.log(`📊 샘플링 정보:
- 전체 거래: ${totalCount.toLocaleString()}건
- 샘플 크기: ${sampledData.length.toLocaleString()}건 (${((sampledData.length / totalCount) * 100).toFixed(1)}%)
- 예상 토큰: ${estimatedTokens.toLocaleString()}개
- 예상 비용: ₩${estimatedCostKRW.toLocaleString()}원`);
                  
                  // 6. AI 분석 실행
                  const analysis = await analyzeWithFlash(prompt);
                  
                  setAnalysisResult(analysis);
                  
                  // 7. 사용 이력 저장
                  const actualCost = estimateCost(estimatedTokens, 2000, true);
                  addUsageRecord({
                    accountName: selectedAccount,
                    analysisType: '계정별원장 AI 분석',
                    totalCount,
                    sampleSize: sampledData.length,
                    samplingRatio: (sampledData.length / totalCount) * 100,
                    tokensUsed: estimatedTokens + 2000, // 입력 + 출력 추정
                    costKRW: actualCost,
                    model: 'gemini-2.0-flash-exp',
                  });
                  refreshUsageSummary();
                  
                  toast({
                    title: '분석 완료',
                    description: `${sampledData.length}건의 샘플을 분석했습니다. (비용: ₩${actualCost})`,
                  });
                } catch (err: any) {
                  toast({
                    title: '오류',
                    description: err.message || 'AI 분석 중 오류가 발생했습니다.',
                    variant: 'destructive',
                  });
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading || !selectedAccount}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
            >
              {isLoading ? (
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

            {analysisResult && (
              <Card className="bg-gradient-to-br from-pink-50/50 via-purple-50/50 to-blue-50/50 dark:from-pink-950/20 dark:via-purple-950/20 dark:to-blue-950/20 border-2 border-pink-200/50 dark:border-pink-800/50">
                <CardHeader className="bg-gradient-to-r from-pink-100/50 to-purple-100/50 dark:from-pink-900/30 dark:to-purple-900/30 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                      AI 분석 결과
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        try {
                          // 마크다운을 파싱하여 엑셀 형식으로 변환
                          const sections = analysisResult.split(/^###\s+/m).filter(s => s.trim());
                          const wb = XLSX.utils.book_new();
                          
                          // 각 섹션을 시트로 추가
                          sections.forEach((section, index) => {
                            const lines = section.split('\n').filter(l => l.trim());
                            if (lines.length === 0) return;
                            
                            const title = lines[0].trim();
                            const content = lines.slice(1).join('\n');
                            
                            // 섹션 제목과 내용을 데이터로 변환
                            const data = [
                              [title],
                              [],
                              ...content.split('\n').map(line => [line.trim()])
                            ];
                            
                            const ws = XLSX.utils.aoa_to_sheet(data);
                            XLSX.utils.book_append_sheet(wb, ws, `섹션${index + 1}`);
                          });
                          
                          // 전체 내용도 하나의 시트로 추가
                          const fullData = analysisResult.split('\n').map(line => [line]);
                          const fullWs = XLSX.utils.aoa_to_sheet(fullData);
                          XLSX.utils.book_append_sheet(wb, fullWs, '전체내용');
                          
                          const fileName = `AI분석_${selectedAccount}_${new Date().toISOString().split('T')[0]}.xlsx`;
                          XLSX.writeFile(wb, fileName);
                          
                          toast({
                            title: '다운로드 완료',
                            description: `${fileName} 파일이 다운로드되었습니다.`,
                          });
                        } catch (err: any) {
                          toast({
                            title: '오류',
                            description: err.message || '다운로드 중 오류가 발생했습니다.',
                            variant: 'destructive',
                          });
                        }
                      }}
                      className="bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      엑셀 다운로드
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {(() => {
                      // 마크다운을 파싱하여 섹션별로 박스 생성
                      const sections = analysisResult.split(/^###\s+/m).filter(s => s.trim());
                      const colors = [
                        'from-pink-100/60 to-rose-100/60 dark:from-pink-900/20 dark:to-rose-900/20 border-pink-300/50 dark:border-pink-700/50',
                        'from-purple-100/60 to-violet-100/60 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-300/50 dark:border-purple-700/50',
                        'from-blue-100/60 to-cyan-100/60 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-300/50 dark:border-blue-700/50',
                        'from-teal-100/60 to-emerald-100/60 dark:from-teal-900/20 dark:to-emerald-900/20 border-teal-300/50 dark:border-teal-700/50',
                        'from-amber-100/60 to-yellow-100/60 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-300/50 dark:border-amber-700/50',
                        'from-indigo-100/60 to-blue-100/60 dark:from-indigo-900/20 dark:to-blue-900/20 border-indigo-300/50 dark:border-indigo-700/50',
                      ];
                      
                      return sections.map((section, index) => {
                        const lines = section.split('\n').filter(l => l.trim());
                        if (lines.length === 0) return null;
                        
                        const title = lines[0].trim();
                        const content = lines.slice(1).join('\n');
                        const colorClass = colors[index % colors.length];
                        
                        return (
                          <div
                            key={index}
                            className={`rounded-lg border-2 p-4 bg-gradient-to-br ${colorClass} shadow-sm hover:shadow-md transition-shadow`}
                          >
                            <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200 flex items-center gap-2">
                              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/60 dark:bg-gray-800/60 text-sm font-bold">
                                {index + 1}
                              </span>
                              {title}
                            </h3>
                            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed pl-10">
                              {content.split('\n').map((line, lineIndex) => {
                                // 리스트 항목 처리
                                if (line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\./.test(line.trim())) {
                                  return (
                                    <div key={lineIndex} className="ml-4 mb-1 flex items-start">
                                      <span className="mr-2 text-pink-500 dark:text-pink-400">•</span>
                                      <span>{line.trim().replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '')}</span>
                                    </div>
                                  );
                                }
                                // 볼드 텍스트 처리
                                if (line.includes('**')) {
                                  const parts = line.split(/(\*\*.*?\*\*)/g);
                                  return (
                                    <div key={lineIndex} className="mb-2">
                                      {parts.map((part, partIndex) => {
                                        if (part.startsWith('**') && part.endsWith('**')) {
                                          return (
                                            <strong key={partIndex} className="text-gray-900 dark:text-gray-100 font-semibold">
                                              {part.slice(2, -2)}
                                            </strong>
                                          );
                                        }
                                        return <span key={partIndex}>{part}</span>;
                                      })}
                                    </div>
                                  );
                                }
                                // 빈 줄
                                if (line.trim() === '') {
                                  return <div key={lineIndex} className="h-2" />;
                                }
                                return (
                                  <div key={lineIndex} className="mb-2">
                                    {line}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      );
    }

    // Other analyses (Coming Soon)
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentOption && <currentOption.icon className="h-5 w-5 text-primary" />}
              <CardTitle>{currentOption?.title}</CardTitle>
              <Badge variant="secondary">곧 출시</Badge>
            </div>
            <Button variant="ghost" onClick={() => setCurrentView('selection')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
          <CardDescription>{currentOption?.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-center py-12">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              {currentOption && <currentOption.icon className="h-8 w-8 text-primary" />}
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">이 기능은 곧 출시됩니다</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {currentOption?.description}
              </p>
              <p className="text-xs text-muted-foreground">
                현재 벤포드 법칙 분석과 계정별원장 AI 분석이 사용 가능합니다.
              </p>
            </div>
            <Button variant="outline" onClick={() => setCurrentView('selection')}>
              다른 분석 선택
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">더존 계정별원장 분석</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* 누적 비용 표시 */}
              {usageSummary.totalAnalyses > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUsageDialog(true)}
                  className="flex items-center gap-2"
                >
                  <DollarSign className="h-4 w-4" />
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-muted-foreground">이번 달</span>
                    <span className="font-bold text-primary">₩{usageSummary.thisMonthCost.toLocaleString()}</span>
                  </div>
                </Button>
              )}
              
              <Button
                variant={apiKeyExists ? "outline" : "default"}
                size="sm"
                onClick={() => {
                  setApiKeyInput(getApiKey() || '');
                  setShowApiKeyDialog(true);
                }}
                className="flex items-center gap-2"
              >
                {apiKeyExists ? (
                  <>
                    <Key className="h-4 w-4" />
                    API Key 설정됨
                  </>
                ) : (
                  <>
                    <Settings className="h-4 w-4" />
                    API Key 설정
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!workbook || showPreviousDialog || showPreviousUpload ? renderUploadScreen() : currentView === 'selection' ? renderSelectionScreen() : renderAnalysisView()}
      </main>

      {/* 사용 이력 Dialog */}
      <Dialog open={showUsageDialog} onOpenChange={setShowUsageDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              AI 사용 이력 및 비용
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* 요약 통계 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">총 누적 비용</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    ₩{usageSummary.totalCost.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">이번 달 비용</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    ₩{usageSummary.thisMonthCost.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">오늘 비용</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₩{usageSummary.todayCost.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">총 분석 횟수</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {usageSummary.totalAnalyses.toLocaleString()}회
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* 최근 이력 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">최근 사용 이력 (최근 50건)</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const csv = exportUsageToCSV();
                      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `AI사용이력_${new Date().toISOString().split('T')[0]}.csv`;
                      link.click();
                      URL.revokeObjectURL(url);
                      toast({
                        title: '다운로드 완료',
                        description: 'CSV 파일로 저장했습니다.',
                      });
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    CSV 내보내기
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm('모든 사용 이력을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
                        clearUsageHistory();
                        refreshUsageSummary();
                        toast({
                          title: '삭제 완료',
                          description: '모든 사용 이력이 삭제되었습니다.',
                        });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    이력 삭제
                  </Button>
                </div>
              </div>
              
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>날짜/시간</TableHead>
                      <TableHead>계정과목</TableHead>
                      <TableHead>분석유형</TableHead>
                      <TableHead className="text-right">거래수</TableHead>
                      <TableHead className="text-right">샘플</TableHead>
                      <TableHead className="text-right">비율</TableHead>
                      <TableHead className="text-right">비용</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageSummary.records.slice(0, 50).map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="text-xs">
                          {new Date(record.timestamp).toLocaleString('ko-KR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{record.accountName}</TableCell>
                        <TableCell className="text-sm">{record.analysisType}</TableCell>
                        <TableCell className="text-right text-sm">{record.totalCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm">{record.sampleSize.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm">{record.samplingRatio.toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          ₩{record.costKRW.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {usageSummary.records.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>아직 사용 이력이 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* API Key 설정 Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Google Gemini API Key 설정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="space-y-2 text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-semibold">🔒 데이터 보안 안내</p>
                  <p>API Key를 입력하시면 귀하의 브라우저에서 직접 Google Gemini API에 연결됩니다.</p>
                  <p>회계 데이터는 외부 서버를 거치지 않고, 브라우저 → Google AI로 직접 전송됩니다.</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">• API Key는 브라우저 localStorage에 안전하게 저장됩니다.</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">• 스마트 샘플링으로 전체 데이터의 1-20%만 전송됩니다.</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Google Gemini API Key를 입력하세요"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                API Key 발급: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google AI Studio</a>
              </p>
            </div>
            
            {apiKeyExists && (
              <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 text-sm text-green-900 dark:text-green-100">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span>API Key가 이미 설정되어 있습니다.</span>
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              {apiKeyExists && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteApiKey();
                    setApiKeyInput('');
                    setApiKeyExists(false);
                    toast({
                      title: '성공',
                      description: 'API Key가 삭제되었습니다.',
                    });
                  }}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  삭제
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowApiKeyDialog(false)}
                className="flex-1"
              >
                취소
              </Button>
              <Button
                onClick={() => {
                  if (!apiKeyInput.trim()) {
                    toast({
                      title: '오류',
                      description: 'API Key를 입력해주세요.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  saveApiKey(apiKeyInput.trim());
                  setApiKeyExists(true);
                  setShowApiKeyDialog(false);
                  toast({
                    title: '성공',
                    description: 'API Key가 저장되었습니다. 이제 AI 분석을 사용할 수 있습니다.',
                  });
                }}
                className="flex-1"
                disabled={!apiKeyInput.trim()}
              >
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 전기 업로드 여부 확인 Dialog - 전역으로 이동 */}
      {showPreviousDialog && (
        <Dialog open={showPreviousDialog} onOpenChange={(open) => {
          console.log('Dialog onOpenChange:', open);
          setShowPreviousDialog(open);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>전기 계정별원장도 업로드하시겠습니까?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                전기 데이터를 업로드하시면 전기 대비 비교 분석을 수행할 수 있습니다.
              </p>
              <p className="text-sm text-muted-foreground">
                전기 데이터가 없어도 당기 분석은 가능합니다.
              </p>
            </div>
            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  console.log('"아니요" 클릭됨');
                  setShowPreviousDialog(false);
                  setCurrentView('selection');
                }}
              >
                아니요, 당기만 분석하겠습니다
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  console.log('"네" 클릭됨');
                  setShowPreviousDialog(false);
                  setShowPreviousUpload(true);
                }}
              >
                네, 전기 데이터도 업로드하겠습니다
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default AdvancedLedgerAnalysis;

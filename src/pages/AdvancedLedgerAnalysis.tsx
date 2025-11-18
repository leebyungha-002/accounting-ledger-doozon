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
import { smartSample, calculateSampleSize, generateDataSummary } from '@/lib/smartSampling';
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
type View = 'selection' | 'account_analysis' | 'offset_analysis' | 'general_ledger' | 'duplicate_vendor' | 'profit_loss' | 'monthly_trend' | 'previous_period' | 'transaction_search' | 'sampling' | 'fss_risk' | 'benford';
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

  return { data, headers, orderedHeaders };
};

const cleanAmount = (val: any) => typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) || 0 : typeof val === 'number' ? val : 0;

const AdvancedLedgerAnalysis = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousFileInputRef = useRef<HTMLInputElement>(null);

  // File states
  const [fileName, setFileName] = useState<string>('');
  const [previousFileName, setPreviousFileName] = useState<string>('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [previousWorkbook, setPreviousWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [accountNames, setAccountNames] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  
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
    return data;
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
      
      // Estimate prompt size
      const dataSummary = generateDataSummary(currentAccountData, selectedAccount, amountColumns);
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
            <div className="space-y-2">
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
              <div className="space-y-4">
                {/* 월별 요약 */}
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">월별 차변/대변 요약</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const headers = Object.keys(currentAccountData[0] || {});
                      const dateHeader = headers.find(h => h.includes('일자') || h.includes('날짜'));
                      const debitHeader = headers.find(h => h.includes('차변'));
                      const creditHeader = headers.find(h => h.includes('대변'));
                      
                      if (!dateHeader || (!debitHeader && !creditHeader)) {
                        return <p className="text-sm text-muted-foreground">월별 집계를 표시할 수 없습니다.</p>;
                      }
                      
                      const monthlyData = new Map<string, { debit: number; credit: number }>();
                      
                      currentAccountData.forEach(row => {
                        const date = row[dateHeader];
                        if (!(date instanceof Date)) return;
                        
                        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                        const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
                        const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
                        
                        if (!monthlyData.has(monthKey)) {
                          monthlyData.set(monthKey, { debit: 0, credit: 0 });
                        }
                        
                        const monthly = monthlyData.get(monthKey)!;
                        monthly.debit += debit;
                        monthly.credit += credit;
                      });
                      
                      const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                      let balance = 0;
                      
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
                          {currentAccountData.slice(0, 100).map((row, idx) => (
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
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
            <div className="space-y-2">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">질문 내용</label>
              <Textarea 
                value={analysisQuestion}
                onChange={(e) => setAnalysisQuestion(e.target.value)}
                rows={4}
                placeholder="이 계정의 거래 내역을 요약하고, 특이사항이 있다면 알려주세요."
              />
            </div>

            {/* 예상 비용 정보 */}
            {estimatedCostInfo && (
              <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-blue-200 dark:border-blue-800">
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
                    dateColumns
                  );
                  
                  // 3. 통계 요약 생성
                  const dataSummary = generateDataSummary(currentAccountData, selectedAccount, amountColumns);
                  
                  // 4. 프롬프트 생성
                  const prompt = `
# 계정별원장 AI 분석

## 전체 통계 정보
${dataSummary}

## 샘플 데이터 (${sampledData.length}/${totalCount}건)
샘플링 방법: 스마트 샘플링 (금액 상위 30%, 최신 20%, 이상치 10%, 월별 균등 30%, 랜덤 10%)

${JSON.stringify(sampledData, null, 2)}

## 질문
${analysisQuestion}

## 요구사항
- 위 통계 정보와 샘플 데이터를 바탕으로 질문에 답변해주세요.
- 특이사항, 패턴, 위험 요소가 있다면 구체적으로 지적해주세요.
- 한국어로 답변하고, 마크다운 형식으로 작성해주세요.
- 금액은 천 단위 구분 기호(,)를 사용해주세요.
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
              className="w-full"
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
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-lg">AI 분석 결과</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm">{analysisResult}</div>
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

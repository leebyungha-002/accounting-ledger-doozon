import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  LogOut,
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
  Sparkles
} from 'lucide-react';

// Types
type LedgerRow = { [key: string]: string | number | Date | undefined };
type View = 'selection' | 'account_analysis' | 'general_ledger' | 'duplicate_vendor' | 'profit_loss' | 'monthly_trend' | 'previous_period' | 'transaction_search' | 'sampling' | 'fss_risk' | 'benford';
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

  const data = XLSX.utils.sheet_to_json<LedgerRow>(worksheet, { range: headerIndex });
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const orderedHeaders = (sheetDataAsArrays[headerIndex] || []).map(h => String(h || '').trim());

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
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: '로그아웃',
      description: '로그아웃되었습니다.',
    });
    navigate('/');
  };
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

  const analysisOptions = [
    { id: 'account_analysis', title: '계정별원장 AI 분석', description: '특정 계정을 선택하여 AI에게 거래내역 요약, 특이사항 분석 등 자유로운 질문을 할 수 있습니다.', icon: FileText },
    { id: 'general_ledger', title: '총계정원장 조회', description: '특정 계정의 월별 차변/대변 합계 및 잔액을 요약하고, 상세 거래내역을 조회합니다.', icon: FileSpreadsheet },
    { id: 'duplicate_vendor', title: '매입/매출 이중거래처 분석', description: '동일한 거래처가 매입과 매출 양쪽에서 동시에 발생하는 경우를 식별하여 잠재적 위험을 분석합니다.', icon: AlertTriangle },
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
        setShowPreviousDialog(true);
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

      {/* 전기 업로드 여부 확인 Dialog */}
      <Dialog open={showPreviousDialog} onOpenChange={setShowPreviousDialog}>
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
                setShowPreviousDialog(false);
                setCurrentView('selection');
              }}
            >
              아니요, 당기만 분석하겠습니다
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setShowPreviousDialog(false);
                setShowPreviousUpload(true);
              }}
            >
              네, 전기 데이터도 업로드하겠습니다
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

  const renderAnalysisView = () => {
    const currentOption = analysisOptions.find(o => o.id === currentView);
    
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

            <Button 
              onClick={async () => {
                setIsLoading(true);
                setAnalysisResult('');
                try {
                  const { data, error } = await supabase.functions.invoke('analyze-ledger', {
                    body: {
                      ledgerData: currentAccountData.slice(0, 100),
                      analysisType: 'account',
                      accountName: selectedAccount,
                      question: analysisQuestion,
                    },
                  });

                  if (error) throw error;
                  
                  if (data.error) {
                    toast({
                      title: '오류',
                      description: data.error,
                      variant: 'destructive',
                    });
                  } else {
                    setAnalysisResult(data.analysis || '');
                  }
                } catch (err: any) {
                  toast({
                    title: '오류',
                    description: `AI 분석 중 오류: ${err.message}`,
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
            <Button variant="ghost" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!workbook ? renderUploadScreen() : currentView === 'selection' ? renderSelectionScreen() : renderAnalysisView()}
      </main>
    </div>
  );
};

export default AdvancedLedgerAnalysis;

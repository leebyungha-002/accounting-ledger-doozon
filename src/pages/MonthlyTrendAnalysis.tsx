import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, TrendingUp, Download, BarChart3, Sparkles, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { analyzeWithFlash, hasApiKey } from '@/lib/geminiClient';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface MonthlyTrendAnalysisProps {
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
  
  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet);
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  
  return { data: rawData, headers };
};

export const MonthlyTrendAnalysis: React.FC<MonthlyTrendAnalysisProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [salesAnalysis, setSalesAnalysis] = useState<string>('');
  const [expenseAnalysis, setExpenseAnalysis] = useState<string>('');
  const [manufacturingAnalysis, setManufacturingAnalysis] = useState<string>('');
  const [isAnalyzingSales, setIsAnalyzingSales] = useState<boolean>(false);
  const [isAnalyzingExpense, setIsAnalyzingExpense] = useState<boolean>(false);
  const [isAnalyzingManufacturing, setIsAnalyzingManufacturing] = useState<boolean>(false);

  // 매출/비용 계정 자동 분류
  const categorizedAccounts = useMemo(() => {
    const sales: string[] = [];
    const expenses: string[] = [];
    const manufacturing: string[] = [];
    
    accountNames.forEach(name => {
      // 매출 계정: 괄호 앞부분이 '매출' 또는 '매출액'으로 끝나는 계정만
      const nameWithoutCode = name.split(/[\(（]/)[0].trim();
      const normalized = nameWithoutCode.replace(/\s/g, '').trim();
      const isSalesAccount = normalized.endsWith('매출') || normalized.endsWith('매출액');
      
      if (isSalesAccount) {
        sales.push(name);
      } else {
        // 판관비 계정: 계정명(판) 또는 계정명(8xxxx) 또는 계정명(판)(8xxxx) 형식만
        let isExpenseAccount = false;
        
        // 괄호 안의 내용 추출 (모든 괄호 쌍 찾기)
        const bracketMatches = name.matchAll(/[\(（]\s*([^\)）]+)\s*[\)）]/g);
        const bracketContents: string[] = [];
        for (const match of bracketMatches) {
          if (match[1]) {
            bracketContents.push(match[1].trim());
          }
        }
        
        // 판관비 조건 확인
        if (bracketContents.length > 0) {
          // 1. (판)이 있는 경우
          const hasPan = bracketContents.some(content => content === '판');
          
          // 2. 8로 시작하는 숫자가 있는 경우 (8xxxx 형식)
          const has8xxxx = bracketContents.some(content => {
            const numMatch = content.match(/^(\d+)$/);
            return numMatch && numMatch[1].startsWith('8');
          });
          
          // 판관비 조건: (판) 또는 (8xxxx) 또는 둘 다
          isExpenseAccount = hasPan || has8xxxx;
          
          // 디버깅 로그
          if (isExpenseAccount) {
            console.log(`✅ 판관비 계정 발견: "${name}"`, {
              괄호내용: bracketContents,
              hasPan,
              has8xxxx
            });
          }
        }
        
        if (isExpenseAccount) {
          expenses.push(name);
        } else {
          // 제조원가 계정: 계정명(제) 또는 계정명(5xxxx) 또는 계정명(제)(5xxxx) 형식만
          let isManufacturingAccount = false;
          
          // 괄호 안의 내용 추출 (모든 괄호 쌍 찾기)
          const bracketMatches = name.matchAll(/[\(（]\s*([^\)）]+)\s*[\)）]/g);
          const bracketContents: string[] = [];
          for (const match of bracketMatches) {
            if (match[1]) {
              bracketContents.push(match[1].trim());
            }
          }
          
          // 제조원가 조건 확인
          if (bracketContents.length > 0) {
            // 1. (제)가 있는 경우
            const hasJe = bracketContents.some(content => content === '제');
            
            // 2. 5로 시작하는 숫자가 있는 경우 (5xxxx 형식)
            const has5xxxx = bracketContents.some(content => {
              const numMatch = content.match(/^(\d+)$/);
              return numMatch && numMatch[1].startsWith('5');
            });
            
            // 제조원가 조건: (제) 또는 (5xxxx) 또는 둘 다
            isManufacturingAccount = hasJe || has5xxxx;
            
            // 디버깅 로그
            if (isManufacturingAccount) {
              console.log(`✅ 제조원가 계정 발견: "${name}"`, {
                괄호내용: bracketContents,
                hasJe,
                has5xxxx
              });
            }
          }
          
          if (isManufacturingAccount) {
            manufacturing.push(name);
          }
        }
      }
    });
    
    return { sales, expenses, manufacturing };
  }, [accountNames]);

  // 월별 데이터 집계
  const monthlyData = useMemo(() => {
    const data: { [account: string]: { [month: number]: number } } = {};
    
    selectedAccounts.forEach(account => {
      data[account] = {};
      for (let i = 1; i <= 12; i++) {
        data[account][i] = 0;
      }
    });

    selectedAccounts.forEach(accountName => {
      const sheet = workbook.Sheets[accountName];
      const { data: rows, headers } = getDataFromSheet(sheet);
      
      const dateHeader = robustFindHeader(headers, ['일자', '날짜', '거래일', 'date']) ||
                         headers.find(h => h.includes('일자') || h.includes('날짜'));
      const debitHeader = robustFindHeader(headers, ['차변', 'debit', '차변금액']) ||
                          headers.find(h => h.includes('차변'));
      const creditHeader = robustFindHeader(headers, ['대변', 'credit', '대변금액']) ||
                           headers.find(h => h.includes('대변'));
      
      if (!dateHeader) {
        console.warn(`⚠️ [${accountName}] 날짜 헤더를 찾을 수 없습니다.`, headers);
        return;
      }
      
      const isSalesAccount = categorizedAccounts.sales.includes(accountName);
      let processedCount = 0;
      let validDateCount = 0;
      let amountCount = 0;
      
      rows.forEach(row => {
        processedCount++;
        let date = row[dateHeader];
        
        // Date 객체가 아니면 파싱 시도
        if (!(date instanceof Date)) {
          date = parseDate(date);
        }
        
        if (!(date instanceof Date)) {
          return;
        }
        
        validDateCount++;
        const month = date.getMonth() + 1;
        const debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
        const credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
        
        // 매출 계정은 대변, 비용 계정은 차변
        const amount = isSalesAccount ? credit : debit;
        
        if (amount > 0) {
          amountCount++;
          data[accountName][month] += amount;
        }
      });
      
      // 디버깅 로그
      if (isSalesAccount && processedCount > 0) {
        console.log(`📊 [${accountName}] 매출 계정 처리:`, {
          전체행: processedCount,
          유효날짜: validDateCount,
          금액있는행: amountCount,
          dateHeader,
          creditHeader,
          총대변금액: Object.values(data[accountName] || {}).reduce((a, b) => a + b, 0)
        });
      }
    });

    return data;
  }, [workbook, selectedAccounts, categorizedAccounts]);

  // 월별 합계
  const monthlyTotals = useMemo(() => {
    const totals: { [month: number]: number } = {};
    for (let i = 1; i <= 12; i++) {
      totals[i] = 0;
    }
    
    Object.values(monthlyData).forEach(accountData => {
      Object.entries(accountData).forEach(([month, amount]) => {
        totals[parseInt(month)] += amount;
      });
    });
    
    return totals;
  }, [monthlyData]);

  // 매출 월별 합계
  const salesMonthlyTotals = useMemo(() => {
    const totals: { [month: number]: number } = {};
    for (let i = 1; i <= 12; i++) {
      totals[i] = 0;
    }
    
    Array.from(selectedAccounts)
      .filter(account => categorizedAccounts.sales.includes(account))
      .forEach(account => {
        Object.entries(monthlyData[account] || {}).forEach(([month, amount]) => {
          totals[parseInt(month)] += amount;
        });
      });
    
    return totals;
  }, [monthlyData, selectedAccounts, categorizedAccounts.sales]);

  // 판관비 월별 합계
  const expenseMonthlyTotals = useMemo(() => {
    const totals: { [month: number]: number } = {};
    for (let i = 1; i <= 12; i++) {
      totals[i] = 0;
    }
    
    Array.from(selectedAccounts)
      .filter(account => categorizedAccounts.expenses.includes(account))
      .forEach(account => {
        Object.entries(monthlyData[account] || {}).forEach(([month, amount]) => {
          totals[parseInt(month)] += amount;
        });
      });
    
    return totals;
  }, [monthlyData, selectedAccounts, categorizedAccounts.expenses]);

  // 제조원가 월별 합계
  const manufacturingMonthlyTotals = useMemo(() => {
    const totals: { [month: number]: number } = {};
    for (let i = 1; i <= 12; i++) {
      totals[i] = 0;
    }
    
    Array.from(selectedAccounts)
      .filter(account => categorizedAccounts.manufacturing.includes(account))
      .forEach(account => {
        Object.entries(monthlyData[account] || {}).forEach(([month, amount]) => {
          totals[parseInt(month)] += amount;
        });
      });
    
    return totals;
  }, [monthlyData, selectedAccounts, categorizedAccounts.manufacturing]);

  const handleToggleAccount = (account: string) => {
    const newSet = new Set(selectedAccounts);
    if (newSet.has(account)) {
      newSet.delete(account);
    } else {
      newSet.add(account);
    }
    setSelectedAccounts(newSet);
  };

  const handleSelectAll = (category: string[]) => {
    const newSet = new Set(selectedAccounts);
    category.forEach(acc => newSet.add(acc));
    setSelectedAccounts(newSet);
  };

  const handleDeselectAll = () => {
    setSelectedAccounts(new Set());
  };

  // AI 분석 함수들
  const analyzeSales = async () => {
    console.log('🔍 API Key 확인:', {
      hasApiKey: hasApiKey(),
      apiKeyLength: hasApiKey() ? '있음' : '없음'
    });
    
    if (!hasApiKey()) {
      toast({
        title: 'API Key 필요',
        description: '먼저 Google Gemini API Key를 설정해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const selectedSalesAccounts = Array.from(selectedAccounts)
      .filter(account => categorizedAccounts.sales.includes(account));
    
    if (selectedSalesAccounts.length === 0) {
      toast({
        title: '오류',
        description: '매출 계정을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzingSales(true);
    setSalesAnalysis('');

    try {
      const monthlyDataText = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const amount = salesMonthlyTotals[month] || 0;
        return `${month}월: ${amount.toLocaleString()}원`;
      }).join('\n');

      const prompt = `다음은 매출 계정의 월별 합계 데이터입니다. 재무 분석 전문가의 관점에서 다음을 분석해주세요:

${monthlyDataText}

분석 요청사항:
1. 월별 매출 추이 패턴 분석 (증가/감소/계절성)
2. 주요 특징 및 특이사항
3. 개선 제안사항

한국어로 간결하고 전문적으로 작성해주세요.`;

      console.log('🔍 매출 AI 분석 시작:', {
        promptLength: prompt.length,
        monthlyData: salesMonthlyTotals,
        selectedAccounts: Array.from(selectedAccounts).filter(a => categorizedAccounts.sales.includes(a))
      });
      
      const result = await analyzeWithFlash(prompt);
      console.log('✅ 매출 AI 분석 성공:', result.substring(0, 100) + '...');
      setSalesAnalysis(result);
      
      toast({
        title: '분석 완료',
        description: '매출 AI 분석이 완료되었습니다.',
      });
    } catch (error: any) {
      console.error('❌ 매출 AI 분석 오류 상세:', {
        message: error.message,
        error: error,
        stack: error.stack,
        name: error.name
      });
      toast({
        title: '분석 실패',
        description: error.message || 'AI 분석 중 오류가 발생했습니다. 브라우저 콘솔(F12)을 확인해주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingSales(false);
    }
  };

  const analyzeExpense = async () => {
    if (!hasApiKey()) {
      toast({
        title: 'API Key 필요',
        description: '먼저 Google Gemini API Key를 설정해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const selectedExpenseAccounts = Array.from(selectedAccounts)
      .filter(account => categorizedAccounts.expenses.includes(account));
    
    if (selectedExpenseAccounts.length === 0) {
      toast({
        title: '오류',
        description: '판관비 계정을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzingExpense(true);
    setExpenseAnalysis('');

    try {
      const monthlyDataText = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const amount = expenseMonthlyTotals[month] || 0;
        return `${month}월: ${amount.toLocaleString()}원`;
      }).join('\n');

      const prompt = `다음은 판관비 계정의 월별 합계 데이터입니다. 재무 분석 전문가의 관점에서 다음을 분석해주세요:

${monthlyDataText}

분석 요청사항:
1. 월별 판관비 추이 패턴 분석 (증가/감소/계절성)
2. 주요 특징 및 특이사항
3. 비용 효율성 평가
4. 개선 제안사항

한국어로 간결하고 전문적으로 작성해주세요.`;

      const result = await analyzeWithFlash(prompt);
      setExpenseAnalysis(result);
    } catch (error: any) {
      console.error('판관비 AI 분석 오류:', error);
      toast({
        title: '분석 실패',
        description: error.message || 'AI 분석 중 오류가 발생했습니다. 콘솔을 확인해주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingExpense(false);
    }
  };

  const analyzeManufacturing = async () => {
    if (!hasApiKey()) {
      toast({
        title: 'API Key 필요',
        description: '먼저 Google Gemini API Key를 설정해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const selectedManufacturingAccounts = Array.from(selectedAccounts)
      .filter(account => categorizedAccounts.manufacturing.includes(account));
    
    if (selectedManufacturingAccounts.length === 0) {
      toast({
        title: '오류',
        description: '제조원가 계정을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzingManufacturing(true);
    setManufacturingAnalysis('');

    try {
      const monthlyDataText = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const amount = manufacturingMonthlyTotals[month] || 0;
        return `${month}월: ${amount.toLocaleString()}원`;
      }).join('\n');

      const prompt = `다음은 제조원가 계정의 월별 합계 데이터입니다. 재무 분석 전문가의 관점에서 다음을 분석해주세요:

${monthlyDataText}

분석 요청사항:
1. 월별 제조원가 추이 패턴 분석 (증가/감소/계절성)
2. 주요 특징 및 특이사항
3. 원가 관리 효율성 평가
4. 개선 제안사항

한국어로 간결하고 전문적으로 작성해주세요.`;

      const result = await analyzeWithFlash(prompt);
      setManufacturingAnalysis(result);
    } catch (error: any) {
      console.error('제조원가 AI 분석 오류:', error);
      toast({
        title: '분석 실패',
        description: error.message || 'AI 분석 중 오류가 발생했습니다. 콘솔을 확인해주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingManufacturing(false);
    }
  };

  const downloadExcel = () => {
    if (selectedAccounts.size === 0) {
      toast({
        title: '오류',
        description: '다운로드할 계정을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [
      ['월별 추이 분석'],
      [],
      ['계정과목', ...Array.from({ length: 12 }, (_, i) => `${i + 1}월`)],
    ];

    Array.from(selectedAccounts).forEach(account => {
      const row: any[] = [account];
      for (let i = 1; i <= 12; i++) {
        row.push(monthlyData[account]?.[i] || 0);
      }
      wsData.push(row);
    });

    wsData.push([]);
    wsData.push(['합계', ...Array.from({ length: 12 }, (_, i) => monthlyTotals[i + 1] || 0)]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 25 }, ...Array(12).fill({ wch: 15 })];
    
    XLSX.utils.book_append_sheet(wb, ws, '월별추이');
    XLSX.writeFile(wb, `월별추이분석_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '월별 추이 분석 결과를 다운로드했습니다.',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                매출/판관비 월별 추이 분석
              </CardTitle>
              <CardDescription className="mt-2">
                매출, 판관비, 제조원가 계정을 선택하고 월별 추이를 시각화합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 계정 선택 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 매출 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">매출 계정</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(categorizedAccounts.sales)}
                  >
                    전체 선택
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {categorizedAccounts.sales.map(account => (
                    <div key={account} className="flex items-center space-x-2">
                      <Checkbox
                        id={`sales-${account}`}
                        checked={selectedAccounts.has(account)}
                        onCheckedChange={() => handleToggleAccount(account)}
                      />
                      <label
                        htmlFor={`sales-${account}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {account}
                      </label>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={analyzeSales}
                  disabled={isAnalyzingSales || Array.from(selectedAccounts).filter(a => categorizedAccounts.sales.includes(a)).length === 0}
                >
                  {isAnalyzingSales ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      분석 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      AI 분석
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* 판관비 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">판관비 계정</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(categorizedAccounts.expenses)}
                  >
                    전체 선택
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {categorizedAccounts.expenses.map(account => (
                    <div key={account} className="flex items-center space-x-2">
                      <Checkbox
                        id={`expense-${account}`}
                        checked={selectedAccounts.has(account)}
                        onCheckedChange={() => handleToggleAccount(account)}
                      />
                      <label
                        htmlFor={`expense-${account}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {account}
                      </label>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={analyzeExpense}
                  disabled={isAnalyzingExpense || Array.from(selectedAccounts).filter(a => categorizedAccounts.expenses.includes(a)).length === 0}
                >
                  {isAnalyzingExpense ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      분석 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      AI 분석
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* 제조원가 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">제조원가 계정</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(categorizedAccounts.manufacturing)}
                  >
                    전체 선택
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {categorizedAccounts.manufacturing.map(account => (
                    <div key={account} className="flex items-center space-x-2">
                      <Checkbox
                        id={`mfg-${account}`}
                        checked={selectedAccounts.has(account)}
                        onCheckedChange={() => handleToggleAccount(account)}
                      />
                      <label
                        htmlFor={`mfg-${account}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {account}
                      </label>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={analyzeManufacturing}
                  disabled={isAnalyzingManufacturing || Array.from(selectedAccounts).filter(a => categorizedAccounts.manufacturing.includes(a)).length === 0}
                >
                  {isAnalyzingManufacturing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      분석 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      AI 분석
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleDeselectAll} variant="outline">
              선택 해제
            </Button>
            <Button onClick={downloadExcel} disabled={selectedAccounts.size === 0}>
              <Download className="mr-2 h-4 w-4" />
              엑셀 다운로드
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 월별 데이터 테이블 */}
      {selectedAccounts.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              월별 추이 ({selectedAccounts.size}개 계정)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">계정과목</TableHead>
                    {Array.from({ length: 12 }, (_, i) => (
                      <TableHead key={i} className="text-right">{i + 1}월</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(selectedAccounts).map(account => (
                    <TableRow key={account}>
                      <TableCell className="font-medium">{account}</TableCell>
                      {Array.from({ length: 12 }, (_, i) => (
                        <TableCell key={i} className="text-right">
                          {(monthlyData[account]?.[i + 1] || 0).toLocaleString()}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted font-bold">
                    <TableCell>합계</TableCell>
                  {Array.from({ length: 12 }, (_, i) => (
                    <TableCell key={i} className="text-right">
                      {(monthlyTotals[i + 1] || 0).toLocaleString()}
                    </TableCell>
                  ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 분석 결과 */}
      {(salesAnalysis || expenseAnalysis || manufacturingAnalysis) && (
        <div className="space-y-4">
          {salesAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  매출 AI 분석 결과
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {salesAnalysis}
                </div>
              </CardContent>
            </Card>
          )}

          {expenseAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  판관비 AI 분석 결과
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {expenseAnalysis}
                </div>
              </CardContent>
            </Card>
          )}

          {manufacturingAnalysis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  제조원가 AI 분석 결과
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {manufacturingAnalysis}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ShoppingCart, DollarSign, AlertTriangle, ExternalLink, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface AccountDetail {
  accountName: string;
  transactions: number;
  amount: number;
}

interface DuplicateVendor {
  vendorName: string;
  salesAccounts: AccountDetail[];
  salesTransactions: number;
  salesAmount: number;
  purchaseAccounts: AccountDetail[];
  purchaseTransactions: number;
  purchaseAmount: number;
  netAmount: number;
}

interface DuplicateVendorAnalysisProps {
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

const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[] } => {
  if (!worksheet) return { data: [], headers: [] };
  
  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet);
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  
  return { data: rawData, headers };
};

export const DuplicateVendorAnalysis: React.FC<DuplicateVendorAnalysisProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [duplicateVendors, setDuplicateVendors] = useState<DuplicateVendor[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<{ accountName: string; vendorName: string; type: 'sales' | 'purchase' } | null>(null);
  const [accountDetails, setAccountDetails] = useState<LedgerRow[]>([]);

  // 매출/매입 계정 찾기
  const relevantAccounts = useMemo(() => {
    // 대변 계정: '매출' 또는 '매출액' 또는 '공사' 또는 '수입'으로 끝나는 계정 (괄호 앞부분 확인)
    const salesAccounts = accountNames.filter(name => {
      // 괄호 앞부분만 추출 (예: "제품매출 (41110)" → "제품매출")
      const nameWithoutCode = name.split(/[\(（]/)[0].trim();
      const normalized = nameWithoutCode.replace(/\s/g, '').trim();
      // '매출', '매출액', '공사', 또는 '수입'으로 끝나는지 확인
      // 또는 특정 계정명 포함 여부 확인 (폐기물처분수입, 스팀판매수입, 자원회수시설운영수입)
      const matches = normalized.endsWith('매출') || 
                      normalized.endsWith('매출액') || 
                      normalized.endsWith('공사') || 
                      normalized.endsWith('수입') ||
                      normalized.includes('폐기물처분수입') ||
                      normalized.includes('스팀판매수입') ||
                      normalized.includes('자원회수시설운영수입');
      if (matches) {
        console.log(`✅ 매출 계정 발견: "${name}" (정리 후: "${normalized}")`);
      }
      return matches;
    });
    
    // 차변 계정: 계정명 뒤 ( )에 오는 숫자가 4xxxx, 5xxxx, 8xxxx로 시작하는 계정만
    const purchaseAccounts = accountNames.filter(name => {
      // 괄호 안의 숫자 추출 (예: "계정명 (41234)" 또는 "계정명(41234)")
      const match = name.match(/[\(（]\s*([0-9]+)\s*[\)）]/);
      if (!match || !match[1]) {
        return false;
      }
      
      const accountCode = match[1];
      // 4xxxx, 5xxxx, 8xxxx로 시작하는지 확인
      const matches = accountCode.startsWith('4') || accountCode.startsWith('5') || accountCode.startsWith('8');
      if (matches) {
        console.log(`✅ 매입 계정 발견: "${name}" (코드: ${accountCode})`);
      }
      return matches;
    });
    
    // 디버깅: 필터링 결과 출력
    console.log('📊 매출/매입 이중거래처 분석 - 필터링 결과:');
    console.log(`  전체 계정 수: ${accountNames.length}`);
    console.log(`  매출 계정 수: ${salesAccounts.length}`, salesAccounts);
    console.log(`  매입 계정 수: ${purchaseAccounts.length}`, purchaseAccounts);
    console.log(`  버튼 활성화 가능: ${salesAccounts.length > 0 && purchaseAccounts.length > 0}`);
    
    return { salesAccounts, purchaseAccounts };
  }, [accountNames]);

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    
    try {
      const vendorMap = new Map<string, DuplicateVendor>();
      
      // 1. 매출 계정 분석 (대변)
      relevantAccounts.salesAccounts.forEach(accountName => {
        const sheet = workbook.Sheets[accountName];
        const { data, headers } = getDataFromSheet(sheet);
        
        const vendorHeader = robustFindHeader(headers, ['거래처', '업체', '회사', 'vendor', 'customer']);
        const creditHeader = robustFindHeader(headers, ['대변', 'credit', '대변금액', '금액']);
        
        if (!vendorHeader || !creditHeader) return;
        
        data.forEach(row => {
          // 전기 데이터 필터링: 전기이월 관련 키워드가 포함된 행 제외
          const isPreviousPeriod = Object.values(row).some(val => {
            if (val === null || val === undefined) return false;
            const str = String(val).trim();
            const normalized = str.replace(/\s/g, '');
            return normalized.includes('전기이월') || 
                   normalized.includes('[전기이월]') ||
                   str.includes('[ 전기이월 ]') ||
                   str.includes('[ 전 기 이 월 ]');
          });
          if (isPreviousPeriod) return;
          
          const vendorName = String(row[vendorHeader] || '').trim();
          const creditAmount = cleanAmount(row[creditHeader]);
          
          // 거래처명이 없거나 금액이 0인 경우만 제외 (마이너스 금액은 포함)
          if (!vendorName || creditAmount === 0) return;
          
          if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, {
              vendorName,
              salesAccounts: [],
              salesTransactions: 0,
              salesAmount: 0,
              purchaseAccounts: [],
              purchaseTransactions: 0,
              purchaseAmount: 0,
              netAmount: 0,
            });
          }
          
          const vendor = vendorMap.get(vendorName)!;
          
          // 계정별 정보 추가 또는 업데이트
          let accountDetail = vendor.salesAccounts.find(acc => acc.accountName === accountName);
          if (!accountDetail) {
            accountDetail = { accountName, transactions: 0, amount: 0 };
            vendor.salesAccounts.push(accountDetail);
          }
          accountDetail.transactions++;
          accountDetail.amount += creditAmount;
          
          // 전체 합계 업데이트
          vendor.salesTransactions++;
          vendor.salesAmount += creditAmount;
        });
      });
      
      // 2. 매입 계정 분석 (차변)
      relevantAccounts.purchaseAccounts.forEach(accountName => {
        const sheet = workbook.Sheets[accountName];
        const { data, headers } = getDataFromSheet(sheet);
        
        const vendorHeader = robustFindHeader(headers, ['거래처', '업체', '회사', 'vendor', 'customer']);
        const debitHeader = robustFindHeader(headers, ['차변', 'debit', '차변금액', '금액']);
        
        if (!vendorHeader || !debitHeader) return;
        
        data.forEach(row => {
          // 전기 데이터 필터링: 전기이월 관련 키워드가 포함된 행 제외
          const isPreviousPeriod = Object.values(row).some(val => {
            if (val === null || val === undefined) return false;
            const str = String(val).trim();
            const normalized = str.replace(/\s/g, '');
            return normalized.includes('전기이월') || 
                   normalized.includes('[전기이월]') ||
                   str.includes('[ 전기이월 ]') ||
                   str.includes('[ 전 기 이 월 ]');
          });
          if (isPreviousPeriod) return;
          
          const vendorName = String(row[vendorHeader] || '').trim();
          const debitAmount = cleanAmount(row[debitHeader]);
          
          // 거래처명이 없거나 금액이 0인 경우만 제외 (마이너스 금액은 포함)
          if (!vendorName || debitAmount === 0) return;
          
          const existingVendor = vendorMap.get(vendorName);
          
          if (existingVendor) {
            // 이미 매출에 있는 거래처 - 매입 정보 추가
            // 계정별 정보 추가 또는 업데이트
            let accountDetail = existingVendor.purchaseAccounts.find(acc => acc.accountName === accountName);
            if (!accountDetail) {
              accountDetail = { accountName, transactions: 0, amount: 0 };
              existingVendor.purchaseAccounts.push(accountDetail);
            }
            accountDetail.transactions++;
            accountDetail.amount += debitAmount;
            
            // 전체 합계 업데이트
            existingVendor.purchaseTransactions++;
            existingVendor.purchaseAmount += debitAmount;
          } else {
            // 매출에 없는 거래처도 매입 정보로 추가 (나중에 매출에서 발견될 수 있음)
            vendorMap.set(vendorName, {
              vendorName,
              salesAccounts: [],
              salesTransactions: 0,
              salesAmount: 0,
              purchaseAccounts: [{ accountName, transactions: 1, amount: debitAmount }],
              purchaseTransactions: 1,
              purchaseAmount: debitAmount,
              netAmount: 0,
            });
          }
        });
      });
      
      // 3. 양쪽에 모두 있는 거래처만 필터링 (마이너스 금액도 포함)
      const duplicateResults = Array.from(vendorMap.values())
        .filter(v => v.salesAmount !== 0 && v.purchaseAmount !== 0)
        .map(v => ({
          ...v,
          netAmount: v.salesAmount - v.purchaseAmount,
        }))
        .sort((a, b) => (b.salesAmount + b.purchaseAmount) - (a.salesAmount + a.purchaseAmount));
      
      setDuplicateVendors(duplicateResults);
      
      if (duplicateResults.length === 0) {
        toast({
          title: '분석 완료',
          description: '이중 거래처가 발견되지 않았습니다.',
        });
      } else {
        toast({
          title: '분석 완료',
          description: `${duplicateResults.length}개의 이중 거래처를 발견했습니다.`,
        });
      }
      
    } catch (err: any) {
      toast({
        title: '오류',
        description: `분석 중 오류: ${err.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                매입/매출 이중거래처 분석
              </CardTitle>
              <CardDescription className="mt-2">
                동일한 거래처가 매출과 매입 양쪽에서 동시에 발생하는 경우를 식별하여 잠재적 위험을 분석합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-4 border border-amber-200 dark:border-amber-800">
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-100">⚠️ 왜 이중거래처가 위험한가요?</p>
              <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300 text-xs">
                <li>매출처와 매입처가 동일한 경우, 허위 거래 또는 자금 세탁의 가능성</li>
                <li>특수관계자 거래 또는 내부 거래의 누락 가능성</li>
                <li>회계 투명성 및 감사 리스크 증가</li>
              </ul>
            </div>
          </div>
          
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-800">
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-blue-900 dark:text-blue-100">📊 분석 대상 계정</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">매출 계정 (대변):</p>
                  <div className="flex flex-wrap gap-1">
                    {relevantAccounts.salesAccounts.map(acc => (
                      <Badge key={acc} variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900">
                        {acc}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">매입 계정 (차변):</p>
                  <div className="flex flex-wrap gap-1">
                    {relevantAccounts.purchaseAccounts.map(acc => (
                      <Badge key={acc} variant="outline" className="text-xs bg-red-100 dark:bg-red-900">
                        {acc}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <Button 
            onClick={handleAnalyze} 
            disabled={isAnalyzing || relevantAccounts.salesAccounts.length === 0 || relevantAccounts.purchaseAccounts.length === 0}
            className="w-full"
          >
            {isAnalyzing ? '분석 중...' : '이중거래처 분석 시작'}
          </Button>
        </CardContent>
      </Card>

      {duplicateVendors.length > 0 && (
        <div className="space-y-4 max-w-[80%] mx-auto">
          {/* 거래처별 매출/매입 비교 그래프 (상위 10개) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-center">거래처별 매출/매입 비교 (상위 10개)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={duplicateVendors
                    .sort((a, b) => Math.max(b.salesAmount, b.purchaseAmount) - Math.max(a.salesAmount, a.purchaseAmount))
                    .slice(0, 10)
                    .map(vendor => ({
                      거래처: vendor.vendorName.length > 10 ? vendor.vendorName.substring(0, 10) + '...' : vendor.vendorName,
                      매출: vendor.salesAmount,
                      매입: vendor.purchaseAmount,
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
                  <Bar dataKey="매출" fill="#3b82f6" name="매출" />
                  <Bar dataKey="매입" fill="#ef4444" name="매입" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">이중거래처 목록 ({duplicateVendors.length}개)</h3>
            <div className="flex items-center gap-2">
            <Badge variant="destructive" className="text-sm">
              ⚠️ 검토 필요
            </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    const wb = XLSX.utils.book_new();
                    
                    // 헤더 정의 (계정별 상세 포함)
                    const headers = [
                      '거래처명',
                      '매출계정',
                      '매출계정별건수',
                      '매출계정별금액',
                      '매출합계건수',
                      '매출합계금액',
                      '매입계정',
                      '매입계정별건수',
                      '매입계정별금액',
                      '매입합계건수',
                      '매입합계금액',
                      '순매출금액'
                    ];
                    
                    // 데이터 준비 (계정별 상세 포함)
                    const exportData: any[] = [];
                    duplicateVendors.forEach(vendor => {
                      const maxAccounts = Math.max(vendor.salesAccounts.length, vendor.purchaseAccounts.length);
                      
                      if (maxAccounts === 0) return;
                      
                      for (let i = 0; i < maxAccounts; i++) {
                        const salesAccount = vendor.salesAccounts[i] || { accountName: '', transactions: 0, amount: 0 };
                        const purchaseAccount = vendor.purchaseAccounts[i] || { accountName: '', transactions: 0, amount: 0 };
                        
                        exportData.push({
                          '거래처명': i === 0 ? vendor.vendorName : '', // 첫 번째 행에만 거래처명 표시
                          '매출계정': salesAccount.accountName,
                          '매출계정별건수': salesAccount.transactions,
                          '매출계정별금액': salesAccount.amount,
                          '매출합계건수': i === 0 ? vendor.salesTransactions : '',
                          '매출합계금액': i === 0 ? vendor.salesAmount : '',
                          '매입계정': purchaseAccount.accountName,
                          '매입계정별건수': purchaseAccount.transactions,
                          '매입계정별금액': purchaseAccount.amount,
                          '매입합계건수': i === 0 ? vendor.purchaseTransactions : '',
                          '매입합계금액': i === 0 ? vendor.purchaseAmount : '',
                          '순매출금액': i === 0 ? vendor.netAmount : ''
                        });
                      }
                    });
                    
                    const ws = XLSX.utils.json_to_sheet(exportData);
                    XLSX.utils.book_append_sheet(wb, ws, '이중거래처분석');
                    
                    const fileName = `이중거래처분석_${new Date().toISOString().split('T')[0]}.xlsx`;
                    XLSX.writeFile(wb, fileName);
                    
                    toast({
                      title: '다운로드 완료',
                      description: '엑셀 파일로 저장했습니다.',
                    });
                  } catch (err: any) {
                    toast({
                      title: '오류',
                      description: `다운로드 중 오류: ${err.message}`,
                      variant: 'destructive',
                    });
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                엑셀 다운로드
              </Button>
            </div>
          </div>
          
          {/* 검토 권장사항 - 상단에 한 번만 표시 */}
          <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    검토 권장사항:
                  </span>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    <li>• 특수관계자 여부 확인</li>
                    <li>• 거래 목적 및 필요성 검토</li>
                    <li>• 가격의 적정성 평가 (정상가격 유지 여부)</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 gap-3">
            {duplicateVendors.map((vendor, idx) => (
              <Card key={idx} className="hover:shadow-lg transition-shadow border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-2 bg-amber-50 dark:bg-amber-950">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      {vendor.vendorName}
                    </CardTitle>
                    <Badge variant={Math.abs(vendor.netAmount) > vendor.salesAmount * 0.5 ? "destructive" : "secondary"} className="text-xs">
                      순매출: ₩{vendor.netAmount.toLocaleString()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* 매입 (왼쪽) */}
                    <div 
                      className="space-y-1.5 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                      onClick={() => {
                        // 모든 매입 계정에서 해당 거래처의 거래 내역 수집
                        const allPurchaseData: LedgerRow[] = [];
                        relevantAccounts.purchaseAccounts.forEach(accountName => {
                          const sheet = workbook.Sheets[accountName];
                          const { data } = getDataFromSheet(sheet);
                          const vendorHeader = robustFindHeader(Object.keys(data[0] || {}), ['거래처', '업체', '회사', 'vendor', 'customer']);
                          if (vendorHeader) {
                            const filteredData = data.filter(row => 
                              String(row[vendorHeader] || '').trim() === vendor.vendorName
                            );
                            allPurchaseData.push(...filteredData);
                          }
                        });
                        setAccountDetails(allPurchaseData);
                        setSelectedAccount({ accountName: vendor.purchaseAccounts.length > 0 ? vendor.purchaseAccounts.map(a => a.accountName).join(', ') : '모든 매입 계정', vendorName: vendor.vendorName, type: 'purchase' });
                      }}
                    >
                      <div className="flex items-center gap-1.5 text-red-700 dark:text-red-300">
                        <ShoppingCart className="h-3.5 w-3.5" />
                        <span className="font-semibold text-xs">매입 (공급자)</span>
                        <ExternalLink className="h-2.5 w-2.5 ml-auto" />
                      </div>
                      <div className="space-y-1">
                        {/* 계정별 상세 정보 */}
                        {vendor.purchaseAccounts.length > 0 ? (
                          <div className="space-y-1">
                            {vendor.purchaseAccounts.map((account, accIdx) => (
                              <div key={accIdx} className="text-xs border-b border-red-200 dark:border-red-800 pb-1 last:border-0">
                                <div className="text-red-600 dark:text-red-400 font-medium">{account.accountName}</div>
                                <div className="text-red-700 dark:text-red-300">
                                  ₩{account.amount.toLocaleString()} ({account.transactions}건)
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-red-600 dark:text-red-400">계정 정보 없음</div>
                        )}
                        {/* 합계 정보 */}
                        <div className="mt-2 pt-2 border-t border-red-300 dark:border-red-700">
                          <div className="text-lg font-bold text-red-900 dark:text-red-100">
                            합계: ₩{vendor.purchaseAmount.toLocaleString()}
                          </div>
                          <div 
                            className="text-xs text-red-600 dark:text-red-400 cursor-pointer hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              // 모든 매입 계정에서 해당 거래처의 거래 내역 수집
                              const allPurchaseData: LedgerRow[] = [];
                              relevantAccounts.purchaseAccounts.forEach(accountName => {
                                const sheet = workbook.Sheets[accountName];
                                const { data } = getDataFromSheet(sheet);
                                const vendorHeader = robustFindHeader(Object.keys(data[0] || {}), ['거래처', '업체', '회사', 'vendor', 'customer']);
                                if (vendorHeader) {
                                  const filteredData = data.filter(row => 
                                    String(row[vendorHeader] || '').trim() === vendor.vendorName
                                  );
                                  allPurchaseData.push(...filteredData);
                                }
                              });
                              setAccountDetails(allPurchaseData);
                              setSelectedAccount({ accountName: vendor.purchaseAccounts.length > 0 ? vendor.purchaseAccounts.map(a => a.accountName).join(', ') : '모든 매입 계정', vendorName: vendor.vendorName, type: 'purchase' });
                            }}
                          >
                            총 {vendor.purchaseTransactions.toLocaleString()}건 (클릭하여 상세보기)
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* 매출 (오른쪽) */}
                    <div 
                      className="space-y-1.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                      onClick={() => {
                        // 모든 매출 계정에서 해당 거래처의 거래 내역 수집
                        const allSalesData: LedgerRow[] = [];
                        relevantAccounts.salesAccounts.forEach(accountName => {
                          const sheet = workbook.Sheets[accountName];
                          const { data } = getDataFromSheet(sheet);
                          const vendorHeader = robustFindHeader(Object.keys(data[0] || {}), ['거래처', '업체', '회사', 'vendor', 'customer']);
                          if (vendorHeader) {
                            const filteredData = data.filter(row => 
                              String(row[vendorHeader] || '').trim() === vendor.vendorName
                            );
                            allSalesData.push(...filteredData);
                          }
                        });
                        setAccountDetails(allSalesData);
                        setSelectedAccount({ accountName: vendor.salesAccounts.length > 0 ? vendor.salesAccounts.map(a => a.accountName).join(', ') : '모든 매출 계정', vendorName: vendor.vendorName, type: 'sales' });
                      }}
                    >
                      <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span className="font-semibold text-xs">매출 (고객)</span>
                        <ExternalLink className="h-2.5 w-2.5 ml-auto" />
                      </div>
                      <div className="space-y-1">
                        {/* 계정별 상세 정보 */}
                        {vendor.salesAccounts.length > 0 ? (
                          <div className="space-y-1">
                            {vendor.salesAccounts.map((account, accIdx) => (
                              <div key={accIdx} className="text-xs border-b border-blue-200 dark:border-blue-800 pb-1 last:border-0">
                                <div className="text-blue-600 dark:text-blue-400 font-medium">{account.accountName}</div>
                                <div className="text-blue-700 dark:text-blue-300">
                                  ₩{account.amount.toLocaleString()} ({account.transactions}건)
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-blue-600 dark:text-blue-400">계정 정보 없음</div>
                        )}
                        {/* 합계 정보 */}
                        <div className="mt-2 pt-2 border-t border-blue-300 dark:border-blue-700">
                          <div className="text-lg font-bold text-blue-900 dark:text-blue-100">
                            합계: ₩{vendor.salesAmount.toLocaleString()}
                          </div>
                          <div 
                            className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              // 모든 매출 계정에서 해당 거래처의 거래 내역 수집
                              const allSalesData: LedgerRow[] = [];
                              relevantAccounts.salesAccounts.forEach(accountName => {
                                const sheet = workbook.Sheets[accountName];
                                const { data } = getDataFromSheet(sheet);
                                const vendorHeader = robustFindHeader(Object.keys(data[0] || {}), ['거래처', '업체', '회사', 'vendor', 'customer']);
                                if (vendorHeader) {
                                  const filteredData = data.filter(row => 
                                    String(row[vendorHeader] || '').trim() === vendor.vendorName
                                  );
                                  allSalesData.push(...filteredData);
                                }
                              });
                              setAccountDetails(allSalesData);
                              setSelectedAccount({ accountName: vendor.salesAccounts.length > 0 ? vendor.salesAccounts.map(a => a.accountName).join(', ') : '모든 매출 계정', vendorName: vendor.vendorName, type: 'sales' });
                            }}
                          >
                            총 {vendor.salesTransactions.toLocaleString()}건 (클릭하여 상세보기)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 계정별원장 상세내역 Dialog */}
      <Dialog open={selectedAccount !== null} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>
                  {selectedAccount?.type === 'sales' ? '매출' : '매입'} 계정별원장 상세내역 - {selectedAccount?.accountName}
                </DialogTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  거래처: {selectedAccount?.vendorName}
                </div>
              </div>
              {accountDetails.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      const wb = XLSX.utils.book_new();
                      
                      // 데이터 준비 (컬럼 순서: 날짜|적요란|코드|거래처|차변|대변|잔액 순서로)
                      const allKeys = accountDetails.length > 0 ? Object.keys(accountDetails[0]) : [];
                      
                      // 차변 컬럼 찾기 (유연한 매칭)
                      const debitKey = allKeys.find(k => 
                        k.includes('차변') || 
                        k.toLowerCase().includes('debit') ||
                        k === '차변금액'
                      );
                      
                      // 대변 컬럼 찾기
                      const creditKey = allKeys.find(k => 
                        k.includes('대변') || 
                        k.toLowerCase().includes('credit') ||
                        k === '대변금액'
                      );
                      
                      // 잔액 컬럼 찾기
                      const balanceKey = allKeys.find(k => 
                        k.includes('잔액') || 
                        k.toLowerCase().includes('balance')
                      );
                      
                      // 우선순위 순서: 날짜, 적요란, 코드, 거래처, 차변, 대변, 잔액
                      const preferredOrder = [
                        '날짜', '적요란', '코드', '거래처',
                        debitKey || '차변',
                        creditKey || '대변',
                        balanceKey || '잔액'
                      ];
                      
                      const orderedKeys = [
                        ...preferredOrder.filter(key => allKeys.includes(key)),
                        ...allKeys.filter(key => !preferredOrder.includes(key))
                      ];
                      
                      const exportData = accountDetails.map(row => {
                        const obj: { [key: string]: any } = {};
                        orderedKeys.forEach(key => {
                          const val = row[key];
                          if (val instanceof Date) {
                            obj[key] = val.toLocaleDateString('ko-KR');
                          } else {
                            obj[key] = val ?? '';
                          }
                        });
                        return obj;
                      });
                      
                      const ws = XLSX.utils.json_to_sheet(exportData);
                      XLSX.utils.book_append_sheet(wb, ws, '상세내역');
                      
                      // 파일명 생성
                      const accountType = selectedAccount?.type === 'sales' ? '매출' : '매입';
                      const fileName = `${accountType}_${selectedAccount?.accountName}_${selectedAccount?.vendorName}_${new Date().toISOString().split('T')[0]}.xlsx`;
                      
                      XLSX.writeFile(wb, fileName);
                      
                      toast({
                        title: '다운로드 완료',
                        description: '엑셀 파일로 저장했습니다.',
                      });
                    } catch (err: any) {
                      toast({
                        title: '오류',
                        description: `다운로드 중 오류: ${err.message}`,
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  엑셀 다운로드
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="mt-4">
            {accountDetails.length > 0 ? (
              <div className="rounded-md border">
                {(() => {
                  // 디버깅: 실제 컬럼 이름 확인
                  if (accountDetails.length > 0) {
                    const allKeys = Object.keys(accountDetails[0] || {});
                    console.log('=== 상세보기 컬럼 정보 ===');
                    console.log('전체 컬럼 목록:', allKeys);
                    console.log('차변 관련 컬럼:', allKeys.filter(k => k.includes('차변') || k.toLowerCase().includes('debit')));
                    console.log('대변 관련 컬럼:', allKeys.filter(k => k.includes('대변') || k.toLowerCase().includes('credit')));
                    console.log('잔액 관련 컬럼:', allKeys.filter(k => k.includes('잔액') || k.toLowerCase().includes('balance')));
                    console.log('첫 번째 행 샘플:', accountDetails[0]);
                  }
                  return null;
                })()}
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(() => {
                        // 컬럼 순서 정의: 날짜|적요란|코드|거래처|차변|대변|잔액 순서로 표시
                        const allKeys = Object.keys(accountDetails[0] || {});
                        
                        // 차변 컬럼 찾기 (유연한 매칭)
                        const debitKey = allKeys.find(k => 
                          k.includes('차변') || 
                          k.toLowerCase().includes('debit') ||
                          k === '차변금액'
                        );
                        
                        // 대변 컬럼 찾기
                        const creditKey = allKeys.find(k => 
                          k.includes('대변') || 
                          k.toLowerCase().includes('credit') ||
                          k === '대변금액'
                        );
                        
                        // 잔액 컬럼 찾기
                        const balanceKey = allKeys.find(k => 
                          k.includes('잔액') || 
                          k.toLowerCase().includes('balance')
                        );
                        
                        // 우선순위 순서: 날짜, 적요란, 코드, 거래처, 차변, 대변, 잔액
                        const preferredOrder = [
                          '날짜', '적요란', '코드', '거래처',
                          debitKey || '차변',
                          creditKey || '대변',
                          balanceKey || '잔액'
                        ];
                        
                        const orderedKeys = [
                          ...preferredOrder.filter(key => allKeys.includes(key)),
                          ...allKeys.filter(key => !preferredOrder.includes(key))
                        ];
                        
                        return orderedKeys.map(key => (
                          <TableHead key={key}>{key}</TableHead>
                        ));
                      })()}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountDetails.map((row, idx) => (
                      <TableRow key={idx}>
                        {(() => {
                          // 컬럼 순서 정의: 날짜|적요란|코드|거래처|차변|대변|잔액 순서로 표시
                          const allKeys = Object.keys(row);
                          
                          // 차변 컬럼 찾기 (유연한 매칭)
                          const debitKey = allKeys.find(k => 
                            k.includes('차변') || 
                            k.toLowerCase().includes('debit') ||
                            k === '차변금액'
                          );
                          
                          // 대변 컬럼 찾기
                          const creditKey = allKeys.find(k => 
                            k.includes('대변') || 
                            k.toLowerCase().includes('credit') ||
                            k === '대변금액'
                          );
                          
                          // 잔액 컬럼 찾기
                          const balanceKey = allKeys.find(k => 
                            k.includes('잔액') || 
                            k.toLowerCase().includes('balance')
                          );
                          
                          // 우선순위 순서: 날짜, 적요란, 코드, 거래처, 차변, 대변, 잔액
                          const preferredOrder = [
                            '날짜', '적요란', '코드', '거래처',
                            debitKey || '차변',
                            creditKey || '대변',
                            balanceKey || '잔액'
                          ];
                          
                          const orderedKeys = [
                            ...preferredOrder.filter(key => allKeys.includes(key)),
                            ...allKeys.filter(key => !preferredOrder.includes(key))
                          ];
                          
                          return orderedKeys.map((key, j) => (
                            <TableCell key={j} className="text-sm">
                              {row[key] instanceof Date ? row[key].toLocaleDateString() : String(row[key] ?? '')}
                            </TableCell>
                          ));
                        })()}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                상세내역이 없습니다.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ShoppingCart, DollarSign, AlertTriangle } from 'lucide-react';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface DuplicateVendor {
  vendorName: string;
  salesAccount: string;
  salesTransactions: number;
  salesAmount: number;
  purchaseAccount: string;
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

  // 매출/매입 계정 찾기
  const relevantAccounts = useMemo(() => {
    const salesAccounts = accountNames.filter(name => 
      name.includes('매출') || name.includes('수익') || name.includes('판매')
    );
    
    const purchaseAccounts = accountNames.filter(name => 
      (name.includes('매입') || name.includes('구매') || name.includes('원재료')) &&
      !name.includes('매입채무') && !name.includes('외상매입')
    );
    
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
          const vendorName = String(row[vendorHeader] || '').trim();
          const creditAmount = cleanAmount(row[creditHeader]);
          
          if (!vendorName || creditAmount <= 0) return;
          
          if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, {
              vendorName,
              salesAccount: accountName,
              salesTransactions: 0,
              salesAmount: 0,
              purchaseAccount: '',
              purchaseTransactions: 0,
              purchaseAmount: 0,
              netAmount: 0,
            });
          }
          
          const vendor = vendorMap.get(vendorName)!;
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
          const vendorName = String(row[vendorHeader] || '').trim();
          const debitAmount = cleanAmount(row[debitHeader]);
          
          if (!vendorName || debitAmount <= 0) return;
          
          const existingVendor = vendorMap.get(vendorName);
          
          if (existingVendor) {
            // 이미 매출에 있는 거래처
            existingVendor.purchaseAccount = accountName;
            existingVendor.purchaseTransactions++;
            existingVendor.purchaseAmount += debitAmount;
          }
        });
      });
      
      // 3. 양쪽에 모두 있는 거래처만 필터링
      const duplicateResults = Array.from(vendorMap.values())
        .filter(v => v.salesAmount > 0 && v.purchaseAmount > 0)
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">이중거래처 목록 ({duplicateVendors.length}개)</h3>
            <Badge variant="destructive" className="text-sm">
              ⚠️ 검토 필요
            </Badge>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {duplicateVendors.map((vendor, idx) => (
              <Card key={idx} className="hover:shadow-lg transition-shadow border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-3 bg-amber-50 dark:bg-amber-950">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      {vendor.vendorName}
                    </CardTitle>
                    <Badge variant={Math.abs(vendor.netAmount) > vendor.salesAmount * 0.5 ? "destructive" : "secondary"}>
                      순매출: ₩{vendor.netAmount.toLocaleString()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* 매출 (왼쪽) */}
                    <div className="space-y-2 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-semibold text-sm">매출 (고객)</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-blue-600 dark:text-blue-400">{vendor.salesAccount}</div>
                        <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                          ₩{vendor.salesAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                          {vendor.salesTransactions.toLocaleString()}건
                        </div>
                      </div>
                    </div>
                    
                    {/* 매입 (오른쪽) */}
                    <div className="space-y-2 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                        <ShoppingCart className="h-4 w-4" />
                        <span className="font-semibold text-sm">매입 (공급자)</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-red-600 dark:text-red-400">{vendor.purchaseAccount}</div>
                        <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                          ₩{vendor.purchaseAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-400">
                          {vendor.purchaseTransactions.toLocaleString()}건
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 위험도 평가 */}
                  <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                          검토 권장사항:
                        </span>
                        <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                          <li>• 특수관계자 여부 확인</li>
                          <li>• 거래 목적 및 필요성 검토</li>
                          <li>• 가격의 적정성 평가 (정상가격 유지 여부)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

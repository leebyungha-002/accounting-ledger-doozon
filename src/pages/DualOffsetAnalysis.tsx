import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Download, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { findDebitCreditHeaders } from '@/lib/headerUtils';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface OffsetVendor {
  vendorName: string;
  debitAccount: string;
  debitTransactions: number;
  debitAmount: number;
  creditAccount: string;
  creditTransactions: number;
  creditAmount: number;
  netAmount: number;
}

interface DualOffsetAnalysisProps {
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

export const DualOffsetAnalysis: React.FC<DualOffsetAnalysisProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [offsetVendors, setOffsetVendors] = useState<OffsetVendor[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<{ accountName: string; vendorName: string; type: 'debit' | 'credit' } | null>(null);
  const [accountDetails, setAccountDetails] = useState<LedgerRow[]>([]);

  // 외상매출금 차변, 외상매입금/미지급금/미지급비용 대변 찾기
  const relevantAccounts = useMemo(() => {
    // 차변 계정: 외상매출금만
    const debitAccounts = accountNames.filter(name => {
      const normalized = name.replace(/\s/g, '').toLowerCase();
      return normalized.includes('외상매출금');
    });
    
    // 대변 계정: 외상매입금, 미지급금, 미지급비용만
    const creditAccounts = accountNames.filter(name => {
      const normalized = name.replace(/\s/g, '').toLowerCase();
      return (
        normalized.includes('외상매입금') ||
        normalized.includes('미지급금') ||
        normalized.includes('미지급비용')
      );
    });
    
    return { debitAccounts, creditAccounts };
  }, [accountNames]);

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    
    try {
      const vendorMap = new Map<string, OffsetVendor>();
      
      // 1. 차변 계정 (외상매출금 등) 분석
      relevantAccounts.debitAccounts.forEach(accountName => {
        const sheet = workbook.Sheets[accountName];
        const { data, headers } = getDataFromSheet(sheet);
        
        const vendorHeader = robustFindHeader(headers, ['거래처', '업체', '회사', 'vendor', 'customer']);
        const dateHeader = headers.find(h => h.includes('일자') || h.includes('날짜'));
        const { debitHeader } = findDebitCreditHeaders(headers, data, dateHeader);
        
        if (!vendorHeader || !debitHeader) return;
        
        data.forEach(row => {
          const vendorName = String(row[vendorHeader] || '').trim();
          const debitAmount = cleanAmount(row[debitHeader]);
          
          if (!vendorName || debitAmount <= 0) return;
          
          if (!vendorMap.has(vendorName)) {
            vendorMap.set(vendorName, {
              vendorName,
              debitAccount: accountName,
              debitTransactions: 0,
              debitAmount: 0,
              creditAccount: '',
              creditTransactions: 0,
              creditAmount: 0,
              netAmount: 0,
            });
          }
          
          const vendor = vendorMap.get(vendorName)!;
          vendor.debitTransactions++;
          vendor.debitAmount += debitAmount;
        });
      });
      
      // 2. 대변 계정 (외상매입금/미지급금 등) 분석
      relevantAccounts.creditAccounts.forEach(accountName => {
        const sheet = workbook.Sheets[accountName];
        const { data, headers } = getDataFromSheet(sheet);
        
        const vendorHeader = robustFindHeader(headers, ['거래처', '업체', '회사', 'vendor', 'customer']);
        const dateHeader = headers.find(h => h.includes('일자') || h.includes('날짜'));
        const { creditHeader } = findDebitCreditHeaders(headers, data, dateHeader);
        
        if (!vendorHeader || !creditHeader) return;
        
        data.forEach(row => {
          const vendorName = String(row[vendorHeader] || '').trim();
          const creditAmount = cleanAmount(row[creditHeader]);
          
          if (!vendorName || creditAmount <= 0) return;
          
          const existingVendor = vendorMap.get(vendorName);
          
          if (existingVendor) {
            // 이미 차변에 있는 거래처
            existingVendor.creditAccount = accountName;
            existingVendor.creditTransactions++;
            existingVendor.creditAmount += creditAmount;
          }
        });
      });
      
      // 3. 양쪽에 모두 있는 거래처만 필터링
      const offsetResults = Array.from(vendorMap.values())
        .filter(v => v.debitAmount > 0 && v.creditAmount > 0)
        .map(v => ({
          ...v,
          netAmount: v.debitAmount - v.creditAmount,
        }))
        .sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));
      
      setOffsetVendors(offsetResults);
      
      if (offsetResults.length === 0) {
        toast({
          title: '분석 완료',
          description: '상계 가능한 거래처가 발견되지 않았습니다.',
        });
      } else {
        toast({
          title: '분석 완료',
          description: `${offsetResults.length}개의 상계 거래처를 발견했습니다.`,
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
                외상매출/매입 상계 거래처 분석
              </CardTitle>
              <CardDescription className="mt-2">
                외상매출금(차변)과 외상매입금/미지급금/미지급비용(대변)에 동시에 나타나는 거래처를 찾아 유상사급거래가 있는 지 상계가능거래가 있는지 여부를 검토합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4 border border-blue-200 dark:border-blue-800">
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-blue-900 dark:text-blue-100">📊 분석 대상 계정</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">차변 계정 (외상매출금):</p>
                  <div className="flex flex-wrap gap-1">
                    {relevantAccounts.debitAccounts.map(acc => (
                      <Badge key={acc} variant="outline" className="text-xs bg-green-100 dark:bg-green-900">
                        {acc}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-1">대변 계정 (외상매입금/미지급금/미지급비용):</p>
                  <div className="flex flex-wrap gap-1">
                    {relevantAccounts.creditAccounts.map(acc => (
                      <Badge key={acc} variant="outline" className="text-xs bg-orange-100 dark:bg-orange-900">
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
            disabled={isAnalyzing || relevantAccounts.debitAccounts.length === 0 || relevantAccounts.creditAccounts.length === 0}
            className="w-full"
          >
            {isAnalyzing ? '분석 중...' : '상계 거래처 분석 시작'}
          </Button>
        </CardContent>
      </Card>

      {offsetVendors.length > 0 && (
        <div className="space-y-4 max-w-[80%] mx-auto">
          {/* 거래처별 차변/대변 비교 그래프 (상위 10개) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-center">거래처별 차변/대변 비교 (상위 10개)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={offsetVendors
                    .sort((a, b) => Math.max(b.debitAmount, b.creditAmount) - Math.max(a.debitAmount, a.creditAmount))
                    .slice(0, 10)
                    .map(vendor => ({
                      거래처: vendor.vendorName.length > 10 ? vendor.vendorName.substring(0, 10) + '...' : vendor.vendorName,
                      차변: vendor.debitAmount,
                      대변: vendor.creditAmount,
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
                  <Bar dataKey="차변" fill="#22c55e" name="차변 (받을금액)" />
                  <Bar dataKey="대변" fill="#f97316" name="대변 (지급금액)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">상계 거래처 목록 ({offsetVendors.length}개)</h3>
            <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm">
              총 상계 가능 금액: ₩{offsetVendors.reduce((sum, v) => sum + Math.min(v.debitAmount, v.creditAmount), 0).toLocaleString()}
            </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    const wb = XLSX.utils.book_new();
                    
                    // 헤더 정의
                    const headers = [
                      '거래처명',
                      '차변계정',
                      '차변거래건수',
                      '차변금액',
                      '대변계정',
                      '대변거래건수',
                      '대변금액',
                      '순액',
                      '상계가능금액'
                    ];
                    
                    // 데이터 준비
                    const exportData = offsetVendors.map(vendor => ({
                      '거래처명': vendor.vendorName,
                      '차변계정': vendor.debitAccount,
                      '차변거래건수': vendor.debitTransactions,
                      '차변금액': vendor.debitAmount,
                      '대변계정': vendor.creditAccount,
                      '대변거래건수': vendor.creditTransactions,
                      '대변금액': vendor.creditAmount,
                      '순액': vendor.netAmount,
                      '상계가능금액': Math.min(vendor.debitAmount, vendor.creditAmount)
                    }));
                    
                    const ws = XLSX.utils.json_to_sheet(exportData);
                    XLSX.utils.book_append_sheet(wb, ws, '외상매출매입분석');
                    
                    const fileName = `외상매출매입분석_${new Date().toISOString().split('T')[0]}.xlsx`;
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
          
          <div className="grid grid-cols-1 gap-3">
            {offsetVendors.map((vendor, idx) => (
              <Card key={idx} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{vendor.vendorName}</CardTitle>
                    <Badge variant={Math.abs(vendor.netAmount) > 1000000 ? "destructive" : "secondary"} className="text-xs">
                      순액: ₩{vendor.netAmount.toLocaleString()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {/* 차변 (왼쪽) */}
                    <div 
                      className="space-y-1.5 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                      onClick={() => {
                        const sheet = workbook.Sheets[vendor.debitAccount];
                        const { data } = getDataFromSheet(sheet);
                        const vendorHeader = robustFindHeader(Object.keys(data[0] || {}), ['거래처', '업체', '회사', 'vendor', 'customer']);
                        if (vendorHeader) {
                          const filteredData = data.filter(row => 
                            String(row[vendorHeader] || '').trim() === vendor.vendorName
                          );
                          setAccountDetails(filteredData);
                          setSelectedAccount({ accountName: vendor.debitAccount, vendorName: vendor.vendorName, type: 'debit' });
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5 text-green-700 dark:text-green-300">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="font-semibold text-xs">차변 (받을금액)</span>
                        <ExternalLink className="h-2.5 w-2.5 ml-auto" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-xs text-green-600 dark:text-green-400 font-medium hover:underline">{vendor.debitAccount}</div>
                        <div className="text-xl font-bold text-green-900 dark:text-green-100">
                          ₩{vendor.debitAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400">
                          {vendor.debitTransactions.toLocaleString()}건
                        </div>
                      </div>
                    </div>
                    
                    {/* 대변 (오른쪽) */}
                    <div 
                      className="space-y-1.5 p-3 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900 transition-colors"
                      onClick={() => {
                        const sheet = workbook.Sheets[vendor.creditAccount];
                        const { data } = getDataFromSheet(sheet);
                        const vendorHeader = robustFindHeader(Object.keys(data[0] || {}), ['거래처', '업체', '회사', 'vendor', 'customer']);
                        if (vendorHeader) {
                          const filteredData = data.filter(row => 
                            String(row[vendorHeader] || '').trim() === vendor.vendorName
                          );
                          setAccountDetails(filteredData);
                          setSelectedAccount({ accountName: vendor.creditAccount, vendorName: vendor.vendorName, type: 'credit' });
                        }
                      }}
                    >
                      <div className="flex items-center gap-1.5 text-orange-700 dark:text-orange-300">
                        <TrendingDown className="h-3.5 w-3.5" />
                        <span className="font-semibold text-xs">대변 (지급금액)</span>
                        <ExternalLink className="h-2.5 w-2.5 ml-auto" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-xs text-orange-600 dark:text-orange-400 font-medium hover:underline">{vendor.creditAccount}</div>
                        <div className="text-xl font-bold text-orange-900 dark:text-orange-100">
                          ₩{vendor.creditAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-orange-600 dark:text-orange-400">
                          {vendor.creditTransactions.toLocaleString()}건
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 상계 가능 금액 */}
                  <div className="mt-3 p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-purple-900 dark:text-purple-100">
                        상계 가능 금액:
                      </span>
                      <span className="text-base font-bold text-purple-900 dark:text-purple-100">
                        ₩{Math.min(vendor.debitAmount, vendor.creditAmount).toLocaleString()}
                      </span>
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
                  {selectedAccount?.type === 'debit' ? '차변' : '대변'} 계정별원장 상세내역 - {selectedAccount?.accountName}
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
                      
                      // 데이터 준비
                      const exportData = accountDetails.map(row => {
                        const obj: { [key: string]: any } = {};
                        Object.keys(row).forEach(key => {
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
                      const accountType = selectedAccount?.type === 'debit' ? '차변' : '대변';
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(accountDetails[0] || {}).map(key => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountDetails.map((row, idx) => (
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

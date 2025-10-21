import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const MonthlyPLAnalysis = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        navigate('/');
        return;
      }
      await loadLatestLedger(session.session.user.id);
    } catch (error) {
      console.error('Error checking auth:', error);
      toast({
        title: '오류',
        description: '인증 확인 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadLatestLedger = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('general_ledgers')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setLedgerData((data.data as any[]) || []);
      }
    } catch (error) {
      console.error('Error loading ledger:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const expenseAccounts = useMemo(() => {
    const accounts = new Set<string>();
    ledgerData.forEach((row) => {
      const sheetName = row['시트명'] || row['계정과목'] || row['계정명'];
      if (sheetName && (
        sheetName.includes('판매비') || 
        sheetName.includes('관리비') ||
        sheetName.includes('급여') ||
        sheetName.includes('복리후생비') ||
        sheetName.includes('여비교통비') ||
        sheetName.includes('접대비') ||
        sheetName.includes('통신비') ||
        sheetName.includes('세금과공과') ||
        sheetName.includes('감가상각비') ||
        sheetName.includes('지급임차료') ||
        sheetName.includes('수선비') ||
        sheetName.includes('보험료') ||
        sheetName.includes('차량유지비') ||
        sheetName.includes('운반비') ||
        sheetName.includes('소모품비') ||
        sheetName.includes('도서인쇄비') ||
        sheetName.includes('수도광열비')
      )) {
        accounts.add(sheetName);
      }
    });
    return Array.from(accounts).sort();
  }, [ledgerData]);

  const monthlyData = useMemo(() => {
    const data: { [account: string]: { [month: number]: number } } = {};
    
    selectedAccounts.forEach(account => {
      data[account] = {};
      for (let i = 1; i <= 12; i++) {
        data[account][i] = 0;
      }
    });

    // 첫 번째 행의 필드명 확인
    if (ledgerData.length > 0) {
      console.log('데이터 필드명:', Object.keys(ledgerData[0]));
      console.log('첫 번째 데이터 샘플:', ledgerData[0]);
    }

    ledgerData.forEach((row, index) => {
      const sheetName = row['시트명'] || row['계정과목'] || row['계정명'];
      if (!selectedAccounts.has(sheetName)) return;

      // 날짜 필드 찾기 - 모든 가능한 필드명 확인
      const dateStr = row['전표일자'] || row['일자'] || row['거래일자'] || row['날짜'];
      
      if (index < 3) {
        console.log(`행 ${index} - 시트명: ${sheetName}, 날짜: ${dateStr}, 차변: ${row['차변금액']}, 대변: ${row['대변금액']}`);
      }

      if (!dateStr) return;

      let month: number | null = null;
      
      // 날짜 형식 파싱 개선
      if (typeof dateStr === 'string') {
        if (dateStr.includes('-')) {
          const parts = dateStr.split('-');
          if (parts.length >= 2) {
            month = parseInt(parts[1], 10);
          }
        } else if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          if (parts.length >= 2) {
            month = parseInt(parts[1], 10);
          }
        } else if (dateStr.length === 8) {
          // YYYYMMDD 형식
          month = parseInt(dateStr.substring(4, 6), 10);
        }
      }

      if (month && month >= 1 && month <= 12) {
        // 금액 필드 찾기 - 더 많은 가능성 확인
        const debit = parseFloat(row['차변금액'] || row['차변'] || row['차변(원)'] || 0);
        const credit = parseFloat(row['대변금액'] || row['대변'] || row['대변(원)'] || 0);
        const amount = debit || credit || 0;
        
        if (index < 3 && amount > 0) {
          console.log(`합계 추가 - 계정: ${sheetName}, 월: ${month}, 금액: ${amount}`);
        }
        
        if (amount > 0) {
          data[sheetName][month] += amount;
        }
      }
    });

    console.log('최종 월별 데이터:', data);
    return data;
  }, [ledgerData, selectedAccounts]);

  const toggleAccount = (account: string) => {
    setSelectedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(account)) {
        newSet.delete(account);
      } else {
        newSet.add(account);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            돌아가기
          </Button>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">월별 손익분석</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>판매비와관리비</CardTitle>
                <CardDescription>분석할 계정을 선택하세요</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {expenseAccounts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        판매비와관리비 계정이 없습니다
                      </p>
                    ) : (
                      expenseAccounts.map((account) => (
                        <div key={account} className="flex items-center space-x-2">
                          <Checkbox
                            id={account}
                            checked={selectedAccounts.has(account)}
                            onCheckedChange={() => toggleAccount(account)}
                          />
                          <label
                            htmlFor={account}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {account}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>월별 합계금액</CardTitle>
                <CardDescription>
                  선택된 계정의 월별 금액을 확인하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedAccounts.size === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    왼쪽에서 계정을 선택하세요
                  </p>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">계정명</TableHead>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                            <TableHead key={month} className="font-semibold text-right">
                              {month}월
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from(selectedAccounts).map(account => (
                          <TableRow key={account}>
                            <TableCell className="font-medium">{account}</TableCell>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                              <TableCell key={month} className="text-right">
                                {monthlyData[account]?.[month]?.toLocaleString() || '0'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MonthlyPLAnalysis;

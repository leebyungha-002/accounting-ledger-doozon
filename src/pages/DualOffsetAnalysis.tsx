import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowLeft, AlertTriangle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DualOffsetAnalysis = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadLatestLedger();
  }, []);

  const loadLatestLedger = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        navigate('/');
        return;
      }

      const { data, error } = await supabase
        .from('general_ledgers')
        .select('*')
        .eq('user_id', session.session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setLedgerData((data.data as any[]) || []);
      } else {
        toast({
          title: '데이터 없음',
          description: '먼저 계정별원장을 업로드해주세요.',
          variant: 'destructive',
        });
        navigate('/');
      }
    } catch (error) {
      console.error('Error loading ledger:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 거래처 정보 추출 (거래처, 거래처명, 적요 등의 필드에서)
  const extractClient = (row: any): string | null => {
    const clientFields = ['거래처', '거래처명', '거래처코드', '적요'];
    for (const field of clientFields) {
      if (row[field] && String(row[field]).trim()) {
        return String(row[field]).trim();
      }
    }
    return null;
  };

  // 매출/비용 이중 거래처 분석
  const salesExpenseDualClients = useMemo(() => {
    const salesAccounts = ['매출', '제품매출', '상품매출', '용역매출'];
    const expenseAccounts = ['판매비', '관리비', '판매비와관리비', '급여', '복리후생비', '접대비', '통신비', '지급수수료', '광고선전비', '광고비', '운반비', '수선비', '소모품비', '도서인쇄비', '차량유지비', '여비교통비', '세금과공과', '감가상각비', '보험료', '임차료', '수도광열비'];

    const clientsByAccount = new Map<string, Set<string>>();

    ledgerData.forEach((row, idx) => {
      const client = extractClient(row);
      const account = row['시트명'] || '';
      
      if (!client || !account) return;

      const isSales = salesAccounts.some(acc => account.includes(acc));
      const isExpense = expenseAccounts.some(acc => account.includes(acc));

      if (isSales || isExpense) {
        const accountType = isSales ? 'sales' : 'expense';
        
        if (!clientsByAccount.has(client)) {
          clientsByAccount.set(client, new Set());
        }
        clientsByAccount.get(client)!.add(accountType);
      }
    });

    const dualClients: Array<{ client: string; accounts: string[] }> = [];
    clientsByAccount.forEach((types, client) => {
      if (types.has('sales') && types.has('expense')) {
        dualClients.push({
          client,
          accounts: Array.from(types).map(t => t === 'sales' ? '매출계정' : '비용계정')
        });
      }
    });

    return dualClients;
  }, [ledgerData]);

  // 디버깅용 데이터
  const frontierDebugData = useMemo(() => {
    const salesAccounts = ['매출', '제품매출', '상품매출', '용역매출'];
    const expenseAccounts = ['판매비', '관리비', '판매비와관리비', '급여', '복리후생비', '접대비', '통신비', '지급수수료', '광고선전비', '광고비', '운반비', '수선비', '소모품비', '도서인쇄비', '차량유지비', '여비교통비', '세금과공과', '감가상각비', '보험료', '임차료', '수도광열비'];
    
    return ledgerData
      .map((row, idx) => {
        const client = extractClient(row);
        if (!client || !client.toLowerCase().includes('frontier')) return null;
        
        const account = row['시트명'] || '';
        const isSales = salesAccounts.some(acc => account.includes(acc));
        const isExpense = expenseAccounts.some(acc => account.includes(acc));
        
        return {
          행번호: idx,
          거래처: client,
          시트명: account,
          매출여부: isSales ? '✓' : '✗',
          비용여부: isExpense ? '✓' : '✗',
        };
      })
      .filter(Boolean);
  }, [ledgerData]);

  // 채권/채무 이중 거래처 분석
  const receivablePayableDualClients = useMemo(() => {
    const receivableAccounts = ['외상매출금', '받을어음', '미수금', '미수수익'];
    const payableAccounts = ['외상매입금', '미지급금', '미지급비용', '지급어음'];

    const clientsByAccount = new Map<string, Set<string>>();

    ledgerData.forEach(row => {
      const client = extractClient(row);
      const account = row['시트명'] || '';
      
      if (!client || !account) return;

      const isReceivable = receivableAccounts.some(acc => account.includes(acc));
      const isPayable = payableAccounts.some(acc => account.includes(acc));

      if (isReceivable || isPayable) {
        const accountType = isReceivable ? 'receivable' : 'payable';
        
        if (!clientsByAccount.has(client)) {
          clientsByAccount.set(client, new Set());
        }
        clientsByAccount.get(client)!.add(accountType);
      }
    });

    const dualClients: Array<{ client: string; accounts: string[] }> = [];
    clientsByAccount.forEach((types, client) => {
      if (types.has('receivable') && types.has('payable')) {
        dualClients.push({
          client,
          accounts: Array.from(types).map(t => t === 'receivable' ? '자산계정(채권)' : '부채계정(채무)')
        });
      }
    });

    return dualClients;
  }, [ledgerData]);

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
            <AlertTriangle className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">이중/상계 가능 거래처 분석</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Frontier 디버깅 카드 */}
        {frontierDebugData.length > 0 && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <CardHeader>
              <CardTitle className="text-yellow-800 dark:text-yellow-200">
                Frontier 거래처 전체 데이터
              </CardTitle>
              <CardDescription>
                Frontier가 포함된 모든 행의 전체 필드
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {ledgerData
                  .map((row, idx) => {
                    const client = extractClient(row);
                    if (!client || !client.toLowerCase().includes('frontier')) return null;
                    return { row, idx, client };
                  })
                  .filter(Boolean)
                  .map((item: any, cardIdx) => (
                    <Card key={cardIdx} className="p-4 bg-white dark:bg-gray-900">
                      <div className="text-sm font-semibold mb-2">
                        행 #{item.idx} - 거래처: {item.client}
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        {Object.entries(item.row).map(([key, value]) => (
                          <div key={key} className="flex gap-2 border-b pb-1">
                            <span className="font-medium text-muted-foreground min-w-[120px]">{key}:</span>
                            <span className="break-all">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 데이터 샘플 표시 */}
        <Card>
          <CardHeader>
            <CardTitle>데이터 샘플 (디버깅용)</CardTitle>
            <CardDescription>
              실제 데이터 구조 확인 - 총 {ledgerData.length}개 행
            </CardDescription>
            <div className="flex gap-2 items-center mt-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="거래처 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {ledgerData.length > 0 && (
              <div className="space-y-4">
                {ledgerData
                  .filter(row => {
                    if (!searchQuery) return true;
                    const search = searchQuery.toLowerCase();
                    return Object.values(row).some(val => 
                      val && String(val).toLowerCase().includes(search)
                    );
                  })
                  .slice(0, 20)
                  .map((row, index) => (
                    <Card key={index} className="p-4">
                      <div className="text-sm font-semibold mb-2">행 #{index + 1}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        {Object.entries(row).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="font-medium text-muted-foreground">{key}:</span>
                            <span className="break-all">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>매출-비용 이중 거래처</CardTitle>
            <CardDescription>
              매출계정과 비용계정에 동시에 나타나는 거래처 목록
            </CardDescription>
          </CardHeader>
          <CardContent>
            {salesExpenseDualClients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">번호</TableHead>
                    <TableHead>거래처명</TableHead>
                    <TableHead>나타나는 계정 유형</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesExpenseDualClients.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{item.client}</TableCell>
                      <TableCell>{item.accounts.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                매출-비용 이중 거래처가 없습니다.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>채권-채무 이중 거래처</CardTitle>
            <CardDescription>
              자산계정(외상매출금 등)과 부채계정(외상매입금, 미지급금 등)에 동시에 나타나는 거래처 목록
            </CardDescription>
          </CardHeader>
          <CardContent>
            {receivablePayableDualClients.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">번호</TableHead>
                    <TableHead>거래처명</TableHead>
                    <TableHead>나타나는 계정 유형</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivablePayableDualClients.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{item.client}</TableCell>
                      <TableCell>{item.accounts.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                채권-채무 이중 거래처가 없습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DualOffsetAnalysis;

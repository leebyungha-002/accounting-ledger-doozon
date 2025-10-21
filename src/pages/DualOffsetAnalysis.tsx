import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DualOffsetAnalysis = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

    ledgerData.forEach(row => {
      const client = extractClient(row);
      const account = row['시트명'] || '';
      
      if (!client || !account) return;

      const isSales = salesAccounts.some(acc => account.includes(acc));
      const isExpense = expenseAccounts.some(acc => account.includes(acc));

      // 디버깅: Frontier 거래처 확인
      if (client.includes('Frontier')) {
        console.log('Frontier 발견:', { client, account, isSales, isExpense });
      }

      if (isSales || isExpense) {
        const accountType = isSales ? 'sales' : 'expense';
        
        if (!clientsByAccount.has(client)) {
          clientsByAccount.set(client, new Set());
        }
        clientsByAccount.get(client)!.add(accountType);
      }
    });

    console.log('clientsByAccount:', Array.from(clientsByAccount.entries()));

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
        {/* 디버깅: 데이터 샘플 표시 */}
        <Card>
          <CardHeader>
            <CardTitle>데이터 샘플 (디버깅용)</CardTitle>
            <CardDescription>
              실제 데이터 구조 확인
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시트명</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead>거래처명</TableHead>
                  <TableHead>거래처코드</TableHead>
                  <TableHead>적요</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerData.slice(0, 20).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row['시트명']}</TableCell>
                    <TableCell>{row['거래처']}</TableCell>
                    <TableCell>{row['거래처명']}</TableCell>
                    <TableCell>{row['거래처코드']}</TableCell>
                    <TableCell>{row['적요']}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

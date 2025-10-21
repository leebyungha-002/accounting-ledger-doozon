import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Search, Check, ChevronsUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const DualOffsetAnalysis = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [debitAccount, setDebitAccount] = useState<string>('');
  const [creditAccount, setCreditAccount] = useState<string>('');
  const [openDebit, setOpenDebit] = useState(false);
  const [openCredit, setOpenCredit] = useState(false);

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

  // 거래처 정보 추출
  const extractClient = (row: any): string | null => {
    const clientFields = ['거래처', '거래처명', '거래처코드', '적요'];
    for (const field of clientFields) {
      if (row[field] && String(row[field]).trim()) {
        return String(row[field]).trim();
      }
    }
    return null;
  };

  // 모든 계정(시트명) 목록
  const allAccounts = useMemo(() => {
    const accounts = new Set<string>();
    ledgerData.forEach(row => {
      const account = row['시트명'];
      if (account && String(account).trim()) {
        accounts.add(String(account).trim());
      }
    });
    return Array.from(accounts).sort();
  }, [ledgerData]);

  // 차변/대변 양쪽에 모두 나타나는 거래처 분석
  const dualClients = useMemo(() => {
    if (!debitAccount || !creditAccount) return [];

    // 차변 계정의 거래처 추출
    const debitClients = new Set<string>();
    ledgerData.forEach(row => {
      if (row['시트명'] === debitAccount) {
        const client = extractClient(row);
        if (client) debitClients.add(client);
      }
    });

    // 대변 계정의 거래처 추출
    const creditClients = new Set<string>();
    ledgerData.forEach(row => {
      if (row['시트명'] === creditAccount) {
        const client = extractClient(row);
        if (client) creditClients.add(client);
      }
    });

    // 양쪽에 모두 나타나는 거래처 찾기
    const common: string[] = [];
    debitClients.forEach(client => {
      if (creditClients.has(client)) {
        common.push(client);
      }
    });

    return common.sort();
  }, [ledgerData, debitAccount, creditAccount]);

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
            <Search className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">이중/상계 가능 거래처 분석</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>계정 선택</CardTitle>
            <CardDescription>
              차변 계정과 대변 계정을 선택하면 양쪽에 모두 나타나는 거래처를 검색합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">차변 계정</label>
                <Popover open={openDebit} onOpenChange={setOpenDebit}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openDebit}
                      className="w-full justify-between"
                    >
                      {debitAccount || "차변 계정을 선택하세요"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="계정 검색..." />
                      <CommandList>
                        <CommandEmpty>계정을 찾을 수 없습니다.</CommandEmpty>
                        <CommandGroup>
                          {allAccounts.map((account) => (
                            <CommandItem
                              key={account}
                              value={account}
                              onSelect={(currentValue) => {
                                setDebitAccount(currentValue === debitAccount ? "" : account);
                                setOpenDebit(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  debitAccount === account ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {account}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">대변 계정</label>
                <Popover open={openCredit} onOpenChange={setOpenCredit}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCredit}
                      className="w-full justify-between"
                    >
                      {creditAccount || "대변 계정을 선택하세요"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="계정 검색..." />
                      <CommandList>
                        <CommandEmpty>계정을 찾을 수 없습니다.</CommandEmpty>
                        <CommandGroup>
                          {allAccounts.map((account) => (
                            <CommandItem
                              key={account}
                              value={account}
                              onSelect={(currentValue) => {
                                setCreditAccount(currentValue === creditAccount ? "" : account);
                                setOpenCredit(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  creditAccount === account ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {account}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>검색 결과</CardTitle>
            <CardDescription>
              {debitAccount && creditAccount
                ? `"${debitAccount}"와(과) "${creditAccount}"에 모두 나타나는 거래처`
                : '차변과 대변 계정을 선택해주세요'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {debitAccount && creditAccount ? (
              dualClients.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">번호</TableHead>
                      <TableHead>거래처명</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dualClients.map((client, index) => (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{client}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  선택한 두 계정에 공통으로 나타나는 거래처가 없습니다.
                </p>
              )
            ) : (
              <p className="text-muted-foreground text-center py-8">
                차변과 대변 계정을 선택하면 결과가 표시됩니다.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DualOffsetAnalysis;

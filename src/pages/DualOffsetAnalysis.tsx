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
    // 실제 데이터 필드명에 맞춰 수정
    const clientFields = ['계   정   별   원   장', '__EMPTY_1', '거래처', '거래처명', '거래처코드', '적요'];
    for (const field of clientFields) {
      const value = row[field];
      if (value && String(value).trim()) {
        const strValue = String(value).trim();
        // 헤더나 기타 정보가 아닌 실제 거래처명만 추출
        if (strValue !== '' &&
            !strValue.includes('원   장') && 
            !strValue.includes('적    요    란') &&
            strValue !== '거래처' &&
            !strValue.includes('2025.') &&
            strValue !== '날짜') {
          return strValue;
        }
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
        if (client) {
          debitClients.add(client);
          // 첫 3개 행만 로그 출력
          if (debitClients.size <= 3) {
            console.log(`차변 계정(${debitAccount}) 행:`, {
              거래처: client,
              차변: row['__EMPTY_3'],
              대변: row['__EMPTY_4'],
              전체행: row
            });
          }
        }
      }
    });

    // 대변 계정의 거래처 추출
    const creditClients = new Set<string>();
    ledgerData.forEach(row => {
      if (row['시트명'] === creditAccount) {
        const client = extractClient(row);
        if (client) {
          creditClients.add(client);
          // 첫 3개 행만 로그 출력
          if (creditClients.size <= 3) {
            console.log(`대변 계정(${creditAccount}) 행:`, {
              거래처: client,
              차변: row['__EMPTY_3'],
              대변: row['__EMPTY_4'],
              전체행: row
            });
          }
        }
      }
    });

    console.log('차변 계정 거래처:', Array.from(debitClients));
    console.log('대변 계정 거래처:', Array.from(creditClients));

    // 양쪽에 모두 나타나는 거래처 찾기 및 금액 계산
    const common: Array<{ client: string; debitAmount: number; creditAmount: number }> = [];
    debitClients.forEach(client => {
      if (creditClients.has(client)) {
        // 차변 계정에서의 금액 합계
        let debitAmount = 0;
        let debitCount = 0;
        ledgerData.forEach(row => {
          if (row['시트명'] === debitAccount && extractClient(row) === client) {
            const debit = row['__EMPTY_3'];
            const credit = row['__EMPTY_4'];
            
            // 숫자로 변환 가능한지 확인
            const debitNum = typeof debit === 'number' ? debit : (debit ? parseFloat(String(debit).replace(/,/g, '')) : 0);
            const creditNum = typeof credit === 'number' ? credit : (credit ? parseFloat(String(credit).replace(/,/g, '')) : 0);
            
            if (!isNaN(debitNum) && debitNum !== 0) {
              debitAmount += Math.abs(debitNum);
              debitCount++;
            }
            if (!isNaN(creditNum) && creditNum !== 0) {
              debitAmount += Math.abs(creditNum);
              debitCount++;
            }
          }
        });

        // 대변 계정에서의 금액 합계
        let creditAmount = 0;
        let creditCount = 0;
        ledgerData.forEach(row => {
          if (row['시트명'] === creditAccount && extractClient(row) === client) {
            const debit = row['__EMPTY_3'];
            const credit = row['__EMPTY_4'];
            
            // 숫자로 변환 가능한지 확인
            const debitNum = typeof debit === 'number' ? debit : (debit ? parseFloat(String(debit).replace(/,/g, '')) : 0);
            const creditNum = typeof credit === 'number' ? credit : (credit ? parseFloat(String(credit).replace(/,/g, '')) : 0);
            
            if (!isNaN(debitNum) && debitNum !== 0) {
              creditAmount += Math.abs(debitNum);
              creditCount++;
            }
            if (!isNaN(creditNum) && creditNum !== 0) {
              creditAmount += Math.abs(creditNum);
              creditCount++;
            }
          }
        });

        console.log(`거래처: ${client}`, {
          차변계정: debitAccount,
          차변금액: debitAmount,
          차변건수: debitCount,
          대변계정: creditAccount,
          대변금액: creditAmount,
          대변건수: creditCount
        });
        
        common.push({ client, debitAmount, creditAmount });
      }
    });

    return common.sort((a, b) => a.client.localeCompare(b.client));
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
                ? `차변: "${debitAccount}" / 대변: "${creditAccount}"`
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
                      <TableHead className="text-right">{debitAccount} 합계</TableHead>
                      <TableHead className="text-right">{creditAccount} 합계</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dualClients.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{item.client}</TableCell>
                        <TableCell className="text-right">{item.debitAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{item.creditAmount.toLocaleString()}</TableCell>
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

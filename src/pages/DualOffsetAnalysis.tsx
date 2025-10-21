import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Search, Check, ChevronsUpDown, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

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

  // 거래처 정보 추출 - 개선
  const extractClient = (row: any): string | null => {
    // 거래처명은 '거래처' 필드에 있습니다
    const clientField = row['거래처'];
    
    if (!clientField) return null;
    
    const strValue = String(clientField).trim();
    
    // 제외할 패턴들
    const excludePatterns = [
      '원   장',
      '적    요',
      '날짜',
      '거래처',
      '합계',
      '총합계',
      '[ 월',
      '[ 누',
      ']',
      '차   변',
      '대   변',
      '잔   액',
      '코드',
      '~' // 날짜 범위 표시
    ];
    
    // 헤더나 합계 행이 아니고, 실제 값이 있으면 반환
    if (strValue && 
        strValue.length > 0 &&
        !excludePatterns.some(pattern => strValue.includes(pattern))) {
      return strValue;
    }
    
    return null;
  };

  const downloadExcel = () => {
    if (!debitAccount || !creditAccount || dualClients.length === 0) {
      toast({
        title: '오류',
        description: '다운로드할 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    const wsData = [
      ['이중/상계 가능 거래처 분석'],
      ['차변 계정', debitAccount],
      ['대변 계정', creditAccount],
      ['분석 일시', new Date().toLocaleString('ko-KR')],
      [],
      ['번호', '거래처명', `${debitAccount} 합계`, `${creditAccount} 합계`],
      ...dualClients.map((item, index) => [
        index + 1,
        item.client,
        item.debitAmount,
        item.creditAmount,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 20 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, '거래처분석');
    XLSX.writeFile(wb, `이중상계거래처분석_${debitAccount}_${creditAccount}_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '분석 결과를 엑셀 파일로 저장했습니다.',
    });
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

    console.log('=== 분석 시작 ===');
    console.log('차변 계정:', debitAccount);
    console.log('대변 계정:', creditAccount);
    console.log('전체 데이터 행 수:', ledgerData.length);

    // 선택한 계정의 데이터만 먼저 출력 (처음 5개)
    const debitRows = ledgerData.filter(row => row['시트명'] === debitAccount).slice(0, 5);
    const creditRows = ledgerData.filter(row => row['시트명'] === creditAccount).slice(0, 5);
    
    console.log('차변 계정 샘플 데이터:', debitRows);
    console.log('대변 계정 샘플 데이터:', creditRows);
    console.log('차변 계정 전체 행 수:', ledgerData.filter(row => row['시트명'] === debitAccount).length);
    console.log('대변 계정 전체 행 수:', ledgerData.filter(row => row['시트명'] === creditAccount).length);
    
    // 대변 계정의 필드 구조 확인
    if (creditRows.length > 0) {
      console.log('대변 계정 첫 번째 행의 모든 키:', Object.keys(creditRows[0]));
      creditRows.slice(0, 10).forEach((row, idx) => {
        console.log(`대변 행 ${idx + 1}:`, {
          거래처: row['거래처'],
          EMPTY3: row['EMPTY3'],
          EMPTY4: row['EMPTY4'],
          EMPTY5: row['EMPTY5'],
          차변: row['차 변'],
          대변: row['대 변'],
          allKeys: Object.keys(row).filter(k => k.includes('EMPTY') || k === '거래처')
        });
      });
    }

    // 각 계정별로 거래처-금액 맵 생성
    const debitMap = new Map<string, number>();
    const creditMap = new Map<string, number>();

    ledgerData.forEach((row, index) => {
      const sheetName = row['시트명'];
      if (sheetName !== debitAccount && sheetName !== creditAccount) return;

      const client = extractClient(row);
      
      // 처음 몇 개만 자세히 로깅
      if (index < 20 && (sheetName === debitAccount || sheetName === creditAccount)) {
        console.log(`행 ${index}:`, {
          시트명: sheetName,
          추출된거래처: client,
          원본데이터: {
            날짜: row['날짜'],
            적요: row['적    요    란'],
            코드: row['코드'],
            거래처: row['거래처'],
            차변: row['차   변'],
            대변: row['대   변']
          }
        });
      }

      if (!client) return;

      // 금액 필드 - 한글 필드명 사용
      const debitValue = row['차   변'];
      const creditValue = row['대   변'];
      
      // 숫자로 변환
      let debitNum = 0;
      let creditNum = 0;
      
      if (debitValue) {
        const str = String(debitValue).replace(/,/g, '');
        debitNum = parseFloat(str);
      }
      
      if (creditValue) {
        const str = String(creditValue).replace(/,/g, '');
        creditNum = parseFloat(str);
      }
      
      // 차변 계정: 차변금액 우선, 없으면 대변금액
      if (sheetName === debitAccount) {
        const amount = !isNaN(debitNum) && debitNum > 0 ? debitNum : 
                      !isNaN(creditNum) && creditNum > 0 ? creditNum : 0;
        if (amount > 0) {
          debitMap.set(client, (debitMap.get(client) || 0) + amount);
        }
      }
      
      // 대변 계정: 대변금액 우선, 없으면 차변금액
      if (sheetName === creditAccount) {
        const amount = !isNaN(creditNum) && creditNum > 0 ? creditNum : 
                      !isNaN(debitNum) && debitNum > 0 ? debitNum : 0;
        if (amount > 0) {
          creditMap.set(client, (creditMap.get(client) || 0) + amount);
        }
      }
    });

    console.log('차변 거래처 맵:', Object.fromEntries(debitMap));
    console.log('대변 거래처 맵:', Object.fromEntries(creditMap));

    // 공통 거래처 찾기
    const common: Array<{ client: string; debitAmount: number; creditAmount: number }> = [];
    
    debitMap.forEach((debitAmount, client) => {
      if (creditMap.has(client)) {
        common.push({ 
          client, 
          debitAmount, 
          creditAmount: creditMap.get(client) || 0 
        });
      }
    });

    console.log('공통 거래처 목록:', common);
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>검색 결과</CardTitle>
                <CardDescription>
                  {debitAccount && creditAccount
                    ? `차변: "${debitAccount}" / 대변: "${creditAccount}"`
                    : '차변과 대변 계정을 선택해주세요'}
                </CardDescription>
              </div>
              {debitAccount && creditAccount && dualClients.length > 0 && (
                <Button variant="outline" size="sm" onClick={downloadExcel}>
                  <Download className="mr-2 h-4 w-4" />
                  엑셀 다운로드
                </Button>
              )}
            </div>
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

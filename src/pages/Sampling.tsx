import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Download, Check, ChevronsUpDown, FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

const Sampling = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  
  // Sampling state
  const [open, setOpen] = useState(false);
  const [selectedSamplingAccount, setSelectedSamplingAccount] = useState<string>('');
  const [samplingMethod, setSamplingMethod] = useState<string>('random');
  const [sampleSize, setSampleSize] = useState<string>('30');
  const [sampledData, setSampledData] = useState<any[]>([]);

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

  // Get all unique accounts for sampling
  const allAccounts = useMemo(() => {
    const accounts = new Set<string>();
    ledgerData.forEach((row) => {
      const sheetName = row['시트명'] || row['계정과목'] || row['계정명'];
      if (sheetName && typeof sheetName === 'string') {
        accounts.add(sheetName);
      }
    });
    return Array.from(accounts).sort();
  }, [ledgerData]);

  // Perform sampling
  const performSampling = () => {
    if (!selectedSamplingAccount) {
      toast({
        title: '오류',
        description: '샘플링할 계정을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const size = parseInt(sampleSize, 10);
    if (isNaN(size) || size < 1) {
      toast({
        title: '오류',
        description: '올바른 샘플 크기를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // Filter data for selected account
    const accountData = ledgerData.filter(row => {
      const sheetName = row['시트명'] || row['계정과목'] || row['계정명'];
      const dateStr = row['__EMPTY'];
      // Exclude rows without dates (these are usually subtotals/totals)
      return sheetName === selectedSamplingAccount && dateStr && typeof dateStr === 'string' && dateStr.trim() !== '';
    });

    if (accountData.length === 0) {
      toast({
        title: '오류',
        description: '선택한 계정에 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    let samples: any[] = [];

    if (samplingMethod === 'random') {
      // Random sampling
      const shuffled = [...accountData].sort(() => Math.random() - 0.5);
      samples = shuffled.slice(0, Math.min(size, accountData.length));
    } else if (samplingMethod === 'systematic') {
      // Systematic sampling
      const interval = Math.floor(accountData.length / size);
      for (let i = 0; i < accountData.length && samples.length < size; i += interval) {
        samples.push(accountData[i]);
      }
    } else if (samplingMethod === 'monetary') {
      // Monetary Unit Sampling (MUS) - weighted by amount
      const dataWithAmounts = accountData.map(row => ({
        ...row,
        amount: Math.abs(parseFloat(row['__EMPTY_3'] || 0)) + Math.abs(parseFloat(row['__EMPTY_4'] || 0))
      })).filter(row => row.amount > 0);

      // Sort by amount descending
      dataWithAmounts.sort((a, b) => b.amount - a.amount);

      // Calculate cumulative amounts
      const totalAmount = dataWithAmounts.reduce((sum, row) => sum + row.amount, 0);
      const samplingInterval = totalAmount / size;

      let cumulativeAmount = 0;
      let nextThreshold = samplingInterval;

      for (const row of dataWithAmounts) {
        cumulativeAmount += row.amount;
        if (cumulativeAmount >= nextThreshold && samples.length < size) {
          samples.push(row);
          nextThreshold += samplingInterval;
        }
      }
    }

    setSampledData(samples);
    toast({
      title: '샘플링 완료',
      description: `${samples.length}개의 항목이 선택되었습니다.`,
    });
  };

  const downloadSampling = () => {
    if (sampledData.length === 0) {
      toast({
        title: '오류',
        description: '다운로드할 샘플 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    const wsData = [
      ['샘플링 결과'],
      ['계정명', selectedSamplingAccount],
      ['샘플링 방법', samplingMethod === 'random' ? '무작위' : samplingMethod === 'systematic' ? '체계적' : '금액가중'],
      ['샘플 크기', sampledData.length],
      ['추출 일시', new Date().toLocaleString('ko-KR')],
      [],
      ['날짜', '적요', '거래처', '차변', '대변', '잔액'],
      ...sampledData.map(row => [
        row['__EMPTY'] || '',
        row['__EMPTY_1'] || '',
        row['__EMPTY_2'] || '',
        row['__EMPTY_3'] || 0,
        row['__EMPTY_4'] || 0,
        row['__EMPTY_5'] || 0,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 15 },
      { wch: 40 },
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '샘플링');
    XLSX.writeFile(wb, `샘플링_${selectedSamplingAccount}_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '샘플링 결과를 엑셀 파일로 저장했습니다.',
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
            <FlaskConical className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">통계적 샘플링</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>샘플링 설정</CardTitle>
                <CardDescription>통계적 샘플링 매개변수를 설정하세요</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>계정명</Label>
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                      >
                        {selectedSamplingAccount || "계정을 선택하세요..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="계정명 검색..." />
                        <CommandList>
                          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                          <CommandGroup>
                            {allAccounts.map((account) => (
                              <CommandItem
                                key={account}
                                value={account}
                                onSelect={(currentValue) => {
                                  setSelectedSamplingAccount(currentValue === selectedSamplingAccount ? '' : currentValue);
                                  setOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedSamplingAccount === account ? "opacity-100" : "opacity-0"
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
                  <Label>샘플링 방법</Label>
                  <Select value={samplingMethod} onValueChange={setSamplingMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="random">무작위 샘플링</SelectItem>
                      <SelectItem value="systematic">체계적 샘플링</SelectItem>
                      <SelectItem value="monetary">금액가중 샘플링 (MUS)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {samplingMethod === 'random' && '모든 항목에서 무작위로 선택합니다.'}
                    {samplingMethod === 'systematic' && '일정한 간격으로 항목을 선택합니다.'}
                    {samplingMethod === 'monetary' && '금액이 큰 항목에 더 높은 확률을 부여합니다.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>샘플 크기</Label>
                  <Input
                    type="number"
                    min="1"
                    value={sampleSize}
                    onChange={(e) => setSampleSize(e.target.value)}
                    placeholder="30"
                  />
                </div>

                <Button onClick={performSampling} className="w-full">
                  샘플링 실행
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>샘플링 결과</CardTitle>
                    <CardDescription>
                      {sampledData.length > 0 
                        ? `${sampledData.length}개 항목이 선택되었습니다`
                        : '샘플링을 실행하세요'}
                    </CardDescription>
                  </div>
                  {sampledData.length > 0 && (
                    <Button variant="outline" size="sm" onClick={downloadSampling}>
                      <Download className="mr-2 h-4 w-4" />
                      엑셀 다운로드
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {sampledData.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    왼쪽에서 설정 후 샘플링을 실행하세요
                  </p>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold">날짜</TableHead>
                          <TableHead className="font-semibold">적요</TableHead>
                          <TableHead className="font-semibold">거래처</TableHead>
                          <TableHead className="font-semibold text-right">차변</TableHead>
                          <TableHead className="font-semibold text-right">대변</TableHead>
                          <TableHead className="font-semibold text-right">잔액</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sampledData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{row['__EMPTY'] || '-'}</TableCell>
                            <TableCell className="max-w-[300px] truncate">{row['__EMPTY_1'] || '-'}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{row['__EMPTY_2'] || '-'}</TableCell>
                            <TableCell className="text-right">
                              {parseFloat(row['__EMPTY_3'] || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {parseFloat(row['__EMPTY_4'] || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {parseFloat(row['__EMPTY_5'] || 0).toLocaleString()}
                            </TableCell>
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

export default Sampling;

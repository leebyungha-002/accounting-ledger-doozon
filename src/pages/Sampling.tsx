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
  const [sampleSizeMethod, setSampleSizeMethod] = useState<string>('manual'); // 'manual' or 'formula'
  const [sampleSize, setSampleSize] = useState<string>('30');
  const [riskFactorMethod, setRiskFactorMethod] = useState<string>('table'); // 'table' or 'manual'
  const [riskFactor, setRiskFactor] = useState<string>('3.00');
  const [tolerableError, setTolerableError] = useState<string>('1000000');
  const [sampledData, setSampledData] = useState<any[]>([]);

  // 신뢰수준별 위험계수 통계표
  const riskFactorTable = [
    { confidenceLevel: '90%', auditRisk: '10%', factor: '2.31' },
    { confidenceLevel: '95%', auditRisk: '5%', factor: '3.00' },
    { confidenceLevel: '99%', auditRisk: '1%', factor: '4.61' },
  ];

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

  // Calculate population size and total amount for selected account
  const populationStats = useMemo(() => {
    if (!selectedSamplingAccount) return { size: 0, totalAmount: 0 };
    
    const accountData = ledgerData.filter(row => {
      const sheetName = row['시트명'] || row['계정과목'] || row['계정명'];
      const dateStr = row['__EMPTY'];
      return sheetName === selectedSamplingAccount && dateStr && typeof dateStr === 'string' && dateStr.trim() !== '';
    });

    const totalAmount = accountData.reduce((sum, row) => {
      const debit = Math.abs(parseFloat(row['__EMPTY_3'] || 0));
      const credit = Math.abs(parseFloat(row['__EMPTY_4'] || 0));
      return sum + debit + credit;
    }, 0);

    return { size: accountData.length, totalAmount };
  }, [ledgerData, selectedSamplingAccount]);

  // Calculate sample size using formula
  const calculatedSampleSize = useMemo(() => {
    if (sampleSizeMethod !== 'formula' || !selectedSamplingAccount) return null;
    
    const risk = parseFloat(riskFactor);
    const tolerable = parseFloat(tolerableError);
    
    if (isNaN(risk) || isNaN(tolerable) || tolerable <= 0) return null;
    
    const calculated = Math.ceil((populationStats.size * risk) / tolerable);
    return Math.min(calculated, populationStats.size); // Cannot exceed population size
  }, [sampleSizeMethod, selectedSamplingAccount, riskFactor, tolerableError, populationStats.size]);

  // 샘플링 방법 설명
  const getSamplingMethodDescription = (method: string): string => {
    switch (method) {
      case 'random':
        return '무작위 샘플링: 모든 항목이 동일한 확률로 선택되어 편향 없는 표본을 제공합니다. 통계적으로 가장 기본적인 방법입니다.';
      case 'systematic':
        return '체계적 샘플링: 일정한 간격으로 항목을 선택하여 전체 모집단을 고르게 대표합니다. 시간순 또는 순서가 있는 데이터에 적합합니다.';
      case 'monetary':
        return '금액가중 샘플링(MUS): 금액이 큰 항목에 더 높은 선택 확률을 부여하여 중요도가 높은 거래를 집중 검토합니다. 회계감사에서 널리 사용됩니다.';
      default:
        return '';
    }
  };

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

    let size: number;
    
    if (sampleSizeMethod === 'formula') {
      if (calculatedSampleSize === null) {
        toast({
          title: '오류',
          description: '위험계수와 허용가능오류금액을 올바르게 입력해주세요.',
          variant: 'destructive',
        });
        return;
      }
      size = calculatedSampleSize;
    } else {
      size = parseInt(sampleSize, 10);
      if (isNaN(size) || size < 1) {
        toast({
          title: '오류',
          description: '올바른 샘플 크기를 입력해주세요.',
          variant: 'destructive',
        });
        return;
      }
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
                  <Label>샘플 크기 결정 방법</Label>
                  <Select value={sampleSizeMethod} onValueChange={setSampleSizeMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">직접 입력</SelectItem>
                      <SelectItem value="formula">공식 계산</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {sampleSizeMethod === 'manual' ? (
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
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>위험 계수 입력 방법</Label>
                      <Select value={riskFactorMethod} onValueChange={setRiskFactorMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="table">통계표 참조</SelectItem>
                          <SelectItem value="manual">직접 입력</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {riskFactorMethod === 'table' ? (
                      <div className="space-y-2">
                        <Label>신뢰수준 선택</Label>
                        <Select value={riskFactor} onValueChange={setRiskFactor}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {riskFactorTable.map((item) => (
                              <SelectItem key={item.factor} value={item.factor}>
                                {item.confidenceLevel} 신뢰수준 (감사위험 {item.auditRisk}) - 계수: {item.factor}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="mt-3 p-3 bg-muted rounded-md">
                          <p className="text-xs font-medium mb-2">위험계수 통계표</p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">신뢰수준</TableHead>
                                <TableHead className="text-xs">감사위험</TableHead>
                                <TableHead className="text-xs text-right">위험계수</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {riskFactorTable.map((item) => (
                                <TableRow key={item.factor} className={riskFactor === item.factor ? 'bg-primary/10' : ''}>
                                  <TableCell className="text-xs">{item.confidenceLevel}</TableCell>
                                  <TableCell className="text-xs">{item.auditRisk}</TableCell>
                                  <TableCell className="text-xs text-right font-medium">{item.factor}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>위험 계수 (Risk Factor)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.1"
                          value={riskFactor}
                          onChange={(e) => setRiskFactor(e.target.value)}
                          placeholder="3.00"
                        />
                        <p className="text-xs text-muted-foreground">
                          일반적으로 2.0 ~ 5.0 사이 값 사용
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>허용가능 오류금액</Label>
                      <Input
                        type="number"
                        min="1"
                        value={tolerableError}
                        onChange={(e) => setTolerableError(e.target.value)}
                        placeholder="1000000"
                      />
                      <p className="text-xs text-muted-foreground">
                        허용 가능한 최대 오류 금액 (원)
                      </p>
                    </div>
                    {selectedSamplingAccount && calculatedSampleSize !== null && (
                      <div className="p-3 bg-muted rounded-md space-y-1">
                        <p className="text-sm font-medium">계산 결과</p>
                        <p className="text-xs text-muted-foreground">
                          모집단 크기: {populationStats.size.toLocaleString()}개
                        </p>
                        <p className="text-xs text-muted-foreground">
                          총 금액: {populationStats.totalAmount.toLocaleString()}원
                        </p>
                        <p className="text-xs text-muted-foreground">
                          계산식: ({populationStats.size} × {riskFactor}) / {parseFloat(tolerableError).toLocaleString()}
                        </p>
                        <p className="text-sm font-semibold text-primary">
                          권장 샘플 크기: {calculatedSampleSize}개
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <Button onClick={performSampling} className="w-full" disabled={sampleSizeMethod === 'formula' && calculatedSampleSize === null}>
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
                      {sampledData.length > 0 ? (
                        <div className="space-y-2">
                          <p className="font-medium">{sampledData.length}개 항목이 선택되었습니다</p>
                          <p className="text-sm">{getSamplingMethodDescription(samplingMethod)}</p>
                        </div>
                      ) : (
                        '샘플링을 실행하세요'
                      )}
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

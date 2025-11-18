import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, FlaskConical, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface SamplingAnalysisProps {
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

const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[] } => {
  if (!worksheet) return { data: [], headers: [] };
  
  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet);
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  
  return { data: rawData, headers };
};

export const SamplingAnalysis: React.FC<SamplingAnalysisProps> = ({
  workbook,
  accountNames,
  onBack,
}) => {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [samplingMethod, setSamplingMethod] = useState<'random' | 'systematic' | 'mus'>('random');
  const [sampleSize, setSampleSize] = useState<string>('30');
  const [sampledData, setSampledData] = useState<LedgerRow[]>([]);

  const accountData = useMemo(() => {
    if (!selectedAccount) return [];
    const sheet = workbook.Sheets[selectedAccount];
    const { data } = getDataFromSheet(sheet);
    return data;
  }, [workbook, selectedAccount]);

  const handleSampling = () => {
    if (!selectedAccount || accountData.length === 0) {
      toast({
        title: '오류',
        description: '계정을 선택하고 데이터를 확인해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const size = Math.min(parseInt(sampleSize) || 30, accountData.length);
    let samples: LedgerRow[] = [];

    switch (samplingMethod) {
      case 'random':
        // 랜덤 샘플링
        const indices = new Set<number>();
        while (indices.size < size) {
          indices.add(Math.floor(Math.random() * accountData.length));
        }
        samples = Array.from(indices).map(i => accountData[i]);
        break;

      case 'systematic':
        // 체계적 샘플링 (등간격)
        const interval = Math.floor(accountData.length / size);
        const start = Math.floor(Math.random() * interval);
        for (let i = 0; i < size; i++) {
          const index = (start + i * interval) % accountData.length;
          samples.push(accountData[index]);
        }
        break;

      case 'mus':
        // MUS (Monetary Unit Sampling) - 금액 기준
        const headers = Object.keys(accountData[0] || {});
        const amountHeader = headers.find(h => 
          h.includes('차변') || h.includes('대변') || h.includes('금액')
        );
        
        if (!amountHeader) {
          toast({
            title: '오류',
            description: '금액 열을 찾을 수 없습니다.',
            variant: 'destructive',
          });
          return;
        }

        // 누적 금액 계산
        const cumulativeAmounts: { row: LedgerRow; cumulative: number }[] = [];
        let total = 0;
        accountData.forEach(row => {
          const amount = Math.abs(cleanAmount(row[amountHeader]));
          total += amount;
          cumulativeAmounts.push({ row, cumulative: total });
        });

        // 샘플링 간격
        const samplingInterval = total / size;
        const selectedIndices = new Set<number>();
        
        for (let i = 0; i < size; i++) {
          const randomStart = Math.random() * samplingInterval;
          const targetAmount = randomStart + i * samplingInterval;
          
          // 이진 검색으로 타겟 금액에 해당하는 거래 찾기
          for (let j = 0; j < cumulativeAmounts.length; j++) {
            if (cumulativeAmounts[j].cumulative >= targetAmount) {
              selectedIndices.add(j);
              break;
            }
          }
        }

        samples = Array.from(selectedIndices).map(i => accountData[i]);
        break;
    }

    setSampledData(samples);
    toast({
      title: '샘플링 완료',
      description: `${samples.length}건의 샘플을 추출했습니다.`,
    });
  };

  const downloadSamples = () => {
    if (sampledData.length === 0) {
      toast({
        title: '오류',
        description: '먼저 샘플링을 실행해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampledData);
    
    XLSX.utils.book_append_sheet(wb, ws, '샘플');
    XLSX.writeFile(wb, `감사샘플_${selectedAccount}_${samplingMethod}_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '샘플 데이터를 다운로드했습니다.',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                감사 샘플링
              </CardTitle>
              <CardDescription className="mt-2">
                통계적 샘플링 기법을 사용하여 감사 테스트를 위한 샘플을 추출합니다.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              뒤로가기
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 계정 선택 */}
            <div className="space-y-2">
              <Label>계정과목</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="계정 선택" />
                </SelectTrigger>
                <SelectContent>
                  {accountNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAccount && (
                <p className="text-xs text-muted-foreground">
                  전체: {accountData.length.toLocaleString()}건
                </p>
              )}
            </div>

            {/* 샘플링 방법 */}
            <div className="space-y-2">
              <Label>샘플링 방법</Label>
              <Select value={samplingMethod} onValueChange={(v: any) => setSamplingMethod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">랜덤 샘플링</SelectItem>
                  <SelectItem value="systematic">체계적 샘플링</SelectItem>
                  <SelectItem value="mus">MUS (금액기준)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {samplingMethod === 'random' && '무작위로 샘플 선택'}
                {samplingMethod === 'systematic' && '등간격으로 샘플 선택'}
                {samplingMethod === 'mus' && '금액 가중치 기반 선택'}
              </p>
            </div>

            {/* 샘플 크기 */}
            <div className="space-y-2">
              <Label>샘플 크기</Label>
              <Input
                type="number"
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
                min="1"
                max={accountData.length}
              />
              <p className="text-xs text-muted-foreground">
                권장: 30~100건
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleSampling} 
              disabled={!selectedAccount || accountData.length === 0}
            >
              샘플링 실행
            </Button>
            {sampledData.length > 0 && (
              <Button onClick={downloadSamples} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                샘플 다운로드
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 샘플링 결과 */}
      {sampledData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>샘플링 결과 ({sampledData.length}건)</CardTitle>
              <Badge>
                {samplingMethod === 'random' && '랜덤'}
                {samplingMethod === 'systematic' && '체계적'}
                {samplingMethod === 'mus' && 'MUS'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(sampledData[0] || {}).map(key => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampledData.map((row, idx) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};

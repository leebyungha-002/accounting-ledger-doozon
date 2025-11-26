import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, FlaskConical, Download, Calculator, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { findDebitCreditHeaders } from '@/lib/headerUtils';

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

const robustFindHeader = (headers: string[], keywords: string[]): string | undefined => {
  // 공백 제거 및 소문자 변환하여 비교
  const normalizedHeaders = headers.map(h => ({
    original: h,
    normalized: h.replace(/\s/g, '').toLowerCase()
  }));

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase();
    const found = normalizedHeaders.find(h => h.normalized.includes(normalizedKeyword));
    if (found) {
      return found.original;
    }
  }
  return undefined;
};

// 월계, 누계 행인지 확인하는 함수 (대괄호, 공백 무시)
const isSummaryRow = (row: LedgerRow): boolean => {
  // 모든 열의 값을 확인
  for (const value of Object.values(row)) {
    if (value === null || value === undefined) continue;
    
    // 문자열로 변환하고 대괄호, 공백 제거 후 소문자 변환
    const normalized = String(value).replace(/[\[\]\s]/g, '').toLowerCase();
    
    // 월계 또는 누계가 포함되어 있으면 true
    if (normalized.includes('월계') || normalized.includes('누계')) {
      return true;
    }
  }
  return false;
};

const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[] } => {
  if (!worksheet) return { data: [], headers: [] };
  
  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet);
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  
  // 월계, 누계 행 제거
  const filteredData = rawData.filter(row => !isSummaryRow(row));
  
  return { data: filteredData, headers };
};

// 통계표 기반 샘플 크기 계산 (MUS)
// 신뢰계수: 90% = 2.31, 95% = 3.00, 99% = 4.61
const calculateMUSSampleSize = (
  populationValue: number,
  materiality: number,
  confidenceLevel: number = 95
): number => {
  const confidenceFactors: { [key: number]: number } = {
    90: 2.31,
    95: 3.00,
    99: 4.61,
  };
  
  const factor = confidenceFactors[confidenceLevel] || 3.00;
  const sampleSize = Math.ceil((populationValue * factor) / materiality);
  return Math.max(1, sampleSize);
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
  
  // MUS 관련 상태
  const [musAmountType, setMusAmountType] = useState<'debit' | 'credit' | 'both'>('both');
  const [materiality, setMateriality] = useState<string>('');
  const [confidenceLevel, setConfidenceLevel] = useState<number>(95);
  const [useStatisticalTable, setUseStatisticalTable] = useState<boolean>(false);
  const [includeAnomalies, setIncludeAnomalies] = useState<boolean>(false);
  const [anomalyRows, setAnomalyRows] = useState<Set<number>>(new Set());
  const [anomalyRowObjects, setAnomalyRowObjects] = useState<Set<LedgerRow>>(new Set());

  const accountData = useMemo(() => {
    if (!selectedAccount) return [];
    const sheet = workbook.Sheets[selectedAccount];
    const { data } = getDataFromSheet(sheet);
    // 추가 필터링: 월계, 누계 행 제거 (이중 체크)
    return data.filter(row => !isSummaryRow(row));
  }, [workbook, selectedAccount]);

  // MUS용 금액 합계 계산 (월계, 누계 제외)
  const musTotalAmount = useMemo(() => {
    if (samplingMethod !== 'mus' || accountData.length === 0) return 0;
    
    const headers = Object.keys(accountData[0] || {});
    const dateHeader = headers.find(h => 
      h.includes('일자') || h.includes('날짜')
    );
    const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, accountData, dateHeader);

    let total = 0;
    // 월계, 누계 행 제외하고 계산
    accountData.filter(row => !isSummaryRow(row)).forEach(row => {
      if (musAmountType === 'debit' && debitHeader) {
        total += Math.abs(cleanAmount(row[debitHeader]));
      } else if (musAmountType === 'credit' && creditHeader) {
        total += Math.abs(cleanAmount(row[creditHeader]));
      } else if (musAmountType === 'both') {
        if (debitHeader) total += Math.abs(cleanAmount(row[debitHeader]));
        if (creditHeader) total += Math.abs(cleanAmount(row[creditHeader]));
      }
    });
    return total;
  }, [accountData, samplingMethod, musAmountType]);

  // 통계표 기반 샘플 크기 계산
  const calculatedSampleSize = useMemo(() => {
    if (samplingMethod !== 'mus' || !useStatisticalTable || !materiality) return null;
    
    const materialityValue = parseFloat(materiality.replace(/,/g, '')) || 0;
    if (materialityValue <= 0 || musTotalAmount <= 0) return null;
    
    return calculateMUSSampleSize(musTotalAmount, materialityValue, confidenceLevel);
  }, [samplingMethod, useStatisticalTable, materiality, musTotalAmount, confidenceLevel]);

  const handleSampling = () => {
    if (!selectedAccount || accountData.length === 0) {
      toast({
        title: '오류',
        description: '계정을 선택하고 데이터를 확인해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // MUS이고 통계표 기반 계산이 활성화되어 있으면 계산된 값 사용
    let finalSampleSize = parseInt(sampleSize) || 30;
    if (samplingMethod === 'mus' && useStatisticalTable && calculatedSampleSize !== null) {
      finalSampleSize = calculatedSampleSize;
    }
    
    // 월계, 누계 행 제외한 데이터
    const filteredData = accountData.filter(row => !isSummaryRow(row));
    
    // 이상거래 포함 옵션이 활성화되어 있으면 이상거래 먼저 탐지 및 포함
    let anomalySamples: LedgerRow[] = [];
    let remainingData = filteredData;
    let remainingSize = finalSampleSize;
    let detectedAnomalyIndices = new Set<number>();
    
    if (includeAnomalies) {
      // 이상거래 탐지 수행 - 사용자가 선택한 차변/대변에 따라
      const headers = Object.keys(filteredData[0] || {});
      const dateHeader = headers.find(h => 
        h.includes('일자') || h.includes('날짜')
      );
      const { debitHeader, creditHeader } = findDebitCreditHeaders(headers, filteredData, dateHeader);
      
      if ((debitHeader || creditHeader) && filteredData.length > 0) {
        // 사용자가 선택한 금액 타입에 따라 금액 추출
        const amounts = filteredData
          .map(row => {
            let amount = 0;
            if (musAmountType === 'debit' && debitHeader) {
              amount = Math.abs(cleanAmount(row[debitHeader]));
            } else if (musAmountType === 'credit' && creditHeader) {
              amount = Math.abs(cleanAmount(row[creditHeader]));
            } else if (musAmountType === 'both') {
              if (debitHeader) amount += Math.abs(cleanAmount(row[debitHeader]));
              if (creditHeader) amount += Math.abs(cleanAmount(row[creditHeader]));
            }
            return amount;
          })
          .filter(amt => amt > 0);

        if (amounts.length > 0) {
          // 통계 계산
          const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
          const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
          const stdDev = Math.sqrt(variance);
          const sorted = [...amounts].sort((a, b) => a - b);
          const q1 = sorted[Math.floor(sorted.length * 0.25)];
          const q3 = sorted[Math.floor(sorted.length * 0.75)];
          const iqr = q3 - q1;

          // 이상거래 인덱스 찾기 (심각도 "높음"만) - 사용자가 선택한 차변/대변에 따라
          filteredData.forEach((row, index) => {
            let amount = 0;
            if (musAmountType === 'debit' && debitHeader) {
              amount = Math.abs(cleanAmount(row[debitHeader]));
            } else if (musAmountType === 'credit' && creditHeader) {
              amount = Math.abs(cleanAmount(row[creditHeader]));
            } else if (musAmountType === 'both') {
              if (debitHeader) amount += Math.abs(cleanAmount(row[debitHeader]));
              if (creditHeader) amount += Math.abs(cleanAmount(row[creditHeader]));
            }
            if (amount <= 0) return;

            let severity: 'high' | 'medium' | 'low' = 'low';
            
            // Z-score 기반
            const zScore = (amount - mean) / stdDev;
            if (Math.abs(zScore) > 3) {
              severity = 'high';
            } else if (Math.abs(zScore) > 2) {
              severity = 'medium';
            }
            
            // IQR 기반
            const lowerBound = q1 - 1.5 * iqr;
            const upperBound = q3 + 1.5 * iqr;
            if (amount < lowerBound || amount > upperBound) {
              if (severity === 'low') severity = 'medium';
            }
            
            // 평균의 10배 이상
            if (amount > mean * 10) {
              if (severity === 'low') severity = 'medium';
            }
            
            // 최대값과 동일하고 평균의 5배 이상
            const maxAmount = Math.max(...amounts);
            if (amount === maxAmount && maxAmount > mean * 5) {
              severity = 'high';
            }

            // 심각도 "높음"만 포함
            if (severity === 'high') {
              detectedAnomalyIndices.add(index);
            }
          });
        }
      }
      
      if (detectedAnomalyIndices.size > 0) {
        // 심각도 높음 이상거래만 포함 (샘플 크기 초과 방지)
        const highSeverityIndices = Array.from(detectedAnomalyIndices)
          .filter(idx => idx < filteredData.length)
          .slice(0, finalSampleSize); // 샘플 크기를 초과하지 않도록 제한
        
        anomalySamples = highSeverityIndices.map(idx => filteredData[idx]);
        
        // 이상거래 객체 Set 생성 (중복 확인용)
        const anomalySet = new Set(anomalySamples);
        setAnomalyRowObjects(anomalySet);
        setAnomalyRows(new Set(highSeverityIndices));
        
        // 이상거래 제외한 데이터
        remainingData = filteredData.filter((_, idx) => !highSeverityIndices.includes(idx));
        remainingSize = Math.max(0, finalSampleSize - anomalySamples.length);
        
        // 중복 제거
        remainingData = remainingData.filter(row => !anomalySet.has(row));
      } else {
        setAnomalyRowObjects(new Set());
        setAnomalyRows(new Set());
      }
    } else {
      setAnomalyRowObjects(new Set());
      setAnomalyRows(new Set());
    }
    
    const size = Math.min(remainingSize, remainingData.length);
    let samples: LedgerRow[] = [];

    // 사용자가 선택한 차변/대변에 해당하는 금액이 있는 행만 필터링
    let dataWithAmount: LedgerRow[] = [];
    let debitHeader: string | undefined;
    let creditHeader: string | undefined;
    
    if (remainingData.length > 0) {
      const headers = Object.keys(remainingData[0] || {});
      const dateHeader = headers.find(h => 
        h.includes('일자') || h.includes('날짜')
      );
      const headersResult = findDebitCreditHeaders(headers, remainingData, dateHeader);
      debitHeader = headersResult.debitHeader;
      creditHeader = headersResult.creditHeader;
      
      dataWithAmount = remainingData.filter(row => {
      if (isSummaryRow(row)) return false;
      let amount = 0;
      if (musAmountType === 'debit' && debitHeader) {
        amount = Math.abs(cleanAmount(row[debitHeader]));
      } else if (musAmountType === 'credit' && creditHeader) {
        amount = Math.abs(cleanAmount(row[creditHeader]));
      } else if (musAmountType === 'both') {
        if (debitHeader) amount += Math.abs(cleanAmount(row[debitHeader]));
        if (creditHeader) amount += Math.abs(cleanAmount(row[creditHeader]));
      }
      return amount > 0;
      });
    }

    switch (samplingMethod) {
      case 'random':
        // 랜덤 샘플링 (사용자가 선택한 차변/대변에 해당하는 금액이 있는 행만)
        const indices = new Set<number>();
        while (indices.size < size && indices.size < dataWithAmount.length) {
          indices.add(Math.floor(Math.random() * dataWithAmount.length));
        }
        samples = Array.from(indices).map(i => dataWithAmount[i]);
        break;

      case 'systematic':
        // 체계적 샘플링 (등간격, 사용자가 선택한 차변/대변에 해당하는 금액이 있는 행만)
        if (dataWithAmount.length === 0) {
          samples = [];
          break;
        }
        const interval = Math.floor(dataWithAmount.length / size);
        const start = Math.floor(Math.random() * interval);
        for (let i = 0; i < size && i < dataWithAmount.length; i++) {
          const index = (start + i * interval) % dataWithAmount.length;
          samples.push(dataWithAmount[index]);
        }
        break;

      case 'mus':
        // MUS (Monetary Unit Sampling) - 금액 기준 (이상거래 제외한 데이터에서)
        // 사용자가 선택한 차변/대변에 해당하는 금액이 있는 행만 사용
        if (dataWithAmount.length === 0) {
          samples = [];
          break;
        }
        
        if (!debitHeader && !creditHeader) {
          toast({
            title: '오류',
            description: '차변 또는 대변 열을 찾을 수 없습니다.',
            variant: 'destructive',
          });
          return;
        }

        // 선택된 금액 타입에 따라 금액 추출 (이미 필터링된 dataWithAmount 사용)
        const cumulativeAmounts: { row: LedgerRow; cumulative: number }[] = [];
        let total = 0;
        dataWithAmount.forEach(row => {
          let amount = 0;
          if (musAmountType === 'debit' && debitHeader) {
            amount = Math.abs(cleanAmount(row[debitHeader]));
          } else if (musAmountType === 'credit' && creditHeader) {
            amount = Math.abs(cleanAmount(row[creditHeader]));
          } else if (musAmountType === 'both') {
            if (debitHeader) amount += Math.abs(cleanAmount(row[debitHeader]));
            if (creditHeader) amount += Math.abs(cleanAmount(row[creditHeader]));
          }
          
          if (amount > 0) {
            total += amount;
            cumulativeAmounts.push({ row, cumulative: total });
          }
        });

        if (total === 0) {
          toast({
            title: '오류',
            description: '금액이 0인 거래만 있거나 선택한 금액 타입에 해당하는 데이터가 없습니다.',
            variant: 'destructive',
          });
          return;
        }

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

        samples = Array.from(selectedIndices).map(i => cumulativeAmounts[i].row);
        break;
    }

    // 이상거래와 일반 샘플 합치기 (샘플 크기 초과 방지)
    const finalSamples = [...anomalySamples, ...samples].slice(0, finalSampleSize);
    
    setSampledData(finalSamples);
    toast({
      title: '샘플링 완료',
      description: `${finalSamples.length}건의 샘플을 추출했습니다.${anomalySamples.length > 0 ? ` (심각도 높음 이상거래 ${anomalySamples.length}건 포함)` : ''}`,
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

    try {
    const wb = XLSX.utils.book_new();
      
      // 샘플링 방법 이름
      const samplingMethodName = samplingMethod === 'random' ? '무작위' : samplingMethod === 'systematic' ? '체계적' : 'MUS';
      
      // 이상거래 포함 여부에 따라 구분 열 추가, 샘플링 방법을 오른쪽 끝에 추가
      const exportData = sampledData.map((row, idx) => {
        const isAnomaly = includeAnomalies && anomalyRowObjects.has(row);
        const rowData: any = {
          ...row,
        };
        // 이상거래가 포함된 경우에만 구분 열 추가
        if (includeAnomalies) {
          rowData['구분'] = isAnomaly ? '이상거래' : '일반';
        }
        // 샘플링 방법을 오른쪽 끝에 추가
        rowData['샘플링방법'] = samplingMethodName;
        return rowData;
      });
      
      // 구분 설명과 헤더를 포함한 데이터 생성
      const originalHeaders = Object.keys(sampledData[0] || {});
      const headers = includeAnomalies 
        ? ['구분', ...originalHeaders, '샘플링방법']
        : [...originalHeaders, '샘플링방법'];
      
      // 설명 행 추가
      const descriptionRow: any[] = [];
      if (includeAnomalies) {
        descriptionRow.push('※ 구분: "이상거래"는 심각도가 높은 이상거래를 의미하며 (Z-score 3 이상, 최대값 등), "일반"은 일반 샘플링으로 추출된 거래를 의미합니다.');
        // 나머지 셀은 비워두기
        for (let i = 1; i < headers.length; i++) {
          descriptionRow.push('');
        }
      }
      
      // 데이터 행 생성
      const dataRows = exportData.map(row => {
        return headers.map(header => {
          if (header === '구분') return row['구분'];
          if (header === '샘플링방법') return row['샘플링방법'];
          return row[header] ?? '';
        });
      });
      
      // 전체 데이터 (설명 + 헤더 + 데이터)
      const allRows: any[][] = [];
      if (includeAnomalies && descriptionRow.length > 0) {
        allRows.push(descriptionRow);
      }
      allRows.push(headers);
      allRows.push(...dataRows);
      
      const ws = XLSX.utils.aoa_to_sheet(allRows);
    
    XLSX.utils.book_append_sheet(wb, ws, '샘플');
      
      // 이상거래 정보 시트 추가
      if (includeAnomalies && anomalyRows.size > 0) {
        const anomalyInfo = [
          ['이상거래 포함 샘플링 정보'],
          ['계정과목', selectedAccount],
          ['샘플링 방법', samplingMethodName],
          ['전체 샘플 수', sampledData.length],
          ['이상거래 포함 수', Array.from(anomalyRowObjects).filter(row => sampledData.includes(row)).length],
          ['일반 샘플 수', sampledData.length - Array.from(anomalyRowObjects).filter(row => sampledData.includes(row)).length],
          [''],
          ['구분 설명'],
          ['이상거래', '심각도가 높은 이상거래를 의미합니다. (Z-score 3 이상, 최대값 등)'],
          ['일반', '일반 샘플링 방법으로 추출된 거래를 의미합니다.'],
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(anomalyInfo);
        XLSX.utils.book_append_sheet(wb, ws2, '이상거래정보');
      }
      
    XLSX.writeFile(wb, `감사샘플_${selectedAccount}_${samplingMethod}_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: '다운로드 완료',
      description: '샘플 데이터를 다운로드했습니다.',
    });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `다운로드 실패: ${error.message}`,
        variant: 'destructive',
      });
    }
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
                disabled={samplingMethod === 'mus' && useStatisticalTable && calculatedSampleSize !== null}
              />
              {samplingMethod === 'mus' && useStatisticalTable && calculatedSampleSize !== null ? (
                <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                  계산된 샘플 크기: {calculatedSampleSize.toLocaleString()}건
                </p>
              ) : (
              <p className="text-xs text-muted-foreground">
                권장: 30~100건
              </p>
              )}
            </div>
          </div>

          {/* MUS 전용 옵션 */}
          {samplingMethod === 'mus' && (
            <Card className="bg-muted/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  MUS 샘플링 옵션
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 금액 타입 선택 */}
                <div className="space-y-2">
                  <Label>금액 타입</Label>
                  <RadioGroup value={musAmountType} onValueChange={(v: any) => setMusAmountType(v)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="debit" id="debit" />
                      <Label htmlFor="debit" className="font-normal cursor-pointer">차변만</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="credit" id="credit" />
                      <Label htmlFor="credit" className="font-normal cursor-pointer">대변만</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="both" id="both" />
                      <Label htmlFor="both" className="font-normal cursor-pointer">차변+대변 모두</Label>
                    </div>
                  </RadioGroup>
                  {musTotalAmount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      모집단 금액 ({musAmountType === 'debit' ? '차변' : musAmountType === 'credit' ? '대변' : '차변+대변'}): ₩{musTotalAmount.toLocaleString()}
                    </p>
                  )}
                </div>

                {/* 통계표 기반 샘플 크기 계산 */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="useStatisticalTable"
                      checked={useStatisticalTable}
                      onChange={(e) => {
                        setUseStatisticalTable(e.target.checked);
                        if (e.target.checked && calculatedSampleSize) {
                          setSampleSize(calculatedSampleSize.toString());
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <Label htmlFor="useStatisticalTable" className="font-normal cursor-pointer">
                      통계표 기반 샘플 크기 계산 사용
                    </Label>
                  </div>
                  
                  {useStatisticalTable && (
                    <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <Label htmlFor="materiality">수행중요성도 (원)</Label>
                        <Input
                          id="materiality"
                          type="text"
                          value={materiality}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9,]/g, '');
                            setMateriality(value);
                            if (value && musTotalAmount > 0) {
                              const materialityValue = parseFloat(value.replace(/,/g, '')) || 0;
                              if (materialityValue > 0) {
                                const calculated = calculateMUSSampleSize(musTotalAmount, materialityValue, confidenceLevel);
                                setSampleSize(calculated.toString());
                              }
                            }
                          }}
                          placeholder="예: 10,000,000"
                        />
                        <p className="text-xs text-muted-foreground">
                          감사에서 중요하게 간주하는 최소 오류 금액
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confidenceLevel">신뢰수준</Label>
                        <Select
                          value={confidenceLevel.toString()}
                          onValueChange={(v) => {
                            const level = parseInt(v);
                            setConfidenceLevel(level);
                            if (materiality && musTotalAmount > 0) {
                              const materialityValue = parseFloat(materiality.replace(/,/g, '')) || 0;
                              if (materialityValue > 0) {
                                const calculated = calculateMUSSampleSize(musTotalAmount, materialityValue, level);
                                setSampleSize(calculated.toString());
                              }
                            }
                          }}
                        >
                          <SelectTrigger id="confidenceLevel">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="90">90% (신뢰계수: 2.31)</SelectItem>
                            <SelectItem value="95">95% (신뢰계수: 3.00)</SelectItem>
                            <SelectItem value="99">99% (신뢰계수: 4.61)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          샘플이 모집단을 대표할 확률
                        </p>
                      </div>

                      {calculatedSampleSize !== null && (
                        <div className="p-3 bg-primary/10 rounded-md border border-primary/20">
                          <p className="text-sm font-semibold text-primary">
                            계산된 샘플 크기: {calculatedSampleSize.toLocaleString()}건
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            모집단 금액 ({musAmountType === 'debit' ? '차변' : musAmountType === 'credit' ? '대변' : '차변+대변'}): ₩{musTotalAmount.toLocaleString()} / 
                            수행중요성도: ₩{materiality.replace(/,/g, '') ? parseFloat(materiality.replace(/,/g, '')).toLocaleString() : '0'} / 
                            신뢰수준: {confidenceLevel}%
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 이상거래 포함 옵션 */}
          <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/50">
            <Checkbox
              id="includeAnomalies"
              checked={includeAnomalies}
              onCheckedChange={(checked) => setIncludeAnomalies(checked === true)}
            />
            <div className="flex-1">
              <Label htmlFor="includeAnomalies" className="cursor-pointer font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                이상거래 자동 포함
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                심각도가 "높음"인 이상거래만 자동으로 탐지하여 샘플에 우선 포함합니다. (Z-score 3 이상, 최대값 등)
                {anomalyRows.size > 0 && (
                  <span className="ml-2 text-orange-600 dark:text-orange-400 font-semibold">
                    발견된 심각도 높음 이상거래: {anomalyRows.size}건
                  </span>
                )}
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
              <CardTitle>
                샘플링 결과 ({sampledData.length}건)
                {includeAnomalies && anomalyRowObjects.size > 0 && (
                  <span className="ml-2 text-sm text-muted-foreground font-normal">
                    (이상거래 {Array.from(anomalyRowObjects).filter(row => sampledData.some(s => JSON.stringify(s) === JSON.stringify(row))).length}건 포함)
                  </span>
                )}
              </CardTitle>
              <Badge>
                {samplingMethod === 'random' && '랜덤'}
                {samplingMethod === 'systematic' && '체계적'}
                {samplingMethod === 'mus' && 'MUS'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* 구분 설명 */}
            {includeAnomalies && (
              <div className="mb-4 p-3 bg-muted/50 rounded-md border border-muted">
                <p className="text-sm font-semibold mb-2">구분 설명</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    <Badge variant="destructive" className="mr-2 text-xs">이상거래</Badge>
                    심각도가 높은 이상거래를 의미합니다. (Z-score 3 이상, 최대값 등)
                  </p>
                  <p>
                    <Badge variant="outline" className="mr-2 text-xs">일반</Badge>
                    일반 샘플링 방법으로 추출된 거래를 의미합니다.
                  </p>
                </div>
              </div>
            )}
            
            <div className="rounded-md border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {includeAnomalies && <TableHead className="w-20">구분</TableHead>}
                    {Object.keys(sampledData[0] || {}).map(key => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                    <TableHead className="w-24">샘플링방법</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampledData.map((row, idx) => {
                    const isAnomaly = includeAnomalies && anomalyRowObjects.has(row);
                    const samplingMethodName = samplingMethod === 'random' ? '무작위' : samplingMethod === 'systematic' ? '체계적' : 'MUS';
                    return (
                    <TableRow key={idx}>
                        {includeAnomalies && (
                          <TableCell>
                            {isAnomaly ? (
                              <Badge variant="destructive" className="text-xs">이상거래</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">일반</Badge>
                            )}
                          </TableCell>
                        )}
                      {Object.values(row).map((val, j) => (
                        <TableCell key={j} className="text-sm">
                          {val instanceof Date ? val.toLocaleDateString() : String(val ?? '')}
                        </TableCell>
                      ))}
                        <TableCell className="text-sm text-muted-foreground">
                          {samplingMethodName}
                        </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

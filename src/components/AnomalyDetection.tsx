import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Download, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Calendar, Building2 } from 'lucide-react';
import * as XLSX from 'xlsx';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface AnomalyDetectionProps {
  accountData: LedgerRow[];
  accountName: string;
  amountColumns: string[];
  dateColumns: string[];
  vendorColumns: string[];
}

const cleanAmount = (val: any): number => {
  if (typeof val === 'string') {
    return parseFloat(val.replace(/,/g, '')) || 0;
  }
  return typeof val === 'number' ? val : 0;
};

// 월계, 누계 행인지 확인하는 함수 (대괄호, 공백 무시)
const isSummaryRow = (row: LedgerRow): boolean => {
  // 모든 열의 값을 확인
  for (const value of Object.values(row)) {
    if (value === null || value === undefined) continue;
    
    // 문자열로 변환하고 대괄호, 공백 제거 후 소문자 변환
    const normalized = String(value).replace(/\s/g, '').replace(/[\[\]]/g, '').toLowerCase();
    
    // 월계 또는 누계가 포함되어 있으면 true
    if (normalized.includes('월계') || normalized.includes('누계')) {
      return true;
    }
  }
  return false;
};

interface AnomalyResult {
  row: LedgerRow;
  index: number;
  reasons: string[];
  severity: 'high' | 'medium' | 'low';
  amount: number;
  zScore?: number;
}

export const AnomalyDetection: React.FC<AnomalyDetectionProps> = ({
  accountData,
  accountName,
  amountColumns,
  dateColumns,
  vendorColumns,
}) => {
  const { toast } = useToast();
  const [selectedColumn, setSelectedColumn] = useState<string>(amountColumns[0] || '');
  
  // 거래처와 일자 열 자동 감지
  const allHeaders = useMemo(() => {
    if (accountData.length === 0) return [];
    return Object.keys(accountData[0] || {});
  }, [accountData]);
  
  const autoDetectedDateColumn = useMemo(() => {
    if (dateColumns.length > 0) return dateColumns[0];
    // 자동 감지
    return allHeaders.find(h => {
      const normalized = h.toLowerCase().replace(/\s/g, '');
      return normalized.includes('일자') || normalized.includes('날짜') || normalized.includes('date');
    }) || '';
  }, [dateColumns, allHeaders]);
  
  const autoDetectedVendorColumn = useMemo(() => {
    if (vendorColumns.length > 0) return vendorColumns[0];
    // 자동 감지
    return allHeaders.find(h => {
      const normalized = h.toLowerCase().replace(/\s/g, '');
      return normalized.includes('거래처') || normalized.includes('업체') || normalized.includes('vendor') || normalized.includes('customer');
    }) || '';
  }, [vendorColumns, allHeaders]);
  
  const [dateColumn, setDateColumn] = useState<string>(autoDetectedDateColumn);
  const [vendorColumn, setVendorColumn] = useState<string>(autoDetectedVendorColumn);
  const [anomalies, setAnomalies] = useState<AnomalyResult[]>([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  // dateColumn이나 vendorColumn이 변경되면 state 업데이트
  useEffect(() => {
    if (autoDetectedDateColumn && !dateColumn) {
      setDateColumn(autoDetectedDateColumn);
    }
  }, [autoDetectedDateColumn, dateColumn]);
  
  useEffect(() => {
    if (autoDetectedVendorColumn && !vendorColumn) {
      setVendorColumn(autoDetectedVendorColumn);
    }
  }, [autoDetectedVendorColumn, vendorColumn]);

  // 통계 계산 (월계, 누계 제외)
  const statistics = useMemo(() => {
    if (!selectedColumn || accountData.length === 0) return null;

    // 월계, 누계 행 제외
    const filteredData = accountData.filter(row => !isSummaryRow(row));
    
    const amounts = filteredData
      .map(row => cleanAmount(row[selectedColumn]))
      .filter(amt => amt > 0);

    if (amounts.length === 0) return null;

    const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // IQR 계산
    const sorted = [...amounts].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    return {
      mean,
      stdDev,
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      median: sorted[Math.floor(sorted.length / 2)],
      q1,
      q3,
      iqr,
      count: amounts.length,
    };
  }, [accountData, selectedColumn]);

  // 이상거래 탐지
  const detectAnomalies = () => {
    if (!selectedColumn || !statistics) {
      toast({
        title: '오류',
        description: '금액 열을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    const detectedAnomalies: AnomalyResult[] = [];

    // 월계, 누계 행 제외
    const filteredData = accountData.filter(row => !isSummaryRow(row));

    filteredData.forEach((row, index) => {
      const amount = cleanAmount(row[selectedColumn]);
      if (amount <= 0) return;

      const reasons: string[] = [];
      let severity: 'high' | 'medium' | 'low' = 'low';
      let zScore: number | undefined;

      // 1. Z-score 기반 이상치 탐지
      zScore = (amount - statistics.mean) / statistics.stdDev;
      if (Math.abs(zScore) > 3) {
        reasons.push(`Z-score ${zScore.toFixed(2)} (평균에서 3 표준편차 이상 벗어남)`);
        severity = 'high';
      } else if (Math.abs(zScore) > 2) {
        reasons.push(`Z-score ${zScore.toFixed(2)} (평균에서 2 표준편차 이상 벗어남)`);
        severity = severity === 'low' ? 'medium' : severity;
      }

      // 2. IQR 기반 이상치 탐지
      const lowerBound = statistics.q1 - 1.5 * statistics.iqr;
      const upperBound = statistics.q3 + 1.5 * statistics.iqr;
      if (amount < lowerBound || amount > upperBound) {
        if (amount > upperBound) {
          reasons.push(`상위 이상치 (IQR: ${upperBound.toLocaleString()}원 초과)`);
        } else {
          reasons.push(`하위 이상치 (IQR: ${lowerBound.toLocaleString()}원 미만)`);
        }
        if (severity === 'low') severity = 'medium';
      }

      // 3. 비정상적으로 큰 거래 (평균의 10배 이상)
      if (amount > statistics.mean * 10) {
        reasons.push(`비정상적으로 큰 거래 (평균의 ${(amount / statistics.mean).toFixed(1)}배)`);
        if (severity === 'low') severity = 'medium';
      }

      // 4. 반올림 패턴 탐지 (정확히 10,000원, 100,000원 등)
      const roundedPatterns = [
        1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000
      ];
      const isRounded = roundedPatterns.some(pattern => Math.abs(amount - pattern) < 1);
      if (isRounded && amount > statistics.mean) {
        reasons.push(`의심스러운 반올림 패턴 (${amount.toLocaleString()}원)`);
        if (severity === 'low') severity = 'low';
      }

      // 5. 최대값/최소값과 동일한 거래
      if (amount === statistics.max && statistics.max > statistics.mean * 5) {
        reasons.push(`최대값과 동일 (${statistics.max.toLocaleString()}원)`);
        severity = 'high';
      }

      if (reasons.length > 0) {
        detectedAnomalies.push({
          row,
          index,
          reasons,
          severity,
          amount,
          zScore,
        });
      }
    });

    // 심각도 순으로 정렬
    const severityOrder = { high: 3, medium: 2, low: 1 };
    detectedAnomalies.sort((a, b) => {
      if (severityOrder[b.severity] !== severityOrder[a.severity]) {
        return severityOrder[b.severity] - severityOrder[a.severity];
      }
      return Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0);
    });

    setAnomalies(detectedAnomalies);
    setIsAnalyzing(false);

    toast({
      title: '분석 완료',
      description: `${detectedAnomalies.length}건의 이상거래를 발견했습니다.`,
    });
  };

  // 심각도 높음 이상거래만 다운로드
  const downloadHighSeverityExcel = () => {
    const highSeverityAnomalies = anomalies.filter(a => a.severity === 'high');
    
    if (highSeverityAnomalies.length === 0) {
      toast({
        title: '알림',
        description: '심각도가 높은 이상거래가 없습니다.',
        variant: 'default',
      });
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      
      // 통계 정보
      const statsData = statistics ? [
        ['심각도 높음 이상거래 탐지 결과'],
        ['계정과목', accountName],
        ['분석일시', new Date().toLocaleString('ko-KR')],
        ['심각도 높음 거래 수', highSeverityAnomalies.length],
        [],
        ['통계 정보'],
        ['평균', Math.round(statistics.mean).toLocaleString()],
        ['표준편차', Math.round(statistics.stdDev).toLocaleString()],
        ['최소값', Math.round(statistics.min).toLocaleString()],
        ['최대값', Math.round(statistics.max).toLocaleString()],
        ['중앙값', Math.round(statistics.median).toLocaleString()],
        ['1사분위수 (Q1)', Math.round(statistics.q1).toLocaleString()],
        ['3사분위수 (Q3)', Math.round(statistics.q3).toLocaleString()],
        ['IQR', Math.round(statistics.iqr).toLocaleString()],
        [],
        ['심각도 높음 이상거래 목록'],
      ] : [];

      // 이상거래 데이터
      const headers = ['순번', '심각도'];
      if (dateColumn) headers.push('일자');
      if (vendorColumn) headers.push('거래처');
      headers.push('금액', 'Z-score', '이유');
      
      // 나머지 열 추가 (이미 포함된 열 제외)
      const otherColumns = highSeverityAnomalies[0] ? Object.keys(highSeverityAnomalies[0].row || {}).filter(key => 
        key !== dateColumn && key !== vendorColumn && key !== selectedColumn
      ) : [];
      headers.push(...otherColumns);
      
      const anomalyData = [
        headers,
        ...highSeverityAnomalies.map((anomaly, idx) => {
          const row: any[] = [
            idx + 1,
            '높음',
          ];
          
          if (dateColumn) {
            const dateValue = anomaly.row[dateColumn];
            if (dateValue instanceof Date) {
              row.push(dateValue.toLocaleDateString('ko-KR'));
            } else {
              row.push(dateValue ? String(dateValue) : '');
            }
          }
          
          if (vendorColumn) {
            row.push(anomaly.row[vendorColumn] ? String(anomaly.row[vendorColumn]) : '');
          }
          
          row.push(
            anomaly.amount.toLocaleString(),
            anomaly.zScore?.toFixed(2) || '',
            anomaly.reasons.join('; ')
          );
          
          // 나머지 열 추가
          otherColumns.forEach(col => {
            row.push(anomaly.row[col] ? String(anomaly.row[col]) : '');
          });
          
          return row;
        }),
      ];

      const ws = XLSX.utils.aoa_to_sheet([...statsData, ...anomalyData]);
      XLSX.utils.book_append_sheet(wb, ws, '심각도높음');
      XLSX.writeFile(wb, `이상거래탐지_심각도높음_${accountName}_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: '다운로드 완료',
        description: `심각도 높음 이상거래 ${highSeverityAnomalies.length}건을 다운로드했습니다.`,
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `다운로드 실패: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  // 엑셀 다운로드
  const downloadExcel = () => {
    if (anomalies.length === 0) {
      toast({
        title: '오류',
        description: '다운로드할 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      
      // 통계 정보
      const statsData = statistics ? [
        ['이상거래 탐지 결과'],
        ['계정과목', accountName],
        ['분석일시', new Date().toLocaleString('ko-KR')],
        [],
        ['통계 정보'],
        ['평균', Math.round(statistics.mean).toLocaleString()],
        ['표준편차', Math.round(statistics.stdDev).toLocaleString()],
        ['최소값', Math.round(statistics.min).toLocaleString()],
        ['최대값', Math.round(statistics.max).toLocaleString()],
        ['중앙값', Math.round(statistics.median).toLocaleString()],
        ['1사분위수 (Q1)', Math.round(statistics.q1).toLocaleString()],
        ['3사분위수 (Q3)', Math.round(statistics.q3).toLocaleString()],
        ['IQR', Math.round(statistics.iqr).toLocaleString()],
        [],
        ['이상거래 목록'],
      ] : [];

      // 이상거래 데이터
      const headers = ['순번', '심각도'];
      if (dateColumn) headers.push('일자');
      if (vendorColumn) headers.push('거래처');
      headers.push('금액', 'Z-score', '이유');
      
      // 나머지 열 추가 (이미 포함된 열 제외)
      const otherColumns = Object.keys(anomalies[0]?.row || {}).filter(key => 
        key !== dateColumn && key !== vendorColumn && key !== selectedColumn
      );
      headers.push(...otherColumns);
      
      const anomalyData = [
        headers,
        ...anomalies.map((anomaly, idx) => {
          const row: any[] = [
            idx + 1,
            anomaly.severity === 'high' ? '높음' : anomaly.severity === 'medium' ? '중간' : '낮음',
          ];
          
          if (dateColumn) {
            const dateValue = anomaly.row[dateColumn];
            if (dateValue instanceof Date) {
              row.push(dateValue.toLocaleDateString('ko-KR'));
            } else {
              row.push(dateValue ? String(dateValue) : '');
            }
          }
          
          if (vendorColumn) {
            row.push(anomaly.row[vendorColumn] ? String(anomaly.row[vendorColumn]) : '');
          }
          
          row.push(
            anomaly.amount.toLocaleString(),
            anomaly.zScore?.toFixed(2) || '',
            anomaly.reasons.join('; ')
          );
          
          // 나머지 열 추가
          otherColumns.forEach(col => {
            row.push(anomaly.row[col] ? String(anomaly.row[col]) : '');
          });
          
          return row;
        }),
      ];

      const ws = XLSX.utils.aoa_to_sheet([...statsData, ...anomalyData]);
      XLSX.utils.book_append_sheet(wb, ws, '이상거래탐지');
      XLSX.writeFile(wb, `이상거래탐지_${accountName}_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: '다운로드 완료',
        description: '이상거래 탐지 결과를 다운로드했습니다.',
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `다운로드 실패: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'high':
        return '높음';
      case 'medium':
        return '중간';
      case 'low':
        return '낮음';
      default:
        return severity;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            이상거래 탐지
          </CardTitle>
          <CardDescription>
            통계적 방법을 사용하여 각 계정의 이상거래를 자동으로 탐지합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 설정 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">금액 열 선택</label>
              <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {amountColumns.map(col => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dateColumns.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">일자 열 선택 (선택사항)</label>
                <Select value={dateColumn} onValueChange={setDateColumn}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dateColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {vendorColumns.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">거래처 열 선택 (선택사항)</label>
                <Select value={vendorColumn} onValueChange={setVendorColumn}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 통계 정보 */}
          {statistics && (
            <div className="rounded-lg border p-4 bg-muted/50">
              <h4 className="text-sm font-semibold mb-3">통계 정보</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">평균</div>
                  <div className="font-semibold">{Math.round(statistics.mean).toLocaleString()}원</div>
                </div>
                <div>
                  <div className="text-muted-foreground">표준편차</div>
                  <div className="font-semibold">{Math.round(statistics.stdDev).toLocaleString()}원</div>
                </div>
                <div>
                  <div className="text-muted-foreground">최소값</div>
                  <div className="font-semibold">{Math.round(statistics.min).toLocaleString()}원</div>
                </div>
                <div>
                  <div className="text-muted-foreground">최대값</div>
                  <div className="font-semibold">{Math.round(statistics.max).toLocaleString()}원</div>
                </div>
              </div>
            </div>
          )}

          {/* 분석 버튼 */}
          <Button
            onClick={detectAnomalies}
            disabled={isAnalyzing || !selectedColumn}
            className="w-full"
          >
            {isAnalyzing ? '분석 중...' : '이상거래 탐지 시작'}
          </Button>

          {/* 결과 */}
          {anomalies.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  발견된 이상거래: {anomalies.length}건
                  {anomalies.filter(a => a.severity === 'high').length > 0 && (
                    <span className="ml-2 text-destructive">
                      (심각도 높음: {anomalies.filter(a => a.severity === 'high').length}건)
                    </span>
                  )}
                </h4>
                <div className="flex gap-2">
                  {anomalies.filter(a => a.severity === 'high').length > 0 && (
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={downloadHighSeverityExcel}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      심각도 높음 다운로드
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={downloadExcel}>
                    <Download className="mr-2 h-4 w-4" />
                    전체 다운로드
                  </Button>
                </div>
              </div>

              <div className="rounded-md border max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">순번</TableHead>
                      <TableHead>심각도</TableHead>
                      {dateColumn && <TableHead>일자</TableHead>}
                      {vendorColumn && <TableHead>거래처</TableHead>}
                      <TableHead className="text-right">금액</TableHead>
                      <TableHead className="text-right">Z-score</TableHead>
                      <TableHead>이유</TableHead>
                      <TableHead>상세보기</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.map((anomaly, idx) => {
                      // 거래처와 날짜 값 가져오기 (정확한 열 이름으로)
                      let dateValue = null;
                      let vendorValue = null;
                      
                      if (dateColumn) {
                        // 정확한 열 이름으로 먼저 시도
                        dateValue = anomaly.row[dateColumn];
                        // 없으면 유사한 열 이름 찾기
                        if (!dateValue || dateValue === '') {
                          const dateHeaders = Object.keys(anomaly.row).filter(key => {
                            const normalized = key.toLowerCase().replace(/\s/g, '');
                            return normalized.includes('일자') || normalized.includes('날짜') || normalized.includes('date');
                          });
                          if (dateHeaders.length > 0) {
                            dateValue = anomaly.row[dateHeaders[0]];
                          }
                        }
                      }
                      
                      if (vendorColumn) {
                        // 정확한 열 이름으로 먼저 시도
                        vendorValue = anomaly.row[vendorColumn];
                        // 없으면 유사한 열 이름 찾기
                        if (!vendorValue || vendorValue === '') {
                          const vendorHeaders = Object.keys(anomaly.row).filter(key => {
                            const normalized = key.toLowerCase().replace(/\s/g, '');
                            return normalized.includes('거래처') || normalized.includes('업체') || normalized.includes('vendor') || normalized.includes('customer');
                          });
                          if (vendorHeaders.length > 0) {
                            vendorValue = anomaly.row[vendorHeaders[0]];
                          }
                        }
                      }
                      
                      // 날짜 포맷팅
                      let formattedDate = '-';
                      if (dateValue) {
                        if (dateValue instanceof Date) {
                          formattedDate = dateValue.toLocaleDateString('ko-KR');
                        } else if (dateValue !== null && dateValue !== undefined && dateValue !== '') {
                          formattedDate = String(dateValue);
                        }
                      }
                      
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>
                            <Badge variant={getSeverityColor(anomaly.severity) as any}>
                              {getSeverityLabel(anomaly.severity)}
                            </Badge>
                          </TableCell>
                          {dateColumn && (
                            <TableCell className="text-sm">
                              {formattedDate}
                            </TableCell>
                          )}
                          {vendorColumn && (
                            <TableCell className="text-sm">
                              {vendorValue ? String(vendorValue) : '-'}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-semibold">
                            {anomaly.amount.toLocaleString()}원
                          </TableCell>
                          <TableCell className="text-right">
                            {anomaly.zScore?.toFixed(2) || '-'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {anomaly.reasons[0]}
                            {anomaly.reasons.length > 1 && ` 외 ${anomaly.reasons.length - 1}개`}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedAnomaly(anomaly)}
                            >
                              보기
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 다이얼로그 */}
      <Dialog open={!!selectedAnomaly} onOpenChange={(open) => !open && setSelectedAnomaly(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>이상거래 상세 정보</DialogTitle>
              {selectedAnomaly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!selectedAnomaly) return;
                    
                    try {
                      const wb = XLSX.utils.book_new();
                      
                      // 기본 정보
                      const basicInfo = [
                        ['이상거래 상세 정보'],
                        ['계정과목', accountName],
                        ['생성일시', new Date().toLocaleString('ko-KR')],
                        [],
                        ['기본 정보'],
                        ['심각도', getSeverityLabel(selectedAnomaly.severity)],
                        ['금액', selectedAnomaly.amount.toLocaleString()],
                        ['Z-score', selectedAnomaly.zScore?.toFixed(2) || '-'],
                        [],
                        ['탐지된 이유'],
                        ...selectedAnomaly.reasons.map(reason => [reason]),
                        [],
                        ['거래 상세 정보'],
                        ['항목', '값'],
                        ...Object.entries(selectedAnomaly.row).map(([key, value]) => [
                          key,
                          value instanceof Date ? value.toLocaleString('ko-KR') : String(value || '-')
                        ]),
                      ];
                      
                      const ws = XLSX.utils.aoa_to_sheet(basicInfo);
                      XLSX.utils.book_append_sheet(wb, ws, '이상거래상세');
                      XLSX.writeFile(wb, `이상거래상세_${accountName}_${new Date().toISOString().split('T')[0]}.xlsx`);
                      
                      toast({
                        title: '다운로드 완료',
                        description: '이상거래 상세 정보를 다운로드했습니다.',
                      });
                    } catch (error: any) {
                      toast({
                        title: '오류',
                        description: `다운로드 실패: ${error.message}`,
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  엑셀 다운로드
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedAnomaly && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">심각도</div>
                  <Badge variant={getSeverityColor(selectedAnomaly.severity) as any}>
                    {getSeverityLabel(selectedAnomaly.severity)}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">금액</div>
                  <div className="font-semibold">{selectedAnomaly.amount.toLocaleString()}원</div>
                </div>
                {selectedAnomaly.zScore && (
                  <div>
                    <div className="text-sm text-muted-foreground">Z-score</div>
                    <div className="font-semibold">{selectedAnomaly.zScore.toFixed(2)}</div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">탐지된 이유</div>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {selectedAnomaly.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">거래 상세 정보</div>
                <div className="rounded-md border p-4">
                  <Table>
                    <TableBody>
                      {Object.entries(selectedAnomaly.row).map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell className="font-medium w-1/3">{key}</TableCell>
                          <TableCell>{String(value || '-')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};


import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, TrendingUp, Loader2, Sparkles, Download } from 'lucide-react';
import { analyzeWithFlash, hasApiKey, estimateTokens, estimateCost } from '@/lib/geminiClient';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, LabelProps } from 'recharts';

type LedgerRow = { [key: string]: string | number | Date | undefined };

interface FinancialStatementAnalysisProps {
  workbook: XLSX.WorkBook;
  onBack: () => void;
  getFinancialStatementData: (worksheet: XLSX.WorkSheet | undefined) => { data: LedgerRow[], headers: string[], orderedHeaders: string[] };
  ledgerWorkbook?: XLSX.WorkBook | null; // 계정별원장 데이터 (당기)
  previousLedgerWorkbook?: XLSX.WorkBook | null; // 전기 계정별원장 데이터
  getDataFromSheet?: (worksheet: XLSX.WorkSheet | undefined) => { data: LedgerRow[], headers: string[], orderedHeaders: string[] }; // 계정별원장 파싱 함수
}

interface FinancialStatementRow {
  과목: string;
  당기금액: number;
  전기금액: number;
  증감금액: number;
  증감율: number;
  유의적변동: boolean;
}

const cleanAmount = (val: any): number => {
  if (typeof val === 'string') {
    return parseFloat(val.replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
  }
  return typeof val === 'number' ? val : 0;
};

export const FinancialStatementAnalysis: React.FC<FinancialStatementAnalysisProps> = ({
  workbook,
  onBack,
  getFinancialStatementData,
  ledgerWorkbook,
  previousLedgerWorkbook,
  getDataFromSheet,
}) => {
  const { toast } = useToast();
  const [thresholdAmount, setThresholdAmount] = useState<number>(100000000); // 기본값: 1억원
  const [selectedView, setSelectedView] = useState<'balance' | 'income' | 'ratios'>('balance'); // 선택된 뷰
  const [analyzingAccount, setAnalyzingAccount] = useState<string | null>(null); // 분석 중인 계정
  const [analysisResults, setAnalysisResults] = useState<Record<string, string>>({}); // 분석 결과 저장
  const [costEstimates, setCostEstimates] = useState<Record<string, { tokens: number; cost: number }>>({}); // 요금 추정
  const ratiosRef = useRef<HTMLDivElement>(null); // 재무비율 섹션 참조

  // 시트명으로 재무상태표와 손익계산서 찾기
  const balanceSheetSheet = useMemo(() => {
    return workbook.SheetNames.find(name => 
      name.includes('재무상태표') || 
      name.includes('대차대조표') || 
      name.toLowerCase().includes('balance') ||
      name.includes('상태표')
    ) || workbook.SheetNames[0] || '';
  }, [workbook.SheetNames]);

  const incomeStatementSheet = useMemo(() => {
    return workbook.SheetNames.find(name => 
      name.includes('손익계산서') || 
      name.includes('손익') || 
      name.toLowerCase().includes('income') ||
      name.toLowerCase().includes('profit')
    ) || null;
  }, [workbook.SheetNames]);

  // 재무상태표 데이터 파싱
  const balanceSheetData = useMemo(() => {
    if (!balanceSheetSheet) return [];
    const worksheet = workbook.Sheets[balanceSheetSheet];
    const { data, headers, orderedHeaders } = getFinancialStatementData(worksheet);

    // 헤더에서 "과목", "당기", "전기" 찾기
    const subjectHeader = orderedHeaders.find(h => h.includes('과목') || h.toLowerCase().includes('subject'));
    const currentHeader = orderedHeaders.find(h => h.includes('당기') || h.toLowerCase().includes('current'));
    const previousHeader = orderedHeaders.find(h => h.includes('전기') || h.toLowerCase().includes('previous'));

    if (!subjectHeader || (!currentHeader && !previousHeader)) {
      return [];
    }

    return data.map(row => {
      const 과목 = String(row[subjectHeader] || '').trim();
      const 당기금액 = cleanAmount(row[currentHeader || '']);
      const 전기금액 = cleanAmount(row[previousHeader || '']);
      const 증감금액 = 당기금액 - 전기금액;
      const 증감율 = 전기금액 !== 0 ? (증감금액 / Math.abs(전기금액)) * 100 : (당기금액 !== 0 ? 100 : 0);
      const 유의적변동 = Math.abs(증감금액) > thresholdAmount;

      return {
        과목,
        당기금액,
        전기금액,
        증감금액,
        증감율,
        유의적변동,
      } as FinancialStatementRow;
    }).filter(row => row.과목 !== ''); // 빈 과목 제거
  }, [workbook, balanceSheetSheet, getFinancialStatementData, thresholdAmount]);

  // 손익계산서 데이터 파싱
  const incomeStatementData = useMemo(() => {
    if (!incomeStatementSheet) return [];
    const worksheet = workbook.Sheets[incomeStatementSheet];
    const { data, headers, orderedHeaders } = getFinancialStatementData(worksheet);

    // 헤더에서 "과목", "당기", "전기" 찾기
    const subjectHeader = orderedHeaders.find(h => h.includes('과목') || h.toLowerCase().includes('subject'));
    const currentHeader = orderedHeaders.find(h => h.includes('당기') || h.toLowerCase().includes('current'));
    const previousHeader = orderedHeaders.find(h => h.includes('전기') || h.toLowerCase().includes('previous'));

    if (!subjectHeader || (!currentHeader && !previousHeader)) {
      return [];
    }

    return data.map(row => {
      const 과목 = String(row[subjectHeader] || '').trim();
      const 당기금액 = cleanAmount(row[currentHeader || '']);
      const 전기금액 = cleanAmount(row[previousHeader || '']);
      const 증감금액 = 당기금액 - 전기금액;
      const 증감율 = 전기금액 !== 0 ? (증감금액 / Math.abs(전기금액)) * 100 : (당기금액 !== 0 ? 100 : 0);
      const 유의적변동 = Math.abs(증감금액) > thresholdAmount;

      return {
        과목,
        당기금액,
        전기금액,
        증감금액,
        증감율,
        유의적변동,
      } as FinancialStatementRow;
    }).filter(row => row.과목 !== ''); // 빈 과목 제거
  }, [workbook, incomeStatementSheet, getFinancialStatementData, thresholdAmount]);

  // 통합 데이터 (재무상태표 + 손익계산서)
  const financialData = useMemo(() => {
    return [...balanceSheetData, ...incomeStatementData];
  }, [balanceSheetData, incomeStatementData]);

  // 커스텀 라벨 컴포넌트 (유의/중요 표시)
  const CustomSignificanceLabel = (props: any) => {
    const { x, y, width, value, payload } = props;
    if (!payload || !payload.significance || payload.significance === 'normal') {
      return null;
    }

    // 세로형 그래프이므로 x는 막대의 끝 위치, y는 막대의 세로 위치
    const labelX = (x || 0) + (width || 0) + 10;
    const labelY = (y || 0) + 10;

    if (payload.significance === 'important') {
      return (
        <g>
          <rect
            x={labelX}
            y={labelY - 12}
            width={40}
            height={20}
            fill="white"
            stroke="#dc2626"
            strokeWidth={2}
            strokeDasharray="4 4"
            rx={2}
          />
          <text
            x={labelX + 20}
            y={labelY + 2}
            textAnchor="middle"
            fill="#dc2626"
            fontSize={12}
            fontWeight="bold"
          >
            중요
          </text>
        </g>
      );
    } else if (payload.significance === 'significant') {
      return (
        <g>
          <rect
            x={labelX}
            y={labelY - 12}
            width={40}
            height={20}
            fill="white"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="4 4"
            rx={2}
          />
          <text
            x={labelX + 20}
            y={labelY + 2}
            textAnchor="middle"
            fill="#f59e0b"
            fontSize={12}
            fontWeight="bold"
          >
            유의
          </text>
        </g>
      );
    }
    return null;
  };

  // 재무상태표 데이터를 자산/부채/자본으로 분류
  const categorizedBalanceSheetData = useMemo(() => {
    const assets: FinancialStatementRow[] = [];
    const liabilities: FinancialStatementRow[] = [];
    const equity: FinancialStatementRow[] = [];

    balanceSheetData.forEach(row => {
      const 과목 = row.과목.toLowerCase();
      
      // 자산 판단
      if (과목.includes('자산') && !과목.includes('부채') && !과목.includes('자본')) {
        assets.push(row);
      }
      // 부채 판단
      else if (과목.includes('부채') || 과목.includes('차입') || 과목.includes('미지급') || 과목.includes('예수금')) {
        liabilities.push(row);
      }
      // 자본 판단
      else if (과목.includes('자본') || 과목.includes('이익잉여금') || 과목.includes('자본금')) {
        equity.push(row);
      }
      // 기본값: 자산으로 분류 (재무상태표의 일반적인 순서)
      else {
        assets.push(row);
      }
    });

    return { assets, liabilities, equity };
  }, [balanceSheetData, thresholdAmount]);

  // 손익계산서 데이터를 비용/수익으로 분류
  const categorizedIncomeStatementData = useMemo(() => {
    const costs: FinancialStatementRow[] = [];
    const revenues: FinancialStatementRow[] = [];

    incomeStatementData.forEach(row => {
      const 과목 = row.과목.toLowerCase();
      
      // 매출 및 수익 판단
      if (과목.includes('매출') || 과목.includes('수익') || 과목.includes('영업외수익') || 
          과목.includes('영업외') || 과목.includes('기타수익') || 과목.includes('이자수익') ||
          과목.includes('배당금수익') || 과목.includes('외환차익')) {
        revenues.push(row);
      }
      // 비용 판단
      else if (과목.includes('비용') || 과목.includes('원가') || 과목.includes('판매비') ||
               과목.includes('관리비') || 과목.includes('영업외비용') || 과목.includes('기타비용') ||
               과목.includes('이자비용') || 과목.includes('외환차손') || 과목.includes('감가상각') ||
               과목.includes('급여') || 과목.includes('임대료') || 과목.includes('광고비')) {
        costs.push(row);
      }
      // 기본값: 비용으로 분류 (손익계산서의 일반적인 순서)
      else {
        costs.push(row);
      }
    });

    return { costs, revenues };
  }, [incomeStatementData, thresholdAmount]);

  // 그래프용 데이터 준비 (자산은 왼쪽, 부채/자본은 오른쪽)
  const chartData = useMemo(() => {
    const data: Array<{
      name: string;
      당기금액: number;
      전기금액: number;
      증감금액: number;
      category: 'asset' | 'liability' | 'equity';
      significance: 'normal' | 'significant' | 'important';
    }> = [];

    // 자산 데이터 (왼쪽)
    categorizedBalanceSheetData.assets.forEach(row => {
      const absChange = Math.abs(row.증감금액);
      let significance: 'normal' | 'significant' | 'important' = 'normal';
      if (absChange >= thresholdAmount * 2) {
        significance = 'important';
      } else if (absChange > thresholdAmount) {
        significance = 'significant';
      }

      data.push({
        name: row.과목,
        당기금액: row.당기금액,
        전기금액: row.전기금액,
        증감금액: row.증감금액,
        category: 'asset',
        significance,
      });
    });

    // 부채 데이터 (오른쪽)
    categorizedBalanceSheetData.liabilities.forEach(row => {
      const absChange = Math.abs(row.증감금액);
      let significance: 'normal' | 'significant' | 'important' = 'normal';
      if (absChange >= thresholdAmount * 2) {
        significance = 'important';
      } else if (absChange > thresholdAmount) {
        significance = 'significant';
      }

      data.push({
        name: row.과목,
        당기금액: row.당기금액,
        전기금액: row.전기금액,
        증감금액: row.증감금액,
        category: 'liability',
        significance,
      });
    });

    // 자본 데이터 (오른쪽)
    categorizedBalanceSheetData.equity.forEach(row => {
      const absChange = Math.abs(row.증감금액);
      let significance: 'normal' | 'significant' | 'important' = 'normal';
      if (absChange >= thresholdAmount * 2) {
        significance = 'important';
      } else if (absChange > thresholdAmount) {
        significance = 'significant';
      }

      data.push({
        name: row.과목,
        당기금액: row.당기금액,
        전기금액: row.전기금액,
        증감금액: row.증감금액,
        category: 'equity',
        significance,
      });
    });

    return data;
  }, [categorizedBalanceSheetData, thresholdAmount]);

  // 손익계산서 그래프용 데이터 준비 (비용은 왼쪽, 매출 및 영업외수익은 오른쪽)
  const incomeChartData = useMemo(() => {
    const data: Array<{
      name: string;
      당기금액: number;
      전기금액: number;
      증감금액: number;
      category: 'cost' | 'revenue';
      significance: 'normal' | 'significant' | 'important';
    }> = [];

    // 비용 데이터 (왼쪽)
    categorizedIncomeStatementData.costs.forEach(row => {
      const absChange = Math.abs(row.증감금액);
      let significance: 'normal' | 'significant' | 'important' = 'normal';
      if (absChange >= thresholdAmount * 2) {
        significance = 'important';
      } else if (absChange > thresholdAmount) {
        significance = 'significant';
      }

      data.push({
        name: row.과목,
        당기금액: row.당기금액,
        전기금액: row.전기금액,
        증감금액: row.증감금액,
        category: 'cost',
        significance,
      });
    });

    // 매출 및 영업외수익 데이터 (오른쪽)
    categorizedIncomeStatementData.revenues.forEach(row => {
      const absChange = Math.abs(row.증감금액);
      let significance: 'normal' | 'significant' | 'important' = 'normal';
      if (absChange >= thresholdAmount * 2) {
        significance = 'important';
      } else if (absChange > thresholdAmount) {
        significance = 'significant';
      }

      data.push({
        name: row.과목,
        당기금액: row.당기금액,
        전기금액: row.전기금액,
        증감금액: row.증감금액,
        category: 'revenue',
        significance,
      });
    });

    return data;
  }, [categorizedIncomeStatementData, thresholdAmount]);

  // 재무비율 계산
  const financialRatios = useMemo(() => {
    const ratios: {
      안정성: { name: string; value: number; ideal?: number }[];
      수익성: { name: string; value: number; ideal?: number }[];
      활동성: { name: string; value: number; ideal?: number }[];
    } = {
      안정성: [],
      수익성: [],
      활동성: [],
    };

    // 자산, 부채, 자본 찾기
    let 총자산 = 0;
    let 총부채 = 0;
    let 총자본 = 0;
    let 유동자산 = 0;
    let 유동부채 = 0;
    let 비유동자산 = 0;
    let 비유동부채 = 0;
    let 매출액 = 0;
    let 당기순이익 = 0;
    let 총매출원가 = 0;
    let 재고자산 = 0;
    let 외상매출금 = 0;

    financialData.forEach(row => {
      const 과목 = row.과목.toLowerCase();
      const 당기금액 = row.당기금액;

      // 자산
      if (과목.includes('자산') && !과목.includes('부채') && !과목.includes('자본')) {
        총자산 += 당기금액;
      }
      if (과목.includes('유동자산')) {
        유동자산 += 당기금액;
      }
      if (과목.includes('비유동자산')) {
        비유동자산 += 당기금액;
      }
      if (과목.includes('재고자산') || 과목.includes('상품') || 과목.includes('제품')) {
        재고자산 += 당기금액;
      }
      if (과목.includes('외상매출금') || 과목.includes('매출채권')) {
        외상매출금 += 당기금액;
      }

      // 부채
      if (과목.includes('부채') && !과목.includes('자산') && !과목.includes('자본')) {
        총부채 += 당기금액;
      }
      if (과목.includes('유동부채')) {
        유동부채 += 당기금액;
      }
      if (과목.includes('비유동부채')) {
        비유동부채 += 당기금액;
      }

      // 자본
      if (과목.includes('자본') && !과목.includes('부채') && !과목.includes('자산')) {
        총자본 += 당기금액;
      }

      // 손익
      if (과목.includes('매출액') || 과목.includes('매출')) {
        매출액 += Math.abs(당기금액);
      }
      if (과목.includes('당기순이익') || 과목.includes('순이익')) {
        당기순이익 += 당기금액;
      }
      if (과목.includes('매출원가') || 과목.includes('원가')) {
        총매출원가 += Math.abs(당기금액);
      }
    });

    // 안정성 비율
    if (총자산 > 0) {
      ratios.안정성.push({ name: '부채비율', value: (총부채 / 총자본) * 100, ideal: 100 });
      ratios.안정성.push({ name: '자기자본비율', value: (총자본 / 총자산) * 100, ideal: 50 });
      if (유동부채 > 0) {
        ratios.안정성.push({ name: '유동비율', value: (유동자산 / 유동부채) * 100, ideal: 200 });
      }
      if (유동부채 > 0) {
        ratios.안정성.push({ name: '당좌비율', value: ((유동자산 - 재고자산) / 유동부채) * 100, ideal: 100 });
      }
    }

    // 수익성 비율
    if (총자산 > 0) {
      ratios.수익성.push({ name: '총자산이익률(ROA)', value: (당기순이익 / 총자산) * 100 });
      ratios.수익성.push({ name: '자기자본이익률(ROE)', value: 총자본 > 0 ? (당기순이익 / 총자본) * 100 : 0 });
    }
    if (매출액 > 0) {
      ratios.수익성.push({ name: '매출액순이익률', value: (당기순이익 / 매출액) * 100 });
      ratios.수익성.push({ name: '매출총이익률', value: ((매출액 - 총매출원가) / 매출액) * 100 });
    }

    // 활동성 비율
    if (총자산 > 0 && 매출액 > 0) {
      ratios.활동성.push({ name: '총자산회전율', value: 매출액 / 총자산 });
      if (재고자산 > 0) {
        ratios.활동성.push({ name: '재고자산회전율', value: 총매출원가 / 재고자산 });
      }
      if (외상매출금 > 0) {
        ratios.활동성.push({ name: '매출채권회전율', value: 매출액 / 외상매출금 });
      }
    }

    return ratios;
  }, [financialData]);

  // 계정명 정규화 함수 (매칭을 위해)
  const normalizeAccountName = (name: string): string => {
    return name
      .replace(/^\d+[_.-]?\s*/, '') // 앞의 숫자 제거
      .replace(/\s+/g, '') // 공백 제거
      .toLowerCase();
  };

  // 매출계정 판단 함수
  const isSalesAccount = (accountName: string): boolean => {
    const normalized = normalizeAccountName(accountName);
    return normalized.includes('매출') || 
           normalized.includes('sales') || 
           normalized.includes('수익') ||
           normalized.includes('revenue');
  };

  // 금액 추출 함수
  const extractAmountFromRow = (row: LedgerRow): number => {
    // 차변, 대변, 금액 컬럼에서 금액 찾기
    const amountColumns = ['차변', '대변', '금액', 'amount', 'debit', 'credit'];
    for (const col of amountColumns) {
      const val = row[col];
      if (val !== null && val !== undefined) {
        const amount = cleanAmount(val);
        if (amount !== 0) {
          return Math.abs(amount);
        }
      }
    }
    // 모든 숫자 컬럼에서 최대값 찾기
    let maxAmount = 0;
    Object.values(row).forEach(val => {
      if (val !== null && val !== undefined) {
        const amount = cleanAmount(val);
        if (Math.abs(amount) > maxAmount) {
          maxAmount = Math.abs(amount);
        }
      }
    });
    return maxAmount;
  };

  // 샘플링 함수 (10%, 최대 50개) - 금액 기준 우선 샘플링
  const sampleLedgerData = (data: LedgerRow[], maxSamples: number = 50): LedgerRow[] => {
    const sampleSize = Math.min(Math.max(Math.floor(data.length * 0.1), 1), maxSamples);
    if (data.length <= sampleSize) return data;
    
    // 금액 기준으로 정렬 (내림차순)
    const sortedByAmount = [...data].sort((a, b) => {
      const amountA = extractAmountFromRow(a);
      const amountB = extractAmountFromRow(b);
      return amountB - amountA; // 큰 금액이 먼저
    });
    
    // 상위 금액 샘플 + 나머지 무작위 샘플
    const highValueCount = Math.floor(sampleSize * 0.7); // 70%는 고액 거래
    const randomCount = sampleSize - highValueCount; // 30%는 무작위
    
    const highValueSamples = sortedByAmount.slice(0, highValueCount);
    
    // 나머지 데이터에서 무작위 샘플링
    const remainingData = sortedByAmount.slice(highValueCount);
    const shuffled = [...remainingData].sort(() => 0.5 - Math.random());
    const randomSamples = shuffled.slice(0, randomCount);
    
    return [...highValueSamples, ...randomSamples];
  };

  // 요금 추정 함수
  const handleEstimateCost = (accountName: string, changeAmount: number, isIncomeStatement: boolean = false) => {
    if (!ledgerWorkbook || !getDataFromSheet) {
      toast({
        title: '오류',
        description: '계정별원장 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const normalizedAccountName = normalizeAccountName(accountName);
      const matchingSheets: Array<{ sheetName: string; data: LedgerRow[] }> = [];
      
      ledgerWorkbook.SheetNames.forEach(sheetName => {
        const normalizedSheetName = normalizeAccountName(sheetName);
        if (normalizedSheetName.includes(normalizedAccountName) || 
            normalizedAccountName.includes(normalizedSheetName)) {
          const worksheet = ledgerWorkbook.Sheets[sheetName];
          const { data } = getDataFromSheet(worksheet);
          if (data.length > 0) {
            matchingSheets.push({ sheetName, data });
          }
        }
      });

      if (matchingSheets.length === 0) {
        toast({
          title: '정보',
          description: `"${accountName}" 계정과 일치하는 계정별원장 데이터를 찾을 수 없습니다.`,
        });
        return;
      }

      const currentPeriodData: LedgerRow[] = [];
      const previousPeriodData: LedgerRow[] = [];

      // 당기 데이터 수집
      matchingSheets.forEach(({ data }) => {
        currentPeriodData.push(...data);
      });

      // 전기 데이터 수집 (전기 계정별원장이 있으면 별도로 수집, 없으면 당기 데이터 사용)
      if (previousLedgerWorkbook && getDataFromSheet) {
        const previousMatchingSheets: Array<{ sheetName: string; data: LedgerRow[] }> = [];
        
        previousLedgerWorkbook.SheetNames.forEach(sheetName => {
          const normalizedSheetName = normalizeAccountName(sheetName);
          if (normalizedSheetName.includes(normalizedAccountName) || 
              normalizedAccountName.includes(normalizedSheetName)) {
            const worksheet = previousLedgerWorkbook.Sheets[sheetName];
            const { data } = getDataFromSheet(worksheet);
            if (data.length > 0) {
              previousMatchingSheets.push({ sheetName, data });
            }
          }
        });

        previousMatchingSheets.forEach(({ data }) => {
          previousPeriodData.push(...data);
        });
      } else {
        // 전기 계정별원장이 없으면 당기 데이터 사용 (하지만 AI에게 알림)
        previousPeriodData.push(...currentPeriodData);
      }

      // 샘플링 (10%, 매출계정은 최대 100개, 그 외는 최대 50개)
      const maxSamples = isSalesAccount(accountName) ? 100 : 50;
      const sampledCurrent = sampleLedgerData(currentPeriodData, maxSamples);
      const sampledPrevious = sampleLedgerData(previousPeriodData, maxSamples);

      const row = isIncomeStatement 
        ? incomeStatementData.find(r => r.과목 === accountName)
        : balanceSheetData.find(r => r.과목 === accountName);
      const previousAmount = row?.전기금액 || 1;
      const changeRate = previousAmount !== 0 ? ((changeAmount / Math.abs(previousAmount)) * 100) : 0;

      const statementType = isIncomeStatement ? '손익계산서' : '재무상태표';
      const prompt = `다음은 "${accountName}" 계정의 ${statementType} 증감 분석 요청입니다.

**증감 정보:**
- 계정명: ${accountName}
- 증감금액: ${changeAmount >= 0 ? '+' : ''}${changeAmount.toLocaleString()}원
- 증감율: ${changeRate.toFixed(2)}%
- 당기금액: ${row?.당기금액.toLocaleString()}원
- 전기금액: ${row?.전기금액.toLocaleString()}원

**당기 데이터 샘플 (${sampledCurrent.length}건, 전체 ${currentPeriodData.length}건 중):**
${sampledCurrent.slice(0, 10).map((row, idx) => 
  `${idx + 1}. ${JSON.stringify(row)}`
).join('\n')}

**전기 데이터 샘플 (${sampledPrevious.length}건, 전체 ${previousPeriodData.length}건 중):**
${previousLedgerWorkbook ? '' : '※ 주의: 전기 계정별원장 데이터가 없어 당기 데이터를 참고용으로 제공합니다.\n'}
${sampledPrevious.slice(0, 10).map((row, idx) => 
  `${idx + 1}. ${JSON.stringify(row)}`
).join('\n')}

위 증감의 원인을 분석해주세요. 주요 거래처, 거래 패턴, 계절성, 특이사항 등을 포함하여 설명해주세요.`;

      const inputTokens = estimateTokens(prompt);
      const estimatedCost = estimateCost(inputTokens, 2000, true);

      setCostEstimates(prev => ({
        ...prev,
        [accountName]: { tokens: inputTokens, cost: estimatedCost },
      }));

      toast({
        title: '요금 추정',
        description: `예상 토큰: ${inputTokens.toLocaleString()}개, 예상 비용: 약 ${estimatedCost.toLocaleString()}원`,
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `요금 추정 중 오류가 발생했습니다: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  // 재무비율 Excel 다운로드 함수
  const handleDownloadRatiosExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      
      // 안정성 비율
      if (financialRatios.안정성.length > 0) {
        const stabilityData = financialRatios.안정성.map(ratio => ({
          '비율명': ratio.name,
          '값': ratio.value,
          '단위': '%',
          '이상값': ratio.ideal ? ratio.ideal : '-',
        }));
        const ws1 = XLSX.utils.json_to_sheet(stabilityData);
        ws1['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws1, '안정성비율');
      }
      
      // 수익성 비율
      if (financialRatios.수익성.length > 0) {
        const profitabilityData = financialRatios.수익성.map(ratio => ({
          '비율명': ratio.name,
          '값': ratio.value,
          '단위': '%',
          '이상값': ratio.ideal ? ratio.ideal : '-',
        }));
        const ws2 = XLSX.utils.json_to_sheet(profitabilityData);
        ws2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws2, '수익성비율');
      }
      
      // 활동성 비율
      if (financialRatios.활동성.length > 0) {
        const activityData = financialRatios.활동성.map(ratio => ({
          '비율명': ratio.name,
          '값': ratio.value,
          '단위': '회',
          '이상값': ratio.ideal ? ratio.ideal : '-',
        }));
        const ws3 = XLSX.utils.json_to_sheet(activityData);
        ws3['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws3, '활동성비율');
      }
      
      if (wb.SheetNames.length === 0) {
        toast({
          title: '오류',
          description: '다운로드할 재무비율 데이터가 없습니다.',
          variant: 'destructive',
        });
        return;
      }
      
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `재무비율_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: '다운로드 완료',
        description: '엑셀 파일로 저장했습니다.',
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `다운로드 중 오류가 발생했습니다: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  // 재무비율 PDF 다운로드 함수
  const handleDownloadRatiosPDF = async () => {
    if (!ratiosRef.current) {
      toast({
        title: '오류',
        description: '재무비율 데이터를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    const loadingToast = toast({
      title: 'PDF 생성 중',
      description: '재무비율표를 PDF로 변환하는 중입니다. 잠시만 기다려주세요...',
    });

    try {
      // html2canvas와 jsPDF를 동적으로 import
      let html2canvas, jsPDF;
      try {
        html2canvas = (await import('html2canvas')).default;
        const jspdfModule = await import('jspdf');
        jsPDF = jspdfModule.jsPDF;
        
        if (!jsPDF || typeof jsPDF !== 'function') {
          throw new Error('jsPDF를 찾을 수 없습니다.');
        }
      } catch (importError: any) {
        toast({
          title: '라이브러리 오류',
          description: `PDF 생성 라이브러리를 불러오지 못했습니다: ${importError.message}`,
          variant: 'destructive',
        });
        return;
      }

      // 한글 폰트 로드 대기
      const loadFont = (fontFamily: string) => {
        return new Promise<void>((resolve) => {
          if (document.fonts.check(`16px "${fontFamily}"`)) {
            resolve();
            return;
          }
          document.fonts.load(`16px "${fontFamily}"`).then(() => resolve()).catch(() => resolve());
        });
      };
      
      await Promise.all([
        loadFont('Noto Sans KR'),
        loadFont('Apple SD Gothic Neo'),
        loadFont('Malgun Gothic'),
        loadFont('맑은 고딕')
      ]);
      
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      
      // 렌더링 대기
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 재무비율 섹션을 캔버스로 변환
      const canvas = await html2canvas(ratiosRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;
      
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      
      const dateStr = new Date().toISOString().split('T')[0];
      pdf.save(`재무비율_${dateStr}.pdf`);
      
      toast({
        title: '다운로드 완료',
        description: 'PDF 파일로 저장했습니다.',
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `PDF 생성 중 오류가 발생했습니다: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  // Excel 다운로드 함수
  const handleDownloadExcel = (data: FinancialStatementRow[], sheetName: string) => {
    if (data.length === 0) {
      toast({
        title: '오류',
        description: '다운로드할 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      
      // Excel 데이터 준비
      const exportData = data.map(row => ({
        '과목': row.과목,
        '당기금액': row.당기금액,
        '전기금액': row.전기금액,
        '증감금액': row.증감금액,
        '증감율(%)': row.증감율,
        '유의적변동': row.유의적변동 ? 'Y' : 'N',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // 컬럼 너비 설정
      ws['!cols'] = [
        { wch: 30 }, // 과목
        { wch: 15 }, // 당기금액
        { wch: 15 }, // 전기금액
        { wch: 15 }, // 증감금액
        { wch: 12 }, // 증감율
        { wch: 12 }, // 유의적변동
      ];

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      
      // 파일명 생성
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `재무제표_증감분석_${sheetName}_${dateStr}.xlsx`;
      
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: '다운로드 완료',
        description: '엑셀 파일로 저장했습니다.',
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `다운로드 중 오류가 발생했습니다: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  // AI 분석 함수
  const handleAnalyzeAccount = async (accountName: string, changeAmount: number, isIncomeStatement: boolean = false) => {
    if (!ledgerWorkbook || !getDataFromSheet) {
      toast({
        title: '오류',
        description: '계정별원장 데이터가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasApiKey()) {
      toast({
        title: '오류',
        description: 'AI 분석을 위해 API Key가 필요합니다.',
        variant: 'destructive',
      });
      return;
    }

    setAnalyzingAccount(accountName);

    try {
      // 계정명 정규화
      const normalizedAccountName = normalizeAccountName(accountName);
      
      // 계정별원장에서 일치하는 계정 찾기 (오류 없이 일치하는 것만)
      const matchingSheets: Array<{ sheetName: string; data: LedgerRow[] }> = [];
      
      ledgerWorkbook.SheetNames.forEach(sheetName => {
        const normalizedSheetName = normalizeAccountName(sheetName);
        if (normalizedSheetName.includes(normalizedAccountName) || 
            normalizedAccountName.includes(normalizedSheetName)) {
          const worksheet = ledgerWorkbook.Sheets[sheetName];
          const { data } = getDataFromSheet(worksheet);
          if (data.length > 0) {
            matchingSheets.push({ sheetName, data });
          }
        }
      });

      if (matchingSheets.length === 0) {
        toast({
          title: '정보',
          description: `"${accountName}" 계정과 일치하는 계정별원장 데이터를 찾을 수 없습니다.`,
        });
        setAnalyzingAccount(null);
        return;
      }

      // 당기와 전기 데이터 수집
      const currentPeriodData: LedgerRow[] = [];
      const previousPeriodData: LedgerRow[] = [];

      // 당기 데이터 수집
      matchingSheets.forEach(({ data }) => {
        currentPeriodData.push(...data);
      });

      // 전기 데이터 수집 (전기 계정별원장이 있으면 별도로 수집, 없으면 당기 데이터 사용)
      if (previousLedgerWorkbook && getDataFromSheet) {
        const previousMatchingSheets: Array<{ sheetName: string; data: LedgerRow[] }> = [];
        
        previousLedgerWorkbook.SheetNames.forEach(sheetName => {
          const normalizedSheetName = normalizeAccountName(sheetName);
          if (normalizedSheetName.includes(normalizedAccountName) || 
              normalizedAccountName.includes(normalizedSheetName)) {
            const worksheet = previousLedgerWorkbook.Sheets[sheetName];
            const { data } = getDataFromSheet(worksheet);
            if (data.length > 0) {
              previousMatchingSheets.push({ sheetName, data });
            }
          }
        });

        previousMatchingSheets.forEach(({ data }) => {
          previousPeriodData.push(...data);
        });
      } else {
        // 전기 계정별원장이 없으면 당기 데이터 사용 (하지만 AI에게 알림)
        previousPeriodData.push(...currentPeriodData);
      }

      // 샘플링 (10%, 매출계정은 최대 100개, 그 외는 최대 50개)
      const maxSamples = isSalesAccount(accountName) ? 100 : 50;
      const sampledCurrent = sampleLedgerData(currentPeriodData, maxSamples);
      const sampledPrevious = sampleLedgerData(previousPeriodData, maxSamples);

      // 증감율 계산
      const row = isIncomeStatement 
        ? incomeStatementData.find(r => r.과목 === accountName)
        : balanceSheetData.find(r => r.과목 === accountName);
      const previousAmount = row?.전기금액 || 1;
      const changeRate = previousAmount !== 0 ? ((changeAmount / Math.abs(previousAmount)) * 100) : 0;

      // AI 프롬프트 생성
      const statementType = isIncomeStatement ? '손익계산서' : '재무상태표';
      const prompt = `다음은 "${accountName}" 계정의 ${statementType} 증감 분석 요청입니다.

**증감 정보:**
- 계정명: ${accountName}
- 증감금액: ${changeAmount >= 0 ? '+' : ''}${changeAmount.toLocaleString()}원
- 증감율: ${changeRate.toFixed(2)}%
- 당기금액: ${row?.당기금액.toLocaleString()}원
- 전기금액: ${row?.전기금액.toLocaleString()}원

**당기 데이터 샘플 (${sampledCurrent.length}건, 전체 ${currentPeriodData.length}건 중):**
${sampledCurrent.slice(0, 10).map((row, idx) => 
  `${idx + 1}. ${JSON.stringify(row)}`
).join('\n')}

**전기 데이터 샘플 (${sampledPrevious.length}건, 전체 ${previousPeriodData.length}건 중):**
${previousLedgerWorkbook ? '' : '※ 주의: 전기 계정별원장 데이터가 없어 당기 데이터를 참고용으로 제공합니다.\n'}
${sampledPrevious.slice(0, 10).map((row, idx) => 
  `${idx + 1}. ${JSON.stringify(row)}`
).join('\n')}

위 증감의 원인을 분석해주세요. 주요 거래처, 거래 패턴, 계절성, 특이사항 등을 포함하여 설명해주세요.

**중요: 분석 결과는 반드시 200자 이내로 간결하게 작성해주세요.**`;

      const result = await analyzeWithFlash(prompt);
      
      // 결과를 200자로 제한
      const limitedResult = result.length > 200 ? result.substring(0, 200) + '...' : result;
      
      setAnalysisResults(prev => ({
        ...prev,
        [accountName]: limitedResult,
      }));

      toast({
        title: '성공',
        description: `"${accountName}" 계정의 AI 분석이 완료되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: '오류',
        description: `AI 분석 중 오류가 발생했습니다: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setAnalyzingAccount(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">재무제표 증감 분석</h2>
          <p className="text-sm text-muted-foreground mt-1">
            재무상태표의 계정별 증감을 분석하고 재무비율을 계산합니다.
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          돌아가기
        </Button>
      </div>

      {/* 시트 정보 표시 */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">재무상태표 시트:</span>
              <Badge variant="outline">{balanceSheetSheet || '미인식'}</Badge>
            </div>
            {incomeStatementSheet && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">손익계산서 시트:</span>
                <Badge variant="outline">{incomeStatementSheet}</Badge>
              </div>
            )}
            {!incomeStatementSheet && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">손익계산서 시트를 찾을 수 없습니다.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 유의적 변동 기준 금액 설정 */}
      <Card>
        <CardHeader>
          <CardTitle>유의적 변동 기준 금액 설정</CardTitle>
          <CardDescription>
            증감금액이 이 금액을 절대값 기준으로 초과하는 경우 체크 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label htmlFor="threshold">기준 금액 (원)</Label>
            <Input
              id="threshold"
              type="number"
              value={thresholdAmount}
              onChange={(e) => setThresholdAmount(Number(e.target.value) || 0)}
              className="w-48"
            />
            <span className="text-sm text-muted-foreground">
              {thresholdAmount.toLocaleString()}원
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 뷰 선택 버튼 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Button
              variant={selectedView === 'balance' ? 'default' : 'outline'}
              onClick={() => setSelectedView('balance')}
              className="flex-1"
            >
              재무상태표
            </Button>
            <Button
              variant={selectedView === 'income' ? 'default' : 'outline'}
              onClick={() => setSelectedView('income')}
              className="flex-1"
            >
              손익계산서
            </Button>
            <Button
              variant={selectedView === 'ratios' ? 'default' : 'outline'}
              onClick={() => setSelectedView('ratios')}
              className="flex-1"
            >
              재무비율
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 재무상태표 증감 분석 표 */}
      {selectedView === 'balance' && balanceSheetData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>재무상태표 증감 분석</CardTitle>
                <CardDescription>
                  재무상태표 계정별 당기/전기 금액, 증감금액, 증감율 및 유의적 변동 여부를 표시합니다.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => handleDownloadExcel(balanceSheetData, '재무상태표')}
              >
                <Download className="mr-2 h-4 w-4" />
                엑셀 다운로드
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">과목</TableHead>
                    <TableHead className="text-right">당기금액</TableHead>
                    <TableHead className="text-right">전기금액</TableHead>
                    <TableHead className="text-right">증감금액</TableHead>
                    <TableHead className="text-right">증감율 (%)</TableHead>
                    <TableHead className="text-center">유의적변동</TableHead>
                    {ledgerWorkbook && getDataFromSheet && (
                      <TableHead className="text-center">AI 분석</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceSheetData.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.과목}</TableCell>
                      <TableCell className="text-right">{row.당기금액.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.전기금액.toLocaleString()}</TableCell>
                      <TableCell className={`text-right ${row.증감금액 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.증감금액 >= 0 ? '+' : ''}{row.증감금액.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right ${row.증감율 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.증감율 >= 0 ? '+' : ''}{row.증감율.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-center">
                        {row.유의적변동 && (
                          <CheckCircle2 className="h-5 w-5 text-orange-500 mx-auto" />
                        )}
                      </TableCell>
                      {ledgerWorkbook && getDataFromSheet && (
                        <TableCell className="text-center">
                          {row.유의적변동 && (
                            <div className="flex gap-2 justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEstimateCost(row.과목, row.증감금액)}
                              >
                                요금확인
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleAnalyzeAccount(row.과목, row.증감금액)}
                                disabled={analyzingAccount === row.과목}
                              >
                                {analyzingAccount === row.과목 ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    분석중
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    AI 분석
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 재무상태표 증감 분석 BAR 그래프 */}
      {selectedView === 'balance' && balanceSheetData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>재무상태표 증감 비교 그래프</CardTitle>
            <CardDescription>
              계정별 당기금액과 전기금액을 비교합니다. 자산은 왼쪽, 부채와 자본은 오른쪽에 표시됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 자산 그래프 (왼쪽) */}
              <div>
                <h3 className="text-lg font-semibold mb-4">자산</h3>
                <ResponsiveContainer width="100%" height={Math.max(400, categorizedBalanceSheetData.assets.length * 40)}>
                  <BarChart
                    data={chartData.filter(d => d.category === 'asset')}
                    layout="vertical"
                    margin={{ top: 5, right: 100, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString()}원`,
                        name === '당기금액' ? '당기' : '전기'
                      ]}
                    />
                    <Bar dataKey="당기금액" fill="#3b82f6" name="당기금액">
                      <LabelList content={<CustomSignificanceLabel />} />
                    </Bar>
                    <Bar dataKey="전기금액" fill="#94a3b8" name="전기금액" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 부채 및 자본 그래프 (오른쪽) */}
              <div>
                <h3 className="text-lg font-semibold mb-4">부채 및 자본</h3>
                <ResponsiveContainer width="100%" height={Math.max(400, (categorizedBalanceSheetData.liabilities.length + categorizedBalanceSheetData.equity.length) * 40)}>
                  <BarChart
                    data={chartData.filter(d => d.category === 'liability' || d.category === 'equity')}
                    layout="vertical"
                    margin={{ top: 5, right: 100, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString()}원`,
                        name === '당기금액' ? '당기' : '전기'
                      ]}
                    />
                    <Bar dataKey="당기금액" fill="#3b82f6" name="당기금액">
                      <LabelList content={<CustomSignificanceLabel />} />
                    </Bar>
                    <Bar dataKey="전기금액" fill="#94a3b8" name="전기금액" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500"></div>
                <span>당기금액</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-slate-400"></div>
                <span>전기금액</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-5 border-2 border-dashed border-orange-500 rounded"></div>
                <span>유의 (기준금액 초과)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-5 border-2 border-dashed border-red-600 rounded"></div>
                <span>중요 (기준금액 2배 이상)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 손익계산서 증감 분석 표 */}
      {selectedView === 'income' && incomeStatementData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>손익계산서 증감 분석</CardTitle>
                <CardDescription>
                  손익계산서 계정별 당기/전기 금액, 증감금액, 증감율 및 유의적 변동 여부를 표시합니다.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => handleDownloadExcel(incomeStatementData, '손익계산서')}
              >
                <Download className="mr-2 h-4 w-4" />
                엑셀 다운로드
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">과목</TableHead>
                    <TableHead className="text-right">당기금액</TableHead>
                    <TableHead className="text-right">전기금액</TableHead>
                    <TableHead className="text-right">증감금액</TableHead>
                    <TableHead className="text-right">증감율 (%)</TableHead>
                    <TableHead className="text-center">유의적변동</TableHead>
                    {ledgerWorkbook && getDataFromSheet && (
                      <TableHead className="text-center">AI 분석</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeStatementData.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.과목}</TableCell>
                      <TableCell className="text-right">{row.당기금액.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.전기금액.toLocaleString()}</TableCell>
                      <TableCell className={`text-right ${row.증감금액 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.증감금액 >= 0 ? '+' : ''}{row.증감금액.toLocaleString()}
                      </TableCell>
                      <TableCell className={`text-right ${row.증감율 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.증감율 >= 0 ? '+' : ''}{row.증감율.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-center">
                        {row.유의적변동 && (
                          <CheckCircle2 className="h-5 w-5 text-orange-500 mx-auto" />
                        )}
                      </TableCell>
                      {ledgerWorkbook && getDataFromSheet && (
                        <TableCell className="text-center">
                          {row.유의적변동 && (
                            <div className="flex gap-2 justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEstimateCost(row.과목, row.증감금액, true)}
                              >
                                요금확인
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleAnalyzeAccount(row.과목, row.증감금액, true)}
                                disabled={analyzingAccount === row.과목}
                              >
                                {analyzingAccount === row.과목 ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    분석중
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    AI 분석
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 손익계산서 증감 분석 BAR 그래프 */}
      {selectedView === 'income' && incomeStatementData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>손익계산서 증감 비교 그래프</CardTitle>
            <CardDescription>
              계정별 당기금액과 전기금액을 비교합니다. 비용은 왼쪽, 매출 및 영업외수익은 오른쪽에 표시됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 비용 그래프 (왼쪽) */}
              <div>
                <h3 className="text-lg font-semibold mb-4">비용</h3>
                <ResponsiveContainer width="100%" height={Math.max(400, categorizedIncomeStatementData.costs.length * 40)}>
                  <BarChart
                    data={incomeChartData.filter(d => d.category === 'cost')}
                    layout="vertical"
                    margin={{ top: 5, right: 100, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString()}원`,
                        name === '당기금액' ? '당기' : '전기'
                      ]}
                    />
                    <Bar dataKey="당기금액" fill="#3b82f6" name="당기금액">
                      <LabelList content={<CustomSignificanceLabel />} />
                    </Bar>
                    <Bar dataKey="전기금액" fill="#94a3b8" name="전기금액" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 매출 및 영업외수익 그래프 (오른쪽) */}
              <div>
                <h3 className="text-lg font-semibold mb-4">매출 및 영업외수익</h3>
                <ResponsiveContainer width="100%" height={Math.max(400, categorizedIncomeStatementData.revenues.length * 40)}>
                  <BarChart
                    data={incomeChartData.filter(d => d.category === 'revenue')}
                    layout="vertical"
                    margin={{ top: 5, right: 100, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString()}원`,
                        name === '당기금액' ? '당기' : '전기'
                      ]}
                    />
                    <Bar dataKey="당기금액" fill="#3b82f6" name="당기금액">
                      <LabelList content={<CustomSignificanceLabel />} />
                    </Bar>
                    <Bar dataKey="전기금액" fill="#94a3b8" name="전기금액" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500"></div>
                <span>당기금액</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-slate-400"></div>
                <span>전기금액</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-5 border-2 border-dashed border-orange-500 rounded"></div>
                <span>유의 (기준금액 초과)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-5 border-2 border-dashed border-red-600 rounded"></div>
                <span>중요 (기준금액 2배 이상)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 분석 결과 표시 */}
      {Object.keys(analysisResults).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI 분석 결과</CardTitle>
            <CardDescription>
              유의적 변동 항목에 대한 AI 분석 결과입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(analysisResults).map(([accountName, result]) => (
              <Card key={accountName} className="bg-blue-50 dark:bg-blue-950">
                <CardHeader>
                  <CardTitle className="text-lg">{accountName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm whitespace-pre-wrap">{result}</div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 재무비율 분석 */}
      {selectedView === 'ratios' && (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>재무비율 분석</CardTitle>
                <CardDescription>
                  안정성, 수익성, 활동성 비율을 분석합니다.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleDownloadRatiosExcel}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Excel 다운로드
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadRatiosPDF}
                >
                  <Download className="mr-2 h-4 w-4" />
                  PDF 다운로드
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
        <div ref={ratiosRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 안정성 비율 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              안정성 비율
            </CardTitle>
          </CardHeader>
          <CardContent>
            {financialRatios.안정성.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={financialRatios.안정성}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
                  <Bar dataKey="value" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                안정성 비율 데이터가 없습니다.
              </p>
            )}
            <div className="mt-4 space-y-2">
              {financialRatios.안정성.map((ratio, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{ratio.name}:</span>
                  <span className="font-medium">{ratio.value.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 수익성 비율 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              수익성 비율
            </CardTitle>
          </CardHeader>
          <CardContent>
            {financialRatios.수익성.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={financialRatios.수익성}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
                  <Bar dataKey="value" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                수익성 비율 데이터가 없습니다.
              </p>
            )}
            <div className="mt-4 space-y-2">
              {financialRatios.수익성.map((ratio, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{ratio.name}:</span>
                  <span className="font-medium">{ratio.value.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 활동성 비율 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              활동성 비율
            </CardTitle>
          </CardHeader>
          <CardContent>
            {financialRatios.활동성.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={financialRatios.활동성}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => value.toFixed(2)} />
                  <Bar dataKey="value" fill="#FFBB28" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                활동성 비율 데이터가 없습니다.
              </p>
            )}
            <div className="mt-4 space-y-2">
              {financialRatios.활동성.map((ratio, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{ratio.name}:</span>
                  <span className="font-medium">{ratio.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
      )}
    </div>
  );
};


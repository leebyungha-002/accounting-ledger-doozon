/**
 * 회계 계정 분석 헬퍼 함수들
 * Google AI Studio 프로젝트에서 통합
 */

// 타입 정의
export interface Transaction {
  accountName: string;
  date: string; // YYYY-MM-DD 형식
  debit: number;
  credit: number;
  description: string;
}

export type AnalysisType = 
  | 'general' 
  | 'expense' 
  | 'manufacturing' 
  | 'sales_vs_sga' 
  | 'audit_risk' 
  | 'benford' 
  | 'yoy';

// Helper: Format currency
export const formatCurrency = (val: number): string => {
  return Math.round(val).toLocaleString('ko-KR');
};

// Helper: Check if account is SG&A (판관비)
// Matches "(판)", "(8", "[8", "8xx" (starts with 8 followed by 2 digits)
// Updated to be more robust with regex for (8xxxx) or [8xxxx]
export const isSGAAccount = (name: string): boolean => {
  const n = name.trim();
  return n.includes('(판)') || 
         n.includes('(8') || 
         n.includes('[8') ||
         /^8\d{2}/.test(n) ||
         /[\(\[]8\d{2,}[\)\]]/.test(n);
};

// Helper: Check if account is Manufacturing Cost (제조원가)
// Matches "(제)", "(5", "[5", "5xx" (starts with 5 followed by 2 digits)
// Updated to be more robust with regex for (5xxxx) or [5xxxx]
export const isManufacturingAccount = (name: string): boolean => {
  const n = name.trim();
  return n.includes('(제)') || 
         n.includes('(5') || 
         n.includes('[5') ||
         /^5\d{2}/.test(n) ||
         /[\(\[]5\d{2,}[\)\]]/.test(n);
};

// Helper: Check if account is Sales (매출)
// Matches "매출", "수익", "(4", "[4", "4xx" (starts with 4 followed by 2 digits)
export const isSalesAccount = (name: string): boolean => {
  const n = name.trim();
  return n.includes('매출') || 
         n.includes('수익') || 
         n.includes('(4') ||
         n.includes('[4') ||
         /^4\d{2}/.test(n) ||
         /[\(\[]4\d{2,}[\)\]]/.test(n);
};

// Helper: Check if account is Logistics/Freight related (운반비 등)
// Used for specific correlation analysis
export const isLogisticsAccount = (name: string): boolean => {
  const n = name.toLowerCase();
  return n.includes('운반') || n.includes('운임') || n.includes('택배') || n.includes('선적') || n.includes('보관');
};

// Helper: Generic Monthly Summary Generator
export interface MonthlySummaryResult {
  summaryTable: string;
  accountCount: number;
  rawData: { accountName: string; months: number[]; total: number }[];
}

const generateMonthlySummaryTable = (
  transactions: Transaction[], 
  filterFn: (name: string) => boolean,
  title: string
): MonthlySummaryResult => {
  const filteredTransactions = transactions.filter(t => filterFn(t.accountName));
  
  // Raw Data for UI
  const rawData: { accountName: string; months: number[]; total: number }[] = [];

  if (filteredTransactions.length === 0) {
    return { 
      summaryTable: `${title} 관련 거래 내역을 찾을 수 없습니다.`, 
      accountCount: 0,
      rawData: []
    };
  }

  // Group by Account -> Month (0-11) -> Amount
  const accountMonthlyData: { [account: string]: number[] } = {};
  const allAccounts = new Set<string>();

  filteredTransactions.forEach(t => {
    allAccounts.add(t.accountName);
    if (!accountMonthlyData[t.accountName]) {
      accountMonthlyData[t.accountName] = Array(12).fill(0);
    }
    
    const date = new Date(t.date);
    if (!isNaN(date.getTime())) {
      const month = date.getMonth(); // 0-11
      let amount = 0;
      // Sales accounts are credit normal, others debit normal usually for this view
      if (isSalesAccount(t.accountName)) {
         amount = t.credit - t.debit;
      } else {
         amount = t.debit - t.credit;
      }
      accountMonthlyData[t.accountName][month] += amount;
    }
  });

  // Create Table String
  let table = "| 계정과목 | 1월 | 2월 | 3월 | 4월 | 5월 | 6월 | 7월 | 8월 | 9월 | 10월 | 11월 | 12월 | 합계 |\n";
  table += "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";

  // Sort accounts by total amount descending
  const sortedAccounts = Array.from(allAccounts).sort((a, b) => {
    const sumA = accountMonthlyData[a].reduce((acc, v) => acc + v, 0);
    const sumB = accountMonthlyData[b].reduce((acc, v) => acc + v, 0);
    return sumB - sumA;
  });

  sortedAccounts.forEach(acc => {
    const months = accountMonthlyData[acc];
    const total = months.reduce((sum, val) => sum + val, 0);
    // Only include if total is not zero
    if (Math.abs(total) > 0) {
         rawData.push({
             accountName: acc,
             months: months,
             total: total
         });
         const row = months.map(val => Math.round(val).toLocaleString('ko-KR'));
         table += `| ${acc} | ${row.join(' | ')} | ${Math.round(total).toLocaleString('ko-KR')} |\n`;
    }
  });

  return { summaryTable: table, accountCount: sortedAccounts.length, rawData };
};

// Helper: Get SG&A Monthly Summary Table
export const getSGAMonthlySummary = (transactions: Transaction[]): MonthlySummaryResult => {
  return generateMonthlySummaryTable(
    transactions, 
    isSGAAccount, 
    "판관비[(판), (8xx) 등]"
  );
};

// Helper: Get Manufacturing Cost Monthly Summary Table
export const getManufacturingMonthlySummary = (transactions: Transaction[]): MonthlySummaryResult => {
  return generateMonthlySummaryTable(
    transactions, 
    isManufacturingAccount, 
    "제조원가[(제), (5xx) 등]"
  );
};

// Helper: Get Sales vs SG&A Monthly Aggregates
export interface SalesVsSgaMonthlyData {
  month: string;
  sales: number;
  sga: number;
  logistics: number;
  ratio: number;
}

export const getSalesVsSgaMonthlySummary = (transactions: Transaction[]): SalesVsSgaMonthlyData[] => {
  const monthlyData = Array.from({ length: 12 }, () => ({
    sales: 0,
    sga: 0,
    logistics: 0
  }));

  transactions.forEach(t => {
    const date = new Date(t.date);
    if (isNaN(date.getTime())) return;
    const month = date.getMonth(); // 0-11

    if (isSalesAccount(t.accountName)) {
      monthlyData[month].sales += (t.credit - t.debit);
    } else if (isSGAAccount(t.accountName)) {
      const expense = t.debit - t.credit;
      monthlyData[month].sga += expense;
      
      if (isLogisticsAccount(t.accountName)) {
        monthlyData[month].logistics += expense;
      }
    }
  });

  return monthlyData.map((d, i) => ({
    month: `${i+1}월`,
    sales: d.sales,
    sga: d.sga,
    logistics: d.logistics,
    ratio: d.sales !== 0 ? (d.sga / d.sales) * 100 : 0
  }));
};

// Helper: Get Monthly Aggregates (For Trend Analysis)
export const getMonthlyAggregates = (transactions: Transaction[]): string => {
  const monthlyData: { [key: string]: { debit: number; credit: number; count: number } } = {};
  
  transactions.forEach(t => {
    // Assume date format YYYY-MM-DD
    const month = t.date.substring(0, 7); 
    if (!monthlyData[month]) {
      monthlyData[month] = { debit: 0, credit: 0, count: 0 };
    }
    monthlyData[month].debit += t.debit;
    monthlyData[month].credit += t.credit;
    monthlyData[month].count += 1;
  });

  const sortedMonths = Object.keys(monthlyData).sort();
  if (sortedMonths.length === 0) return "데이터 없음";

  return sortedMonths.map(m => {
    const d = monthlyData[m];
    return `- ${m}: 건수 ${d.count}건, 차변합계 ${formatCurrency(d.debit)}, 대변합계 ${formatCurrency(d.credit)}`;
  }).join('\n');
};

// Helper: Benford's Law Stats Calculation for Prompt
export interface BenfordStats {
  total: number;
  statsTable: string;
  suspectDigit: number;
  maxDiff: number;
}

export const calculateBenfordStats = (transactions: Transaction[]): BenfordStats | string => {
  const counts = Array(10).fill(0);
  let total = 0;
  transactions.forEach(t => {
    const amount = Math.max(t.debit, t.credit);
    if (amount > 0) {
      const firstDigit = parseInt(amount.toString()[0]);
      if (firstDigit >= 1 && firstDigit <= 9) {
        counts[firstDigit]++;
        total++;
      }
    }
  });
  
  if (total === 0) return "데이터 부족으로 분석 불가";

  const expected = [0, 30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
  let statsStr = "| 숫자(Digit) | 실제 비율(Actual) | 벤포드 기대비율(Expected) | 차이(Diff) |\n|---|---|---|---|\n";
  
  let maxDiff = 0;
  let suspectDigit = -1;

  for (let i = 1; i <= 9; i++) {
    const actualPct = (counts[i] / total) * 100;
    const diff = actualPct - expected[i];
    statsStr += `| ${i} | ${actualPct.toFixed(1)}% | ${expected[i]}% | ${diff > 0 ? '+' : ''}${diff.toFixed(1)}% |\n`;
    
    if (Math.abs(diff) > maxDiff) {
      maxDiff = Math.abs(diff);
      suspectDigit = i;
    }
  }
  
  return {
    total,
    statsTable: statsStr,
    suspectDigit,
    maxDiff
  };
};

// Helper: Calculate Target Sample Size based on Tiered Logic
export const calculateSampleSize = (totalCount: number): number => {
  if (totalCount <= 100) return totalCount; // 100개 이하는 전수
  if (totalCount <= 500) return Math.ceil(totalCount * 0.20); // 20%
  if (totalCount <= 5000) return Math.ceil(totalCount * 0.05); // 5%
  if (totalCount <= 50000) return Math.ceil(totalCount * 0.03); // 3%
  
  // 5만개 초과 시 1% 적용하되, AI 컨텍스트 윈도우 고려하여 최대 2000개로 제한
  return Math.min(2000, Math.ceil(totalCount * 0.01)); 
};

// Helper: Get Transactions for Analysis (Hybrid Sampling: Materiality + Systematic)
export interface SampledTransactionsResult {
  csv: string;
  sampleInfo: string;
  samples: Transaction[];
}

export const getSampledTransactions = (transactions: Transaction[]): SampledTransactionsResult => {
  const totalCount = transactions.length;
  if (totalCount === 0) return { csv: "거래 내역 없음", sampleInfo: "데이터 없음", samples: [] };

  const targetSize = calculateSampleSize(totalCount);
  let finalSample: Transaction[] = [];
  let sampleInfo = "";

  if (targetSize >= totalCount) {
    // 전수 조사
    finalSample = [...transactions];
    sampleInfo = `(전체 ${totalCount.toLocaleString()}건 데이터 전수 분석)`;
  } else {
    // 하이브리드 샘플링
    const materialityCount = Math.ceil(targetSize * 0.5);
    const systematicCount = targetSize - materialityCount;

    // 1. 중요 거래 추출 (금액 절대값 내림차순)
    const sortedByAmount = [...transactions].sort((a, b) => 
      Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit)
    );
    const highValueItems = sortedByAmount.slice(0, materialityCount);
    
    // 2. 균등 추출
    const selectedSet = new Set(highValueItems);
    const remainingItems = transactions.filter(t => !selectedSet.has(t)); 
    
    const systematicItems: Transaction[] = [];
    if (remainingItems.length > 0 && systematicCount > 0) {
      const step = remainingItems.length / systematicCount;
      for (let i = 0; i < systematicCount; i++) {
        const index = Math.floor(i * step);
        if (remainingItems[index]) {
          systematicItems.push(remainingItems[index]);
        }
      }
    }

    finalSample = [...highValueItems, ...systematicItems];
    const percentage = ((targetSize / totalCount) * 100).toFixed(1);
    sampleInfo = `(보안을 위해 전체 ${totalCount.toLocaleString()}건 중 약 ${percentage}%인 ${finalSample.length}건을 표본 추출하여 분석 - 중요거래 및 기간별 분산 추출 적용)`;
  }

  // AI가 회계적 흐름을 이해하기 좋게 항상 날짜순으로 재정렬
  finalSample.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Format as CSV to save tokens (Header + Rows)
  const header = "일자,적요,차변,대변";
  const rows = finalSample.map(t => {
    const cleanDesc = t.description.replace(/"/g, '""').replace(/\n/g, ' ');
    return `${t.date},"${cleanDesc}",${Math.round(t.debit)},${Math.round(t.credit)}`;
  });

  return {
    csv: [header, ...rows].join('\n'),
    sampleInfo,
    samples: finalSample
  };
};

// Helper: Wait function for backoff
export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Helper: Convert LedgerRow to Transaction (for compatibility with existing code)
export interface LedgerRow {
  [key: string]: string | number | Date | undefined;
}

export const convertLedgerRowToTransaction = (
  row: LedgerRow,
  accountName: string,
  dateHeader: string,
  debitHeader: string,
  creditHeader: string,
  descriptionHeader?: string
): Transaction | null => {
  const date = row[dateHeader];
  const debit = row[debitHeader];
  const credit = row[creditHeader];
  const description = descriptionHeader ? row[descriptionHeader] : '';

  // 날짜 변환
  let dateStr = '';
  if (date instanceof Date) {
    dateStr = date.toISOString().split('T')[0];
  } else if (typeof date === 'string') {
    // YYYY-MM-DD 형식으로 변환 시도
    const dateObj = new Date(date);
    if (!isNaN(dateObj.getTime())) {
      dateStr = dateObj.toISOString().split('T')[0];
    } else {
      return null; // 유효하지 않은 날짜
    }
  } else {
    return null; // 날짜가 없음
  }

  // 금액 변환
  const cleanAmount = (val: any): number => {
    if (typeof val === 'string') {
      return parseFloat(val.replace(/,/g, '')) || 0;
    }
    return typeof val === 'number' ? val : 0;
  };

  return {
    accountName,
    date: dateStr,
    debit: cleanAmount(debit),
    credit: cleanAmount(credit),
    description: String(description || '')
  };
};

/**
 * 스마트 샘플링 유틸리티
 * 
 * B안 세분화 로직:
 * - 500건 이하: 20%
 * - 1,000건 이하: 10%
 * - 10,000건 이하: 5%
 * - 10,000건 초과: 2%
 * - 최소: 50개, 최대: 1,000개
 */

type LedgerRow = { [key: string]: string | number | Date | undefined };

/**
 * 샘플 크기 계산
 */
export const calculateSampleSize = (totalCount: number): number => {
  let ratio: number;
  
  if (totalCount <= 500) {
    ratio = 0.20; // 20%
  } else if (totalCount <= 1000) {
    ratio = 0.10; // 10%
  } else if (totalCount <= 10000) {
    ratio = 0.05; // 5%
  } else {
    ratio = 0.02; // 2%
  }
  
  const calculatedSize = Math.floor(totalCount * ratio);
  
  // 최소 50개, 최대 1,000개
  return Math.min(Math.max(calculatedSize, 50), 1000);
};

/**
 * 금액 추출 헬퍼
 */
const extractAmount = (row: LedgerRow, amountColumns: string[]): number => {
  for (const col of amountColumns) {
    const val = row[col];
    if (typeof val === 'number' && !isNaN(val) && val > 0) {
      return Math.abs(val);
    }
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        return Math.abs(parsed);
      }
    }
  }
  return 0;
};

/**
 * 날짜 추출 헬퍼
 */
const extractDate = (row: LedgerRow, dateColumns: string[]): Date | null => {
  for (const col of dateColumns) {
    const val = row[col];
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val;
    }
  }
  return null;
};

/**
 * 월 추출 (1-12)
 */
const getMonth = (row: LedgerRow, dateColumns: string[]): number | null => {
  const date = extractDate(row, dateColumns);
  return date ? date.getMonth() + 1 : null;
};

/**
 * 스마트 샘플링
 * 
 * 구성:
 * - 30%: 금액 상위 (중요 거래)
 * - 20%: 최신 거래
 * - 10%: 이상치 후보 (평균에서 크게 벗어남)
 * - 30%: 월별 균등 배분
 * - 10%: 완전 랜덤
 */
export const smartSample = (
  data: LedgerRow[],
  sampleSize: number,
  amountColumns: string[],
  dateColumns: string[]
): LedgerRow[] => {
  if (data.length === 0) return [];
  if (data.length <= sampleSize) return [...data];
  
  const result: LedgerRow[] = [];
  const usedIndices = new Set<number>();
  
  // 금액 정보 추가
  const dataWithAmounts = data.map((row, index) => ({
    row,
    index,
    amount: extractAmount(row, amountColumns),
    month: getMonth(row, dateColumns),
  }));
  
  // 평균 및 표준편차 계산 (이상치 탐지용)
  const amounts = dataWithAmounts.map(d => d.amount).filter(a => a > 0);
  const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
  const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  
  // 1. 금액 상위 30% (중요 거래)
  const topCount = Math.floor(sampleSize * 0.30);
  const sortedByAmount = [...dataWithAmounts].sort((a, b) => b.amount - a.amount);
  for (let i = 0; i < Math.min(topCount, sortedByAmount.length); i++) {
    const item = sortedByAmount[i];
    if (!usedIndices.has(item.index)) {
      result.push(item.row);
      usedIndices.add(item.index);
    }
  }
  
  // 2. 최신 거래 20%
  const recentCount = Math.floor(sampleSize * 0.20);
  const sortedByDate = [...dataWithAmounts].sort((a, b) => {
    const dateA = extractDate(a.row, dateColumns);
    const dateB = extractDate(b.row, dateColumns);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB.getTime() - dateA.getTime();
  });
  for (let i = 0; i < Math.min(recentCount, sortedByDate.length); i++) {
    const item = sortedByDate[i];
    if (!usedIndices.has(item.index)) {
      result.push(item.row);
      usedIndices.add(item.index);
      if (result.length >= sampleSize) break;
    }
  }
  
  // 3. 이상치 후보 10% (평균에서 2σ 이상 벗어남)
  const outlierCount = Math.floor(sampleSize * 0.10);
  const outliers = dataWithAmounts
    .filter(d => d.amount > 0 && Math.abs(d.amount - mean) > 2 * stdDev)
    .sort((a, b) => Math.abs(b.amount - mean) - Math.abs(a.amount - mean));
  for (let i = 0; i < Math.min(outlierCount, outliers.length); i++) {
    const item = outliers[i];
    if (!usedIndices.has(item.index)) {
      result.push(item.row);
      usedIndices.add(item.index);
      if (result.length >= sampleSize) break;
    }
  }
  
  // 4. 월별 균등 배분 30%
  const monthlyCount = Math.floor(sampleSize * 0.30);
  const byMonth: { [month: number]: typeof dataWithAmounts } = {};
  dataWithAmounts.forEach(item => {
    if (item.month !== null) {
      if (!byMonth[item.month]) byMonth[item.month] = [];
      byMonth[item.month].push(item);
    }
  });
  
  const months = Object.keys(byMonth).map(Number);
  if (months.length > 0) {
    const perMonth = Math.ceil(monthlyCount / months.length);
    for (const month of months) {
      const monthData = byMonth[month];
      const shuffled = [...monthData].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(perMonth, shuffled.length); i++) {
        const item = shuffled[i];
        if (!usedIndices.has(item.index)) {
          result.push(item.row);
          usedIndices.add(item.index);
          if (result.length >= sampleSize) break;
        }
      }
      if (result.length >= sampleSize) break;
    }
  }
  
  // 5. 완전 랜덤 10% (편향 방지)
  const randomCount = Math.floor(sampleSize * 0.10);
  const remaining = dataWithAmounts.filter(item => !usedIndices.has(item.index));
  const shuffled = [...remaining].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(randomCount, shuffled.length); i++) {
    const item = shuffled[i];
    if (!usedIndices.has(item.index)) {
      result.push(item.row);
      usedIndices.add(item.index);
      if (result.length >= sampleSize) break;
    }
  }
  
  // 6. 목표 샘플 수에 못 미치면 랜덤으로 채우기
  while (result.length < sampleSize && result.length < data.length) {
    const remaining = dataWithAmounts.filter(item => !usedIndices.has(item.index));
    if (remaining.length === 0) break;
    const randomItem = remaining[Math.floor(Math.random() * remaining.length)];
    result.push(randomItem.row);
    usedIndices.add(randomItem.index);
  }
  
  return result;
};

/**
 * 데이터 통계 요약 생성 (AI에게 전체 컨텍스트 제공)
 */
export const generateDataSummary = (
  data: LedgerRow[],
  accountName: string,
  amountColumns: string[]
): string => {
  if (data.length === 0) return '데이터 없음';
  
  const amounts = data
    .map(row => extractAmount(row, amountColumns))
    .filter(a => a > 0);
  
  if (amounts.length === 0) return `총 거래 수: ${data.length}건`;
  
  const total = amounts.reduce((sum, val) => sum + val, 0);
  const mean = total / amounts.length;
  const sortedAmounts = [...amounts].sort((a, b) => a - b);
  const median = sortedAmounts[Math.floor(sortedAmounts.length / 2)];
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  
  const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);
  
  return `
계정과목: ${accountName}
총 거래 수: ${data.length.toLocaleString()}건
총 금액: ${total.toLocaleString()}원
평균 거래액: ${Math.round(mean).toLocaleString()}원
중앙값: ${Math.round(median).toLocaleString()}원
최소값: ${Math.round(min).toLocaleString()}원
최대값: ${Math.round(max).toLocaleString()}원
표준편차: ${Math.round(stdDev).toLocaleString()}원
`.trim();
};

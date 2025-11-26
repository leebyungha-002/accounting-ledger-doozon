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

import { cleanAmount } from './headerUtils';

type LedgerRow = { [key: string]: string | number | Date | undefined };

/**
 * 계정 유형 판단
 * @param accountName 계정명
 * @returns 'asset' | 'expense' | 'liability' | 'equity' | 'revenue' | 'unknown'
 */
export const getAccountType = (accountName: string): 'asset' | 'expense' | 'liability' | 'equity' | 'revenue' | 'unknown' => {
  const normalized = accountName.replace(/\s/g, '').toLowerCase();
  
  // 자산 계정 키워드
  const assetKeywords = ['자산', '현금', '예금', '매출채권', '외상매출금', '외상매출', '선급금', '선급비용', 
    '재고자산', '재고', '유형자산', '무형자산', '투자자산', '당좌자산', '유동자산', '비유동자산',
    '매입채권', '외상매입금', '미수금', '미수수익', '선수금', '선수수익', '기타자산'];
  
  // 비용 계정 키워드
  const expenseKeywords = ['비용', '원가', '매출원가', '판매비', '관리비', '영업비용', '판관비', '판매관리비',
    '급여', '임금', '수당', '복리후생비', '임차료', '임대료', '광고선전비', '운반비', '보험료',
    '세금', '세금과세금', '감가상각비', '충당금', '손실', '기타비용', '차감', '감소'];
  
  // 부채 계정 키워드
  const liabilityKeywords = ['부채', '차입금', '차입', '대출', '사채', '채권', '매입채무', '외상매입금',
    '미지급금', '미지급비용', '선수금', '선수수익', '예수금', '유동부채', '비유동부채',
    '단기차입금', '장기차입금', '기타부채'];
  
  // 자본 계정 키워드
  const equityKeywords = ['자본', '자본금', '주식', '자본잉여금', '이익잉여금', '자본변동', '기타포괄손익',
    '자기자본', '납입자본', '이익', '손익'];
  
  // 수익 계정 키워드
  const revenueKeywords = ['매출', '수익', '영업수익', '영업외수익', '기타수익', '이자수익', '배당수익',
    '임대수익', '수수료수익', '기타영업수익', '증가', '발생'];
  
  // 자산 계정 확인
  if (assetKeywords.some(keyword => normalized.includes(keyword))) {
    return 'asset';
  }
  
  // 비용 계정 확인
  if (expenseKeywords.some(keyword => normalized.includes(keyword))) {
    return 'expense';
  }
  
  // 부채 계정 확인
  if (liabilityKeywords.some(keyword => normalized.includes(keyword))) {
    return 'liability';
  }
  
  // 자본 계정 확인
  if (equityKeywords.some(keyword => normalized.includes(keyword))) {
    return 'equity';
  }
  
  // 수익 계정 확인
  if (revenueKeywords.some(keyword => normalized.includes(keyword))) {
    return 'revenue';
  }
  
  return 'unknown';
};

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
    if (typeof val === 'number' && !isNaN(val)) {
      return Math.abs(val);
    }
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace(/,/g, ''));
      if (!isNaN(parsed)) {
        return Math.abs(parsed);
      }
    }
  }
  return 0;
};

/**
 * 금액 추출 (차변/대변 구분)
 * 계정 유형에 따라 우선 컬럼 결정
 */
const extractAmountFromRow = (
  row: LedgerRow, 
  debitHeader?: string, 
  creditHeader?: string,
  accountType?: 'asset' | 'expense' | 'liability' | 'equity' | 'revenue' | 'unknown'
): number => {
  // 계정 유형에 따라 우선 컬럼 결정
  // 자산/비용: 차변 우선, 부채/자본/수익: 대변 우선
  const preferDebit = accountType === 'asset' || accountType === 'expense';
  const preferCredit = accountType === 'liability' || accountType === 'equity' || accountType === 'revenue';
  
  let amount = 0;
  
  if (preferDebit && debitHeader) {
    // 자산/비용 계정: 차변 우선
    const val = row[debitHeader];
    const debitAmount = cleanAmount(val);
    if (Math.abs(debitAmount) > 0) {
      return Math.abs(debitAmount);
    }
    // 차변이 없으면 대변 확인
    if (creditHeader) {
      const creditVal = row[creditHeader];
      const creditAmount = cleanAmount(creditVal);
      return Math.abs(creditAmount);
    }
  } else if (preferCredit && creditHeader) {
    // 부채/자본/수익 계정: 대변 우선
    const val = row[creditHeader];
    const creditAmount = cleanAmount(val);
    if (Math.abs(creditAmount) > 0) {
      return Math.abs(creditAmount);
    }
    // 대변이 없으면 차변 확인
    if (debitHeader) {
      const debitVal = row[debitHeader];
      const debitAmount = cleanAmount(debitVal);
      return Math.abs(debitAmount);
    }
  } else {
    // 계정 유형이 없거나 unknown인 경우: 둘 다 합산
    if (debitHeader) {
      const val = row[debitHeader];
      amount += Math.abs(cleanAmount(val));
    }
    if (creditHeader) {
      const val = row[creditHeader];
      amount += Math.abs(cleanAmount(val));
    }
  }
  
  return amount;
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
 * - 30%: 금액 상위 (중요 거래) - 계정 유형에 따라 차변/대변 우선
 * - 20%: 최신 거래
 * - 10%: 이상치 후보 (평균에서 크게 벗어남)
 * - 30%: 월별 균등 배분
 * - 10%: 완전 랜덤
 */
export const smartSample = (
  data: LedgerRow[],
  sampleSize: number,
  amountColumns: string[],
  dateColumns: string[],
  debitHeader?: string,
  creditHeader?: string,
  accountName?: string
): LedgerRow[] => {
  if (data.length === 0) return [];
  if (data.length <= sampleSize) return [...data];
  
  // 계정 유형 판단
  const accountType = accountName ? getAccountType(accountName) : undefined;
  
  console.log(`📊 샘플링 - 계정: ${accountName || '알 수 없음'}, 유형: ${accountType || 'unknown'}, 차변 우선: ${accountType === 'asset' || accountType === 'expense'}, 대변 우선: ${accountType === 'liability' || accountType === 'equity' || accountType === 'revenue'}`);
  
  const result: LedgerRow[] = [];
  const usedIndices = new Set<number>();
  
  // 금액 정보 추가 (계정 유형에 따라 차변/대변 우선)
  const dataWithAmounts = data.map((row, index) => {
    let amount = 0;
    if (debitHeader || creditHeader) {
      amount = extractAmountFromRow(row, debitHeader, creditHeader, accountType);
    } else {
      amount = extractAmount(row, amountColumns);
    }
    return {
      row,
      index,
      amount,
      month: getMonth(row, dateColumns),
    };
  });
  
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
 * 차변/대변을 구분하여 통계 계산
 */
export const generateDataSummary = (
  data: LedgerRow[],
  accountName: string,
  amountColumns: string[],
  debitHeader?: string,
  creditHeader?: string,
  dateHeader?: string
): string => {
  if (data.length === 0) return '데이터 없음';
  
  // 분석 기간 계산
  let analysisPeriod = '';
  if (dateHeader) {
    const dates = data
      .map(row => {
        const date = row[dateHeader];
        if (date instanceof Date) return date;
        return null;
      })
      .filter((d): d is Date => d !== null);
    
    if (dates.length > 0) {
      const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
      const startDate = sortedDates[0];
      const endDate = sortedDates[sortedDates.length - 1];
      analysisPeriod = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')} ~ ${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    }
  }
  
  // 차변/대변 헤더가 있으면 구분하여 계산
  if (debitHeader || creditHeader) {
    // 차변과 대변을 합쳐서 통계 계산 (절대값 기준)
    const amounts = data
      .map(row => extractAmountFromRow(row, debitHeader, creditHeader))
      .filter(a => a > 0);
    
    if (amounts.length === 0) {
      return `계정과목: ${accountName}
${analysisPeriod ? `분석 기간: ${analysisPeriod}` : ''}
총 거래 수: ${data.length.toLocaleString()}건
차변/대변 금액이 있는 거래가 없습니다.`;
    }
    
    const total = amounts.reduce((sum, val) => sum + val, 0);
    const mean = total / amounts.length;
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    const median = sortedAmounts[Math.floor(sortedAmounts.length / 2)];
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    
    // 차변/대변별 통계
    let debitStats = '';
    let creditStats = '';
    
    if (debitHeader) {
      const debitAmounts = data
        .map(row => {
          const val = row[debitHeader];
          return Math.abs(cleanAmount(val));
        })
        .filter(a => a > 0);
      
      if (debitAmounts.length > 0) {
        const debitTotal = debitAmounts.reduce((sum, val) => sum + val, 0);
        const debitMax = Math.max(...debitAmounts);
        const sortedDebit = [...debitAmounts].sort((a, b) => a - b);
        const debitMedian = sortedDebit[Math.floor(sortedDebit.length / 2)];
        
        // 디버깅: 상위 5개 차변 거래 확인
        const topDebits = [...debitAmounts].sort((a, b) => b - a).slice(0, 5);
        console.log(`📊 차변 통계 - 상위 5개:`, topDebits.map(v => v.toLocaleString()));
        console.log(`📊 차변 최대값: ${debitMax.toLocaleString()}원`);
        
        debitStats = `
차변 통계:
- 차변 거래 수: ${debitAmounts.length.toLocaleString()}건
- 차변 총액: ${debitTotal.toLocaleString()}원
- 차변 최대값: ${debitMax.toLocaleString()}원
- 차변 중앙값: ${debitMedian.toLocaleString()}원`;
      }
    }
    
    if (creditHeader) {
      const creditAmounts = data
        .map(row => {
          const val = row[creditHeader];
          return Math.abs(cleanAmount(val));
        })
        .filter(a => a > 0);
      
      if (creditAmounts.length > 0) {
        const creditTotal = creditAmounts.reduce((sum, val) => sum + val, 0);
        const creditMax = Math.max(...creditAmounts);
        const sortedCredit = [...creditAmounts].sort((a, b) => a - b);
        const creditMedian = sortedCredit[Math.floor(sortedCredit.length / 2)];
        
        // 디버깅: 상위 5개 대변 거래 확인
        const topCredits = [...creditAmounts].sort((a, b) => b - a).slice(0, 5);
        console.log(`📊 대변 통계 - 상위 5개:`, topCredits.map(v => v.toLocaleString()));
        console.log(`📊 대변 최대값: ${creditMax.toLocaleString()}원`);
        
        creditStats = `
대변 통계:
- 대변 거래 수: ${creditAmounts.length.toLocaleString()}건
- 대변 총액: ${creditTotal.toLocaleString()}원
- 대변 최대값: ${creditMax.toLocaleString()}원
- 대변 중앙값: ${creditMedian.toLocaleString()}원`;
      }
    }
    
    return `
계정과목: ${accountName}
${analysisPeriod ? `분석 기간: ${analysisPeriod}` : ''}
총 거래 수: ${data.length.toLocaleString()}건
${debitStats}
${creditStats}
전체 통계 (차변+대변 합계):
- 총 금액: ${total.toLocaleString()}원
- 평균 거래액: ${Math.round(mean).toLocaleString()}원
- 중앙값: ${Math.round(median).toLocaleString()}원
- 최소값: ${Math.round(min).toLocaleString()}원
- 최대값: ${Math.round(max).toLocaleString()}원
- 표준편차: ${Math.round(stdDev).toLocaleString()}원
`.trim();
  }
  
  // 차변/대변 헤더가 없으면 기존 방식 사용
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
${analysisPeriod ? `분석 기간: ${analysisPeriod}` : ''}
총 거래 수: ${data.length.toLocaleString()}건
총 금액: ${total.toLocaleString()}원
평균 거래액: ${Math.round(mean).toLocaleString()}원
중앙값: ${Math.round(median).toLocaleString()}원
최소값: ${Math.round(min).toLocaleString()}원
최대값: ${Math.round(max).toLocaleString()}원
표준편차: ${Math.round(stdDev).toLocaleString()}원
`.trim();
};

/**
 * AI 사용 이력 추적 및 관리
 */

export interface UsageRecord {
  id: string;
  timestamp: number;
  date: string;
  accountName: string;
  analysisType: string;
  totalCount: number;
  sampleSize: number;
  samplingRatio: number;
  tokensUsed: number;
  costKRW: number;
  model: string;
}

export interface UsageSummary {
  totalCost: number;
  totalAnalyses: number;
  todayCost: number;
  thisMonthCost: number;
  records: UsageRecord[];
}

const USAGE_STORAGE_KEY = 'gemini_usage_history';

/**
 * 사용 이력 불러오기
 */
export const getUsageHistory = (): UsageRecord[] => {
  const stored = localStorage.getItem(USAGE_STORAGE_KEY);
  if (!stored) return [];
  
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
};

/**
 * 사용 이력 저장
 */
export const saveUsageHistory = (records: UsageRecord[]): void => {
  localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(records));
};

/**
 * 사용 이력 추가
 */
export const addUsageRecord = (record: Omit<UsageRecord, 'id' | 'timestamp' | 'date'>): UsageRecord => {
  const history = getUsageHistory();
  
  const newRecord: UsageRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    date: new Date().toISOString(),
  };
  
  history.unshift(newRecord); // 최신 항목을 앞에
  
  // 최대 1000개까지만 저장 (오래된 것 삭제)
  if (history.length > 1000) {
    history.splice(1000);
  }
  
  saveUsageHistory(history);
  return newRecord;
};

/**
 * 사용 요약 통계
 */
export const getUsageSummary = (): UsageSummary => {
  const records = getUsageHistory();
  
  const totalCost = records.reduce((sum, r) => sum + r.costKRW, 0);
  const totalAnalyses = records.length;
  
  // 오늘 사용량
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();
  const todayCost = records
    .filter(r => r.timestamp >= todayTimestamp)
    .reduce((sum, r) => sum + r.costKRW, 0);
  
  // 이번 달 사용량
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  const thisMonthTimestamp = thisMonth.getTime();
  const thisMonthCost = records
    .filter(r => r.timestamp >= thisMonthTimestamp)
    .reduce((sum, r) => sum + r.costKRW, 0);
  
  return {
    totalCost,
    totalAnalyses,
    todayCost,
    thisMonthCost,
    records,
  };
};

/**
 * 사용 이력 초기화
 */
export const clearUsageHistory = (): void => {
  localStorage.removeItem(USAGE_STORAGE_KEY);
};

/**
 * 특정 기간 사용량
 */
export const getUsageByDateRange = (startDate: Date, endDate: Date): UsageRecord[] => {
  const records = getUsageHistory();
  const startTimestamp = startDate.getTime();
  const endTimestamp = endDate.getTime();
  
  return records.filter(r => r.timestamp >= startTimestamp && r.timestamp <= endTimestamp);
};

/**
 * 분석 유형별 사용량
 */
export const getUsageByAnalysisType = (): { [type: string]: { count: number; cost: number } } => {
  const records = getUsageHistory();
  const byType: { [type: string]: { count: number; cost: number } } = {};
  
  records.forEach(r => {
    if (!byType[r.analysisType]) {
      byType[r.analysisType] = { count: 0, cost: 0 };
    }
    byType[r.analysisType].count++;
    byType[r.analysisType].cost += r.costKRW;
  });
  
  return byType;
};

/**
 * 일별 사용량 (최근 30일)
 */
export const getDailyCostLast30Days = (): { date: string; cost: number }[] => {
  const records = getUsageHistory();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  
  const recentRecords = records.filter(r => r.timestamp >= thirtyDaysAgo.getTime());
  
  // 날짜별 그룹화
  const byDate: { [date: string]: number } = {};
  recentRecords.forEach(r => {
    const date = new Date(r.timestamp);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    byDate[dateStr] = (byDate[dateStr] || 0) + r.costKRW;
  });
  
  // 배열로 변환 및 정렬
  return Object.entries(byDate)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => {
      const [aMonth, aDay] = a.date.split('/').map(Number);
      const [bMonth, bDay] = b.date.split('/').map(Number);
      return aMonth * 100 + aDay - (bMonth * 100 + bDay);
    });
};

/**
 * CSV 내보내기
 */
export const exportUsageToCSV = (): string => {
  const records = getUsageHistory();
  
  const header = '날짜,계정과목,분석유형,전체거래수,샘플크기,샘플링비율(%),토큰수,비용(원),모델\n';
  const rows = records.map(r => {
    const date = new Date(r.timestamp).toLocaleString('ko-KR');
    return `${date},${r.accountName},${r.analysisType},${r.totalCount},${r.sampleSize},${r.samplingRatio.toFixed(1)},${r.tokensUsed},${r.costKRW},${r.model}`;
  }).join('\n');
  
  return header + rows;
};

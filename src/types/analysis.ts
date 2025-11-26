/**
 * 분석 관련 타입 정의
 * Google AI Studio에서 사용하는 타입들을 현재 프로젝트에 맞게 정의
 */

/**
 * 분개장 항목 (Journal Entry)
 */
export interface JournalEntry {
  id?: string | number; // 고유 식별자 (선택)
  entryNumber?: string | number; // 전표번호 (선택)
  date: string | Date;
  accountName: string;
  vendor: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * 일반 분석 결과 (General Analysis Result)
 */
export interface GeneralAnalysisResult {
  riskScore: number; // 0-100
  content: string; // 한국어로 작성된 분석 내용
}

/**
 * 휴일 분석 결과 (Holiday Analysis Result)
 */
export interface HolidayAnalysisResult {
  items: string[]; // 의심스러운 거래 목록 (예: "2024-01-01 - 골프장: 주말 비즈니스 거래 아님")
}

/**
 * 적정성 분석 결과 (Appropriateness Analysis Result)
 */
export interface AppropriatenessAnalysisResult {
  score: number; // 전체 회계 정확도 점수 (0-100)
  flaggedItems: FlaggedItem[];
}

/**
 * 적정성 분석에서 플래그된 항목
 */
export interface FlaggedItem {
  date: string;
  accountName: string;
  description: string;
  amount: number;
  reason: string; // 왜 부적절한지 설명 (한국어)
  recommendedAccount?: string | null; // 권장되는 올바른 계정과목 (선택)
}

/**
 * 상대계정 분석 상세 내역
 */
export interface CounterAccountDetail {
  name: string; // 상대계정명
  count: number; // 거래 건수
  amount: number; // 총 금액
  percentage: string; // 비율 (예: "50.0%")
}

/**
 * 상대계정 분석 결과
 */
export interface CounterAccountAnalysisResult {
  accountName: string; // 분석한 계정과목
  type: '차변' | '대변'; // 분석한 방향
  totalTransactions: number; // 총 거래 건수
  uniqueCounterAccounts: number; // 식별된 상대계정 수
  breakdown: CounterAccountDetail[]; // 상대계정별 집계
  transactions: JournalEntry[]; // 상세 거래 내역
}

/**
 * 대시보드 분석 요약
 */
export interface AnalysisSummary {
  totalDebit: number; // 총 차변 금액
  totalCredit: number; // 총 대변 금액
  entryCount: number; // 총 거래 건수
  dateRange: {
    start: string; // 시작일
    end: string; // 종료일
  };
  monthlyTrend: Array<{
    month: string; // 월 (예: "2024-01")
    debit: number; // 차변 합계
    credit: number; // 대변 합계
  }>;
  topExpenses: Array<{
    name: string; // 계정명
    value: number; // 금액
  }>;
}


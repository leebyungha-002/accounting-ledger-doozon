/**
 * Column Mapping Dictionary
 * 애플리케이션 전반에서 사용되는 컬럼 헤더 동의어 사전입니다.
 */

// 차변 관련 키워드
export const DEBIT_KEYWORDS = [
  '차변', 
  'debit', 
  '차변금액', 
  'debit amount'
];

// 대변 관련 키워드
export const CREDIT_KEYWORDS = [
  '대변', 
  'credit', 
  '대변금액', 
  'credit amount'
];

// 계정과목 관련 키워드
export const ACCOUNT_KEYWORDS = [
  '계정명', 
  '계정과목', 
  '계정', 
  'account',
  '차변계정과목',
  '대변계정과목',
  '데변계정과목' // 사용자 요청에 의한 오타 포함
];

// 날짜 관련 키워드
export const DATE_KEYWORDS = [
  '일자', 
  '날짜', 
  '거래일', 
  'date'
];

// 거래처 관련 키워드
export const VENDOR_KEYWORDS = [
  '거래처', 
  '업체', 
  '회사', 
  'vendor', 
  'customer'
];

// 적요 관련 키워드
export const DESCRIPTION_KEYWORDS = [
  '적요', 
  '내용', 
  '비고', 
  'description', 
  'remark'
];

// 잔액 관련 키워드
export const BALANCE_KEYWORDS = [
  '잔액', 
  'balance'
];

/**
 * 차변/대변 헤더 인식 유틸리티
 * 모든 분석 카드에서 일관되게 차변/대변 헤더를 인식하기 위한 공통 함수
 */

import { 
  DEBIT_KEYWORDS, 
  CREDIT_KEYWORDS, 
  BALANCE_KEYWORDS, 
  DATE_KEYWORDS,
  ACCOUNT_KEYWORDS,
  VENDOR_KEYWORDS,
  DESCRIPTION_KEYWORDS
} from './columnMapping';

type LedgerRow = { [key: string]: string | number | Date | undefined };

export const cleanAmount = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').replace(/\s/g, '').trim();
    if (cleaned === '' || cleaned === '-' || cleaned === '0') return 0;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

/**
 * 헤더를 찾는 강력한 함수 (공통 사용)
 * @param headers 헤더 목록
 * @param keywords 찾을 키워드 목록
 * @returns 찾은 헤더 문자열 또는 undefined
 */
export const robustFindHeader = (headers: string[], keywords: string[]): string | undefined => {
  // 1. 공백 제거 및 소문자 변환하여 비교할 준비
  const normalizedHeaders = headers.map(h => ({
    original: h,
    normalized: (h || "").trim().toLowerCase().replace(/\s/g, '')
  }));

  // 2. 키워드 순회하며 매칭 시도
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase().replace(/\s/g, '');
    
    // 정확한 매칭 우선
    const exactMatch = normalizedHeaders.find(h => h.normalized === normalizedKeyword);
    if (exactMatch) return exactMatch.original;
    
    // 포함 관계 매칭 (정확한 매칭이 없을 때)
    const partialMatch = normalizedHeaders.find(h => h.normalized.includes(normalizedKeyword));
    if (partialMatch) return partialMatch.original;
  }
  
  return undefined;
};

/**
 * 차변/대변 헤더를 찾는 함수 (자동 탐지 포함)
 * @param headers 헤더 배열
 * @param data 데이터 배열 (자동 탐지용)
 * @param dateHeader 날짜 헤더 (제외용)
 * @returns { debitHeader: string | undefined, creditHeader: string | undefined }
 */
export const findDebitCreditHeaders = (
  headers: string[],
  data: LedgerRow[],
  dateHeader?: string
): { debitHeader: string | undefined; creditHeader: string | undefined } => {
  // 1차: 사전 정의된 키워드로 찾기
  let debitHeader = robustFindHeader(headers, DEBIT_KEYWORDS);
  let creditHeader = robustFindHeader(headers, CREDIT_KEYWORDS);

  // 2차: 차변 헤더를 찾지 못했고 데이터가 있는 경우 자동 탐지
  if (!debitHeader && data.length > 0) {
    const numericColumns = new Map<string, number>();
    
    data.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        // 이미 찾은 대변, 날짜 헤더 제외
        if (key === creditHeader || key === dateHeader) return;
        
        const cleanKey = key.replace(/\s/g, '').toLowerCase();
        
        // 제외할 키워드들 (대변, 일자, 잔액, 적요, 거래처, 코드, 내용 등)
        const isExcluded = 
          isMatch(key, CREDIT_KEYWORDS) || 
          isMatch(key, DATE_KEYWORDS) || 
          isMatch(key, BALANCE_KEYWORDS) || 
          isMatch(key, ACCOUNT_KEYWORDS) ||
          isMatch(key, VENDOR_KEYWORDS) ||
          isMatch(key, DESCRIPTION_KEYWORDS) ||
          cleanKey.includes('코드') || 
          cleanKey.includes('code');

        if (!isExcluded) {
          const numVal = cleanAmount(value);
          if (numVal !== 0) {
            numericColumns.set(key, (numericColumns.get(key) || 0) + Math.abs(numVal));
          }
        }
      });
    });
    
    if (numericColumns.size > 0) {
      const sortedColumns = Array.from(numericColumns.entries())
        .sort((a, b) => b[1] - a[1]);
      debitHeader = sortedColumns[0][0];
    }
  }

  // 3차: 대변 헤더를 찾지 못했고 데이터가 있는 경우 자동 탐지
  if (!creditHeader && data.length > 0) {
    const numericColumns = new Map<string, number>();
    
    data.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        // 이미 찾은 차변, 날짜 헤더 제외
        if (key === debitHeader || key === dateHeader) return;
        
        const cleanKey = key.replace(/\s/g, '').toLowerCase();
        
        // 제외할 키워드들
        const isExcluded = 
          isMatch(key, DEBIT_KEYWORDS) || 
          isMatch(key, DATE_KEYWORDS) || 
          isMatch(key, BALANCE_KEYWORDS) || 
          isMatch(key, ACCOUNT_KEYWORDS) ||
          isMatch(key, VENDOR_KEYWORDS) ||
          isMatch(key, DESCRIPTION_KEYWORDS) ||
          cleanKey.includes('코드') || 
          cleanKey.includes('code');

        if (!isExcluded) {
          const numVal = cleanAmount(value);
          if (numVal !== 0) {
            numericColumns.set(key, (numericColumns.get(key) || 0) + Math.abs(numVal));
          }
        }
      });
    });
    
    if (numericColumns.size > 0) {
      const sortedColumns = Array.from(numericColumns.entries())
        .sort((a, b) => b[1] - a[1]);
      creditHeader = sortedColumns[0][0];
    }
  }

  // 4차: 잔액 컬럼이 잘못 인식되었는지 확인
  if (debitHeader && isMatch(debitHeader, BALANCE_KEYWORDS)) {
    // 잔액이 아닌 차변 키워드를 가진 헤더 다시 찾기
    const correctDebitHeader = headers.find(h => {
      return isMatch(h, DEBIT_KEYWORDS) && !isMatch(h, BALANCE_KEYWORDS);
    });
    if (correctDebitHeader) {
      debitHeader = correctDebitHeader;
    }
  }

  if (creditHeader && isMatch(creditHeader, BALANCE_KEYWORDS)) {
    const correctCreditHeader = headers.find(h => {
      return isMatch(h, CREDIT_KEYWORDS) && !isMatch(h, BALANCE_KEYWORDS);
    });
    if (correctCreditHeader) {
      creditHeader = correctCreditHeader;
    }
  }

  return { debitHeader, creditHeader };
};

// 헬퍼: 키워드 매칭 확인
function isMatch(header: string, keywords: string[]): boolean {
  if (!header) return false;
  const h = header.replace(/\s/g, '').toLowerCase();
  return keywords.some(k => h.includes(k.replace(/\s/g, '').toLowerCase()));
}



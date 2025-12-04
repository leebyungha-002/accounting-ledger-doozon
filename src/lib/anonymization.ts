/**
 * 거래처명과 적요 익명화 유틸리티
 * 구글 클라우드로 전송할 때는 가명으로 변환하고,
 * 분석 결과를 받아올 때는 실제 이름으로 복원합니다.
 */

/**
 * 익명화 매핑 테이블 (실제 이름 -> 가명)
 * 같은 이름은 항상 같은 가명으로 매핑됩니다.
 */
const vendorMapping = new Map<string, string>();
const descriptionMapping = new Map<string, string>();

// 가명 생성 카운터
let vendorCounter = 1;
let descriptionCounter = 1;

/**
 * 거래처명을 익명화합니다.
 * 같은 거래처명은 항상 같은 가명으로 변환됩니다.
 */
export function anonymizeVendor(realName: string): string {
  if (!realName || realName.trim() === '') {
    return '';
  }

  const trimmed = realName.trim();
  
  // 이미 매핑이 있으면 기존 가명 반환
  if (vendorMapping.has(trimmed)) {
    return vendorMapping.get(trimmed)!;
  }

  // 새로운 가명 생성 (거래처A, 거래처B, ...)
  const anonymized = `거래처${String.fromCharCode(64 + vendorCounter)}`; // A, B, C, ...
  vendorMapping.set(trimmed, anonymized);
  vendorCounter++;

  return anonymized;
}

/**
 * 적요를 익명화합니다.
 * 같은 적요는 항상 같은 가명으로 변환됩니다.
 */
export function anonymizeDescription(realDescription: string): string {
  if (!realDescription || realDescription.trim() === '') {
    return '';
  }

  const trimmed = realDescription.trim();
  
  // 이미 매핑이 있으면 기존 가명 반환
  if (descriptionMapping.has(trimmed)) {
    return descriptionMapping.get(trimmed)!;
  }

  // 새로운 가명 생성 (적요1, 적요2, ...)
  const anonymized = `적요${descriptionCounter}`;
  descriptionMapping.set(trimmed, anonymized);
  descriptionCounter++;

  return anonymized;
}

/**
 * 익명화된 거래처명을 실제 이름으로 복원합니다.
 */
export function deanonymizeVendor(anonymizedName: string): string {
  if (!anonymizedName || anonymizedName.trim() === '') {
    return '';
  }

  // 매핑 테이블에서 역방향 검색
  for (const [realName, anonymized] of vendorMapping.entries()) {
    if (anonymized === anonymizedName.trim()) {
      return realName;
    }
  }

  // 매핑을 찾지 못하면 원본 반환 (이미 실제 이름일 수 있음)
  return anonymizedName;
}

/**
 * 익명화된 적요를 실제 내용으로 복원합니다.
 */
export function deanonymizeDescription(anonymizedDescription: string): string {
  if (!anonymizedDescription || anonymizedDescription.trim() === '') {
    return '';
  }

  // 매핑 테이블에서 역방향 검색
  for (const [realDescription, anonymized] of descriptionMapping.entries()) {
    if (anonymized === anonymizedDescription.trim()) {
      return realDescription;
    }
  }

  // 매핑을 찾지 못하면 원본 반환 (이미 실제 내용일 수 있음)
  return anonymizedDescription;
}

/**
 * JournalEntry 배열의 거래처명과 적요를 익명화합니다.
 */
export function anonymizeJournalEntries(
  entries: Array<{ vendor?: string; description?: string; [key: string]: any }>
): Array<{ vendor?: string; description?: string; [key: string]: any }> {
  return entries.map(entry => ({
    ...entry,
    vendor: entry.vendor ? anonymizeVendor(entry.vendor) : entry.vendor,
    description: entry.description ? anonymizeDescription(entry.description) : entry.description,
  }));
}

/**
 * 분석 결과 텍스트에서 익명화된 거래처명과 적요를 실제 이름으로 복원합니다.
 */
export function deanonymizeAnalysisText(text: string): string {
  let result = text;

  // 모든 익명화된 거래처명을 실제 이름으로 교체
  for (const [realName, anonymized] of vendorMapping.entries()) {
    // 정규식으로 정확히 일치하는 경우만 교체 (단어 경계 고려)
    const regex = new RegExp(`\\b${escapeRegex(anonymized)}\\b`, 'g');
    result = result.replace(regex, realName);
  }

  // 모든 익명화된 적요를 실제 내용으로 교체
  for (const [realDescription, anonymized] of descriptionMapping.entries()) {
    const regex = new RegExp(`\\b${escapeRegex(anonymized)}\\b`, 'g');
    result = result.replace(regex, realDescription);
  }

  return result;
}

/**
 * FlaggedItem 배열의 거래처명과 적요를 복원합니다.
 */
export function deanonymizeFlaggedItems(
  items: Array<{ description?: string; [key: string]: any }>
): Array<{ description?: string; [key: string]: any }> {
  return items.map(item => ({
    ...item,
    description: item.description ? deanonymizeDescription(item.description) : item.description,
  }));
}

/**
 * 정규식 특수문자를 이스케이프합니다.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 익명화 매핑 테이블을 초기화합니다.
 * 새로운 데이터셋을 분석할 때 호출합니다.
 */
export function resetAnonymizationMappings(): void {
  vendorMapping.clear();
  descriptionMapping.clear();
  vendorCounter = 1;
  descriptionCounter = 1;
}

/**
 * 현재 익명화 매핑 상태를 반환합니다 (디버깅용).
 */
export function getAnonymizationMappings(): {
  vendors: Map<string, string>;
  descriptions: Map<string, string>;
} {
  return {
    vendors: new Map(vendorMapping),
    descriptions: new Map(descriptionMapping),
  };
}

/**
 * 계좌번호 마스킹 유틸리티
 */

/**
 * 계좌번호 패턴을 찾아서 마스킹합니다.
 * 계좌번호는 보통 10-16자리 숫자이며, 하이픈이나 공백이 포함될 수 있습니다.
 * 
 * @param text 마스킹할 텍스트
 * @returns 마스킹된 텍스트 (예: 1234-56-789012 -> 1234-56-****12)
 */
export function maskAccountNumber(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // 계좌번호 패턴: 10-16자리 숫자 (하이픈, 공백, 콜론 등 구분자 포함 가능)
  // 예: 1234567890, 123-456-789012, 1234 5678 9012, 1234-56-789012 등
  const accountNumberPattern = /(\d{3,4}[-.\s]?\d{2,4}[-.\s]?\d{4,8})/g;

  return text.replace(accountNumberPattern, (match) => {
    // 구분자 제거하여 순수 숫자만 추출
    const digitsOnly = match.replace(/[-.\s]/g, '');
    
    // 10자리 이상인 경우만 마스킹 (계좌번호로 판단)
    if (digitsOnly.length >= 10 && digitsOnly.length <= 16) {
      // 앞 4자리와 뒤 4자리만 보이고 중간은 마스킹
      if (digitsOnly.length <= 8) {
        // 8자리 이하는 앞 2자리, 뒤 2자리만
        const front = digitsOnly.substring(0, 2);
        const back = digitsOnly.substring(digitsOnly.length - 2);
        return `${front}${'*'.repeat(digitsOnly.length - 4)}${back}`;
      } else {
        // 9자리 이상은 앞 4자리, 뒤 4자리
        const front = digitsOnly.substring(0, 4);
        const back = digitsOnly.substring(digitsOnly.length - 4);
        const middleLength = digitsOnly.length - 8;
        
        // 원본 구분자 구조 유지 (가능한 경우)
        if (match.includes('-')) {
          // 하이픈이 있으면 구조 유지
          const parts = match.split(/[-.\s]/);
          if (parts.length >= 2) {
            const firstPart = parts[0];
            const lastPart = parts[parts.length - 1];
            const maskedMiddle = '*'.repeat(middleLength);
            
            // 첫 부분과 마지막 부분만 보이고 중간은 마스킹
            if (firstPart.length <= 4 && lastPart.length <= 4) {
              return `${firstPart}${'-'.repeat(parts.length - 2)}${maskedMiddle}${lastPart}`;
            }
          }
        }
        
        // 구분자 구조를 유지할 수 없으면 단순 마스킹
        return `${front}${'*'.repeat(middleLength)}${back}`;
      }
    }
    
    // 10자리 미만이면 마스킹하지 않음 (계좌번호가 아닐 수 있음)
    return match;
  });
}

/**
 * 예금계정 또는 차입금계정인지 확인합니다.
 * @param accountName 계정명
 * @returns 예금계정 또는 차입금계정이면 true
 */
export function isDepositOrLoanAccount(accountName: string): boolean {
  if (!accountName || typeof accountName !== 'string') {
    return false;
  }

  const normalized = accountName.replace(/\s/g, '').toLowerCase();
  
  // 예금계정 키워드
  const depositKeywords = ['예금', '보통예금', '당좌예금', '정기예금', '적립예금', '저축예금', '수신', '자금'];
  
  // 차입금계정 키워드
  const loanKeywords = ['차입금', '차입', '단기차입금', '장기차입금', '대출', '사채', '차입대출'];
  
  const isDeposit = depositKeywords.some(keyword => normalized.includes(keyword));
  const isLoan = loanKeywords.some(keyword => normalized.includes(keyword));
  
  return isDeposit || isLoan;
}

/**
 * LedgerRow 데이터에서 예금계정/차입금계정의 계좌번호를 마스킹합니다.
 * @param row 원장 데이터 행
 * @param accountNameHeader 계정명 헤더 필드명
 * @returns 마스킹된 데이터 행
 */
export function maskAccountNumbersInRow(
  row: { [key: string]: any },
  accountNameHeader?: string
): { [key: string]: any } {
  const maskedRow = { ...row };
  
  // 계정명 확인
  const accountName = accountNameHeader 
    ? String(row[accountNameHeader] || '')
    : String(row['계정과목'] || row['계정명'] || row['계정'] || '');
  
  // 예금계정 또는 차입금계정인 경우에만 마스킹
  if (!isDepositOrLoanAccount(accountName)) {
    return maskedRow;
  }
  
  // 거래처, 적요, 내용, 비고 등 필드에서 계좌번호 마스킹
  const fieldsToMask = [
    '거래처', '거래처명', '적요', '적요란', '내용', '비고', 'description', 'remark',
    '계   정   별   원   장', '__EMPTY_1', '__EMPTY_2'
  ];
  
  fieldsToMask.forEach(field => {
    if (row[field] && typeof row[field] === 'string') {
      maskedRow[field] = maskAccountNumber(row[field]);
    }
  });
  
  return maskedRow;
}

/**
 * LedgerRow 배열에서 예금계정/차입금계정의 계좌번호를 마스킹합니다.
 * @param rows 원장 데이터 배열
 * @param accountNameHeader 계정명 헤더 필드명 (선택)
 * @returns 마스킹된 데이터 배열
 */
export function maskAccountNumbersInRows(
  rows: { [key: string]: any }[],
  accountNameHeader?: string
): { [key: string]: any }[] {
  return rows.map(row => maskAccountNumbersInRow(row, accountNameHeader));
}


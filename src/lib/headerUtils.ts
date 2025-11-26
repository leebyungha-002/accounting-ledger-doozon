/**
 * 차변/대변 헤더 인식 유틸리티
 * 모든 분석 카드에서 일관되게 차변/대변 헤더를 인식하기 위한 공통 함수
 */

type LedgerRow = { [key: string]: string | number | Date | undefined };

const cleanAmount = (val: any): number => {
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
  // 1차: 기본 헤더 찾기
  let debitHeader = headers.find(h => {
    const clean = h.replace(/\s/g, '').toLowerCase();
    return clean.includes('차변') || clean.includes('debit') || clean === '차변' || clean === 'debit';
  }) || headers.find(h => {
    const clean = h.toLowerCase();
    return clean.includes('차변') || clean.includes('debit');
  });

  let creditHeader = headers.find(h => {
    const clean = h.replace(/\s/g, '').toLowerCase();
    return clean.includes('대변') || clean.includes('credit') || clean === '대변' || clean === 'credit';
  }) || headers.find(h => {
    const clean = h.toLowerCase();
    return clean.includes('대변') || clean.includes('credit');
  });

  // 2차: 차변 헤더를 찾지 못한 경우 자동 탐지
  if (!debitHeader && data.length > 0) {
    const numericColumns = new Map<string, number>();
    
    data.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (key === creditHeader || key === dateHeader) return;
        const cleanKey = key.replace(/\s/g, '').toLowerCase();
        // 대변, 일자, 날짜, 잔액, balance가 아닌 컬럼만 확인
        if (!cleanKey.includes('대변') && !cleanKey.includes('credit') && 
            !cleanKey.includes('일자') && !cleanKey.includes('날짜') &&
            !cleanKey.includes('잔액') && !cleanKey.includes('balance') &&
            !cleanKey.includes('적요') && !cleanKey.includes('거래처') &&
            !cleanKey.includes('코드') && !cleanKey.includes('내용')) {
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

  // 3차: 대변 헤더를 찾지 못한 경우 자동 탐지
  if (!creditHeader && data.length > 0) {
    const numericColumns = new Map<string, number>();
    
    data.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (key === debitHeader || key === dateHeader) return;
        const cleanKey = key.replace(/\s/g, '').toLowerCase();
        // 차변, 일자, 날짜, 잔액, balance가 아닌 컬럼만 확인
        if (!cleanKey.includes('차변') && !cleanKey.includes('debit') && 
            !cleanKey.includes('일자') && !cleanKey.includes('날짜') &&
            !cleanKey.includes('잔액') && !cleanKey.includes('balance') &&
            !cleanKey.includes('적요') && !cleanKey.includes('거래처') &&
            !cleanKey.includes('코드') && !cleanKey.includes('내용')) {
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

  // 4차: 잔액 컬럼이 차변/대변으로 잘못 인식되지 않았는지 확인
  if (debitHeader && debitHeader.toLowerCase().includes('잔액')) {
    const correctDebitHeader = headers.find(h => {
      const clean = h.replace(/\s/g, '').toLowerCase();
      return (clean.includes('차변') || clean.includes('debit')) && 
             !clean.includes('잔액') && !clean.includes('balance');
    });
    if (correctDebitHeader) {
      debitHeader = correctDebitHeader;
    }
  }

  if (creditHeader && creditHeader.toLowerCase().includes('잔액')) {
    const correctCreditHeader = headers.find(h => {
      const clean = h.replace(/\s/g, '').toLowerCase();
      return (clean.includes('대변') || clean.includes('credit')) && 
             !clean.includes('잔액') && !clean.includes('balance');
    });
    if (correctCreditHeader) {
      creditHeader = correctCreditHeader;
    }
  }

  return { debitHeader, creditHeader };
};


import * as XLSX from 'xlsx';
import { 
  DATE_KEYWORDS, 
  ACCOUNT_KEYWORDS, 
  VENDOR_KEYWORDS, 
  DESCRIPTION_KEYWORDS, 
  DEBIT_KEYWORDS, 
  CREDIT_KEYWORDS, 
  BALANCE_KEYWORDS 
} from '@/lib/columnMapping';
import { robustFindHeader } from '@/lib/headerUtils';
import { maskAccountNumbersInRows } from '@/lib/anonymization';

export type LedgerRow = { [key: string]: string | number | Date | undefined };

export const parseDate = (value: any): Date | null => {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.match(/^(?<month>\d{1,2})[-/](?<day>\d{1,2})$/);
    if (match && match.groups) {
      const currentYear = new Date().getFullYear();
      const month = parseInt(match.groups.month, 10) - 1;
      const day = parseInt(match.groups.day, 10);
      const d = new Date(currentYear, month, day);
      if (d.getFullYear() === currentYear && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
  }
  if (typeof value === 'number' && value > 1 && value < 50000) {
    try {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) return date;
    } catch (e) { /* ignore */ }
  }
  return null;
};

export const getDataFromSheet = (worksheet: XLSX.WorkSheet | undefined): { data: LedgerRow[], headers: string[], orderedHeaders: string[] } => {
  if (!worksheet) return { data: [], headers: [], orderedHeaders: [] };

  const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
  if (sheetDataAsArrays.length < 2) return { data: [], headers: [], orderedHeaders: [] };

  let headerIndex = -1;
  const searchLimit = Math.min(20, sheetDataAsArrays.length);
  const dateKeywords = DATE_KEYWORDS;
  // Combine other keywords for robustness, avoiding duplicates if any
  const otherHeaderKeywords = [
    ...new Set([
      ...DESCRIPTION_KEYWORDS, 
      ...VENDOR_KEYWORDS, 
      ...DEBIT_KEYWORDS, 
      ...CREDIT_KEYWORDS, 
      ...BALANCE_KEYWORDS,
      '금액', '코드', '내용', '비고'
    ])
  ];

  for (let i = 0; i < searchLimit; i++) {
    const potentialHeaderRow = sheetDataAsArrays[i];
    if (!potentialHeaderRow || potentialHeaderRow.length < 3) continue;

    const headerContent = potentialHeaderRow.map(cell => String(cell || '').trim().toLowerCase()).join('|');
    const hasDateKeyword = dateKeywords.some(kw => headerContent.includes(kw));
    const otherKeywordCount = otherHeaderKeywords.filter(kw => headerContent.includes(kw)).length;

    if (hasDateKeyword && otherKeywordCount >= 2) {
      const lookaheadLimit = Math.min(i + 6, sheetDataAsArrays.length);
      for (let j = i + 1; j < lookaheadLimit; j++) {
        const dataRowCandidate = sheetDataAsArrays[j];
        if (dataRowCandidate && parseDate(dataRowCandidate[0]) !== null) {
          headerIndex = i;
          break;
        }
      }
    }
    if (headerIndex !== -1) break;
  }

  if (headerIndex === -1) {
    for (let i = 0; i < searchLimit; i++) {
      const row = sheetDataAsArrays[i];
      if (!row || row.length < 2) continue;
      const rowContent = row.map(cell => String(cell || '').trim().toLowerCase()).join(' ');
      if (dateKeywords.some(kw => rowContent.includes(kw)) && otherHeaderKeywords.filter(kw => rowContent.includes(kw)).length >= 2) {
        if (i + 1 < sheetDataAsArrays.length && sheetDataAsArrays[i + 1]?.some(cell => cell !== null)) {
          headerIndex = i;
          break;
        }
      }
    }
  }

  if (headerIndex === -1) {
    let maxNonEmptyCells = 0;
    let potentialHeaderIndex = -1;
    for (let i = 0; i < searchLimit; i++) {
      const row = sheetDataAsArrays[i];
      if (!row) continue;
      const nonEmptyCells = row.filter(cell => cell !== null && String(cell).trim() !== '');
      if (nonEmptyCells.length === 1 && String(nonEmptyCells[0]).trim() === '계정별원장') continue;
      if (nonEmptyCells.length >= maxNonEmptyCells && nonEmptyCells.length >= 3) {
        maxNonEmptyCells = nonEmptyCells.length;
        potentialHeaderIndex = i;
      }
    }
    headerIndex = potentialHeaderIndex;
  }

  if (headerIndex === -1) return { data: [], headers: [], orderedHeaders: [] };

  const rawData = XLSX.utils.sheet_to_json<LedgerRow>(worksheet, { range: headerIndex });
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  const orderedHeaders = (sheetDataAsArrays[headerIndex] || []).map(h => String(h || '').trim());

  // 필터링: 합계행, 빈행, 헤더 중복 제거 (기존 데이터에 영향 없음)
  const data = rawData.filter(row => {
    // 1. 합계 행 제거: 모든 컬럼의 값을 확인하여 월계/누계 행 제거
    const isMonthlyOrCumulative = Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      // 공백 제거 후 정규화
      const normalized = str.replace(/\s/g, '');
      // 다양한 형태의 월계/누계 확인
      return normalized.includes('월계') || 
             normalized.includes('누계') ||
             normalized.includes('[월계]') || 
             normalized.includes('[누계]') ||
             normalized === '월계' ||
             normalized === '누계' ||
             str.includes('[ 월계 ]') ||
             str.includes('[ 누계 ]') ||
             str.includes('[월 계]') ||
             str.includes('[누 계]') ||
             str.includes('[ 전 기 이 월 ]') ||
             str.includes('[ 전기이월 ]');
    });
    
    if (isMonthlyOrCumulative) {
      return false;
    }
    
    // 2. 헤더 중복 제거 (두 번째 페이지 등)
    const dateHeader = robustFindHeader(orderedHeaders, dateKeywords);
    if (dateHeader && (row[dateHeader] === dateHeader || row[dateHeader] === '일  자' || row[dateHeader] === '일자')) {
      return false;
    }
    
    // 3. 완전 빈 행 제거 강화
    const hasData = Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      return str !== '' && str !== '0' && str !== '-';
    });
    if (!hasData) return false;
    
    return true;
  });

  const dateHeader = robustFindHeader(orderedHeaders, dateKeywords);
  if (dateHeader) {
    data.forEach(row => {
      const parsed = parseDate(row[dateHeader]);
      if (parsed) {
        row[dateHeader] = parsed;
      }
    });
  }

  // 예금계정/차입금계정의 계좌번호 마스킹 ('계정명'을 우선순위로)
  const accountNameHeader = robustFindHeader(orderedHeaders, ACCOUNT_KEYWORDS);
  const maskedData = maskAccountNumbersInRows(data, accountNameHeader);

  return { data: maskedData, headers, orderedHeaders };
};

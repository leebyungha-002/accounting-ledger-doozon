/**
 * Gemini 기반 회계 분석 서비스
 * Google AI Studio 코드를 현재 프로젝트 방식으로 변환
 * 기존 geminiClient.ts를 활용하여 구현
 */

import { createGeminiClient, getApiKey } from '@/lib/geminiClient';
import {
  anonymizeJournalEntries,
  deanonymizeAnalysisText,
  deanonymizeFlaggedItems,
} from '@/lib/anonymization';
import type { 
  JournalEntry, 
  GeneralAnalysisResult, 
  HolidayAnalysisResult, 
  AppropriatenessAnalysisResult,
  FlaggedItem
} from '@/types/analysis';

/**
 * Context 준비 (상위 거래 및 샘플 추출)
 */
const prepareContext = (entries: JournalEntry[]): string => {
  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
  const expenses = entries.filter(e => e.debit > 0);

  // 상위 300개 거래 (고액 거래) - 요청 크기 감소를 위해 500 → 300으로 줄임
  const topTransactions = [...expenses]
    .sort((a, b) => b.debit - a.debit)
    .slice(0, 300)
    .map(e => `${e.date} | ${e.accountName} | ${e.vendor} | ${e.debit.toLocaleString()} | ${e.description}`);

  // 무작위 샘플 300개 (패턴 매칭용) - 요청 크기 감소를 위해 500 → 300으로 줄임
  const diverseSample = expenses
    .sort(() => 0.5 - Math.random())
    .slice(0, 300)
    .map(e => `${e.date} | ${e.accountName} | ${e.vendor} | ${e.description}`);

  return `
    Total Debit: ${totalDebit.toLocaleString()} KRW
    [Top High Value Transactions]
    ${topTransactions.join('\n')}
    [Random Sample Transactions]
    ${diverseSample.join('\n')}
  `;
};

/**
 * LedgerRow를 JournalEntry로 변환하는 헬퍼 함수
 */
const convertToJournalEntry = (row: { [key: string]: string | number | Date | undefined }, headers: {
  date?: string;
  accountName?: string;
  vendor?: string;
  debit?: string;
  credit?: string;
  description?: string;
}): JournalEntry | null => {
  if (!headers.date || !headers.accountName) {
    return null;
  }

  const cleanAmount = (val: any): number => {
    // null, undefined 체크
    if (val === null || val === undefined) {
      return 0;
    }
    
    // 빈 문자열 체크
    if (typeof val === 'string' && val.trim() === '') {
      return 0;
    }
    
    // 문자열인 경우: 쉼표 제거 후 숫자 변환
    if (typeof val === 'string') {
      const cleaned = val.replace(/,/g, '').replace(/\s/g, '').trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    
    // 숫자인 경우
    if (typeof val === 'number') {
      return isNaN(val) ? 0 : val;
    }
    
    // 그 외의 경우 (Date 객체 등)
    return 0;
  };

  return {
    date: row[headers.date] instanceof Date ? row[headers.date] : String(row[headers.date] || ''),
    accountName: String(row[headers.accountName] || ''),
    vendor: headers.vendor ? String(row[headers.vendor] || '') : '',
    debit: headers.debit ? cleanAmount(row[headers.debit]) : 0,
    credit: headers.credit ? cleanAmount(row[headers.credit]) : 0,
    description: headers.description ? String(row[headers.description] || '') : '',
  };
};

/**
 * 일반 분석 수행
 * 전체적인 비용 성격, 고위험 거래 식별, 위험 점수 제공
 */
export const analyzeGeneral = async (
  entries: JournalEntry[]
): Promise<GeneralAnalysisResult | null> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("No API Key found");
    return null;
  }

  const client = createGeminiClient(apiKey);
  if (!client) {
    console.error("Failed to create Gemini client");
    return null;
  }

  // 익명화된 엔트리로 컨텍스트 준비 (구글 클라우드로 전송)
  const anonymizedEntries = anonymizeJournalEntries(entries);
  const context = prepareContext(anonymizedEntries);

  const prompt = `
You are a professional financial auditor for Korean corporate accounting.

Analyze the following journal entry data summary:

${context}

Provide a "General Review" (일반사항).

1. Assess the overall nature of expenses (e.g., Manufacturing, Service, IT).

2. Identify any immediate high-level risks based on the high value transactions.

3. Provide a risk score (0-100).

Return JSON in the following format:
{
  "riskScore": number (0-100),
  "content": string (detailed analysis in Korean, markdown format)
}

Keep the content professional and in Korean. Use markdown for formatting.
`;

  // 2026년 2월 기준 최신 공식 명칭: gemini-3-pro-preview 우선, 404 시 gemini-3-pro 등 대체
  const modelsToTry = [
    'gemini-2.0-flash',         // 비용 절감용 (최우선)
    'gemini-3-pro',             // 정식명 (404 시 위 preview 사용)
    'gemini-2.5-flash',         // 최신 2.5 Flash
    'gemini-1.5-flash-latest',  // 최신 Flash 모델
    'gemini-1.5-flash',         // 기본 Flash 모델
    'gemini-1.5-pro',           // Pro 모델
  ];
  
  let lastError: any = null;
  
  for (const modelName of modelsToTry) {
    try {
      console.log(`🔄 ${modelName} 모델로 일반 분석 시도 중...`);
      const model = client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      if (!text) {
        console.warn(`⚠️ ${modelName}: 빈 응답 반환`);
        continue;
      }

      // JSON 파싱
      const parsed = JSON.parse(text) as GeneralAnalysisResult;
      
      // 유효성 검증
      if (typeof parsed.riskScore !== 'number' || !parsed.content) {
        console.error(`⚠️ ${modelName}: Invalid response format:`, parsed);
        continue;
      }

      // 분석 결과 텍스트에서 익명화된 이름을 실제 이름으로 복원
      parsed.content = deanonymizeAnalysisText(parsed.content);

      console.log(`✅ ${modelName} 모델로 분석 성공!`);
      return parsed;
    } catch (modelError: any) {
      console.error('Gemini API Error:', modelError?.message ?? modelError);
      console.warn(`⚠️ ${modelName} 모델 오류:`, modelError.message || modelError);
      lastError = modelError;
      
      // 404 오류인 경우 다음 모델 시도
      if (modelError.message?.includes('404') || modelError.message?.includes('not found') || modelError.status === 404) {
        console.error('모델명 확인: 최신 명칭 gemini-3-pro-preview, 대안 gemini-3-pro');
        console.log(`⏭️ ${modelName} 모델을 찾을 수 없습니다. 다음 모델로 시도합니다...`);
        continue;
      }
      
      // 429, 401, 403 같은 다른 오류는 즉시 throw
      if (modelError.status === 429) {
        console.error("할당량 초과 (429): 분당 요청 제한을 초과했습니다. 잠시 후 다시 시도해주세요.");
        throw new Error("API 사용량 한도 초과: 무료 티어는 분당 15회 요청 제한이 있습니다. 1-2분 후 다시 시도해주세요.");
      } else if (modelError.status === 401 || modelError.status === 403) {
        console.error("API Key 인증 실패:", modelError.status);
        throw new Error("API Key가 유효하지 않습니다. 설정에서 API Key를 확인하고 다시 시도해주세요.");
      }
      
      // 404가 아닌 다른 오류는 다음 모델 시도
    }
  }
  
  // 모든 모델 실패
  console.error("❌ 모든 모델로 일반 분석 실패");
  if (lastError) {
    console.error("AI General Analysis Error:", lastError);
    if (lastError.status === 404) {
      throw new Error("모델을 찾을 수 없습니다. API Key가 올바른지 확인해주세요.");
    }
    throw lastError;
  }
  throw new Error("모든 모델로 분석 실패했습니다.");
};

/**
 * 휴일/주말 분석 수행
 * 비즈니스와 무관한 의심스러운 거래 식별 (개인 용도, 과도한 접대비, 골프, 노래방 등)
 */
export const analyzeHoliday = async (
  entries: JournalEntry[]
): Promise<HolidayAnalysisResult | null> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("No API Key found");
    return null;
  }

  const client = createGeminiClient(apiKey);
  if (!client) {
    console.error("Failed to create Gemini client");
    return null;
  }

  // 비용만 필터링
  const expenses = entries.filter(e => e.debit > 0);
  
  // 공휴일 거래는 금액과 무관하게 발견되어야 하므로 층화 샘플링 적용
  // 1. 상위 고액 거래 300개 (이상 거래 탐지)
  // 2. 무작위 샘플 700개 (일반적인 공휴일 패턴 탐지)
  const topExpenses = [...expenses].sort((a, b) => b.debit - a.debit).slice(0, 300);
  const randomExpenses = [...expenses]
    .filter(e => !topExpenses.includes(e))
    .sort(() => 0.5 - Math.random())
    .slice(0, 700);
  const limitedEntries = [...topExpenses, ...randomExpenses];

  // 익명화된 엔트리로 변환 (구글 클라우드로 전송)
  const anonymizedEntries = anonymizeJournalEntries(limitedEntries);
  const dataStr = anonymizedEntries.map(e => 
    `[${e.date}] ${e.accountName} | ${e.vendor} | ${e.description} | ${e.debit}`
  ).join('\n');

  const prompt = `
You are an auditor checking for suspicious weekend/holiday expenses.

Data:
${dataStr}

Identify items that seem unrelated to business (e.g. personal use, excessive entertainment, golf, karaoke).

Return JSON in the following format:
{
  "items": string[] (each item format: "Date - Vendor: Reason in Korean")
}

If none, items should be an empty array.
`;

  // 비용 절감: gemini-2.0-flash 우선, 404 시 gemini-3-pro 등 대체
  const modelsToTry = [
    'gemini-2.0-flash',         // 비용 절감용 (최우선)
    'gemini-3-pro',             // 정식명 (404 시 위 preview 사용)
    'gemini-2.5-flash',         // 최신 2.5 Flash
    'gemini-1.5-flash-latest',  // 최신 Flash 모델
    'gemini-1.5-flash',         // 기본 Flash 모델
    'gemini-1.5-pro',           // Pro 모델
  ];
  
  let lastError: any = null;
  
  for (const modelName of modelsToTry) {
    try {
      console.log(`🔄 ${modelName} 모델로 공휴일 분석 시도 중...`);
      const model = client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      if (!text) {
        console.warn(`⚠️ ${modelName}: 빈 응답 반환`);
        continue;
      }

      const parsed = JSON.parse(text) as HolidayAnalysisResult;
      
      // 유효성 검증
      if (!Array.isArray(parsed.items)) {
        console.error(`⚠️ ${modelName}: Invalid response format:`, parsed);
        continue;
      }

      // 분석 결과에서 익명화된 이름을 실제 이름으로 복원
      parsed.items = parsed.items.map(item => deanonymizeAnalysisText(item));

      console.log(`✅ ${modelName} 모델로 분석 성공!`);
      return parsed;
    } catch (modelError: any) {
      console.error('Gemini API Error:', modelError?.message ?? modelError);
      console.warn(`⚠️ ${modelName} 모델 오류:`, modelError.message || modelError);
      lastError = modelError;
      
      // 404 오류인 경우 다음 모델 시도
      if (modelError.message?.includes('404') || modelError.message?.includes('not found') || modelError.status === 404) {
        console.error('모델명 확인: 최신 명칭 gemini-3-pro-preview, 대안 gemini-3-pro');
        console.log(`⏭️ ${modelName} 모델을 찾을 수 없습니다. 다음 모델로 시도합니다...`);
        continue;
      }
      
      // 429, 401, 403 같은 다른 오류는 즉시 throw
      if (modelError.status === 429) {
        console.error("할당량 초과 (429): 분당 요청 제한을 초과했습니다. 잠시 후 다시 시도해주세요.");
        throw new Error("API 사용량 한도 초과: 무료 티어는 분당 15회 요청 제한이 있습니다. 1-2분 후 다시 시도해주세요.");
      } else if (modelError.status === 401 || modelError.status === 403) {
        console.error("API Key 인증 실패:", modelError.status);
        throw new Error("API Key가 유효하지 않습니다. 설정에서 API Key를 확인하고 다시 시도해주세요.");
      }
      
      // 404가 아닌 다른 오류는 다음 모델 시도
    }
  }
  
  // 모든 모델 실패
  console.error("❌ 모든 모델로 공휴일 분석 실패");
  if (lastError) {
    console.error("Holiday Analysis Error:", lastError);
    if (lastError.status === 404) {
      throw new Error("모델을 찾을 수 없습니다. API Key가 올바른지 확인해주세요.");
    }
    throw lastError;
  }
  throw new Error("모든 모델로 분석 실패했습니다.");
};

/**
 * 적정 금액 기준 제안 결과 타입
 */
export interface SuggestedMinAmount {
  amount: number;
  reason?: string;
}

/**
 * 적정 금액 기준 제안 (AI 기반)
 * 데이터를 분석하여 적요 적합성 분석에 적합한 최소 금액 기준을 제안
 */
export const suggestAppropriateMinAmount = async (
  entries: JournalEntry[]
): Promise<SuggestedMinAmount> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    // API 키가 없으면 통계적으로 계산
    const amount = calculateStatisticalMinAmount(entries);
    return { amount, reason: '통계적 방법으로 계산된 금액입니다.' };
  }

  const client = createGeminiClient(apiKey);
  if (!client) {
    const amount = calculateStatisticalMinAmount(entries);
    return { amount, reason: '통계적 방법으로 계산된 금액입니다.' };
  }

  // 차변 항목만 필터링
  const debitEntries = entries.filter(e => e.debit > 0 && e.description && e.description.length > 1);
  
  if (debitEntries.length === 0) {
    return { amount: 100000, reason: '기본값입니다.' }; // 기본값
  }

  // 통계 정보 요약
  const amounts = debitEntries.map(e => e.debit).sort((a, b) => b - a);
  const totalCount = debitEntries.length;
  const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
  const medianAmount = amounts[Math.floor(amounts.length / 2)];
  const p75 = amounts[Math.floor(amounts.length * 0.25)];
  const p90 = amounts[Math.floor(amounts.length * 0.10)];
  const p95 = amounts[Math.floor(amounts.length * 0.05)];
  const maxAmount = amounts[0];
  const minAmount = amounts[amounts.length - 1];

  // 계정과목별 통계
  const accountStats = new Map<string, { count: number; avg: number; max: number }>();
  debitEntries.forEach(e => {
    const stat = accountStats.get(e.accountName) || { count: 0, avg: 0, max: 0, total: 0 };
    stat.count++;
    stat.avg += e.debit;
    stat.max = Math.max(stat.max, e.debit);
    accountStats.set(e.accountName, stat);
  });

  const topAccounts = Array.from(accountStats.entries())
    .map(([name, stat]) => ({
      name,
      count: stat.count,
      avgAmount: stat.avg / stat.count,
      maxAmount: stat.max
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const prompt = `
당신은 회계 감사 전문가입니다. 적요 적합성 분석을 위해 적정한 최소 금액 기준을 제안해주세요.

데이터 통계:
- 총 차변 항목 수: ${totalCount.toLocaleString()}건
- 평균 금액: ${avgAmount.toLocaleString()}원
- 중앙값: ${medianAmount.toLocaleString()}원
- 75백분위수: ${p75.toLocaleString()}원
- 90백분위수: ${p90.toLocaleString()}원
- 95백분위수: ${p95.toLocaleString()}원
- 최대 금액: ${maxAmount.toLocaleString()}원
- 최소 금액: ${minAmount.toLocaleString()}원

상위 계정과목 통계:
${topAccounts.map(a => `- ${a.name}: ${a.count}건, 평균 ${Math.round(a.avgAmount).toLocaleString()}원, 최대 ${a.maxAmount.toLocaleString()}원`).join('\n')}

요구사항:
1. 적요 적합성 분석은 AI 분석이므로 분석 항목 수를 500-1000건 정도로 제한하는 것이 적절합니다.
2. 너무 낮은 금액 기준을 사용하면 분석 시간과 비용이 증가합니다.
3. 너무 높은 금액 기준을 사용하면 중요한 항목을 놓칠 수 있습니다.
4. 75-90백분위수 사이의 금액을 기준으로 제안하는 것이 일반적으로 적절합니다.

적정한 최소 금액 기준(원 단위, 숫자만)을 제안해주세요. 
응답은 JSON 형식으로: {"suggestedMinAmount": 숫자, "reason": "이유"}

예: {"suggestedMinAmount": 150000, "reason": "95백분위수 기준으로 상위 5% 항목만 분석하면 약 500건 정도로 적정한 분석량이 됩니다."}
`;

  // 최신 공식 명칭 우선, 404 시 gemini-3-pro 시도
  const suggestModels = ['gemini-2.0-flash', 'gemini-3-pro'];
  for (const modelName of suggestModels) {
    try {
      const model = client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      if (!text) continue;

      const parsed = JSON.parse(text);
      const suggestedAmount = parsed.suggestedMinAmount || calculateStatisticalMinAmount(entries);
      const reason = parsed.reason || 'AI가 제안한 금액입니다.';
      
      // 제안 금액이 합리적인 범위인지 확인
      if (suggestedAmount >= minAmount && suggestedAmount <= maxAmount) {
        return { 
          amount: Math.round(suggestedAmount),
          reason: reason
        };
      } else {
        const amount = calculateStatisticalMinAmount(entries);
        return { 
          amount,
          reason: '제안 금액이 범위를 벗어나 통계적 방법으로 재계산했습니다.'
        };
      }
    } catch (error: any) {
      const is404 = error.status === 404 || (error.message || '').includes('404') || (error.message || '').toLowerCase().includes('not found');
      if (is404) {
        console.warn(`⚠️ ${modelName} 모델을 찾을 수 없습니다. 다음 모델로 시도합니다.`);
        continue;
      }
      console.error("적정 금액 제안 오류:", error);
      const amount = calculateStatisticalMinAmount(entries);
      let reason = '오류가 발생하여 통계적 방법으로 계산했습니다.';
      if (error.status === 429) {
        reason = 'API 사용량 한도 초과로 통계적 방법으로 계산했습니다.';
      } else if (error.status === 401 || error.status === 403) {
        reason = 'API 인증 오류로 통계적 방법으로 계산했습니다.';
      }
      return { amount, reason };
    }
  }
  // 모든 모델 실패 시 통계적 방법
  const amount = calculateStatisticalMinAmount(entries);
  return { amount, reason: 'API 모델을 사용할 수 없어 통계적 방법으로 계산했습니다.' };
};

/**
 * 통계적으로 적정 금액 기준 계산 (AI 없이)
 */
function calculateStatisticalMinAmount(entries: JournalEntry[]): number {
  const debitEntries = entries.filter(e => e.debit > 0 && e.description && e.description.length > 1);
  
  if (debitEntries.length === 0) {
    return 100000; // 기본값
  }

  const amounts = debitEntries.map(e => e.debit).sort((a, b) => b - a);
  const totalCount = debitEntries.length;
  
  // 목표: 500-1000건 정도로 제한
  let targetCount = Math.min(1000, Math.max(500, Math.floor(totalCount * 0.1)));
  
  // 백분위수 계산
  if (targetCount >= totalCount) {
    return amounts[amounts.length - 1]; // 최소값
  }
  
  const percentile = 1 - (targetCount / totalCount);
  const index = Math.floor(amounts.length * percentile);
  const suggestedAmount = amounts[Math.max(0, index)];
  
  // 최소값 제한 (10,000원 이상)
  return Math.max(10000, Math.round(suggestedAmount));
}

/**
 * 적정성 분석 수행
 * 계정과목과 적요의 일관성 분석, 부적절한 분개 식별
 */
export const analyzeAppropriateness = async (
  entries: JournalEntry[]
): Promise<AppropriatenessAnalysisResult | null> => {
  // 다른 분석 함수들과 동일한 방식으로 API 키 처리
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("No API Key found");
    return null;
  }

  const client = createGeminiClient(apiKey);
  if (!client) {
    console.error("Failed to create Gemini client");
    return null;
  }

  // 비용만 필터링하고, 일반적인 조정 항목 제외
  const expenses = entries.filter(e => e.debit > 0 && e.description && e.description.length > 1);
  
  if (expenses.length === 0) {
    console.warn("분석할 비용 항목이 없습니다.");
    return {
      score: 100,
      flaggedItems: []
    };
  }
  
  // 층화 샘플링: 계정과목별로 균형있게 샘플링
  // 1. 계정과목별로 그룹화
  const accountGroups = new Map<string, JournalEntry[]>();
  expenses.forEach(e => {
    if (!accountGroups.has(e.accountName)) {
      accountGroups.set(e.accountName, []);
    }
    accountGroups.get(e.accountName)!.push(e);
  });
  
  // 2. 계정과목별로 균형있게 샘플링 (각 계정에서 최소 10개, 최대 100개)
  const sample: JournalEntry[] = [];
  const accounts = Array.from(accountGroups.keys());
  
  if (accounts.length === 0) {
    console.warn("분석할 계정이 없습니다.");
    return {
      score: 100,
      flaggedItems: []
    };
  }
  
  const perAccountSize = Math.min(1000 / accounts.length, 100);
  const minPerAccount = Math.min(10, Math.floor(1000 / accounts.length));
  
  accounts.forEach(account => {
    const accountEntries = accountGroups.get(account)!;
    const sampleSize = Math.min(perAccountSize, accountEntries.length);
    const minSize = Math.min(minPerAccount, accountEntries.length);
    const actualSize = Math.max(minSize, sampleSize);
    
    const shuffled = [...accountEntries].sort(() => 0.5 - Math.random());
    sample.push(...shuffled.slice(0, actualSize));
  });
  
  // 3. 총 1000개로 제한
  const finalSample = sample.sort(() => 0.5 - Math.random()).slice(0, Math.min(1000, sample.length));

  if (finalSample.length === 0) {
    console.warn("샘플링된 데이터가 없습니다.");
    return {
      score: 100,
      flaggedItems: []
    };
  }

  // 익명화된 엔트리로 변환 (구글 클라우드로 전송)
  const anonymizedSample = anonymizeJournalEntries(finalSample);
  const dataStr = anonymizedSample.map(e => 
    `${e.date} | Account:${e.accountName} | Desc:${e.description} | Amt:${e.debit}`
  ).join('\n');

  const prompt = `
You are an expert AI Auditor. Analyze the consistency between "Account Name" (계정과목) and "Description" (적요).

Data Format: Date | Account | Desc | Amt

Data:
${dataStr}

Task:
1. Identify entries where the Description logically contradicts the Account Name (e.g., Account='Welfare(복리후생비)' but Desc='Client Gift(거래처 선물)' -> Should be Entertainment(접대비)).
2. Ignore minor spelling errors or generic descriptions like "Payment". Focus on clear semantic mismatches.
3. Give a 'score' (0-100) for overall accounting accuracy (100 = perfect).

Return JSON in the following format:
{
  "score": number (0-100),
  "flaggedItems": [
    {
      "date": string,
      "accountName": string,
      "description": string,
      "amount": number,
      "reason": string (explanation in Korean why it is mismatched),
      "recommendedAccount": string | null (suggested correct account name in Korean, optional)
    }
  ]
}
`;

  try {
    // 2026년 2월 기준 최신 공식 명칭: gemini-3-pro-preview 우선, 404 시 gemini-3-pro 등 대체
    const modelsToTry = [
      'gemini-2.0-flash',         // 비용 절감용 (최우선)
      'gemini-3-pro',             // 정식명 (404 시 위 preview 사용)
      'gemini-2.5-flash',         // 최신 2.5 Flash
      'gemini-1.5-flash',         // 대체 - 404 오류 시 자동 대체
      'gemini-2.0-flash-exp',     // 대체 - AdvancedLedgerAnalysis에서 사용
      'gemini-1.5-pro',           // 대체 - Pro 모델
    ];
    
    let lastError: any = null;
    
    for (const modelName of modelsToTry) {
      try {
        console.log(`🔄 ${modelName} 모델로 적요 적합성 분석 시도 중...`);
        const model = client.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        if (!text) {
          console.warn(`⚠️ ${modelName}: 빈 응답 반환`);
          continue;
        }

        const parsed = JSON.parse(text) as AppropriatenessAnalysisResult;
        
        // 유효성 검증
        if (typeof parsed.score !== 'number' || !Array.isArray(parsed.flaggedItems)) {
          console.error(`⚠️ ${modelName}: Invalid response format:`, parsed);
          continue;
        }

        // flaggedItems 검증
        parsed.flaggedItems = parsed.flaggedItems.filter(item => 
          item.date && item.accountName && item.description !== undefined && item.amount !== undefined && item.reason
        );

        // 분석 결과에서 익명화된 이름을 실제 이름으로 복원
        parsed.flaggedItems = deanonymizeFlaggedItems(parsed.flaggedItems);
        parsed.flaggedItems = parsed.flaggedItems.map(item => ({
          ...item,
          reason: deanonymizeAnalysisText(item.reason),
          recommendedAccount: item.recommendedAccount ? deanonymizeAnalysisText(item.recommendedAccount) : item.recommendedAccount,
        }));

        console.log(`✅ ${modelName} 모델로 분석 성공!`);
        return parsed;
      } catch (modelError: any) {
        console.error('Gemini API Error:', modelError?.message ?? modelError);
        console.warn(`⚠️ ${modelName} 모델 오류:`, modelError.message || modelError);
        lastError = modelError;
        
        // 404 오류인 경우 다음 모델 시도
        if (modelError.message?.includes('404') || modelError.message?.includes('not found')) {
          console.error('모델명 확인: 최신 명칭 gemini-3-pro-preview, 대안 gemini-3-pro');
          console.log(`⏭️ ${modelName} 모델을 찾을 수 없습니다. 다음 모델로 시도합니다...`);
          continue;
        }
        
        // 404가 아닌 다른 오류는 즉시 반환 (할당량 오류 등)
        if (!modelError.message?.includes('404') && !modelError.message?.includes('not found')) {
          throw modelError;
        }
      }
    }
    
    // 모든 모델 실패
    console.error("❌ 모든 모델로 분석 실패");
    throw lastError || new Error("모든 모델로 분석 실패했습니다.");
    
  } catch (error: any) {
    console.error("Appropriateness Analysis Error:", error);
    // 에러 정보를 더 자세히 로깅
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
    // 에러를 throw하지 않고 null을 반환하여 상위에서 처리
    return null;
  }
};

/**
 * LedgerRow 배열을 JournalEntry 배열로 변환하는 헬퍼 함수
 */
export const convertLedgerRowsToJournalEntries = (
  rows: { [key: string]: string | number | Date | undefined }[],
  headers: string[]
): JournalEntry[] => {
  const robustFindHeader = (headers: string[], keywords: string[]): string | undefined => {
    const normalizedHeaders = headers.map(h => ({
      original: h,
      normalized: String(h || '').replace(/\s/g, '').toLowerCase().trim()
    }));

    for (const keyword of keywords) {
      const normalizedKeyword = keyword.replace(/\s/g, '').toLowerCase().trim();
      // 정확히 일치하는 경우 우선
      let found = normalizedHeaders.find(h => h.normalized === normalizedKeyword);
      if (found) {
        return found.original;
      }
      // 포함하는 경우
      found = normalizedHeaders.find(h => h.normalized.includes(normalizedKeyword) || normalizedKeyword.includes(h.normalized));
      if (found) {
        return found.original;
      }
    }
    return undefined;
  };

  const dateHeader = robustFindHeader(headers, ['일자', '날짜', '거래일', 'date']);
  const accountNameHeader = robustFindHeader(headers, ['계정명', '계정과목', '계정', 'account', 'accountname', '적요란']); // '계정명'을 우선순위로, 적요란도 계정명으로 사용 가능
  const accountCodeHeader = robustFindHeader(headers, ['계정코드', '코드', 'accountcode', 'account_code', 'code']); // 계정코드 컬럼 (금액이 아님)
  const vendorHeader = robustFindHeader(headers, ['거래처', 'vendor', 'customer', '업체']);
  let debitHeader = robustFindHeader(headers, ['차변', 'debit', '차변금액']);
  let creditHeader = robustFindHeader(headers, ['대변', 'credit', '대변금액', '대변액']);
  const amountHeader = robustFindHeader(headers, ['금액', 'amount', '거래금액', '액수']); // 구분 컬럼과 함께 사용되는 금액 컬럼
  const descriptionHeader = robustFindHeader(headers, ['적요', '적요란', '내용', 'description', '비고', '내역']); // 적요란 추가
  const entryNumberHeader = robustFindHeader(headers, ['전표번호', '전표', 'entry', 'entrynumber', 'entry_number', 'no', '번호']);
  const classificationHeader = robustFindHeader(headers, ['구분', '분류', 'classification', 'type']);

  // 헤더 인식 디버깅 - 더 강화된 로그
  console.log('=== 헤더 인식 결과 ===');
  console.log('인식된 헤더:', {
    dateHeader,
    accountNameHeader,
    accountCodeHeader,
    debitHeader,
    creditHeader,
    amountHeader,
    classificationHeader,
    descriptionHeader,
    vendorHeader,
    entryNumberHeader
  });
  console.log('모든 헤더 목록:', headers);
  
  // 차변/대변 헤더가 없으면 직접 찾기 (더 강력한 검색)
  if (!debitHeader) {
    console.warn('⚠️ 차변 헤더를 찾지 못했습니다. 직접 검색합니다...');
    console.log('검색 대상 헤더 목록:', headers.map((h, i) => `${i + 1}. "${h}" (정규화: "${String(h || '').replace(/\s/g, '').toLowerCase()}")`));
    
    // 다양한 방법으로 차변 헤더 찾기
    let foundDebit = headers.find(h => {
      const normalized = String(h || '').replace(/\s/g, '').toLowerCase();
      return normalized === '차변' || normalized === 'debit' || normalized.includes('차변');
    });
    
    // 못 찾았으면 더 넓게 검색 (공백이나 특수문자 제거 후)
    if (!foundDebit) {
      foundDebit = headers.find(h => {
        const hStr = String(h || '').replace(/[\s\t\r\n]/g, '').toLowerCase();
        return hStr.includes('차변') || hStr.includes('debit') || hStr === '차변' || hStr === 'debit';
      });
    }
    
    if (foundDebit) {
      console.log(`✓ 차변 헤더 발견: "${foundDebit}"`);
      debitHeader = foundDebit; // 재할당
    } else {
      console.error('✗ 차변 헤더를 찾을 수 없습니다!');
      console.log('가능한 헤더 목록:', headers.map((h, i) => `${i + 1}. "${h}"`).join('\n'));
    }
  } else {
    console.log(`✓ 차변 헤더 인식됨: "${debitHeader}"`);
  }
  
  if (!creditHeader) {
    console.warn('⚠️ 대변 헤더를 찾지 못했습니다. 직접 검색합니다...');
    let foundCredit = headers.find(h => {
      const normalized = String(h || '').replace(/\s/g, '').toLowerCase();
      return normalized === '대변' || normalized === 'credit' || normalized.includes('대변');
    });
    
    // 못 찾았으면 더 넓게 검색
    if (!foundCredit) {
      foundCredit = headers.find(h => {
        const hStr = String(h || '').toLowerCase();
        return hStr.includes('대변') || hStr.includes('credit');
      });
    }
    
    if (foundCredit) {
      console.log(`✓ 대변 헤더 발견: "${foundCredit}"`);
      creditHeader = foundCredit; // 재할당
    } else {
      console.error('✗ 대변 헤더를 찾을 수 없습니다!');
    }
  } else {
    console.log(`✓ 대변 헤더 인식됨: "${creditHeader}"`);
  }
  
  // 샘플 데이터 확인 (처음 3개 행)
  if (rows.length > 0) {
    console.log('=== 샘플 데이터 (처음 3개 행) ===');
    rows.slice(0, 3).forEach((row, idx) => {
      console.log(`[행 ${idx + 1}]`, {
        구분: classificationHeader ? row[classificationHeader] : '없음',
        차변헤더: debitHeader,
        차변값: debitHeader ? row[debitHeader] : '없음',
        대변헤더: creditHeader,
        대변값: creditHeader ? row[creditHeader] : '없음',
        모든컬럼키: Object.keys(row),
        모든컬럼값: Object.keys(row).reduce((acc, key) => {
          acc[key] = { 값: row[key], 타입: typeof row[key] };
          return acc;
        }, {} as any)
      });
    });
  }

  if (!dateHeader) {
    console.warn("Required header not found: date");
    return [];
  }
  
  // accountNameHeader가 없으면 descriptionHeader를 사용 (적요란만 있는 경우)
  const effectiveAccountNameHeader = accountNameHeader || descriptionHeader;
  if (!effectiveAccountNameHeader) {
    console.warn("Required header not found: accountName or description");
    return [];
  }
  
  // effectiveAccountNameHeader를 변수로 저장하여 나중에 사용
  const finalAccountNameHeader = effectiveAccountNameHeader;
  
  // 대변 헤더를 찾지 못한 경우 추가 검색
  if (!creditHeader) {
    console.warn("대변 헤더를 찾을 수 없습니다. 헤더 목록에서 수동으로 찾는 중...");
    // 모든 헤더에서 "대변" 포함 여부 확인
    const foundCreditHeader = headers.find(h => {
      const normalized = String(h).replace(/\s/g, '').toLowerCase();
      return normalized.includes('대변') || normalized.includes('credit');
    });
    if (foundCreditHeader) {
      console.log(`대변 헤더 발견: "${foundCreditHeader}"`);
      creditHeader = foundCreditHeader; // creditHeader 재설정
    } else {
      console.warn("대변 헤더를 찾을 수 없습니다. '구분' 컬럼을 사용하여 추론합니다.");
    }
  }

  const cleanAmount = (val: any): number => {
    // null, undefined 체크
    if (val === null || val === undefined) {
      return 0;
    }
    
    // 빈 문자열 체크
    if (typeof val === 'string' && val.trim() === '') {
      return 0;
    }
    
    // 문자열인 경우: 쉼표 제거 후 숫자 변환
    if (typeof val === 'string') {
      const cleaned = val.replace(/,/g, '').replace(/\s/g, '').trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    
    // 숫자인 경우
    if (typeof val === 'number') {
      return isNaN(val) ? 0 : val;
    }
    
    // 그 외의 경우 (Date 객체 등)
    return 0;
  };

  return rows
    .map((row, index) => {
      // entryNumber 추출: 원본이 "일자+번호" 결합(예: 2025010550006)이면 그대로 사용,
      // "번호"만 있으면(예: 50007) 일자(YYYYMMDD)와 결합하여 전표번호로 구분
      let entryNumber: string | number | undefined = undefined;
      const dateStr = dateHeader && row[dateHeader]
        ? (row[dateHeader] instanceof Date
            ? `${row[dateHeader].getFullYear()}${String((row[dateHeader] as Date).getMonth() + 1).padStart(2, '0')}${String((row[dateHeader] as Date).getDate()).padStart(2, '0')}`
            : String(row[dateHeader] || '').replace(/-|\s/g, '').slice(0, 8))
        : '';

      if (entryNumberHeader && row[entryNumberHeader] !== undefined && row[entryNumberHeader] !== '') {
        const raw = row[entryNumberHeader];
        const rawStr = String(raw).trim().replace(/\s/g, '');
        if (/^\d{13,}$/.test(rawStr) && rawStr.startsWith('20')) {
          entryNumber = rawStr;
        } else if (dateStr && /^\d{1,8}$/.test(rawStr)) {
          entryNumber = dateStr + rawStr.padStart(5, '0');
        } else {
          entryNumber = rawStr || raw;
        }
      } else {
        const date = row[dateHeader] instanceof Date
          ? row[dateHeader].toISOString().split('T')[0]
          : String(row[dateHeader] || '');
        entryNumber = `${date}_${index}`;
      }

      // 구분 컬럼이 있으면 그것을 활용하여 debit/credit 결정
      let debit = 0;
      let credit = 0;
      
      if (classificationHeader) {
        const classification = String(row[classificationHeader] || '').trim();
        const normalizedClassification = classification.replace(/\s/g, '').toLowerCase();
        
        if (normalizedClassification === '차변' || normalizedClassification === 'debit') {
          // 차변인 경우: 
          // 분개장 형식: "구분"이 "차변"이면, "차변" 컬럼에서 직접 금액을 읽어야 함
          // 우선순위: 차변 컬럼 > 금액 컬럼
          
          // 1. 차변 컬럼에서 직접 읽기 (분개장 형식의 기본)
          if (debitHeader) {
            const rawDebitValue = row[debitHeader];
            debit = cleanAmount(rawDebitValue);
            
            // 디버깅: 차변 컬럼 값을 상세히 로깅 (처음 10개만)
            if (index < 10) {
              console.log(`[차변 읽기] 행 ${index + 1}:`, {
                구분: classification,
                차변헤더: debitHeader,
                원본값: rawDebitValue,
                타입: typeof rawDebitValue,
                cleanAmount결과: debit,
                debit가0인가: debit === 0
              });
            }
          } else {
            // 차변 헤더가 없으면 경고
            if (index < 5) {
              console.warn(`[경고] 행 ${index + 1}: 차변 헤더를 찾을 수 없습니다.`);
            }
          }
          
          // 2. 차변 컬럼이 없거나 값이 0이면, 금액 컬럼 확인 (다른 형식 지원)
          if (debit === 0 && amountHeader) {
            const amountValue = cleanAmount(row[amountHeader]);
            if (amountValue > 0) {
              debit = amountValue;
            }
          }
          
          // 3. 대변 컬럼이 있다면 그 값을 credit에 할당 (같은 행에 대변 금액이 있을 수도 있음)
          if (creditHeader) {
            credit = cleanAmount(row[creditHeader]);
          }
        } else if (normalizedClassification === '대변' || normalizedClassification === 'credit') {
          // 대변인 경우: 
          // "구분"이 "대변"이면, "대변" 컬럼에서 금액을 읽어야 함
          // 분개장 형식: 구분 컬럼이 있으면 차변/대변 컬럼에 직접 금액이 들어있음
          
          // 1. 대변 컬럼에서 직접 읽기 (우선순위 1)
          if (creditHeader) {
            credit = cleanAmount(row[creditHeader]);
          }
          
          // 2. 대변 컬럼이 없거나 값이 0이면, 금액 컬럼 확인 (구분 컬럼과 함께 사용되는 경우)
          if (credit === 0 && amountHeader) {
            const amountValue = cleanAmount(row[amountHeader]);
            if (amountValue > 0) {
              credit = amountValue;
            }
          }
          
          // 3. 차변 컬럼이 있다면 그 값을 debit에 할당 (같은 행에 차변 금액이 있을 수도 있음)
          if (debitHeader) {
            debit = cleanAmount(row[debitHeader]);
          }
        } else {
          // 구분이 없거나 다른 값인 경우: 기존 로직 사용
          // 하지만 구분 컬럼이 있는데 값이 비어있거나 예상치 못한 값인 경우,
          // 차변/대변 컬럼이 있으면 그것을 사용
          debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
          credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
          
          // 금액 컬럼이 있고 차변/대변 컬럼 값이 모두 0이면, 금액 컬럼을 확인
          if (debit === 0 && credit === 0 && amountHeader) {
            const amountValue = cleanAmount(row[amountHeader]);
            // 차변/대변 컬럼 중 하나라도 값이 있으면 그쪽으로, 둘 다 없으면 금액은 차변으로 간주
            if (amountValue > 0) {
              debit = amountValue;
            }
          }
        }
      } else {
        // 구분 컬럼이 없으면 기존 로직 사용
        debit = debitHeader ? cleanAmount(row[debitHeader]) : 0;
        credit = creditHeader ? cleanAmount(row[creditHeader]) : 0;
        
        // 차변/대변 컬럼이 없고 금액 컬럼만 있으면, 둘 다 0으로 처리 (명확하지 않으므로)
        // 단, 하나만 있으면 그것을 사용
        if (debit === 0 && credit === 0 && amountHeader && !debitHeader && !creditHeader) {
          // 구분이 없고 차변/대변 컬럼도 없으면 명확하지 않으므로 0으로 유지
        }
      }

      // 디버깅: 차변/대변 통계 (처음 100개 행 기준)
      if (index === 0) {
        console.log('=== 데이터 변환 시작 ===');
      }
      
      // 차변 금액이 0인 차변 항목 추적 (처음 30개)
      if (debit === 0 && index < 30) {
        const classification = classificationHeader ? String(row[classificationHeader] || '').trim() : '';
        const normalizedClassification = classification.replace(/\s/g, '').toLowerCase();
        
        if (classificationHeader && (normalizedClassification === '차변' || normalizedClassification === 'debit')) {
          // 모든 헤더와 값의 상세 정보 수집
          const allColumnInfo = headers.map(h => {
            const val = row[h];
            const numVal = cleanAmount(val);
            const normalizedH = String(h).replace(/\s/g, '').toLowerCase();
            return {
              헤더: h,
              원본값: val,
              숫자값: numVal,
              타입: typeof val,
              금액컬럼으로보임: normalizedH.includes('금액') || normalizedH.includes('amount') || normalizedH.includes('액'),
              코드컬럼으로보임: normalizedH.includes('코드') || normalizedH.includes('code') || normalizedH.includes('id')
            };
          });
          
          console.warn(`⚠️ [차변 인식 실패] 행 ${index + 1}:`, {
            구분: classification,
            인식된헤더: {
              차변컬럼: debitHeader,
              대변컬럼: creditHeader,
              금액컬럼: amountHeader,
              계정코드컬럼: accountCodeHeader
            },
            컬럼값: {
              차변값: debitHeader ? `${row[debitHeader]} (${typeof row[debitHeader]})` : '없음',
              금액값: amountHeader ? `${row[amountHeader]} (${typeof row[amountHeader]})` : '없음',
              대변값: creditHeader ? `${row[creditHeader]} (${typeof row[creditHeader]})` : '없음'
            },
            모든컬럼정보: allColumnInfo,
            숫자값이있는컬럼: allColumnInfo.filter(c => c.숫자값 > 0),
            최종debit: debit
          });
        }
      }
      
      // 처음 100개 행에서 차변/대변 통계는 변환 완료 후 출력

      const entry: JournalEntry = {
        id: index,
        entryNumber: entryNumber,
        date: row[dateHeader] instanceof Date 
          ? row[dateHeader].toISOString().split('T')[0] 
          : String(row[dateHeader] || ''),
        accountName: String(row[finalAccountNameHeader] || ''),
        vendor: vendorHeader ? String(row[vendorHeader] || '') : '',
        debit: debit,
        credit: credit,
        description: descriptionHeader ? String(row[descriptionHeader] || '') : '',
      };
      return entry;
    })
    .filter(entry => entry.accountName.trim() !== ''); // 계정명이 있는 항목만
  
  // 변환 완료 후 전체 통계 출력
  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0);
  const debitCount = entries.filter(e => (e.debit || 0) > 0).length;
  const creditCount = entries.filter(e => (e.credit || 0) > 0).length;
  
  console.log('=== 데이터 변환 완료 ===');
  console.log(`총 변환된 항목 수: ${entries.length}`);
  console.log(`차변 합계: ${totalDebit.toLocaleString()}원 (${debitCount}건)`);
  console.log(`대변 합계: ${totalCredit.toLocaleString()}원 (${creditCount}건)`);
  console.log(`대차 차이: ${(totalDebit - totalCredit).toLocaleString()}원`);
  
  if (Math.abs(totalDebit - totalCredit) > 1000 && entries.length > 100) {
    console.warn('⚠️ 차변/대변 합계 차이가 큽니다. 데이터 파싱에 문제가 있을 수 있습니다.');
    console.warn('⚠️ 헤더 확인:', { debitHeader, creditHeader, amountHeader, classificationHeader });
  }
  
  // 첫 번째 변환된 Entry 샘플 출력
  if (entries.length > 0) {
    console.log('=== 첫 번째 변환된 Entry 샘플 ===', {
      date: entries[0].date,
      accountName: entries[0].accountName,
      debit: entries[0].debit,
      credit: entries[0].credit,
      description: entries[0].description
    });
  }
  
  return entries;
};


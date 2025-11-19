/**
 * Google Gemini API 직접 클라이언트
 * localStorage에서 API Key를 관리하고 직접 호출
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

/**
 * API Key 저장
 */
export const saveApiKey = (apiKey: string): void => {
  const trimmedKey = apiKey.trim();
  console.log('💾 API Key 저장:', {
    originalLength: apiKey.length,
    trimmedLength: trimmedKey.length,
    prefix: trimmedKey.substring(0, 15) + '...',
    suffix: '...' + trimmedKey.substring(trimmedKey.length - 5),
    hasSpaces: trimmedKey.includes(' ')
  });
  
  if (trimmedKey.length < 30) {
    console.warn('⚠️ API Key가 너무 짧습니다. 올바른 API Key인지 확인하세요.');
  }
  
  localStorage.setItem(API_KEY_STORAGE_KEY, trimmedKey);
};

/**
 * API Key 불러오기
 */
export const getApiKey = (): string | null => {
  const key = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (key) {
    console.log('📥 API Key 로드:', {
      length: key.length,
      prefix: key.substring(0, 15) + '...',
      suffix: '...' + key.substring(key.length - 5),
      hasSpaces: key.includes(' '),
      trimmedLength: key.trim().length
    });
  }
  return key;
};

/**
 * API Key 삭제
 */
export const deleteApiKey = (): void => {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
};

/**
 * API Key 존재 여부 확인
 */
export const hasApiKey = (): boolean => {
  return !!getApiKey();
};

/**
 * Gemini 클라이언트 생성
 */
export const createGeminiClient = (apiKey?: string): GoogleGenerativeAI | null => {
  const key = apiKey || getApiKey();
  if (!key) {
    console.error('❌ API Key가 없습니다.');
    return null;
  }
  
  const trimmedKey = key.trim();
  if (trimmedKey.length === 0) {
    console.error('❌ API Key가 비어있습니다.');
    return null;
  }
  
  console.log('🔧 Gemini 클라이언트 생성 시도:', {
    keyLength: trimmedKey.length,
    keyPrefix: trimmedKey.substring(0, 10) + '...'
  });
  
  try {
    const client = new GoogleGenerativeAI(trimmedKey);
    console.log('✅ Gemini 클라이언트 생성 성공');
    return client;
  } catch (error: any) {
    console.error('❌ Gemini 클라이언트 생성 실패:', error);
    return null;
  }
};

/**
 * API Key 유효성 테스트
 */
export const testApiKey = async (apiKey?: string): Promise<{ valid: boolean; message: string }> => {
  const keyToUse = apiKey || getApiKey();
  
  if (!keyToUse || keyToUse.trim().length === 0) {
    return {
      valid: false,
      message: 'API Key가 설정되지 않았습니다.'
    };
  }
  
  // API Key 형식 검증 (Google AI Studio API Key는 보통 39자, AIza로 시작)
  const trimmedKey = keyToUse.trim();
  if (trimmedKey.length < 30 || trimmedKey.length > 50) {
    return {
      valid: false,
      message: `API Key 길이가 비정상적입니다 (${trimmedKey.length}자). 일반적으로 39자입니다.`
    };
  }
  
  if (!trimmedKey.startsWith('AIza')) {
    console.warn('⚠️ API Key가 "AIza"로 시작하지 않습니다. 올바른 Google AI Studio API Key인지 확인하세요.');
  }
  
  // 간단한 테스트 요청 - 여러 모델 시도
  try {
    const client = createGeminiClient(trimmedKey);
    if (!client) {
      return {
        valid: false,
        message: 'API Key로 클라이언트를 생성할 수 없습니다.'
      };
    }
    
    // 사용 가능한 모델 목록 (안정적인 순서대로)
    const testModels = [
      'gemini-1.5-flash',  // 가장 안정적이고 빠른 모델
      'gemini-1.5-pro',    // Pro 모델
      'gemini-2.0-flash-exp',  // 실험적 모델
    ];
    
    let lastError: any = null;
    
    for (const modelName of testModels) {
      try {
        console.log(`🧪 ${modelName} 모델로 API Key 테스트 중...`);
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('테스트');
        await result.response;
        
        console.log(`✅ ${modelName} 모델로 테스트 성공!`);
        return {
          valid: true,
          message: `API Key가 유효합니다. (테스트 모델: ${modelName})`
        };
      } catch (error: any) {
        console.warn(`⚠️ ${modelName} 모델 테스트 실패:`, {
          message: error.message,
          status: error.status
        });
        lastError = error;
        
        // API Key 관련 에러나 429는 즉시 중단
        if (error.message?.toLowerCase().includes('api key') || 
            error.message?.toLowerCase().includes('invalid') ||
            error.status === 400 || error.status === 401 || error.status === 403 ||
            error.status === 429) {
          break;
        }
        
        // 404는 다음 모델 시도
        if (error.status === 404) {
          continue;
        }
      }
    }
    
    // 모든 모델 실패
    const errorMsg = lastError?.message || '알 수 없는 오류';
    const statusCode = lastError?.status;
    
    if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
      return {
        valid: false,
        message: `API Key가 유효하지 않습니다. (${errorMsg})`
      };
    }
    
    return {
      valid: false,
      message: `API Key 테스트 실패: ${errorMsg}\n\n모든 테스트 모델이 실패했습니다. API Key를 확인해주세요.`
    };
  } catch (error: any) {
    const errorMsg = error.message || '알 수 없는 오류';
    return {
      valid: false,
      message: `API Key 테스트 중 오류 발생: ${errorMsg}`
    };
  }
};

/**
 * Gemini Flash 모델로 분석 (빠르고 저렴)
 */
export const analyzeWithFlash = async (
  prompt: string,
  apiKey?: string
): Promise<string> => {
  // API Key 확인 및 디버깅
  const storedKey = getApiKey();
  const keyToUse = apiKey || storedKey;
  
  console.log('🔑 API Key 확인:', {
    hasStoredKey: !!storedKey,
    storedKeyLength: storedKey?.length || 0,
    storedKeyPrefix: storedKey ? storedKey.substring(0, 10) + '...' : '없음',
    hasProvidedKey: !!apiKey,
    keyToUseLength: keyToUse?.length || 0,
    startsWithAIza: keyToUse?.trim().startsWith('AIza') || false
  });
  
  if (!keyToUse) {
    throw new Error('API Key가 설정되지 않았습니다. 설정 버튼을 클릭하여 Google Gemini API Key를 입력해주세요.');
  }
  
  const trimmedKey = keyToUse.trim();
  if (trimmedKey.length === 0) {
    throw new Error('API Key가 비어있습니다. 올바른 API Key를 입력해주세요.');
  }
  
  // API Key 형식 검증
  if (trimmedKey.length < 30 || trimmedKey.length > 50) {
    console.warn('⚠️ API Key 길이가 비정상적입니다:', trimmedKey.length);
  }
  
  if (!trimmedKey.startsWith('AIza')) {
    console.warn('⚠️ API Key가 "AIza"로 시작하지 않습니다. Google AI Studio에서 발급한 API Key인지 확인하세요.');
  }
  
  const client = createGeminiClient(trimmedKey);
  if (!client) {
    throw new Error('API Key로 클라이언트를 생성할 수 없습니다. API Key를 확인해주세요.');
  }
  
  console.log('✅ Gemini 클라이언트 생성 성공');
  
  try {
    // 다른 페이지에서 사용하는 모델 포함하여 시도
    const modelsToTry = [
      'gemini-2.0-flash-exp',  // AdvancedLedgerAnalysis에서 사용
      'gemini-pro',  // 가장 기본 모델
      'gemini-1.5-pro',  // Pro 모델
    ];
    
    console.log('📋 시도할 모델 목록:', modelsToTry);
    
    let lastError: any = null;
    
    for (const modelName of modelsToTry) {
      try {
        console.log(`🔄 ${modelName} 모델로 요청 시도 중...`);
        const model = client.getGenerativeModel({ model: modelName });
        
        console.log('📡 API 요청 전송 중...');
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        console.log(`✅ ${modelName} 모델 성공! 응답 길이:`, text.length);
        return text;
      } catch (error: any) {
        console.warn(`⚠️ ${modelName} 실패:`, {
          message: error.message,
          status: error.status,
          statusText: error.statusText
        });
        lastError = error;
        
        // API Key 관련 에러나 429는 즉시 중단
        if (error.message?.toLowerCase().includes('api key') || 
            error.message?.toLowerCase().includes('invalid') ||
            error.status === 400 || error.status === 401 || error.status === 403 ||
            error.status === 429) {
          throw error;
        }
        
        // 404는 다음 모델 시도
        if (error.status === 404) {
          continue;
        }
      }
    }
    
    // 모든 모델 실패
    const errorMsg = lastError?.message || '알 수 없는 오류';
    const statusCode = lastError?.status || lastError?.code;
    console.error('❌ 모든 모델 실패. 마지막 에러:', {
      message: errorMsg,
      status: statusCode,
      error: lastError
    });
    
    // 상태 코드별 상세 메시지
    let detailedMessage = `모든 모델 시도 실패.\n\n에러: ${errorMsg}`;
    
    if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
      detailedMessage += `\n\nAPI Key 인증 오류 (${statusCode})\n\n가능한 원인:\n1. API Key가 유효하지 않거나 만료됨\n2. Google Cloud 프로젝트에서 Generative Language API가 활성화되지 않음\n3. API Key에 필요한 권한이 없음\n\n해결 방법:\n1. Google AI Studio에서 새 API Key 발급: https://aistudio.google.com/app/apikey\n2. Google Cloud Console에서 Generative Language API 활성화 확인\n3. API Key 재설정 후 다시 시도`;
    } else if (statusCode === 429) {
      detailedMessage += `\n\n요청 한도 초과 (429)\n\n해결 방법:\n1. 잠시 후 다시 시도\n2. Google Cloud Console에서 할당량 확인`;
    } else if (statusCode === 404) {
      detailedMessage += `\n\n모델을 찾을 수 없음 (404)\n\n해결 방법:\n1. 사용 가능한 모델명 확인\n2. 다른 모델 사용 시도`;
    } else {
      detailedMessage += `\n\n가능한 원인:\n1. API Key가 유효하지 않음\n2. 프로젝트에서 Gemini API가 활성화되지 않음\n3. 모델이 해당 API 버전에서 지원되지 않음\n4. 네트워크 연결 문제\n\n해결 방법:\n1. Google AI Studio에서 새 API Key 발급: https://aistudio.google.com/app/apikey\n2. Google Cloud Console에서 Generative Language API 활성화 확인\n3. 잠시 후 다시 시도`;
    }
    
    throw new Error(detailedMessage);
  } catch (error: any) {
    let errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
    const errorString = JSON.stringify(error, null, 2);
    console.error('Gemini API 오류 상세:', {
      message: errorMessage,
      error: errorString,
      status: error.status,
      statusText: error.statusText,
      code: error.code
    });
    
    // API Key 관련 에러 메시지 개선
    const lowerMessage = errorMessage.toLowerCase();
    if (lowerMessage.includes('api key') || 
        lowerMessage.includes('valid') ||
        lowerMessage.includes('invalid') ||
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('403') ||
        lowerMessage.includes('401') ||
        lowerMessage.includes('permission') ||
        lowerMessage.includes('forbidden')) {
      errorMessage = `API Key 오류가 발생했습니다.\n\n가능한 원인:\n1. Gemini API가 Google Cloud 프로젝트에서 활성화되지 않았을 수 있습니다.\n2. API Key에 필요한 권한이 없을 수 있습니다.\n3. API Key가 만료되었거나 삭제되었을 수 있습니다.\n\n해결 방법:\n1. Google Cloud Console에서 Gemini API 활성화 확인\n2. 새로운 API Key 발급: https://aistudio.google.com/app/apikey\n3. API Key 재설정 후 다시 시도`;
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Gemini Pro 모델로 분석 (복잡한 분석용)
 */
export const analyzeWithPro = async (
  prompt: string,
  apiKey?: string
): Promise<string> => {
  const client = createGeminiClient(apiKey);
  if (!client) {
    throw new Error('API Key가 설정되지 않았습니다. 설정 버튼을 클릭하여 Google Gemini API Key를 입력해주세요.');
  }
  
  const model = client.getGenerativeModel({ model: 'gemini-1.5-pro' });
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
};

/**
 * 토큰 수 추정 (대략적)
 */
export const estimateTokens = (text: string): number => {
  // 한글: 약 1.5자당 1토큰
  // 영어: 약 4자당 1토큰
  // 숫자/기호: 약 2자당 1토큰
  const koreanChars = (text.match(/[가-힣]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const otherChars = text.length - koreanChars - englishChars;
  
  return Math.ceil(koreanChars / 1.5 + englishChars / 4 + otherChars / 2);
};

/**
 * 예상 비용 계산 (원화)
 */
export const estimateCost = (inputTokens: number, outputTokens: number = 2000, useFlash: boolean = true): number => {
  const exchangeRate = 1350; // $1 = ₩1,350
  
  if (useFlash) {
    // Flash: $0.075 / 1M input, $0.30 / 1M output
    const inputCost = (inputTokens / 1000000) * 0.075 * exchangeRate;
    const outputCost = (outputTokens / 1000000) * 0.30 * exchangeRate;
    return Math.ceil(inputCost + outputCost);
  } else {
    // Pro: $1.25 / 1M input, $5.00 / 1M output
    const inputCost = (inputTokens / 1000000) * 1.25 * exchangeRate;
    const outputCost = (outputTokens / 1000000) * 5.00 * exchangeRate;
    return Math.ceil(inputCost + outputCost);
  }
};

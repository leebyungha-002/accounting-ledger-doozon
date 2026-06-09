/**
 * Google Gemini API 직접 클라이언트
 * localStorage에서 API Key를 관리하고 직접 호출
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

// 개발 환경에서 전역 진단 함수 제공
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__diagnoseGeminiApiKey = () => {
    const diagnosis = diagnoseApiKey();
    console.log('🔍 API Key 진단 결과:', diagnosis);
    return diagnosis;
  };
  
  (window as any).__clearGeminiApiKey = () => {
    deleteApiKey();
    console.log('🗑️ API Key가 삭제되었습니다.');
  };
  
  (window as any).__testGeminiApiKey = async () => {
    const result = await testApiKey();
    console.log('🧪 API Key 테스트 결과:', result);
    return result;
  };
}

/**
 * API Key 저장
 */
export const saveApiKey = (apiKey: string): void => {
  const trimmedKey = apiKey.trim();
  
  console.group('💾 API Key 저장 프로세스');
  console.log('입력된 API Key 정보:', {
    originalLength: apiKey.length,
    trimmedLength: trimmedKey.length,
    prefix: trimmedKey.substring(0, 15) + '...',
    suffix: '...' + trimmedKey.substring(trimmedKey.length - 5),
    hasSpaces: trimmedKey.includes(' '),
    startsWithAIza: trimmedKey.startsWith('AIza'),
    localStorageKey: API_KEY_STORAGE_KEY
  });
  
  if (trimmedKey.length < 30) {
    console.error('❌ API Key가 너무 짧습니다:', trimmedKey.length, '자 (최소 30자 필요)');
    console.groupEnd();
    throw new Error(`API Key가 너무 짧습니다 (${trimmedKey.length}자). 전체 API Key를 복사했는지 확인하세요.`);
  }
  
  if (!trimmedKey.startsWith('AIza')) {
    console.error('❌ API Key가 "AIza"로 시작하지 않습니다:', trimmedKey.substring(0, 10));
    console.groupEnd();
    throw new Error('API Key가 "AIza"로 시작하지 않습니다. Google AI Studio에서 발급한 올바른 API Key인지 확인하세요.');
  }
  
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmedKey);
    console.log('✅ localStorage에 저장 완료');
    
    // 저장 확인
    const saved = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (saved === trimmedKey) {
      console.log('✅ 저장 확인 성공:', {
        savedLength: saved.length,
        matches: saved === trimmedKey
      });
    } else {
      console.error('❌ 저장 확인 실패:', {
        expected: trimmedKey.substring(0, 20) + '...',
        actual: saved ? saved.substring(0, 20) + '...' : 'null'
      });
    }
  } catch (error: any) {
    console.error('❌ localStorage 저장 실패:', error);
    console.groupEnd();
    throw new Error(`API Key 저장 실패: ${error.message}`);
  }
  
  console.groupEnd();
};

/**
 * API Key 불러오기
 */
export const getApiKey = (): string | null => {
  try {
    const key = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (key) {
      // API Key가 문자열인지 확인
      const keyString = typeof key === 'string' ? key : String(key);
      
      // 디버깅: 너무 자주 로그가 출력되지 않도록 조건부 로그
      // (개발 환경에서만 상세 로그 출력)
      if (process.env.NODE_ENV === 'development') {
        console.log('📥 API Key 로드:', {
          type: typeof key,
          isString: typeof key === 'string',
          length: keyString.length,
          prefix: keyString.substring(0, 15) + '...',
          suffix: '...' + keyString.substring(keyString.length - 5),
          hasSpaces: keyString.includes(' '),
          trimmedLength: keyString.trim().length,
          startsWithAIza: keyString.trim().startsWith('AIza')
        });
      }
      
      return keyString;
    }
    return null;
  } catch (error: any) {
    console.error('❌ API Key 로드 실패:', error);
    return null;
  }
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
 * API Key 상태 진단 (디버깅용)
 */
export const diagnoseApiKey = (): {
  exists: boolean;
  length: number;
  prefix: string;
  suffix: string;
  startsWithAIza: boolean;
  hasSpaces: boolean;
  trimmedLength: number;
  localStorageKey: string;
  recommendations: string[];
} => {
  const key = getApiKey();
  const recommendations: string[] = [];
  
  if (!key) {
    recommendations.push('API Key가 설정되지 않았습니다.');
    recommendations.push('Google AI Studio에서 API Key를 발급받아 설정하세요: https://aistudio.google.com/app/apikey');
    return {
      exists: false,
      length: 0,
      prefix: '',
      suffix: '',
      startsWithAIza: false,
      hasSpaces: false,
      trimmedLength: 0,
      localStorageKey: API_KEY_STORAGE_KEY,
      recommendations
    };
  }
  
  const trimmed = key.trim();
  
  // 길이 검증
  if (trimmed.length < 30 || trimmed.length > 50) {
    recommendations.push(`⚠️ API Key 길이가 비정상적입니다 (${trimmed.length}자). 일반적으로 39자입니다.`);
  }
  
  // 형식 검증
  if (!trimmed.startsWith('AIza')) {
    recommendations.push('⚠️ API Key가 "AIza"로 시작하지 않습니다. Google AI Studio에서 발급한 API Key인지 확인하세요.');
  }
  
  // 공백 검증
  if (key.includes(' ')) {
    recommendations.push('⚠️ API Key에 공백이 포함되어 있습니다. 앞뒤 공백을 제거하세요.');
  }
  
  // 일반적인 권장사항
  if (recommendations.length === 0) {
    recommendations.push('✅ API Key 형식이 정상적으로 보입니다.');
    recommendations.push('만약 오류가 계속 발생한다면:');
    recommendations.push('1. Google Cloud Console에서 Generative Language API 활성화 확인');
    recommendations.push('2. API Key 할당량 확인 (무료 티어: 분당 15회 요청 제한)');
    recommendations.push('3. 브라우저 콘솔(F12)에서 상세 오류 메시지 확인');
    recommendations.push('4. 새 API Key 발급 후 재설정');
  }
  
  return {
    exists: true,
    length: key.length,
    prefix: key.substring(0, 15) + '...',
    suffix: '...' + key.substring(key.length - 5),
    startsWithAIza: trimmed.startsWith('AIza'),
    hasSpaces: key.includes(' '),
    trimmedLength: trimmed.length,
    localStorageKey: API_KEY_STORAGE_KEY,
    recommendations
  };
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
    
    const testModels = ['gemini-3.1-flash-lite', 'gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastTestError: any = null;
    
    for (const testModel of testModels) {
      try {
        console.log(`🧪 ${testModel} 모델로 API Key 테스트 중...`);
        const model = client.getGenerativeModel({ model: testModel });
        
        const callInfo = trackApiCall('testApiKey', testModel);
        const testPrompt = 'Hi';
        console.log('📡 테스트 요청 전송:', { 
          model: testModel, 
          prompt: testPrompt,
          최근1분간호출: callInfo.recentCalls,
          오늘총호출: callInfo.todayCalls
        });
        
        const result = await model.generateContent(testPrompt);
        const response = result.response;
        const text = response.text();
        
        console.log(`✅ ${testModel} 모델로 테스트 성공! 응답:`, text.substring(0, 50));
        return {
          valid: true,
          message: `API Key가 유효합니다. (테스트 모델: ${testModel})`
        };
      } catch (error: any) {
        lastTestError = error;
        console.error('Gemini API Error:', error?.message ?? error);
        const errorDetails: any = {
          message: error.message,
          status: error.status,
          statusText: error.statusText,
          code: error.code
        };
        console.warn(`⚠️ ${testModel} 모델 테스트 실패:`, errorDetails);
        
        const is404 = error.status === 404 || (error.message || '').includes('404') || (error.message || '').toLowerCase().includes('not found');
        if (is404) {
          console.log(`⏭️ ${testModel} 모델을 찾을 수 없습니다. 다음 모델로 시도합니다...`);
          continue;
        }
        
        // 429 오류 처리 (할당량 초과 또는 분당 요청 제한)
      if (error.status === 429 || 
          error.message?.toLowerCase().includes('429') ||
          error.message?.toLowerCase().includes('quota') ||
          error.message?.toLowerCase().includes('resource exhausted') ||
          error.message?.toLowerCase().includes('rate limit')) {
        // 실제 오류 메시지 확인 (더 자세한 정보 수집)
        let actualErrorMsg = error.message || '알 수 없는 오류';
        let errorDetails = '';
        
        try {
          // 에러 객체의 모든 속성 확인
          const errorObj: any = {};
          Object.getOwnPropertyNames(error).forEach(key => {
            try {
              errorObj[key] = error[key];
            } catch (e) {
              errorObj[key] = '[직렬화 불가]';
            }
          });
          errorDetails = JSON.stringify(errorObj, null, 2);
        } catch (e) {
          errorDetails = String(error);
        }
        
        console.error('🔍 429 오류 상세 정보:', {
          status: error.status,
          statusText: error.statusText,
          code: error.code,
          message: error.message,
          name: error.name,
          stack: error.stack,
          fullError: errorDetails,
          timestamp: new Date().toISOString()
        });
        
        // 할당량 페이지에서 초과하지 않았다면 분당 제한 문제일 가능성
        const isRpmLimit = error.message?.toLowerCase().includes('rpm') || 
                          error.message?.toLowerCase().includes('per minute') ||
                          error.message?.toLowerCase().includes('requests per minute');
        
        return {
          valid: false,
          message: `⚠️ 요청 한도 초과 (429)\n\n` +
            `원인:\n` +
            (isRpmLimit 
              ? `- 분당 요청 제한(RPM)을 초과했습니다 (무료 티어: 분당 15회)\n`
              : `- 할당량 초과 또는 분당 요청 제한 문제일 수 있습니다\n`) +
            `- 할당량 페이지는 프로젝트의 모든 API Key 사용량을 합산하여 표시합니다\n` +
            `- 분당 제한은 할당량 페이지에 표시되지 않을 수 있습니다\n\n` +
            `실제 오류 메시지:\n${actualErrorMsg}\n\n` +
            `해결 방법:\n` +
            `1. 1-2분 정도 기다린 후 다시 시도하세요\n` +
            `2. 할당량 확인: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas\n` +
            `3. API Key를 저장한 후 실제 AI 분석을 시도해보세요 (테스트 없이도 작동할 수 있음)\n\n` +
            `💡 참고: 브라우저 콘솔(F12)에서 "🔍 429 오류 상세 정보"를 확인하면 더 자세한 정보를 볼 수 있습니다.`
        };
      }
      
      // 400 오류 처리
      if (error.status === 400) {
        return {
          valid: false,
          message: `❌ 400 Bad Request 오류\n\n` +
            `이는 API Key 권한이나 요청 형식 문제일 가능성이 높습니다.\n\n` +
            `🔍 확인 사항:\n` +
            `1. Google Cloud Console에서 결제 계정 상태 확인\n` +
            `2. API Key가 실제로 활성화되어 있는지 확인\n` +
            `3. 새 API Key 발급 후 재시도: https://aistudio.google.com/app/apikey\n\n` +
            `상세 오류: ${error.message || '알 수 없는 오류'}`
        };
      }
      
      // API Key 관련 에러 (401, 403)
      if (error.message?.toLowerCase().includes('api key') || 
          error.message?.toLowerCase().includes('invalid') ||
          error.status === 401 || error.status === 403) {
        return {
          valid: false,
          message: `API Key가 유효하지 않습니다. (${error.message || '인증 실패'})`
        };
      }
      
      // 기타 오류
      return {
        valid: false,
        message: `API Key 테스트 실패: ${error.message || '알 수 없는 오류'}\n\n` +
          `가능한 원인:\n` +
          `1. 네트워크 연결 문제\n` +
          `2. Google API 서버 일시적 오류\n` +
          `3. 잠시 후 다시 시도해주세요`
      };
      }
    }
    
    // 모든 테스트 모델 실패 (gemini-3-pro, gemini-3-pro-preview 모두 404 등)
    const error = lastTestError;
    if (error) {
      console.warn(`⚠️ 모든 테스트 모델 실패:`, {
        message: error.message,
        status: error.status
      });
      
      // 429 오류인 경우 특별 처리
      if (error.status === 429) {
        return {
          valid: false,
          message: `요청 한도 초과 (429)\n\n원인:\n- API 호출이 너무 많아 Google의 요청 한도를 초과했습니다.\n\n해결 방법:\n1. 1-2분 정도 기다린 후 다시 시도하세요\n2. Google Cloud Console에서 할당량 확인: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas\n3. 무료 티어의 경우 분당 15회 요청 제한이 있습니다\n4. API Key 테스트는 잠시 후 다시 시도하세요`
        };
      }
      
      // API Key 관련 에러
      if (error.message?.toLowerCase().includes('api key') || 
          error.message?.toLowerCase().includes('invalid') ||
          error.status === 400 || error.status === 401 || error.status === 403) {
        return {
          valid: false,
          message: `API Key가 유효하지 않습니다. (${error.message || '인증 실패'})`
        };
      }
      
      // 404는 모델을 찾을 수 없음
      if (error.status === 404) {
        return {
          valid: false,
          message: `모델을 찾을 수 없습니다. (404)\n\nAPI Key는 유효하지만 테스트 모델에 접근할 수 없습니다.\n실제 분석 기능은 정상 작동할 수 있습니다.`
        };
      }
      
      // 기타 오류
      return {
        valid: false,
        message: `API Key 테스트 실패: ${error.message || '알 수 없는 오류'}\n\n가능한 원인:\n1. 네트워크 연결 문제\n2. Google API 서버 일시적 오류\n3. 잠시 후 다시 시도해주세요`
      };
    }
    
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
// 🔒 전역 API 호출 추적 및 중복 방지
// API 호출 추적 객체 - 안전한 초기화 및 접근
let globalApiCallTracker: {
  activeCalls: Set<string>;
  callHistory: Array<{time: number, function: string, model: string, id: string}>;
  isDuplicateCall: (functionName: string, modelName: string, promptHash?: string) => boolean;
  startCall: (functionName: string, modelName: string, promptHash?: string) => string;
  endCall: (callId: string) => void;
};

// 안전한 getter 함수
const getApiCallTracker = () => {
  if (!globalApiCallTracker) {
    console.warn('⚠️ globalApiCallTracker가 undefined입니다. 재초기화합니다.');
    globalApiCallTracker = {
      activeCalls: new Set<string>(),
      callHistory: [],
      isDuplicateCall: function(functionName: string, modelName: string, promptHash?: string): boolean {
        const tracker = getApiCallTracker();
        const callId = `${functionName}_${modelName}_${promptHash || 'default'}`;
        if (!tracker.activeCalls) {
          console.error('❌ activeCalls가 초기화되지 않았습니다.');
          tracker.activeCalls = new Set<string>();
        }
        if (tracker.activeCalls.has(callId)) {
          console.warn('⚠️ 중복 호출 감지:', { callId, functionName, modelName });
          return true;
        }
        return false;
      },
      startCall: function(functionName: string, modelName: string, promptHash?: string): string {
        const tracker = getApiCallTracker();
        const callId = `${functionName}_${modelName}_${promptHash || Date.now()}`;
        if (!tracker.activeCalls) {
          console.error('❌ activeCalls가 초기화되지 않았습니다.');
          tracker.activeCalls = new Set<string>();
        }
        if (tracker.activeCalls.has(callId)) {
          throw new Error(`중복 호출 감지: ${callId}`);
        }
        tracker.activeCalls.add(callId);
        return callId;
      },
      endCall: function(callId: string) {
        const tracker = getApiCallTracker();
        if (!tracker || !tracker.activeCalls) {
          console.error('❌ globalApiCallTracker가 초기화되지 않았습니다. endCall을 건너뜁니다.');
          return;
        }
        tracker.activeCalls.delete(callId);
      }
    };
  }
  return globalApiCallTracker;
};

// 초기화
globalApiCallTracker = getApiCallTracker();

// API 호출 횟수 추적 (할당량 모니터링)
const trackApiCall = (functionName: string, modelName: string, promptHash?: string) => {
  const now = Date.now();
  const today = new Date().toDateString();
  const key = `gemini_api_calls_${today}`;
  
  // 오늘의 호출 기록 가져오기
  const allCalls = JSON.parse(localStorage.getItem(key) || '[]') as Array<{time: number, function: string, model: string}>;
  
  // 최근 1분간의 호출만 유지 (RPM 계산용)
  const oneMinuteAgo = now - 60000;
  const recentCalls = allCalls.filter(c => c.time > oneMinuteAgo);
  
  // 새 호출 추가
  recentCalls.push({ time: now, function: functionName, model: modelName });
  
  // 저장 (최근 1분간 호출만)
  localStorage.setItem(key, JSON.stringify(recentCalls));
  
  // 오늘의 총 호출 수 (모든 호출 기록에서 계산)
  const todayCalls = allCalls.filter(c => {
    const callDate = new Date(c.time).toDateString();
    return callDate === today;
  });
  
  // 전역 추적에도 추가
  const tracker = getApiCallTracker();
  if (tracker && tracker.callHistory) {
    tracker.callHistory.push({
      time: now,
      function: functionName,
      model: modelName,
      id: `${functionName}_${modelName}_${now}`
    });
    
    // 오래된 기록 정리 (1시간 이상 된 기록 제거)
    const oneHourAgo = now - 3600000;
    tracker.callHistory = tracker.callHistory.filter(c => c.time > oneHourAgo);
  }
  
  const activeCallsSize = tracker?.activeCalls?.size || 0;
  console.log('📊 API 호출 추적:', {
    함수: functionName,
    모델: modelName,
    최근1분간호출: recentCalls.length,
    오늘총호출: todayCalls.length + 1,
    진행중인호출: activeCallsSize,
    RPM제한: 15,
    일일제한: 1500,
    경고: recentCalls.length >= 10 ? '⚠️ 분당 제한에 근접했습니다!' : '✅ 정상',
    중복호출감지: activeCallsSize > 1 ? '⚠️ 여러 호출이 동시에 진행 중입니다!' : '✅ 정상'
  });
  
  return {
    recentCalls: recentCalls.length,
    todayCalls: todayCalls.length + 1,
    activeCalls: activeCallsSize
  };
};

export const analyzeWithFlash = async (
  prompt: string,
  apiKey?: string
): Promise<string> => {
  // 🔒 중복 호출 방지: 같은 요청이 이미 진행 중인지 확인
  const promptHash = prompt.substring(0, 50); // 프롬프트의 처음 50자로 해시 생성
  const tracker = getApiCallTracker();
  
  if (tracker.isDuplicateCall('analyzeWithFlash', 'primary', promptHash)) {
    throw new Error('같은 요청이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.');
  }
  
  const callId = tracker.startCall('analyzeWithFlash', 'primary', promptHash);
  
  try {
    // API Key 확인 및 디버깅
    const storedKey = getApiKey();
    const keyToUse = apiKey || storedKey;
    
    // 🔍 상세한 API Key 진단
    const keyDiagnosis = {
      hasStoredKey: !!storedKey,
      storedKeyLength: storedKey?.length || 0,
      storedKeyPrefix: storedKey ? storedKey.substring(0, 10) + '...' : '없음',
      storedKeySuffix: storedKey ? '...' + storedKey.substring(storedKey.length - 5) : '없음',
      hasProvidedKey: !!apiKey,
      keyToUseLength: keyToUse?.length || 0,
      keyToUsePrefix: keyToUse ? keyToUse.substring(0, 10) + '...' : '없음',
      keyToUseSuffix: keyToUse ? '...' + keyToUse.substring(keyToUse.length - 5) : '없음',
      startsWithAIza: keyToUse?.trim().startsWith('AIza') || false,
      trimmedLength: keyToUse?.trim().length || 0,
      hasSpaces: keyToUse?.includes(' ') || false,
      localStorageKey: API_KEY_STORAGE_KEY,
      localStorageValue: typeof window !== 'undefined' ? localStorage.getItem(API_KEY_STORAGE_KEY) : 'N/A (SSR)'
    };
    
    console.group('🔑 API Key 상세 진단');
    console.log('API Key 상태:', keyDiagnosis);
    console.log('localStorage 직접 확인:', {
      key: API_KEY_STORAGE_KEY,
      value: typeof window !== 'undefined' ? localStorage.getItem(API_KEY_STORAGE_KEY) : 'N/A',
      valueLength: typeof window !== 'undefined' ? localStorage.getItem(API_KEY_STORAGE_KEY)?.length : 0
    });
    console.groupEnd();
    
    if (!keyToUse) {
      console.error('❌ API Key가 없습니다. localStorage 확인:', {
        storageKey: API_KEY_STORAGE_KEY,
        storedValue: typeof window !== 'undefined' ? localStorage.getItem(API_KEY_STORAGE_KEY) : 'N/A',
        hasApiKey: hasApiKey()
      });
    throw new Error('API Key가 설정되지 않았습니다. 설정 버튼을 클릭하여 Google Gemini API Key를 입력해주세요.');
  }
  
    const trimmedKey = keyToUse.trim();
    if (trimmedKey.length === 0) {
      console.error('❌ API Key가 비어있습니다.');
      throw new Error('API Key가 비어있습니다. 올바른 API Key를 입력해주세요.');
    }
  
    // API Key 형식 검증
    if (trimmedKey.length < 30 || trimmedKey.length > 50) {
      console.warn('⚠️ API Key 길이가 비정상적입니다:', trimmedKey.length, '(일반적으로 39자)');
    }
  
    if (!trimmedKey.startsWith('AIza')) {
      console.error('❌ API Key가 "AIza"로 시작하지 않습니다:', {
        prefix: trimmedKey.substring(0, 10),
        fullKey: trimmedKey.substring(0, 20) + '...'
      });
      throw new Error('API Key가 "AIza"로 시작하지 않습니다. Google AI Studio에서 발급한 올바른 API Key인지 확인해주세요.');
    }
  
    console.log('🔧 Gemini 클라이언트 생성 시도 중...');
    const client = createGeminiClient(trimmedKey);
    if (!client) {
      console.error('❌ 클라이언트 생성 실패');
      throw new Error('API Key로 클라이언트를 생성할 수 없습니다. API Key를 확인해주세요.');
    }
  
    console.log('✅ Gemini 클라이언트 생성 성공');
  
  const modelsToTry = [
    'gemini-3.1-flash-lite',  // 최신 Flash Lite (최우선)
    'gemini-3-pro-preview',   // Pro Preview (두 번째)
    'gemini-2.5-flash',       // 2.5 Flash (대체)
    'gemini-2.0-flash',       // 이전 Flash (대체)
    'gemini-1.5-flash',       // 안정적인 Flash (대체)
  ];
  
  console.log('📋 시도할 모델 목록:', modelsToTry);
  
  let lastError: any = null;
  const maxRetries = 0; // 할당량 절약: 재시도 없음 (첫 번째 모델만 시도)
  
  const primaryModel = modelsToTry[0];

  console.log(`🎯 모델 선택: ${primaryModel} → 실패 시 ${modelsToTry[1]} 등 순차 시도`);
  console.log(`💡 404 오류 발생 시 자동으로 다음 모델로 대체됩니다.`);
  
  // 429 오류 자동 재시도 로직
  const maxRetriesFor429 = 3; // 최대 3회 재시도
  let last429Error: any = null;
  
  for (let retryAttempt = 0; retryAttempt <= maxRetriesFor429; retryAttempt++) {
    try {
      // API 호출 추적
      const callInfo = trackApiCall('analyzeWithFlash', primaryModel);
      
      if (retryAttempt > 0) {
        // 재시도인 경우 대기 시간 계산 (exponential backoff)
        const waitTime = Math.min(1000 * Math.pow(2, retryAttempt - 1), 30000); // 최대 30초
        console.log(`⏳ 429 오류 재시도 ${retryAttempt}/${maxRetriesFor429} - ${waitTime / 1000}초 대기 중...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      console.group(`📡 ${primaryModel} 모델로 요청 시도 중... (시도 ${retryAttempt + 1}/${maxRetriesFor429 + 1})`);
      console.log('요청 정보:', {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 100) + '...',
        최근1분간호출: callInfo.recentCalls,
        오늘총호출: callInfo.todayCalls,
        APIKey상태: {
          hasKey: !!keyToUse,
          keyLength: keyToUse?.length || 0,
          keyPrefix: keyToUse ? keyToUse.substring(0, 10) + '...' : '없음',
          startsWithAIza: keyToUse?.trim().startsWith('AIza') || false
        }
      });
      console.groupEnd();
      
      // RPM 제한 체크 및 자동 대기 (429 오류 예방)
      if (callInfo.recentCalls >= 10) {
        const waitTime = Math.min((callInfo.recentCalls - 9) * 2000, 10000); // 최대 10초 대기
        console.warn(`⚠️ 경고: 최근 1분간 ${callInfo.recentCalls}회 호출했습니다. RPM 제한(15회) 방지를 위해 ${waitTime / 1000}초 대기합니다.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      const model = client.getGenerativeModel({ model: primaryModel });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      console.log(`✅ ${primaryModel} 모델 성공! 응답 길이:`, text.length);
      
      // 성공 시 추적 종료
      getApiCallTracker().endCall(callId);
      return text;
    } catch (error: any) {
    console.error('Gemini API Error:', error?.message ?? error);
    const msg = error.message?.toLowerCase() || '';
    const statusCode = error.status;
    
    // 🔍 상세한 오류 진단 (할당량 초과 방지를 위해 중요!)
    const callInfo = trackApiCall('analyzeWithFlash', primaryModel);
    
    console.group(`❌ ${primaryModel} 모델 호출 실패 - 상세 진단`);
    console.error('📋 오류 상세 정보:', {
      모델: primaryModel,
      상태코드: statusCode,
      오류메시지: error.message,
      오류타입: error.name,
      오류코드: error.code,
      최근1분간호출: callInfo.recentCalls,
      오늘총호출: callInfo.todayCalls,
      APIKey상태: {
        hasKey: !!keyToUse,
        keyLength: keyToUse?.length || 0,
        keyPrefix: keyToUse ? keyToUse.substring(0, 10) + '...' : '없음',
        startsWithAIza: keyToUse?.trim().startsWith('AIza') || false
      }
    });
    
    // 오류 객체의 모든 속성 출력
    try {
      const errorDetails: any = {};
      Object.getOwnPropertyNames(error).forEach(key => {
        try {
          errorDetails[key] = error[key as keyof typeof error];
        } catch (e) {
          errorDetails[key] = '[직렬화 불가]';
        }
      });
      console.error('🔍 오류 객체 전체:', errorDetails);
    } catch (e) {
      console.error('🔍 오류 객체 분석 실패:', e);
    }
    
    console.groupEnd();
    
    // ⚠️ 중요: 429 오류는 자동 재시도 시도
    if (statusCode === 429 || 
        msg.includes('429') || 
        msg.includes('quota') || 
        msg.includes('resource exhausted') ||
        msg.includes('rate limit')) {
      
      // 🔍 429 오류 원인 분석
      const isRpmExceeded = callInfo.recentCalls >= 15;
      const isDailyExceeded = callInfo.todayCalls >= 1500;
      
      console.error(`❌ 429 오류 발생 (시도 ${retryAttempt + 1}/${maxRetriesFor429 + 1})`);
      console.error('💡 할당량 초과 원인 분석:', {
        오류코드: statusCode,
        오류메시지: error.message,
        현재시간: new Date().toISOString(),
        최근1분간호출: callInfo.recentCalls,
        오늘총호출: callInfo.todayCalls,
        원인분석: isRpmExceeded 
          ? '⚠️ 분당 제한(RPM) 초과 - 최근 1분간 15회 이상 호출'
          : isDailyExceeded
          ? '⚠️ 일일 할당량 초과 - 오늘 1,500회 이상 호출'
          : '⚠️ 다른 프로젝트/브라우저에서 같은 API Key 사용 중일 가능성',
        재시도가능: isDailyExceeded ? '❌ 일일 할당량 초과 - 재시도 불가' : '✅ RPM 제한 - 재시도 가능'
      });
      
      // 일일 할당량 초과인 경우 재시도 불가
      if (isDailyExceeded) {
        console.error('❌ 일일 할당량 초과로 인해 재시도하지 않습니다.');
        getApiCallTracker().endCall(callId);
        throw new Error(
          `⚠️ API 일일 할당량 초과 (429)\n\n` +
          `무료 티어 제한:\n` +
          `- 일일 할당량: 1,500회\n\n` +
          `현재 상태:\n` +
          `- 오늘 총 호출: ${callInfo.todayCalls}회\n\n` +
          `해결 방법:\n` +
          `1. ⏰ 내일 다시 시도하세요 (일일 할당량은 매일 자정에 초기화됩니다)\n` +
          `2. 📊 할당량 확인: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas\n` +
          `3. 🔍 다른 프로젝트/브라우저에서 같은 API Key 사용 중인지 확인\n`
        );
      }
      
      // 마지막 재시도인 경우 에러 throw
      if (retryAttempt >= maxRetriesFor429) {
        console.error(`❌ 429 오류 재시도 실패 - 최대 재시도 횟수(${maxRetriesFor429}회) 초과`);
        getApiCallTracker().endCall(callId);
        throw new Error(
          `⚠️ API 사용량 한도 초과 (429) - 자동 재시도 실패\n\n` +
          `무료 티어 제한:\n` +
          `- 분당 요청 제한(RPM): 15회\n` +
          `- 일일 할당량: 1,500회\n\n` +
          `현재 상태:\n` +
          `- 최근 1분간 호출: ${callInfo.recentCalls}회\n` +
          `- 오늘 총 호출: ${callInfo.todayCalls}회\n` +
          `- 재시도 횟수: ${maxRetriesFor429}회 (모두 실패)\n\n` +
          `해결 방법:\n` +
          `1. ⏰ 2-3분 정도 기다린 후 수동으로 다시 시도하세요\n` +
          `2. 📊 할당량 확인: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas\n` +
          `3. 🔍 다른 프로젝트/브라우저에서 같은 API Key 사용 중인지 확인\n` +
          `4. 🚫 불필요한 분석 실행은 피하세요 (할당량 낭비 방지)\n\n` +
          `💡 팁: 여러 분석을 연속으로 실행하지 말고, 하나씩 실행하세요.`
        );
      }
      
      // 재시도 가능한 경우 다음 루프로 계속
      last429Error = error;
      console.log(`🔄 429 오류 재시도 예정 (${retryAttempt + 1}/${maxRetriesFor429} 완료)`);
      continue; // 다음 재시도로 계속
    }
    
    // 429 오류가 아닌 다른 오류는 즉시 throw (재시도 불가)
    getApiCallTracker().endCall(callId);
    
    // API Key 관련 에러 (401, 403)는 즉시 중단 (다른 모델 시도 불필요)
    if (error.message?.toLowerCase().includes('api key') || 
        error.message?.toLowerCase().includes('invalid') ||
        statusCode === 401 || statusCode === 403) {
      console.error(`❌ API Key 인증 실패 (${statusCode}) - 즉시 중단`);
      console.error('💡 API Key 문제는 다른 모델을 시도해도 해결되지 않습니다.');
      throw error;
    }
    
    // 400 오류는 모델 이름이나 요청 형식 문제
    if (statusCode === 400) {
      console.error(`❌ ${primaryModel} 모델이 400 Bad Request 오류를 반환했습니다.`);
      
      // 🔍 어제와 오늘의 차이 분석
      console.error('🔍 어제와 오늘의 차이 분석:', {
        '어제': '정상 작동',
        '오늘': '400 Bad Request 오류 발생',
        '가능한 원인': [
          '1. Google이 모델 이름을 변경했거나 모델을 더 이상 사용할 수 없게 함',
          '2. API Key의 제한 사항이 변경됨 (IP 주소, HTTP 리퍼러 등)',
          '3. API Key의 권한이 변경됨',
          '4. 요청 형식이 변경됨 (프롬프트 크기 제한 등)',
          '5. Google API 서버의 일시적 문제'
        ]
      });
      
      // 상세한 오류 정보 분석
      const errorDetails = {
        '오류 메시지': error.message,
        '오류 코드': error.code,
        '프롬프트 크기': `${prompt.length}자`,
        '모델 이름': primaryModel,
        'API Key 길이': keyToUse?.length || 0,
        'API Key 시작': keyToUse?.substring(0, 4) || 'N/A'
      };
      
      console.error('📋 상세 오류 정보:', errorDetails);
      
      // 특정 오류 메시지에 따른 원인 추론
      let specificCause = '';
      if (error.message?.toLowerCase().includes('model')) {
        specificCause = '모델 이름 문제 - Google이 모델을 변경했거나 더 이상 사용할 수 없게 했을 가능성';
      } else if (error.message?.toLowerCase().includes('permission') || error.message?.toLowerCase().includes('permission denied')) {
        specificCause = '권한 문제 - API Key에 해당 모델 사용 권한이 없을 가능성';
      } else if (error.message?.toLowerCase().includes('invalid') || error.message?.toLowerCase().includes('malformed')) {
        specificCause = '요청 형식 문제 - 프롬프트 형식이나 크기가 변경되었을 가능성';
      } else if (error.message?.toLowerCase().includes('quota') || error.message?.toLowerCase().includes('limit')) {
        specificCause = '할당량 문제 - 하지만 400 오류이므로 모델 접근 권한 문제일 가능성';
      } else {
        specificCause = '알 수 없는 원인 - Google API 서버의 일시적 문제이거나 모델 접근 방식이 변경되었을 가능성';
      }
      
      console.error('💡 추론된 원인:', specificCause);
      
      // 400 오류는 다른 모델 시도하지 않고 즉시 실패 (할당량 절약)
      throw new Error(
        `❌ ${primaryModel} 모델 호출 실패 (400 Bad Request)\n\n` +
        `⚠️ 어제까지 잘 작동했던 모델이 오늘 갑자기 실패했습니다.\n\n` +
        `🔍 가능한 원인:\n` +
        `1. Google이 모델 이름을 변경했거나 모델을 더 이상 사용할 수 없게 함\n` +
        `2. API Key의 제한 사항이 변경됨 (IP 주소, HTTP 리퍼러 등)\n` +
        `3. API Key의 권한이 변경됨\n` +
        `4. 요청 형식이 변경됨 (프롬프트 크기: ${prompt.length}자)\n` +
        `5. Google API 서버의 일시적 문제\n\n` +
        `💡 추론된 원인: ${specificCause}\n\n` +
        `✅ 해결 방법:\n` +
        `1. Google Cloud Console에서 API Key 제한 사항 확인: https://console.cloud.google.com/apis/credentials\n` +
        `2. Google AI Studio에서 최신 모델 이름 확인: https://aistudio.google.com\n` +
        `3. 새 API Key 발급 후 재시도\n` +
        `4. 브라우저 콘솔에서 상세 오류 정보 확인 (위의 "📋 상세 오류 정보" 참고)`
      );
    }
    
    // 404 오류는 모델을 찾을 수 없음 → 폴백 모델로 계속 시도
    if (statusCode === 404) {
      console.error(`❌ ${primaryModel} 모델을 찾을 수 없음 (404) → 다음 모델 시도`);
      lastError = error;
      // 아래 폴백 루프로 fall-through
    }
    
    // 네트워크 오류나 일시적 오류만 다른 모델 시도 (할당량 소모 주의)
    console.warn(`⚠️ ${primaryModel} 모델 실패, 다른 모델 시도 중... (할당량 소모 주의)`);
    lastError = error;
    
    // 다른 모델 시도 (할당량 소모하지만 마지막 시도)
    for (let i = 1; i < modelsToTry.length; i++) {
      const fallbackModel = modelsToTry[i];
      try {
        console.log(`🔄 ${fallbackModel} 모델로 대체 시도 중...`);
        const callInfo2 = trackApiCall('analyzeWithFlash', fallbackModel);
        
        if (callInfo2.recentCalls >= 12) {
          console.warn('⚠️ 경고: 최근 1분간 12회 이상 호출했습니다. 추가 모델 시도를 중단합니다.');
          break;
        }
        
          const model = client.getGenerativeModel({ model: fallbackModel });
  const result = await model.generateContent(prompt);
  const response = result.response;
        const text = response.text();
        console.log(`✅ ${fallbackModel} 모델 성공! 응답 길이:`, text.length);
        return text;
      } catch (fallbackError: any) {
        console.error('Gemini API Error:', fallbackError?.message ?? fallbackError);
        console.error(`❌ ${fallbackModel} 모델도 실패:`, fallbackError.message);
        lastError = fallbackError;
        // 다음 모델 시도
      }
    }
    
    // 모든 모델 실패
    const errorMsg = lastError?.message || '알 수 없는 오류';
    console.error('❌ 모든 모델 시도 실패:', errorMsg);
    throw lastError || new Error('모든 모델 시도가 실패했습니다.');
    } // for 루프의 catch 블록 끝
  } // for 루프 끝
  } catch (outerError: any) {
    // 외부 try-catch에서 처리되지 않은 오류
    console.error('❌ 예상치 못한 오류:', outerError);
    // 호출 완료 처리
    getApiCallTracker().endCall(callId);
    throw outerError;
  } finally {
    // 🔒 호출 완료 처리 (성공/실패 여부와 관계없이)
    const tracker = getApiCallTracker();
    tracker.endCall(callId);
    console.log('🔓 API 호출 완료 처리:', { callId, 진행중인호출: tracker?.activeCalls?.size || 0 });
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

  const proModels = ['gemini-3-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastProError: any = null;
  for (const proModel of proModels) {
    try {
      const model = client.getGenerativeModel({ model: proModel });
      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text();
    } catch (error: any) {
      console.error(`Gemini API Error (${proModel}):`, error?.message ?? error);
      lastProError = error;
    }
  }
  throw lastProError || new Error('모든 모델 시도가 실패했습니다.');
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

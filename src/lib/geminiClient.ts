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
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
};

/**
 * API Key 불러오기
 */
export const getApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
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
  if (!key) return null;
  return new GoogleGenerativeAI(key);
};

/**
 * Gemini Flash 모델로 분석 (빠르고 저렴)
 */
export const analyzeWithFlash = async (
  prompt: string,
  apiKey?: string
): Promise<string> => {
  const client = createGeminiClient(apiKey);
  if (!client) {
    throw new Error('API Key가 설정되지 않았습니다. 설정 버튼을 클릭하여 Google Gemini API Key를 입력해주세요.');
  }
  
  const model = client.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
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

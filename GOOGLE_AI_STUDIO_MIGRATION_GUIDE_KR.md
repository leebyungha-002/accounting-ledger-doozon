# Google AI Studio → 로컬 프로젝트 이전 가이드

Google AI Studio에서 개발한 앱을 현재 로컬 프로젝트로 옮기는 단계별 가이드입니다.

## 📋 목차

1. [코드 가져오기](#1-코드-가져오기)
2. [프로젝트 구조 이해](#2-프로젝트-구조-이해)
3. [파일 통합](#3-파일-통합)
4. [의존성 설치](#4-의존성-설치)
5. [환경 변수 설정](#5-환경-변수-설정)
6. [테스트 및 실행](#6-테스트-및-실행)

---

## 1. 코드 가져오기

### 방법 A: Google AI Studio에서 직접 복사 (추천)

#### 단계 1: Google AI Studio 접속
1. https://aistudio.google.com 접속
2. 로그인 후 개발한 프로젝트 선택

#### 단계 2: 파일 목록 확인
Google AI Studio 화면에서 다음 파일들을 확인하세요:
- 코드 편집기 영역의 파일 탭 확인
- 일반적으로 다음 파일들이 있습니다:
  - `index.tsx` 또는 `App.tsx` - 메인 컴포넌트
  - `services/geminiService.ts` - Gemini API 서비스
  - `types.ts` - 타입 정의
  - `components/` - 컴포넌트 폴더
  - `utils/` - 유틸리티 함수

#### 단계 3: 각 파일 복사
1. 각 파일 탭을 클릭하여 열기
2. 전체 선택 (`Ctrl+A` 또는 `Cmd+A`)
3. 복사 (`Ctrl+C` 또는 `Cmd+C`)
4. 텍스트 파일로 임시 저장 또는 메모장에 붙여넣기

### 방법 B: 브라우저 개발자 도구 사용

1. Google AI Studio 프로젝트 열기
2. `F12` 키로 개발자 도구 열기
3. "Sources" 탭 클릭
4. 왼쪽 파일 트리에서 파일 확인 및 복사

---

## 2. 프로젝트 구조 이해

현재 프로젝트 구조:

```
accounting-ledger-doozon/
├── src/
│   ├── pages/
│   │   ├── SamplingAnalysis.tsx  ← 이미 있음
│   │   └── [새로운 페이지들 추가]
│   ├── components/
│   │   └── ui/  ← shadcn-ui 컴포넌트
│   ├── services/
│   │   └── [Gemini 서비스 추가 예정]
│   ├── types/
│   │   └── [타입 정의 추가 예정]
│   ├── utils/
│   │   └── [유틸리티 추가 예정]
│   ├── App.tsx
│   └── main.tsx
├── package.json  ← @google/generative-ai 이미 설치됨
└── .env  ← 환경 변수 설정 필요
```

---

## 3. 파일 통합

### 3-1. Gemini 서비스 파일 통합

Google AI Studio의 `services/geminiService.ts` 파일을 가져옵니다:

**저장 위치**: `src/services/geminiService.ts`

```bash
# services 폴더 생성 (이미 있으면 생략)
mkdir src/services
```

**작업 순서**:
1. Google AI Studio에서 `geminiService.ts` 코드 복사
2. `src/services/geminiService.ts` 파일 생성
3. 코드 붙여넣기
4. API Key 설정 확인 (환경 변수 사용 권장)

### 3-2. 컴포넌트 파일 통합

Google AI Studio의 컴포넌트를 가져옵니다:

**저장 위치**: `src/pages/` 또는 `src/components/`

**작업 순서**:
1. Google AI Studio의 컴포넌트 파일들 확인
2. 각 파일을 적절한 위치에 생성
3. import 경로 수정 필요할 수 있음

**예시**:
- `GeminiAnalysis.tsx` → `src/pages/GeminiAnalysis.tsx`
- `Dashboard.tsx` → `src/pages/Dashboard.tsx`

### 3-3. 타입 정의 통합

Google AI Studio의 타입 정의를 가져옵니다:

**저장 위치**: `src/types/`

**작업 순서**:
1. `types.ts` 파일 내용 확인
2. `src/types/index.ts` 또는 개별 파일로 생성
3. 필요시 기존 타입과 통합

---

## 4. 의존성 설치

### 확인해야 할 패키지

Google AI Studio에서 사용하는 패키지가 `package.json`에 있는지 확인:

```json
{
  "dependencies": {
    "@google/generative-ai": "^0.24.1",  ← 이미 있음
    "react": "^18.3.1",  ← 이미 있음
    "react-dom": "^18.3.1",  ← 이미 있음
    // 기타 필요한 패키지들...
  }
}
```

### 패키지 설치가 필요한 경우

```bash
# 프로젝트 폴더로 이동
cd C:\Users\USer\Documents\accounting-ledger-doozon

# 필요한 패키지 설치 (예시)
npm install 패키지명

# 또는 모든 의존성 재설치
npm install
```

---

## 5. 환경 변수 설정

### 5-1. .env 파일 생성

프로젝트 루트에 `.env` 파일을 생성하거나 수정합니다:

```env
# Supabase 설정 (이미 있음)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Gemini API Key (추가 필요)
VITE_GEMINI_API_KEY=your_gemini_api_key
```

### 5-2. API Key 가져오기

1. **Google AI Studio에서 API Key 확인**:
   - Google AI Studio 프로젝트 설정에서 API Key 확인
   - 또는 https://aistudio.google.com/apikey 에서 생성

2. **코드에서 API Key 사용 방식 확인**:
   Google AI Studio 코드에서 API Key를 어떻게 가져오는지 확인:
   
   ```typescript
   // 예시 1: 환경 변수에서 가져오기 (권장)
   const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
   
   // 예시 2: 직접 입력
   const apiKey = "your-api-key-here";
   
   // 예시 3: localStorage에서 가져오기
   const apiKey = localStorage.getItem('gemini_api_key');
   ```

### 5-3. 환경 변수 사용으로 변경 (권장)

Google AI Studio 코드에서 하드코딩된 API Key가 있다면 환경 변수로 변경:

**변경 전**:
```typescript
const apiKey = "hardcoded-api-key";
```

**변경 후**:
```typescript
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
```

---

## 6. 테스트 및 실행

### 6-1. 개발 서버 실행

```bash
# 프로젝트 폴더로 이동
cd C:\Users\USer\Documents\accounting-ledger-doozon

# 개발 서버 시작
npm run dev
```

### 6-2. 오류 확인 및 수정

실행 시 발생하는 오류들을 확인:

1. **Import 오류**: 파일 경로 확인 및 수정
2. **타입 오류**: 타입 정의 확인 및 수정
3. **API Key 오류**: 환경 변수 설정 확인
4. **패키지 오류**: 필요한 패키지 설치

### 6-3. 라우팅 설정

새로운 페이지를 추가했다면 `src/App.tsx`에서 라우팅 설정:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import GeminiAnalysis from './pages/GeminiAnalysis';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/gemini-analysis" element={<GeminiAnalysis />} />
        {/* 기타 라우트들... */}
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 🎯 빠른 체크리스트

다음 항목들을 확인하세요:

- [ ] Google AI Studio에서 코드 복사 완료
- [ ] `src/services/geminiService.ts` 파일 생성 및 코드 통합
- [ ] 컴포넌트 파일들을 `src/pages/` 또는 `src/components/`에 추가
- [ ] 타입 정의를 `src/types/`에 추가
- [ ] 필요한 패키지 설치 확인
- [ ] `.env` 파일에 `VITE_GEMINI_API_KEY` 추가
- [ ] 코드에서 API Key를 환경 변수로 사용하도록 수정
- [ ] `npm run dev`로 개발 서버 실행 확인
- [ ] 라우팅 설정 확인 (새 페이지 추가한 경우)

---

## 💡 자주 발생하는 문제 해결

### 문제 1: API Key 오류

**증상**: `API key not valid` 오류

**해결**:
1. `.env` 파일에 올바른 API Key가 있는지 확인
2. 환경 변수 이름이 `VITE_`로 시작하는지 확인 (Vite 프로젝트이므로)
3. 개발 서버를 재시작 (`Ctrl+C` 후 `npm run dev`)

### 문제 2: Import 경로 오류

**증상**: `Cannot find module` 오류

**해결**:
1. 파일 경로 확인 (대소문자 구분)
2. `tsconfig.json`에서 경로 별칭 설정 확인
3. 상대 경로로 변경 시도

### 문제 3: 타입 오류

**증상**: TypeScript 컴파일 오류

**해결**:
1. `src/types/` 폴더에 타입 정의 추가
2. 필요한 타입을 import
3. `any` 타입을 임시로 사용하여 점진적으로 수정

---

## 📞 다음 단계

코드 통합이 완료되면:

1. **기능 테스트**: 각 기능이 정상 작동하는지 확인
2. **스타일 통합**: 기존 프로젝트의 UI 스타일과 일치시키기
3. **성능 최적화**: 필요시 코드 최적화
4. **문서화**: 추가된 기능에 대한 문서 작성

---

## 🚀 도움이 필요하신가요?

다음 정보를 공유해주시면 더 정확한 도움을 드릴 수 있습니다:

1. **Google AI Studio 코드**: 복사한 코드 내용
2. **오류 메시지**: 발생하는 정확한 오류 메시지
3. **현재 상태**: 어디까지 진행했는지
4. **API Key 사용 방식**: Google AI Studio에서 어떻게 사용했는지

코드를 공유해주시면 제가 직접 통합해드리겠습니다! 🎉



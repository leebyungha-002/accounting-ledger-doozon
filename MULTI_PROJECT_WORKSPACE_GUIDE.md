# 두 프로젝트 통합 작업 가이드

## 🎯 목표
현재 프로젝트(`accounting-ledger-doozon`)와 Google AI Studio 프로젝트를 함께 작업하는 방법

---

## 방법 1: 멀티 루트 워크스페이스 (추천) ⭐

### 장점
- 두 프로젝트를 동시에 볼 수 있음
- 한 에이전트가 두 프로젝트 모두 접근 가능
- 파일 비교 및 복사가 쉬움
- 코드 통합이 용이

### 설정 방법

1. **워크스페이스 파일 생성**
   ```
   프로젝트 루트에 .code-workspace 파일 생성
   ```

2. **워크스페이스 설정**
   ```json
   {
     "folders": [
       {
         "path": ".",
         "name": "현재 프로젝트 (accounting-ledger-doozon)"
       },
       {
         "path": "../google-ai-studio-project",
         "name": "Google AI Studio 프로젝트"
       }
     ],
     "settings": {
       "files.exclude": {
         "**/node_modules": true
       }
     }
   }
   ```

3. **Cursor에서 열기**
   - File → Open Workspace from File
   - `.code-workspace` 파일 선택

---

## 방법 2: 별도 Cursor 창 (병렬 작업)

### 장점
- 각 프로젝트를 독립적으로 작업
- 서로 다른 에이전트 세션 사용 가능
- 프로젝트 간 간섭 없음

### 설정 방법

1. **첫 번째 프로젝트 열기**
   ```
   Cursor에서 현재 프로젝트 열기
   C:\Users\USer\Documents\accounting-ledger-doozon
   ```

2. **두 번째 프로젝트 열기**
   ```
   File → New Window
   File → Open Folder
   → Google AI Studio 프로젝트 폴더 선택
   ```

3. **작업 방식**
   - 각 창에서 독립적으로 작업
   - 필요시 코드 복사/붙여넣기
   - 각각 다른 에이전트 세션 사용 가능

---

## 방법 3: 프로젝트 통합 (완전 통합)

### 장점
- 하나의 프로젝트로 관리
- 코드 중복 제거
- 배포 및 관리 용이

### 단계

1. **Google AI Studio 프로젝트 파일 복사**
   ```
   Google AI Studio 프로젝트의 파일들을
   현재 프로젝트의 적절한 위치에 복사
   ```

2. **의존성 통합**
   ```bash
   # package.json에 필요한 패키지 추가
   npm install [필요한 패키지들]
   ```

3. **코드 통합**
   - Google AI Studio의 컴포넌트를 현재 프로젝트 구조에 맞게 통합
   - 라우팅 추가
   - 스타일 통합

---

## 방법 4: Git 서브모듈 (고급)

### 장점
- 각 프로젝트를 독립적으로 관리
- 버전 관리 분리
- 필요시 업데이트 가능

### 설정 방법

```bash
# 현재 프로젝트에서
git submodule add [Google AI Studio 프로젝트 Git URL] google-ai-studio
```

---

## 🚀 추천 워크플로우

### 시나리오 A: 코드 비교 및 통합
**→ 방법 1 (멀티 루트 워크스페이스) 추천**

1. 두 프로젝트를 한 워크스페이스에 열기
2. 에이전트에게 "두 프로젝트를 비교해서 통합해줘" 요청
3. 필요한 기능만 선택적으로 통합

### 시나리오 B: 독립적 개발
**→ 방법 2 (별도 창) 추천**

1. 각 프로젝트를 별도 창에서 열기
2. 각각 독립적으로 개발
3. 필요시 코드 공유

### 시나리오 C: 완전 통합
**→ 방법 3 (프로젝트 통합) 추천**

1. Google AI Studio 프로젝트의 핵심 기능만 추출
2. 현재 프로젝트에 통합
3. 하나의 통합 프로젝트로 관리

---

## 💡 실용적인 예시

### 예시 1: Google AI Studio의 서비스 파일 통합

```bash
# Google AI Studio 프로젝트에서
# services/geminiService.ts 파일을
# 현재 프로젝트의 src/lib/로 복사

# 그 후 에이전트에게:
"이 파일을 현재 프로젝트 구조에 맞게 수정해줘"
```

### 예시 2: 컴포넌트 통합

```bash
# Google AI Studio의 컴포넌트를
# 현재 프로젝트의 src/components/로 복사

# 그 후 에이전트에게:
"이 컴포넌트를 shadcn/ui로 변환해줘"
```

---

## 🔧 현재 프로젝트에 Google AI Studio 통합하기

### 빠른 통합 방법

1. **Google AI Studio 프로젝트 폴더 위치 확인**
   - Google AI Studio에서 다운로드한 경우: 다운로드 폴더
   - 또는 Google AI Studio 웹에서 코드 복사

2. **필요한 파일만 복사**
   ```
   Google AI Studio 프로젝트/
   ├── services/
   │   └── geminiService.ts  → 현재 프로젝트/src/lib/
   ├── components/
   │   └── [컴포넌트들]      → 현재 프로젝트/src/components/
   └── types.ts              → 현재 프로젝트/src/types/
   ```

3. **에이전트에게 통합 요청**
   ```
   "이 파일들을 현재 프로젝트에 통합해줘"
   ```

---

## 📝 워크스페이스 파일 예시

`.code-workspace` 파일 생성:

```json
{
  "folders": [
    {
      "path": ".",
      "name": "📊 회계 원장 분석 (현재 프로젝트)"
    },
    {
      "path": "../google-ai-studio-accounting",
      "name": "🤖 Google AI Studio 프로젝트"
    }
  ],
  "settings": {
    "files.exclude": {
      "**/node_modules": true,
      "**/.git": false
    },
    "search.exclude": {
      "**/node_modules": true
    }
  },
  "extensions": {
    "recommendations": [
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode"
    ]
  }
}
```

---

## 🎯 다음 단계

어떤 방법을 사용하시겠습니까?

1. **멀티 루트 워크스페이스 설정** - 두 프로젝트를 한 번에 보기
2. **별도 창으로 열기** - 독립적으로 작업
3. **코드 통합** - Google AI Studio 기능을 현재 프로젝트에 통합
4. **특정 파일만 통합** - 필요한 부분만 선택적으로 통합

원하시는 방법을 알려주시면 바로 도와드리겠습니다! 🚀





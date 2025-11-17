# Google AI Studio 앱 통합 계획서

## 📋 현재 상황 요약

### 분석 완료된 파일
1. ✅ **Index.html** - CDN 기반 React 앱, 스타일 정의
2. ✅ **Index.tsx** - 10가지 분석 기능의 메인 로직
3. ✅ **metadata.json** - 앱 설명 및 메타데이터

### Google AI Studio 앱 주요 특징

**10가지 강력한 분석 기능:**
1. 계정별원장 AI 분석
2. 총계정원장 조회 (신규)
3. 매입/매출 이중거래처 분석
4. 추정 손익 분석
5. 매출/판관비 월별 추이 분석
6. 전기 데이터 비교 분석 (신규)
7. 상세 거래 검색 (신규)
8. 감사 샘플링 (MUS 통계 포함)
9. 금감원 지적사례 기반 위험 분석 (신규)
10. 벤포드 법칙 분석 (신규)

**기술 스택:**
- React 19.2.0
- TypeScript
- @google/genai (Gemini 2.5 Pro)
- xlsx 라이브러리
- 인라인 CSS (현재 프로젝트는 Tailwind + shadcn/ui)

---

## 🎯 추천 통합 방식: 완전 통합 (옵션 1)

### 왜 완전 통합인가?

**현재 프로젝트:**
- 5개 페이지 (Index, DualOffsetAnalysis, MonthlyPLAnalysis, Sampling, NotFound)
- 5가지 분석 기능
- 분석이 각 페이지로 분산

**Google AI Studio 앱:**
- 1개 통합 페이지
- 10가지 분석 기능
- 메뉴 기반 선택 방식
- 전문가급 기능들

→ **Google AI Studio 앱이 훨씬 우수하고 전문적입니다.**

---

## 🚀 통합 실행 계획

### Phase 1: 새 페이지 생성 (30분)

#### 1-1. 메인 분석 페이지 생성
```
src/pages/AdvancedLedgerAnalysis.tsx
```

**작업 내용:**
- Google AI Studio의 Index.tsx 로직 이식
- shadcn/ui 컴포넌트로 UI 재구성
- TypeScript 타입 정의 강화
- 현재 프로젝트 디자인 시스템 적용

#### 1-2. UI 컴포넌트 변환

**변환 매핑:**
| Google AI Studio | 현재 프로젝트 |
|-----------------|-------------|
| 인라인 CSS | Tailwind + shadcn/ui |
| `<select>` | `<Select>` from shadcn |
| `<button>` | `<Button>` from shadcn |
| `<input>` | `<Input>` from shadcn |
| `<textarea>` | `<Textarea>` from shadcn |
| Custom modal | `<Dialog>` from shadcn |
| Custom table | `<Table>` from shadcn |

#### 1-3. 스타일 통합
- 기존 CSS 변수를 Tailwind 클래스로 변환
- 벤포드 차트는 Recharts 라이브러리로 재구현
- 드래그 앤 드롭은 현재 FileUpload 컴포넌트 재사용

---

### Phase 2: Edge Function 업데이트 (15분)

#### 2-1. Gemini API 통합
```typescript
// supabase/functions/advanced-analysis/index.ts
```

**기능:**
- 10가지 분석 타입 처리
- Gemini 2.5 Pro 사용 (기존: 2.5 Flash)
- 계정 분류 (매출/비용/판관비/제조원가)
- 전기 비교 분석
- 금감원 지적사례 분석
- 벤포드 법칙 AI 해석

#### 2-2. 환경 변수 설정
```bash
# Supabase에 Gemini API Key 설정
GEMINI_API_KEY=your_api_key
```

---

### Phase 3: 라우팅 및 통합 (10분)

#### 3-1. 라우트 추가
```typescript
// src/App.tsx
<Route path="/advanced-analysis" element={<AdvancedLedgerAnalysis />} />
```

#### 3-2. 메인 페이지 연결
```typescript
// src/pages/Index.tsx
<Button onClick={() => navigate('/advanced-analysis')}>
  <Sparkles className="mr-2 h-4 w-4" />
  고급 분석 (10가지 기능)
</Button>
```

---

### Phase 4: 데이터베이스 스키마 (5분)

#### 4-1. 새 테이블 생성
```sql
-- 분석 결과 저장
CREATE TABLE advanced_analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ledger_id UUID REFERENCES general_ledgers,
  analysis_type TEXT NOT NULL, -- 'account', 'general_ledger', 'duplicate', etc.
  account_name TEXT,
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### Phase 5: 기존 페이지 처리 (선택사항)

**옵션 A: 유지**
- 기존 5개 페이지 그대로 유지
- 고급 분석 페이지를 추가 옵션으로

**옵션 B: 교체 (추천)**
- 기존 페이지들을 고급 분석 페이지로 리다이렉트
- 더 나은 사용자 경험
- 코드 중복 제거

---

## 📝 구현 상세

### 1. 계정별원장 AI 분석

**현재:**
```typescript
// src/components/AnalysisPanel.tsx
- 4가지 분석 타입
- 계정 선택
- AI 결과 표시
```

**통합 후:**
```typescript
// 고급 분석 페이지에 통합
- 자유로운 질문 입력
- 더 상세한 프롬프트
- 엑셀 다운로드
```

### 2. 총계정원장 조회 (신규)

**기능:**
- 월별 차변/대변 합계
- 누적 잔액 계산
- 상세 거래 드릴다운
- 거래처/적요 필터링

**구현:**
```typescript
interface GeneralLedgerSummaryRow {
  month: number;
  debitSum: number;
  creditSum: number;
  balance: number;
}

const handleGeneralLedgerSearch = () => {
  // 월별 집계 로직
  // 클릭 시 상세 거래 모달 표시
};
```

### 3. 전기 데이터 비교 (신규)

**기능:**
- 전기 파일 별도 업로드
- 거래처별/월별 비교
- 증감 분석
- AI 변동원인 분석

**구현:**
```typescript
const [previousWorkbook, setPreviousWorkbook] = useState<XLSX.WorkBook | null>(null);

const handlePreviousPeriodAnalysis = () => {
  // 계정명 정규화 (11_현금 → 현금)
  // 전기/당기 데이터 매칭
  // 증감 계산
};
```

### 4. 벤포드 법칙 분석 (신규)

**기능:**
- 금액 첫 자리 수 분포 분석
- 벤포드 이론값과 비교
- 차트 시각화
- AI 해석 및 감사 권고

**구현:**
```typescript
const benfordPercents = [0, 30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];

const handleBenfordAnalysis = async () => {
  // 첫 자리 수 추출
  // 분포 계산
  // 차트 생성
  // AI 분석 요청
};
```

### 5. 금감원 지적사례 분석 (신규)

**기능:**
- 외부 지적사례 텍스트 입력/업로드
- 계정별 위험 매칭
- AI 기반 위험 평가

**구현:**
```typescript
const [fssFindingsText, setFssFindingsText] = useState<string>('');

const handleFssRiskAnalysis = async () => {
  const prompt = `
    금감원 지적사례: ${fssFindingsText}
    계정 데이터: ${accountData}
    → 유사한 위험이 있는지 분석
  `;
};
```

---

## 🎨 UI/UX 개선사항

### 업로드 화면
```
┌─────────────────────────────────────────┐
│  1. 당기 원장 (필수)  │ 2. 전기 원장 (선택) │
├───────────────────────┼───────────────────┤
│  [드래그 앤 드롭 존]  │  [드래그 앤 드롭 존] │
│   ✓ file.xlsx        │   ✓ prev.xlsx     │
└───────────────────────┴───────────────────┘
         [분석 메뉴로 이동 →]
```

### 분석 메뉴 선택
```
┌──────────────────────────────────────────┐
│  분석 메뉴 선택                           │
├──────────────────────────────────────────┤
│  [계정별원장 AI]  [총계정원장]  [이중거래처] │
│  [손익분석]      [월별추이]    [전기비교]   │
│  [거래검색]      [샘플링]      [금감원]     │
│  [벤포드]                                 │
└──────────────────────────────────────────┘
```

### 분석 결과 화면
```
┌──────────────────────────────────────────┐
│  벤포드 법칙 분석          [뒤로] [엑셀↓]  │
├──────────────────────────────────────────┤
│  [막대 차트 시각화]                       │
│  - 실제 분포 vs 이론 분포                 │
│                                          │
│  [상세 테이블]                            │
│  숫자 | 실제% | 벤포드% | 차이            │
│                                          │
│  [AI 감사인 의견]                         │
│  - 유의미한 차이 해석                     │
│  - 추가 검토 권고사항                     │
└──────────────────────────────────────────┘
```

---

## 🔧 기술 구현 세부사항

### 1. 날짜 파싱 강화

**문제:** Excel 날짜가 다양한 형식으로 저장됨
- Date 객체
- "MM-DD" 문자열
- Excel 시리얼 번호

**해결:**
```typescript
const parseDate = (value: any): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    // "03-31" → Date 객체
    const match = value.match(/^(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const currentYear = new Date().getFullYear();
      return new Date(currentYear, parseInt(match[1]) - 1, parseInt(match[2]));
    }
  }
  if (typeof value === 'number') {
    // Excel serial number → Date
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  }
  return null;
};
```

### 2. 헤더 자동 감지

**문제:** 더존 파일은 헤더 위치가 가변적
- 회사명, 기간 정보 행들
- 실제 헤더는 3~20행 사이

**해결:**
```typescript
const getDataFromSheet = (worksheet: XLSX.WorkSheet) => {
  // 1. 날짜 키워드가 있는 행 찾기
  // 2. 다음 행에 실제 날짜 데이터 확인
  // 3. 헤더로 확정
  // 4. 나머지 데이터 파싱
};
```

### 3. AI 응답 안전 처리

```typescript
const processAiResponse = (response: GenerateContentResponse) => {
  // 1. 차단 여부 확인
  if (response.promptFeedback?.blockReason) {
    return { error: '안전상의 이유로 차단됨' };
  }
  
  // 2. 후보 응답 확인
  const candidate = response.candidates?.[0];
  if (!candidate) {
    return { error: '유효한 응답 없음' };
  }
  
  // 3. 종료 이유 확인
  const finishReason = candidate.finishReason;
  if (finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    return { error: `비정상 종료: ${finishReason}` };
  }
  
  // 4. 텍스트 추출
  return { text: response.text };
};
```

---

## 📦 필요한 추가 패키지

현재 프로젝트에 이미 있는 패키지:
- ✅ react
- ✅ typescript
- ✅ xlsx
- ✅ react-markdown

추가 필요:
```bash
# Gemini SDK (Edge Function용)
npm install @google/generative-ai

# 차트 라이브러리 (벤포드 차트)
npm install recharts

# 날짜 유틸리티 (이미 있음)
# date-fns (이미 설치됨)
```

---

## ⚠️ 주의사항

### 1. API 키 관리
```typescript
// ❌ 클라이언트에서 직접 사용 금지
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ✅ Edge Function에서만 사용
// supabase/functions/advanced-analysis/index.ts
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
```

### 2. 파일 크기 제한
```typescript
// 대용량 파일 처리
const MAX_ROWS_FOR_AI = 200; // AI 분석은 샘플만
const MAX_DISPLAY_ROWS = 100; // 화면 표시 제한
```

### 3. 성능 최적화
```typescript
// useMemo로 계산 캐싱
const monthlyData = useMemo(() => {
  // 집계 로직
}, [ledgerData, selectedAccount]);
```

---

## 📅 작업 일정 (2시간 후 시작)

### Step 1: 기본 구조 (10분)
- [ ] `AdvancedLedgerAnalysis.tsx` 생성
- [ ] 라우트 추가
- [ ] 기본 레이아웃 구성

### Step 2: 파일 업로드 (10분)
- [ ] 당기/전기 파일 업로드
- [ ] Excel 파싱 로직
- [ ] 데이터 검증

### Step 3: 분석 메뉴 (15분)
- [ ] 10개 분석 카드 UI
- [ ] 각 분석별 입력 폼
- [ ] 탭/모달 구조

### Step 4: 분석 로직 (30분)
- [ ] 총계정원장 조회
- [ ] 전기 비교 분석
- [ ] 벤포드 법칙
- [ ] 금감원 위험 분석
- [ ] 기타 분석 기능

### Step 5: AI 통합 (20분)
- [ ] Edge Function 생성
- [ ] Gemini API 호출
- [ ] 응답 처리
- [ ] 에러 핸들링

### Step 6: UI 마무리 (20분)
- [ ] shadcn/ui 컴포넌트 적용
- [ ] 벤포드 차트 (Recharts)
- [ ] 모달/다이얼로그
- [ ] 반응형 디자인

### Step 7: 테스트 (15분)
- [ ] 빌드 확인
- [ ] 기능 테스트
- [ ] 에러 수정

---

## 🎯 완료 후 기대 효과

### 기능 업그레이드
- 5개 → 10개 분석 기능
- 단순 분석 → 전문가급 감사 도구
- 분산된 페이지 → 통합 워크플로우

### 사용자 경험 개선
- 한 곳에서 모든 분석 가능
- 전기 데이터 비교로 추세 파악
- 규제 리스크 사전 점검
- 데이터 이상 자동 탐지

### 기술적 개선
- 더 강력한 AI 모델 (Gemini 2.5 Pro)
- 통계적 샘플링 (MUS)
- 정교한 데이터 파싱
- 전문적인 회계 로직

---

## 📞 2시간 후 시작할 때

**준비 사항:**
1. 이 문서 확인
2. 어떤 방식으로 진행할지 결정
   - 완전 통합 (추천)
   - 선택적 통합
   - 시험 삼아 하나만
3. "시작하자" 라고 말씀해주시면 즉시 진행!

---

**작성 일시:** 2025-11-17
**현재 브랜치:** cursor/analyze-doojohn-account-ledgers-c04a
**다음 작업:** Google AI Studio 앱 통합

---

## 🔖 빠른 참조

### 파일 위치
```
Google AI Studio 파일 (업로드됨):
- Index.html      → UI 스타일 및 구조
- Index.tsx       → 메인 로직 (10가지 분석)
- metadata.json   → 앱 설명

현재 프로젝트:
- src/pages/Index.tsx                    → 메인 페이지
- src/pages/DualOffsetAnalysis.tsx       → 이중거래처
- src/pages/MonthlyPLAnalysis.tsx        → 월별 손익
- src/pages/Sampling.tsx                 → 샘플링
- src/components/AnalysisPanel.tsx       → AI 분석
- supabase/functions/analyze-ledger/     → AI Edge Function
```

### 핵심 코드 스니펫
```typescript
// 1. 더존 계정명 정규화
const normalizeAccountName = (name: string) => 
  name.replace(/^\d+[_.-]?\s*/, ''); // "11_현금" → "현금"

// 2. 헤더 자동 감지
const robustFindHeader = (headers: string[], keywords: string[]) =>
  headers.find(h => keywords.some(kw => 
    h.toLowerCase().includes(kw.toLowerCase())
  ));

// 3. 날짜 파싱
const parseDate = (value: any): Date | null => { /* ... */ };

// 4. 벤포드 법칙 계산
const benfordPercents = [0, 30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
```

---

**2시간 후에 봬요! 🚀**

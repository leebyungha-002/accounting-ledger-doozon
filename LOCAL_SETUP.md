# 🚀 로컬에서 실행하기

## 📋 준비물
- Node.js 18 이상
- npm 또는 yarn
- Git

---

## ⚡ 빠른 시작 (5분)

### 1️⃣ 저장소 클론
```bash
git clone https://github.com/leebyungha-002/accounting-ledger-analysis.git
cd accounting-ledger-analysis
```

### 2️⃣ 브랜치 전환
```bash
git checkout cursor/analyze-doojohn-account-ledgers-c04a
```

### 3️⃣ 의존성 설치
```bash
npm install
```

### 4️⃣ 개발 서버 실행
```bash
npm run dev
```

### 5️⃣ 브라우저 열기
```
🌐 http://localhost:8080/
```

---

## 🎯 테스트할 페이지

### 메인 페이지
```
http://localhost:8080/
```
✅ 로그인 (이메일/비밀번호 또는 회원가입)
✅ 더존 Excel 파일 업로드
✅ "고급 분석 (10가지 기능 통합)" 버튼 확인

### 고급 분석 페이지
```
http://localhost:8080/advanced-analysis
```
✅ 당기/전기 파일 업로드 (드래그 앤 드롭)
✅ 10개 분석 메뉴 카드
✅ **벤포드 법칙 분석** (완성! 🎉)
✅ **계정별원장 AI 분석** (완성! ✨)
✅ 나머지 8개 (곧 출시 표시)

---

## 🔥 벤포드 법칙 분석 테스트

### 1단계: 파일 업로드
- 더존 계정별원장 Excel 파일 업로드
- 당기 파일만 있으면 됨

### 2단계: 분석 시작
1. "벤포드 법칙 분석" 메뉴 클릭
2. 계정과목 선택 (예: 매출, 외상매출금)
3. 금액 기준열 선택 (차변 또는 대변)
4. "분석 시작" 버튼 클릭

### 3단계: 결과 확인
- 📊 시각화 차트 (막대 그래프)
- 📈 상세 통계 테이블
- 🤖 AI 감사인 의견
- 🔍 숫자 클릭하여 상세 거래 확인
- 💾 엑셀 다운로드

**특징:**
- 첫 자리 수 분포 분석
- 벤포드 이론값과 실제값 비교
- 5% 이상 차이 시 빨간색 경고
- AI가 이상 징후 해석 및 감사 절차 제안

---

## ✨ 계정별원장 AI 분석 테스트

### 1단계: 메뉴 선택
"계정별원장 AI 분석" 클릭

### 2단계: 분석 설정
1. 계정과목 선택
2. 질문 입력 (또는 기본 질문 사용)
   - 예: "이 계정의 거래 내역을 요약하고, 특이사항이 있다면 알려주세요."
   - 예: "월별 패턴이 있나요?"
   - 예: "가장 큰 거래 10개를 분석해주세요."

### 3단계: AI 분석 실행
"AI 분석 시작" 버튼 클릭

### 4단계: 결과 확인
- 🤖 Gemini 2.5 Flash AI 분석
- 📝 한국어로 명확한 설명
- 📊 구조화된 분석 결과

---

## 🛠️ 환경 변수 설정 (선택사항)

AI 분석 기능을 사용하려면 Supabase 설정이 필요합니다.

프로젝트 루트에 `.env` 파일 생성:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**참고:** 
- Supabase 없이도 UI 확인은 가능합니다
- AI 분석 기능만 Supabase 연결 필요

---

## 📁 주요 파일 위치

```
/workspace/
├── src/
│   ├── pages/
│   │   ├── Index.tsx                      ← 메인 페이지
│   │   └── AdvancedLedgerAnalysis.tsx     ← 고급 분석 페이지 (신규!)
│   ├── components/
│   │   ├── BenfordAnalysis.tsx            ← 벤포드 분석 (신규!)
│   │   ├── AnalysisPanel.tsx              ← 기존 AI 분석
│   │   └── FileUpload.tsx                 ← 파일 업로드
│   └── App.tsx                            ← 라우팅 설정
└── supabase/functions/analyze-ledger/
    └── index.ts                           ← Edge Function (업데이트됨)
```

---

## 🎨 UI 특징

### 디자인
- ✅ shadcn/ui 컴포넌트
- ✅ Tailwind CSS
- ✅ 다크 모드 지원
- ✅ 반응형 디자인
- ✅ 드래그 앤 드롭

### 사용자 경험
- ✅ 직관적인 카드 레이아웃
- ✅ 명확한 로딩 상태
- ✅ 에러 메시지 토스트
- ✅ "완성" vs "곧 출시" 배지

---

## 🐛 문제 해결

### 포트가 이미 사용 중인 경우
```bash
# 다른 포트로 실행
npm run dev -- --port 3000
```

### 의존성 설치 오류
```bash
# 캐시 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

### 빌드 오류
```bash
# 타입 체크
npm run build

# 린트 확인
npm run lint
```

---

## 📊 빌드 정보

### 프로덕션 빌드
```bash
npm run build
```

결과:
```
✓ 1985 modules transformed
✓ 61.75 kB CSS (gzip: 10.91 kB)
✓ 1,174.61 kB JS (gzip: 368.94 kB)
```

### 빌드 미리보기
```bash
npm run preview
```

---

## 🎯 완성도

### ✅ 완성된 기능 (2개)
1. **벤포드 법칙 분석** - 100% 완성
2. **계정별원장 AI 분석** - 100% 완성

### 🔜 곧 출시 (8개)
3. 총계정원장 조회
4. 매입/매출 이중거래처 분석
5. 추정 손익 분석
6. 매출/판관비 월별 추이 분석
7. 전기 데이터 비교 분석
8. 상세 거래 검색
9. 감사 샘플링
10. 금감원 지적사례 기반 위험 분석

---

## 📚 추가 문서

- `README.md` - 프로젝트 개요
- `INTEGRATION_COMPLETE.md` - 통합 완료 가이드
- `GOOGLE_AI_STUDIO_INTEGRATION_PLAN.md` - 통합 계획서
- `ANALYSIS_SUMMARY.md` - 프로젝트 분석

---

## 🎉 성공 확인

다음을 모두 확인하셨다면 성공입니다!

- ✅ 메인 페이지 표시
- ✅ "고급 분석" 버튼 보임
- ✅ /advanced-analysis 페이지 접근 가능
- ✅ 10개 메뉴 카드 표시
- ✅ 파일 업로드 드래그 앤 드롭 작동
- ✅ 벤포드 분석 실행 및 차트 표시
- ✅ AI 분석 실행 및 결과 표시

---

## 💡 팁

### 더존 Excel 파일이 없다면?
- 샘플 데이터로 UI만 확인 가능
- 각 분석 메뉴의 설명 확인 가능
- "곧 출시" 기능들의 UI 확인 가능

### 빠른 데모용
1. 아무 Excel 파일이나 업로드
2. UI 흐름 확인
3. 벤포드 분석 UI 확인
4. AI 분석 UI 확인

---

**즐거운 테스트 되세요! 🚀**

문제가 있으시면 GitHub Issues에 남겨주세요!

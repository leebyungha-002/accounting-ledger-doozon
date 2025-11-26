# 더존(DuoZon) 분개장 분석 시스템

더존 ERP의 분개장 데이터를 분석하는 웹 애플리케이션입니다.

## 📋 프로젝트 정보

**Lovable URL**: https://lovable.dev/projects/0ebf0f9d-7a2b-4470-af80-906c3b83603f

## ✨ 주요 기능

### 1. 파일 업로드
- Excel 파일(.xlsx, .xls) 업로드
- 여러 시트의 데이터 자동 통합
- Supabase에 자동 저장

### 2. 이중/상계 거래처 분석
- 차변/대변 계정에서 공통 거래처 검색
- 계정별 금액 합계 표시
- Excel 다운로드

### 3. 월별 손익분석
- 판매비와관리비 월별 집계
- 연간 추세 분석
- Excel 다운로드

### 4. 통계적 샘플링
- 무작위/체계적/금액가중(MUS) 샘플링
- 위험계수 기반 샘플 크기 계산
- 신뢰수준별 통계표 제공

### 5. AI 분석
- 추세 분석
- 이상 거래 탐지
- 차대 균형 분석
- 재무 인사이트

## 🛠 기술 스택

- **프론트엔드**: React 18, TypeScript, Vite
- **UI**: Tailwind CSS, shadcn-ui
- **백엔드**: Supabase (인증, 데이터베이스, Edge Functions)
- **AI**: Google Gemini 2.5 Flash
- **라이브러리**: React Query, xlsx, React Markdown

## 🚀 시작하기

### 필수 요구사항
- Node.js 18 이상
- npm 또는 yarn

### 설치 및 실행

```bash
# 저장소 클론
git clone <YOUR_GIT_URL>

# 프로젝트 디렉토리로 이동
cd <YOUR_PROJECT_NAME>

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview
```

### 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 Supabase 설정을 추가하세요:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 📝 코드 수정 방법

### Lovable 사용
[Lovable 프로젝트](https://lovable.dev/projects/0ebf0f9d-7a2b-4470-af80-906c3b83603f)에 접속하여 프롬프트로 수정할 수 있습니다.

### 로컬 IDE 사용
선호하는 IDE(VS Code, WebStorm 등)로 코드를 수정하고 push하면 Lovable에도 자동으로 반영됩니다.

## 💾 작업 저장 (Git 커밋)

프로젝트 종료 시 변경사항을 자동으로 커밋하여 작업 내용을 안전하게 저장할 수 있습니다.

### 자동 커밋 스크립트 사용

**Windows (배치 파일):**
```bash
# 프로젝트 루트 디렉토리에서 실행
commit-changes.bat
```

**PowerShell:**
```bash
# 프로젝트 루트 디렉토리에서 실행
.\commit-changes.ps1
```

### 수동 커밋

```bash
# 변경사항 확인
git status

# 모든 변경사항 추가
git add .

# 커밋 (날짜/시간이 자동으로 포함됨)
git commit -m "작업 저장: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# 원격 저장소에 푸시 (선택사항)
git push
```

### 주의사항

- **프로젝트 종료 전 반드시 커밋**: 작업 내용이 손실되지 않도록 매일 작업 종료 시 커밋하세요.
- **의미 있는 커밋 메시지**: 자동 커밋 외에도 중요한 변경사항은 구체적인 메시지와 함께 커밋하세요.
- **정기적인 푸시**: 로컬 커밋을 정기적으로 원격 저장소에 푸시하여 백업하세요.

### GitHub에서 직접 수정
- 파일로 이동
- 우측 상단의 "Edit" 버튼(연필 아이콘) 클릭
- 수정 후 커밋

### GitHub Codespaces 사용
- 저장소 메인 페이지에서 "Code" 버튼 클릭
- "Codespaces" 탭 선택
- "New codespace" 클릭하여 클라우드 개발 환경 시작

## 🌐 배포

[Lovable](https://lovable.dev/projects/0ebf0f9d-7a2b-4470-af80-906c3b83603f)에서 Share → Publish를 클릭하여 배포할 수 있습니다.

### 커스텀 도메인 연결
Project > Settings > Domains로 이동하여 Connect Domain을 클릭하세요.

자세한 내용: [커스텀 도메인 설정 가이드](https://docs.lovable.dev/features/custom-domain#custom-domain)

## 📚 상세 문서

프로젝트의 상세 분석과 개선 권장사항은 [ANALYSIS_SUMMARY.md](./ANALYSIS_SUMMARY.md)를 참고하세요.

## 🔒 보안

- 환경 변수는 절대 커밋하지 마세요
- `.env` 파일은 `.gitignore`에 포함되어 있습니다
- Supabase RLS(Row Level Security) 정책이 활성화되어 있습니다

## 📄 라이선스

이 프로젝트는 Lovable을 통해 생성되었습니다.

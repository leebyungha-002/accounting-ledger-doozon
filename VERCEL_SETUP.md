# 🚀 Vercel 자동 배포 설정 가이드

## 왜 Vercel?

- ✅ Git pull 필요 없음!
- ✅ npm run dev 필요 없음!
- ✅ 웹 URL로 바로 확인
- ✅ 완전 무료
- ✅ 자동 HTTPS
- ✅ 글로벌 CDN

---

## 🔧 설정 방법 (5분)

### 1단계: Vercel 가입
1. https://vercel.com 방문
2. **"Sign Up"** 클릭
3. **"Continue with GitHub"** 선택
4. GitHub 계정으로 로그인

### 2단계: 프로젝트 연결
1. 대시보드에서 **"Add New Project"** 클릭
2. **"Import Git Repository"** 선택
3. `accounting-ledger-analysis` 저장소 선택
4. **"Import"** 클릭

### 3단계: 설정
**Framework Preset:** Vite 선택 (자동 감지됨)

> 💡 **참고**: 프로젝트에 `vercel.json` 파일이 포함되어 있어서 대부분의 설정이 자동으로 감지됩니다.

**Build Command:**
```
npm run build
```

**Output Directory:**
```
dist
```

**Install Command:**
```
npm install
```

**Root Directory:** (필요한 경우)
```
./
```

### 4단계: 환경 변수 (선택사항)
이 프로젝트는 Google Gemini API를 사용하며, API 키는 **클라이언트 사이드에서 localStorage에 저장**됩니다.

따라서 **환경 변수 설정이 필요하지 않습니다!** ✅

사용자가 웹 인터페이스에서 직접 API 키를 입력하면 됩니다.

> 💡 Supabase를 사용한다면 (현재는 사용하지 않음):
> ```
> VITE_SUPABASE_URL=your_supabase_url
> VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
> ```

### 5단계: 배포!
**"Deploy"** 버튼 클릭!

---

## 🎉 완료!

### 배포 URL:
```
https://accounting-ledger-analysis.vercel.app
```
(실제 URL은 프로젝트명에 따라 다름)

---

## 🔄 이후 작업 흐름

### Cursor(저)가 코드 수정:
```
1. 코드 작성
2. git commit
3. git push
```

### Vercel 자동:
```
1. 변경 감지 (즉시)
2. 빌드 시작 (자동)
3. 배포 완료 (2-3분)
```

### 사용자:
```
1. URL 새로고침!
2. 끝!
```

---

## 📱 어디서나 접근

- ✅ 데스크톱
- ✅ 노트북
- ✅ 태블릿
- ✅ 스마트폰
- ✅ 회사/집 어디서나

---

## 🔔 알림 설정 (선택사항)

Vercel 대시보드에서:
- 배포 성공 시 이메일 알림
- 배포 실패 시 이메일 알림

---

## 🎯 장점

1. **git pull 불필요**
   - 웹에서 바로 최신 버전 확인

2. **npm 설치 불필요**
   - 로컬 환경 설정 필요 없음

3. **서버 실행 불필요**
   - 항상 온라인

4. **자동 HTTPS**
   - 보안 연결 자동

5. **빠른 속도**
   - 글로벌 CDN

---

## 🐛 문제 해결

### 배포 실패 시:
1. Vercel 대시보드의 **"Deployments"** 탭
2. 실패한 배포 클릭
3. 로그 확인

### 환경 변수 변경 시:
1. 프로젝트 **Settings** → **Environment Variables**
2. 변경
3. **Redeploy** 클릭

---

## 💰 비용

**완전 무료:**
- 무제한 배포
- 무제한 대역폭
- 1개 팀
- HTTPS 포함
- 개인 프로젝트는 영구 무료!

---

## 🔗 유용한 링크

- Vercel 대시보드: https://vercel.com/dashboard
- 문서: https://vercel.com/docs
- 지원: https://vercel.com/support

---

**설정 완료 후 URL을 저장해두세요!**

그러면 앞으로는:
- ✅ 제가 "완료했습니다" 알림
- ✅ URL 새로고침
- ✅ 끝!

**git pull 필요 없습니다!** 🎉

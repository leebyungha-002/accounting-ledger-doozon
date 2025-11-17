# 🌐 로컬호스트 접근 방법

## 현재 상황
- ✅ 개발 서버 실행 중: http://localhost:8080/
- ✅ 프로세스 ID: 실행 중
- ❌ 직접 localhost 접근 불가 (Cursor 원격 환경)

---

## ✅ Cursor에서 접근하는 방법

### 1단계: PORTS 탭 찾기

Cursor 창을 보시면:

```
┌─────────────────────────────────────────┐
│                                         │
│        (여기가 코드 편집기)              │
│                                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ PROBLEMS | OUTPUT | DEBUG CONSOLE       │
│ ► TERMINAL | ► PORTS | ► COMPOSER       │  ← 여기!
└─────────────────────────────────────────┘
```

### 2단계: PORTS 탭 클릭

"PORTS" 탭을 클릭하면 이런 화면이 나옵니다:

```
PORT    ADDRESS          ACTION
8080    localhost:8080   🌐 Open in Browser
8081    localhost:8081   🌐 Open in Browser
```

### 3단계: "Open in Browser" 클릭

- 8080 포트 옆의 "🌐 Open in Browser" 버튼 클릭
- 또는 포트 번호 우클릭 → "Open in Browser"

---

## 🚀 빠른 테스트 URL

Cursor가 자동으로 생성한 URL (예시):
```
https://8080-your-workspace.cursor.sh/
```

이 URL이 자동으로 브라우저에서 열립니다!

---

## 💻 또는 로컬 컴퓨터에서 실행

Cursor 환경 대신 로컬에서 직접 실행하려면:

```bash
# 새 터미널에서
cd /path/to/your/workspace
npm run dev
```

그러면 바로:
- http://localhost:8080/ ← 접근 가능!

---

## 📍 테스트할 페이지

### 1. 메인 페이지
```
http://localhost:8080/
```
- 파일 업로드
- "고급 분석 (10가지 기능 통합)" 버튼 확인

### 2. 고급 분석 페이지
```
http://localhost:8080/advanced-analysis
```
- 당기/전기 파일 업로드
- 10개 분석 메뉴 카드
- 벤포드 법칙 분석
- 계정별원장 AI 분석

---

## ❓ 여전히 접근 안 되면?

### 체크리스트:

- [ ] Cursor 하단에 "PORTS" 탭이 보이나요?
- [ ] 8080 포트가 목록에 있나요?
- [ ] 개발 서버가 실행 중인가요? (터미널 확인)
- [ ] 방화벽이 포트를 차단하고 있지 않나요?

### 해결 방법:

1. **개발 서버 재시작**
   ```bash
   # Ctrl+C로 중지 후
   npm run dev
   ```

2. **다른 포트 사용**
   ```bash
   npm run dev -- --port 3000
   ```

3. **로컬에서 직접 실행**
   - 로컬 터미널 열기
   - 프로젝트 폴더로 이동
   - `npm run dev` 실행

---

## 🎉 성공 확인

브라우저에서 다음을 확인하세요:

- ✅ 로그인 화면 또는 메인 페이지 표시
- ✅ "고급 분석" 버튼이 보임
- ✅ /advanced-analysis 페이지 접근 가능
- ✅ 10개 분석 메뉴 카드 표시
- ✅ 파일 업로드 드래그 앤 드롭 작동

---

**도움이 필요하시면 Cursor UI의 스크린샷을 공유해주세요!**

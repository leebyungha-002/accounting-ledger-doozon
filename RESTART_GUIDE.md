# 🚀 서버 재시작 가이드

## 문제 상황
- Dialog가 나타나지 않음
- 콘솔에 로그가 없음

## 해결 방법

### 1단계: Git Bash에서 서버 완전히 종료

**방법 1: Ctrl + C**
```bash
Ctrl + C
```
(컨트롤 키와 C 키를 동시에 누르기)

**방법 2: 창 닫기**
- Git Bash 창을 완전히 닫기
- 다시 Git Bash 열기

### 2단계: 프로젝트 폴더로 이동

```bash
cd ~/Documents/accounting-ledger-analysis
```

### 3단계: 서버 다시 시작

```bash
npm run dev
```

**성공 메시지:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:8080/
```

### 4단계: 브라우저 새로고침 (중요!)

**Chrome/Edge:**
1. **Ctrl + Shift + R** (캐시 무시하고 새로고침)
2. 또는 **F12** → **Network 탭** → **Disable cache 체크** → **F5**

### 5단계: 로그인 후 테스트

1. `http://localhost:8080` 접속
2. 로그인
3. **주소창 확인**: `http://localhost:8080/analysis` 인지 확인!
4. 당기 파일 업로드
5. **F12** → **Console 탭** 확인

### 6단계: 콘솔에서 다음 메시지 확인

```
당기 파일 업로드 완료! Dialog를 표시합니다.
showPreviousDialog가 true로 설정되었습니다.
```

---

## 체크리스트

- [ ] Git Bash 서버 완전히 종료
- [ ] 프로젝트 폴더 확인
- [ ] npm run dev 실행
- [ ] "Local: http://localhost:8080/" 메시지 확인
- [ ] 브라우저에서 Ctrl + Shift + R
- [ ] 주소창이 /analysis 인지 확인
- [ ] F12 콘솔 열기
- [ ] 당기 파일 업로드
- [ ] 콘솔에서 로그 확인
- [ ] Dialog 나타나는지 확인

---

## 문제가 계속되면

다음 정보를 알려주세요:
1. Git Bash에서 `npm run dev` 실행 후 나오는 메시지 전체
2. 브라우저 주소창의 정확한 URL
3. 파일 업로드 후 화면 스크린샷
4. F12 콘솔의 전체 내용 (스크롤해서 모든 로그)

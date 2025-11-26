# 파일 복구 가이드

## 현재 상황
- 많은 파일이 수정되었지만 Git에 커밋되지 않은 상태입니다
- 최근 커밋: "API Key 설정 및 테스트 기능 추가" (커밋 해시: 55e4cd5)

## 복구 방법

### 방법 1: Git Stash (현재 변경사항 임시 저장)
현재 변경사항을 임시 저장하고 이전 상태로 되돌립니다:

```powershell
# 현재 변경사항을 임시 저장
git stash push -m "2025-11-26 작업 임시 저장"

# 이전 커밋 상태로 되돌리기
git reset --hard HEAD

# 나중에 저장된 내용 복구
git stash pop
```

### 방법 2: 특정 파일만 이전 버전으로 복구
특정 파일만 이전 커밋 상태로 되돌립니다:

```powershell
# 특정 파일을 이전 커밋 상태로 복구
git checkout HEAD -- src/services/geminiAnalysisService.ts
```

### 방법 3: Cursor 에디터의 로컬 히스토리 사용
1. Cursor에서 파일을 엽니다
2. 파일 탭에서 오른쪽 클릭 → "Timeline" 또는 "Local History" 선택
3. 원하는 시점의 버전을 선택하여 복구

### 방법 4: Git Diff로 변경사항 확인 후 선택적 복구
변경사항을 확인하고 필요한 부분만 유지:

```powershell
# 변경사항 확인
git diff src/services/geminiAnalysisService.ts

# 모든 변경사항 확인
git diff
```

## 주의사항
- Git stash를 사용하면 현재 작업 내용이 임시 저장되지만, 나중에 다시 적용해야 합니다
- `git reset --hard`는 현재 변경사항을 **완전히 삭제**합니다. 주의하세요!
- 복구 전에 백업을 권장합니다


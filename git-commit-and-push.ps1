# Git 커밋 및 Push 스크립트

Write-Host "=== Git 커밋 및 Push ===" -ForegroundColor Cyan
Write-Host ""

# 현재 디렉토리 확인
$currentDir = Get-Location
Write-Host "현재 디렉토리: $currentDir" -ForegroundColor Gray
Write-Host ""

# Git 저장소 확인
if (-not (Test-Path .git)) {
    Write-Host "오류: Git 저장소가 아닙니다." -ForegroundColor Red
    exit 1
}

# 변경사항 확인
Write-Host "변경사항 확인 중..." -ForegroundColor Cyan
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "커밋할 변경사항이 없습니다." -ForegroundColor Yellow
    exit 0
}

Write-Host "변경된 파일:" -ForegroundColor Green
git status --short
Write-Host ""

# 변경사항 추가
Write-Host "변경사항을 스테이징합니다..." -ForegroundColor Cyan
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "오류: git add 실패" -ForegroundColor Red
    exit 1
}

# 커밋 메시지
$commitMessage = @"
feat: 상대계정분석 및 일반사항분석 월별 합계 표시 기능 추가

- 상대계정분석: 계정명/건수/금액 클릭 시 월별 합계 박스 표시 (상세내역 위)
- 일반사항분석: 계정명/차변/대변 클릭 시 월별 합계 박스 표시 (상세내역 위)
- 전표번호 클릭 시 분개장 drill-down 및 엑셀 다운로드 기능 추가
- 월별 합계 엑셀 다운로드 기능 추가
- JSX 구조 오류 수정 (activeCard === 'general' 블록 닫기 태그)
- counterDrilldownRef 추가 (상대계정 드릴다운 스크롤)
- 포트 변경 (8080 → 8081)
- 배치파일 생성 및 수정
- 디버깅 로그 추가
"@

# 커밋
Write-Host "커밋을 생성합니다..." -ForegroundColor Cyan
git commit -m $commitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ 커밋이 완료되었습니다!" -ForegroundColor Green
    Write-Host ""
    
    # Push
    Write-Host "원격 저장소에 푸시합니다..." -ForegroundColor Cyan
    git push
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ Push가 완료되었습니다!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "✗ Push에 실패했습니다." -ForegroundColor Red
        Write-Host "원격 저장소 설정을 확인하세요." -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "✗ 커밋에 실패했습니다." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "완료!" -ForegroundColor Green

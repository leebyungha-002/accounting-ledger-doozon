# 자동 커밋 스크립트
# 프로젝트 종료 시 이 스크립트를 실행하여 변경사항을 커밋합니다.

Write-Host "=== Git 자동 커밋 스크립트 ===" -ForegroundColor Cyan
Write-Host ""

# Git 저장소 확인
if (-not (Test-Path .git)) {
    Write-Host "오류: Git 저장소가 아닙니다." -ForegroundColor Red
    exit 1
}

# 변경사항 확인
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
git add .

# 커밋 메시지 생성 (날짜와 시간 포함)
$date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMessage = "작업 저장: $date"

# 커밋
Write-Host "커밋을 생성합니다..." -ForegroundColor Cyan
git commit -m $commitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ 커밋이 완료되었습니다!" -ForegroundColor Green
    Write-Host "커밋 메시지: $commitMessage" -ForegroundColor Gray
    Write-Host ""
    Write-Host "원격 저장소에 푸시하려면 다음 명령을 실행하세요:" -ForegroundColor Yellow
    Write-Host "  git push" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "✗ 커밋에 실패했습니다." -ForegroundColor Red
    exit 1
}






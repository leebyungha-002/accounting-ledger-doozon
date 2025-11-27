# 어제 작업 복구 스크립트
# 실행하기 전에 이 스크립트를 확인하세요!

Write-Host "=== 어제 작업 복구 스크립트 ===" -ForegroundColor Yellow
Write-Host ""

# 1단계: 현재 변경사항 백업
Write-Host "1단계: 현재 작업 내용을 백업 중..." -ForegroundColor Cyan
$backupName = "백업_$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
git stash push -u -m $backupName

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ 백업 완료: $backupName" -ForegroundColor Green
    Write-Host ""
    
    # 2단계: 이전 커밋 상태로 복구 확인
    Write-Host "2단계: 이전 커밋 상태로 복구하시겠습니까?" -ForegroundColor Yellow
    Write-Host "  현재 변경사항은 백업되어 있습니다." -ForegroundColor Gray
    Write-Host ""
    $confirm = Read-Host "계속하시겠습니까? (Y/N)"
    
    if ($confirm -eq 'Y' -or $confirm -eq 'y') {
        Write-Host ""
        Write-Host "이전 커밋 상태로 복구 중..." -ForegroundColor Cyan
        
        # 수정된 파일들만 이전 상태로 복구 (새 파일은 유지)
        git reset --hard HEAD
        
        Write-Host "✓ 복구 완료!" -ForegroundColor Green
        Write-Host ""
        Write-Host "백업된 내용을 복구하려면 다음 명령을 실행하세요:" -ForegroundColor Yellow
        Write-Host "  git stash list" -ForegroundColor White
        Write-Host "  git stash apply stash@{0}" -ForegroundColor White
    } else {
        Write-Host "복구를 취소했습니다." -ForegroundColor Yellow
        Write-Host "백업만 완료되었습니다." -ForegroundColor Gray
    }
} else {
    Write-Host "✗ 백업 실패: 변경사항이 없거나 오류가 발생했습니다." -ForegroundColor Red
}

Write-Host ""
Write-Host "작업 완료!" -ForegroundColor Green






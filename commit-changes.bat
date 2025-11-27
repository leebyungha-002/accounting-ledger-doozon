@echo off
REM 자동 커밋 배치 파일
REM 프로젝트 종료 시 이 파일을 더블클릭하여 변경사항을 커밋합니다.

echo === Git 자동 커밋 스크립트 ===
echo.

REM PowerShell 스크립트 실행
powershell.exe -ExecutionPolicy Bypass -File "%~dp0commit-changes.ps1"

pause







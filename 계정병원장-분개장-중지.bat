@echo off
chcp 65001 >nul
echo ========================================
echo   계정병원장 및 분개장 분석 시스템
echo   개발 서버 종료 중...
echo ========================================
echo.

cd /d "%~dp0"

REM Node.js 프로세스 종료
echo Node.js 프로세스를 확인하고 종료합니다...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Node.js 프로세스를 종료합니다...
    taskkill /F /IM node.exe >NUL 2>&1
    timeout /t 2 >NUL
    echo.
    echo ========================================
    echo   모든 Node.js 프로세스가 종료되었습니다.
    echo ========================================
) else (
    echo.
    echo ========================================
    echo   실행 중인 Node.js 프로세스가 없습니다.
    echo ========================================
)
echo.
echo 이 창은 3초 후 자동으로 닫힙니다...
timeout /t 3 /nobreak >nul

@echo off
chcp 65001 >nul
echo ========================================
echo   개발 서버 시작 중...
echo ========================================
echo.

cd /d "%~dp0"

REM 기존 Node.js 프로세스 종료
echo [1/3] 기존 Node.js 프로세스 확인 중...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo 기존 Node.js 프로세스를 종료합니다...
    taskkill /F /IM node.exe >NUL 2>&1
    timeout /t 2 >NUL
    echo 기존 프로세스 종료 완료.
) else (
    echo 실행 중인 Node.js 프로세스가 없습니다.
)
echo.

REM node_modules 확인
echo [2/3] 의존성 확인 중...
if not exist "node_modules" (
    echo node_modules가 없습니다. npm install을 실행합니다...
    call npm install
    if errorlevel 1 (
        echo 오류: npm install 실패
        pause
        exit /b 1
    )
) else (
    echo 의존성이 설치되어 있습니다.
)
echo.

REM 개발 서버 시작
echo [3/3] 개발 서버 시작 중...
echo.
echo ========================================
echo   서버가 시작되면 브라우저에서
echo   http://localhost:8080/analysis 를 자동으로 열어줍니다
echo ========================================
echo.
echo 서버를 종료하려면 Ctrl+C를 누르세요.
echo.

REM npm run dev를 별도 PowerShell 창에서 시작
echo 새 창에서 개발 서버를 시작합니다...
start "개발 서버" powershell -NoExit -Command "cd '%~dp0'; npm run dev"

REM 서버가 시작될 때까지 대기 (20초로 증가)
echo.
echo 서버 시작을 기다리는 중 (약 20초)...
timeout /t 20 /nobreak >nul

REM 브라우저에서 /analysis 경로 자동으로 열기
echo.
echo 브라우저를 열고 있습니다...
REM 여러 방법으로 브라우저 열기 시도
start "" "http://localhost:8080/analysis" 2>nul
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8080/analysis" 2>nul

echo.
echo ========================================
echo   브라우저가 열렸습니다!
echo   서버는 별도 창에서 실행 중입니다.
echo   서버를 종료하려면 "개발 서버" 창에서 Ctrl+C를 누르세요
echo ========================================
echo.
echo 이 창은 5초 후 자동으로 닫힙니다...
timeout /t 5 /nobreak >nul


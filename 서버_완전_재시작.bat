@echo off
chcp 65001 >nul
echo ========================================
echo   서버 완전 재시작 (포트 정리)
echo ========================================
echo.

cd /d "%~dp0"

REM 1. 모든 Node.js 프로세스 강제 종료
echo [1/4] 모든 Node.js 프로세스 종료 중...
taskkill /F /IM node.exe >NUL 2>&1
if errorlevel 1 (
    echo 실행 중인 Node.js 프로세스가 없습니다.
) else (
    echo 모든 Node.js 프로세스가 종료되었습니다.
)
timeout /t 2 >NUL
echo.

REM 2. Vite 캐시 삭제
echo [2/4] Vite 캐시 삭제 중...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite" >NUL 2>&1
    echo node_modules\.vite 캐시 삭제 완료.
) else (
    echo node_modules\.vite 캐시가 없습니다.
)
if exist ".vite" (
    rmdir /s /q ".vite" >NUL 2>&1
    echo .vite 캐시 삭제 완료.
) else (
    echo .vite 캐시가 없습니다.
)
if exist "dist" (
    rmdir /s /q "dist" >NUL 2>&1
    echo dist 폴더 삭제 완료.
) else (
    echo dist 폴더가 없습니다.
)
echo.

REM 3. 포트 확인
echo [3/4] 포트 사용 확인 중...
netstat -ano | findstr ":8081 :8082" >NUL 2>&1
if errorlevel 1 (
    echo 포트 8081, 8082가 사용 가능합니다.
) else (
    echo 경고: 포트 8081 또는 8082가 사용 중입니다.
    netstat -ano | findstr ":8081 :8082"
)
echo.

REM 4. 개발 서버 시작
echo [4/4] 개발 서버 시작 중...
echo.
echo ========================================
echo   포트 8081에서 서버를 시작합니다.
echo   브라우저에서 http://localhost:8081/analysis 접속하세요.
echo ========================================
echo.
echo 서버를 종료하려면 Ctrl+C를 누르세요.
echo.

start "개발 서버 (포트 8081)" powershell -NoExit -Command "cd '%~dp0'; npm run dev"

echo.
echo ========================================
echo   서버가 시작되었습니다!
echo   브라우저에서 http://localhost:8081/analysis 를 열어주세요.
echo   (브라우저 캐시를 지우려면 Ctrl+Shift+R 또는 Ctrl+F5를 누르세요)
echo ========================================
echo.
echo 이 창은 5초 후 자동으로 닫힙니다...
timeout /t 5 /nobreak >nul

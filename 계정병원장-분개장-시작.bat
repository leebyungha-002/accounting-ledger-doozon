@echo off
chcp 65001 >nul
echo ========================================
echo   계정병원장 및 분개장 분석 시스템
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

REM [3/3] 자동화 시스템 시작
echo [3/3] task_list 기반 자동화 시스템을 시작합니다...
echo.

REM npm run dev를 실행하여 안티그래비티 엔진을 깨웁니다.
REM %1은 실행 시 입력한 회사명(예: Braintree)을 프로그램에 전달합니다.
call npm run dev %1

echo.
echo ========================================
echo   모든 작업이 완료되었습니다!
echo   결과물은 각 회사 폴더의 raw_data를 확인하세요.
echo ========================================
pause
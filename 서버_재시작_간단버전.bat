@echo off
chcp 65001 >nul
cd /d "%~dp0"
taskkill /F /IM node.exe >NUL 2>&1
timeout /t 2 >NUL
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite" >NUL 2>&1
if exist ".vite" rmdir /s /q ".vite" >NUL 2>&1
start "개발 서버" cmd /k "npm run dev"
echo 서버가 시작되었습니다. http://localhost:8081/analysis 접속하세요.
timeout /t 3 >nul

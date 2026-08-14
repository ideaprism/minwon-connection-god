@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   민원 연결의 神 - KIPI COMPLAINT MASTER
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo        https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo 처음 실행이라 패키지를 내려받습니다. 몇 분 걸릴 수 있습니다...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [오류] 패키지 설치에 실패했습니다. 인터넷 연결을 확인하세요.
        pause
        exit /b 1
    )
)

echo 서버를 켭니다. 잠시 후 브라우저가 열립니다.
echo 종료하려면 이 창에서 Ctrl+C 를 누르거나 창을 닫으세요.
echo.

start "" http://localhost:5173
call npm run dev

pause

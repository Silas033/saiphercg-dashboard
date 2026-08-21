@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Saipher CG Local Dashboard
echo ========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js / npm was not found on this computer.
    echo Install Node.js first, then run this file again.
    pause
    exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
    echo First-time setup: installing dashboard packages...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed. Review the error above.
        pause
        exit /b 1
    )
)

if not exist "dist\index.html" (
    echo Building the dashboard for first use...
    call npm run build
    if errorlevel 1 (
        echo.
        echo Dashboard build failed. Review the error above.
        pause
        exit /b 1
    )
)

echo Starting local dashboard at http://127.0.0.1:4173
start "Saipher CG Dashboard Server" /min cmd /k "cd /d ""%~dp0"" && npm run start:local"

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173"
exit /b 0

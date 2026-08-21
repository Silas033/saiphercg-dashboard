@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Saipher CG Dashboard Setup
ECHO ========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js / npm was not found on this computer.
    echo Install Node.js first, then run this file again.
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo.
    echo npm install failed. Review the error above.
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo.
    echo Dashboard build failed. Review the error above.
    pause
    exit /b 1
)

echo.
echo Setup complete.
echo You can now use start-dashboard.bat for normal daily use.
pause

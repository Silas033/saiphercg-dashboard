@echo off
setlocal
cd /d "%~dp0"

echo Rebuilding Saipher CG Dashboard...
call npm run build

if errorlevel 1 (
    echo.
    echo Build failed. Review the error above.
    pause
    exit /b 1
)

echo.
echo Dashboard build completed successfully.
pause

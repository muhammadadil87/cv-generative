@echo off
title Student CV Builder & Admin Portal
cd /d "%~dp0"

echo ========================================================
echo        STUDENT CV BUILDER & ADMIN PORTAL
echo ========================================================
echo.
echo Starting application server...
echo Local URL: http://localhost:5000
echo.
echo Default Admin Login:
echo   Email:    admin@university.edu
echo   Password: Admin@123456
echo ========================================================
echo.

:: Automatically open browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5000"

:: Start the Node.js server
node server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server encountered an issue and stopped.
    pause
)

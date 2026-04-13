@echo off
REM ============================================
REM Attendance System - Windows PM2 Setup
REM Run this ONCE to set up auto-starting services
REM ============================================

echo.
echo ============================================
echo   Attendance System - Windows PM2 Setup
echo ============================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script must run as Administrator!
    echo.
    echo To fix:
    echo 1. Right-click this file
    echo 2. Select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

REM Change to script directory
cd /d %~dp0

REM ============================================
REM Step 1: Install PM2 globally
REM ============================================
echo [*] Checking PM2 installation...
npm list -g pm2 >nul 2>&1
if errorlevel 1 (
    echo [*] Installing PM2 globally (this may take a minute)...
    call npm install -g pm2
    if errorlevel 1 (
        echo [ERROR] Failed to install PM2
        echo Make sure Node.js is installed: https://nodejs.org
        pause
        exit /b 1
    )
)
echo [OK] PM2 is ready

REM ============================================
REM Step 2: Create logs directory
REM ============================================
if not exist "logs" (
    mkdir logs
    echo [OK] Created logs directory
)

REM ============================================
REM Step 3: Install Backend Dependencies
REM ============================================
echo.
echo [*] Installing backend dependencies...
cd backend
call npm install
if errorlevel 1 (
    echo [ERROR] Backend installation failed
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] Backend ready

REM ============================================
REM Step 4: Install Frontend Dependencies
REM ============================================
echo.
echo [*] Installing frontend dependencies...
cd frontend
call npm install
if errorlevel 1 (
    echo [ERROR] Frontend installation failed
    cd ..
    pause
    exit /b 1
)
cd ..
echo [OK] Frontend ready

REM ============================================
REM Step 5: Setup Python Virtual Environment
REM ============================================
echo.
echo [*] Setting up Python environment...
cd face-service

if not exist ".venv" (
    echo   Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create Python virtual environment
        echo Make sure Python 3.9+ is installed: https://www.python.org
        cd ..
        pause
        exit /b 1
    )
)

echo   Installing Python dependencies...
call .venv\Scripts\activate.bat
pip install -q --upgrade pip
pip install -q -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Python dependencies installation failed
    deactivate
    cd ..
    pause
    exit /b 1
)
deactivate
cd ..
echo [OK] Face service ready

REM ============================================
REM Step 6: Start services with PM2
REM ============================================
echo.
echo [*] Starting services with PM2...
echo.

REM Stop any existing PM2 processes first
pm2 delete all >nul 2>&1

REM Start services
pm2 start ecosystem.config.js
if errorlevel 1 (
    echo [ERROR] Failed to start services
    echo Make sure ecosystem.config.js exists in project root
    pause
    exit /b 1
)

REM Wait a moment for services to start
timeout /t 3 /nobreak

REM ============================================
REM Step 7: Setup auto-startup on Windows reboot
REM ============================================
echo.
echo [*] Setting up auto-start on Windows reboot...
pm2 startup windows -u %USERNAME%
pm2 save
if errorlevel 1 (
    echo [WARNING] Could not set up auto-start
    echo You may need to run: pm2 startup windows
    echo And then: pm2 save
)

REM ============================================
REM Success Message
REM ============================================
echo.
echo ============================================
echo   [OK] Setup Complete!
echo ============================================
echo.
echo   Your services are now running:
echo.
echo   Frontend:        http://localhost:3000
echo   Backend API:     http://localhost:5000
echo   Face Service:    http://localhost:8000
echo.
echo ============================================
echo   Important Next Steps:
echo ============================================
echo.
echo   1. Services auto-start on Windows reboot
echo.
echo   2. View services anytime:
echo      pm2 list
echo.
echo   3. View logs anytime:
echo      pm2 logs
echo.
echo   4. Stop/start services:
echo      pm2 stop all
echo      pm2 start all
echo.
echo   5. Change default admin password!
echo      Login with: admin / Admin@1234
echo.
echo ============================================
echo.
pause

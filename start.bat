@echo off
REM RAAS DANDIYA Event System - Complete Startup Script for Windows

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║      RAAS DANDIYA Event Ticketing System - Startup         ║
echo ║                    Production Ready v1.0                  ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if Node.js is installed
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    echo Download from: https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%a in ('node -v') do set NODE_VERSION=%%a
echo ✓ Node.js version: %NODE_VERSION%
echo.

REM Check if .env file exists
if not exist ".env" (
    echo ⚠️  .env file not found!
    echo 📋 Creating .env from .env.example...
    
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo ✓ .env created from template
        echo.
        echo ⚠️  IMPORTANT: Please edit .env with your Cashfree sandbox credentials:
        echo    - CLIENT_ID
        echo    - CLIENT_SECRET
        echo.
        echo    Get these from: https://dashboard.cashfree.com
        echo.
        pause
    ) else (
        echo ❌ .env.example not found
        exit /b 1
    )
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo ✓ Dependencies installed
    echo.
)

REM Start the payment server
echo 🚀 Starting Payment Server...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo Server will run on: http://localhost:3000
echo.
echo IMPORTANT:
echo 1. Keep this terminal open
echo 2. Open another terminal window (Command Prompt or PowerShell)
echo 3. Run this command to start frontend:
echo    python -m http.server 5500
echo    (or use: py -m http.server 5500)
echo.
echo 4. Access the app at: http://localhost:5500
echo.
echo TEST CREDENTIALS:
echo Card: 4111111111111111
echo OTP: Any 6 digits
echo.
echo Press Ctrl+C to stop the server
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

call npm start

pause

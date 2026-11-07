@echo off
echo.
echo   INDI AI - Your AI. Your PC. Your rules.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   ! Node.js 18+ is required: https://nodejs.org
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo   Created .env - add at least 2 API keys, then run this script again.
  exit /b 0
)

if not exist node_modules (
  echo   Installing dependencies...
  call npm install
)

echo   Starting INDI AI...
call npm run local

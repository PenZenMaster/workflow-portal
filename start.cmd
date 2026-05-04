@echo off
REM Double-click to start the Workflow Portal locally.
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies for the first time...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. See CLAUDE.md Troubleshooting section.
    pause
    exit /b 1
  )
)

echo.
echo Starting Workflow Portal at http://localhost:5000
echo Press Ctrl+C to stop.
echo.

call npm run dev
pause

@echo off
title M3E Canvas - desktop
cd /d "%~dp0"

echo ==============================================
echo   M3E Canvas  -  desktop (Electron)
echo   Stop : close the app window
echo ==============================================
echo.

if not exist "node_modules\" (
  echo First run: installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

set NEEDBUILD=0
if "%~1"=="rebuild" set NEEDBUILD=1
if not exist "out\index.html" set NEEDBUILD=1
if not exist "dist-electron\main.js" set NEEDBUILD=1

if "%NEEDBUILD%"=="1" (
  echo Building renderer + electron shell...
  call npm run build || goto :fail
  call npm run build:electron || goto :fail
) else (
  rem renderer is cached, but the electron shell is cheap to rebuild and
  rem must never go stale - it carries the window icon and mirror changes
  call npm run build:electron || goto :fail
)
echo.

echo Starting M3E Canvas...
call npx electron .
echo.
echo App closed.
pause
exit /b 0

:fail
echo.
echo Build failed - see the errors above.
pause
exit /b 1

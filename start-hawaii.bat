@echo off
chcp 65001 >nul
title Hawaii (close this window to quit)
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] Node.js not found. Please install Node.js 20 or newer, then try again.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0scripts\launch.mjs" (
  echo.
  echo   [X] scripts\launch.mjs is missing. Please restore it from the project backup.
  echo.
  pause
  exit /b 1
)

node "%~dp0scripts\launch.mjs"

echo.
pause

@echo off
chcp 65001 >nul
title OutputMaster (close this window to quit)
cd /d "C:\Users\14009\Desktop\refining-product-features-and-ux (1)"
echo Starting OutputMaster, browser will open in a few seconds...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:3000"
call npm start
echo.
echo Server stopped. Press any key to close.
pause >nul

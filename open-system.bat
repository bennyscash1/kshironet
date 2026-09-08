@echo off
chcp 65001 >nul
title Certifications System - 228
cd /d "%~dp0"

echo Checking if the system is already running...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo Already running.
    goto openbrowser
)

echo Starting the system, please wait...
call npm install --no-audit --no-fund >nul 2>&1
start "Certifications System - Server" /min cmd /c "npm run dev"

set count=0
:waitloop
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 goto openbrowser
set /a count+=1
if %count% lss 40 goto waitloop

echo The system did not start in time. Please try again.
pause
exit /b 1

:openbrowser
start http://localhost:3000
exit

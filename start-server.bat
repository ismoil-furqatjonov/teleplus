@echo off
title TelePulse Web & AI Content Moderation Server
echo ===============================================================
echo  TelePulse Server & AI Moderation ishga tushirilmoqda...
echo ===============================================================

REM 1. Tekshiramiz: node PATH ichida bormi?
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    node "%~dp0server.js"
    goto end
)

REM 2. Tekshiramiz: mahalliy portable node bormi?
if exist "%USERPROFILE%\.local\node\node.exe" (
    "%USERPROFILE%\.local\node\node.exe" "%~dp0server.js"
    goto end
)

REM 3. Fallback: PowerShell Zero-Admin server
echo Node topilmadi, PowerShell server orqali ishga tushirilmoqda...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"

:end
pause

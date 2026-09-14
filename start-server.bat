@echo off
title TelePulse Windows HTTP Server
echo TelePulse Server ishga tushirilmoqda...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause

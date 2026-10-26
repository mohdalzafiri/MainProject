@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-to-pc-server.ps1"
echo.
echo Press any key to close.
pause >nul

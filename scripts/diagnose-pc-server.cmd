@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-pc-server.ps1"
echo.
echo Diagnostic saved. Press any key to close.
pause >nul

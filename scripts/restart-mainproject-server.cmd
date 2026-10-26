@echo off
title Restart MainProject Server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "G:\Database\RESTART_NODE_SAFE.ps1"
if errorlevel 1 (
  echo.
  echo Restart failed. Review the message above.
  pause
  exit /b 1
)
echo.
echo The server process exited. Review the message above.
pause

@echo off
setlocal
title Install MainProject Restart Launcher
set "SOURCE=G:\Database\RESTART_MAINPROJECT_SERVER.cmd"
set "TARGET=%USERPROFILE%\Desktop\Restart MainProject Server.cmd"

if /I not "%COMPUTERNAME%"=="PC-SERVER" (
  echo ERROR: Run this installer on PC-SERVER.
  pause
  exit /b 1
)

if not exist "%SOURCE%" (
  echo ERROR: Restart launcher was not found:
  echo %SOURCE%
  pause
  exit /b 1
)

copy /Y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 (
  echo ERROR: Could not create the desktop launcher.
  pause
  exit /b 1
)

echo Desktop launcher created:
echo %TARGET%
echo.
echo Restarting MainProject now. Keep the next window open.
start "" "%TARGET%"
exit /b 0

@echo off
setlocal

set "START_SCRIPT=%~dp0START_CENTRAL_SERVER_WINDOWS7.bat"
reg.exe add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MainProjectApi" /t REG_SZ /d "%START_SCRIPT%" /f
if errorlevel 1 (
  echo Failed to configure automatic startup.
  pause
  exit /b 1
)

start "MainProject Server" /min cmd.exe /c call "%START_SCRIPT%"
echo Central server startup installed and launched.
exit /b 0
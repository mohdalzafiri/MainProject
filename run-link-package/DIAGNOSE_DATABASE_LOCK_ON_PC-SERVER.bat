@echo off
chcp 65001 >nul
setlocal
title Diagnose MainProject database lock

set "REPORT=G:\Database\database-lock-report.txt"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator permission...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

(
  echo MainProject database lock report
  echo Computer: %COMPUTERNAME%
  echo Date: %DATE% %TIME%
  echo.
  echo ===== SMB SESSIONS =====
  powershell.exe -NoProfile -Command "Get-SmbSession | Format-List ClientComputerName,ClientUserName,NumOpens"
  net session
  echo.
  echo ===== OPEN DATABASE FILES =====
  powershell.exe -NoProfile -Command "Get-SmbOpenFile | Where-Object { $_.Path -like '*database.db*' } | Format-List FileId,ClientComputerName,ClientUserName,Path"
  net file
) > "%REPORT%" 2>&1

echo Report created:
echo %REPORT%
pause
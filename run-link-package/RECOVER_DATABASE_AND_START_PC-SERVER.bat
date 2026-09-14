@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Recover MainProject database and start server

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator permission...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

if /I not "%COMPUTERNAME%"=="PC-SERVER" (
  echo ERROR: Run this file directly on PC-SERVER.
  pause
  exit /b 1
)

set "PROJECT_DIR=G:\Database\MainProject.Api"
set "NODE_EXE=%PROJECT_DIR%\run-link-package\node\node.exe"
set "CURRENT_LOG=%PROJECT_DIR%\run-link-package\server-runtime-current.log"

if not exist "%NODE_EXE%" (
  echo ERROR: Portable Node was not found: %NODE_EXE%
  pause
  exit /b 1
)

echo Closing remote handles for the central SQLite database...
for /F "tokens=1,2" %%A in ('net file ^| findstr.exe /I /R "database.db database.db-wal database.db-shm"') do (
  echo Closing remote file ID %%A: %%B
  net file %%A /close >nul 2>&1
)

taskkill.exe /IM node.exe /T /F >nul 2>&1

set "NODE_SKIP_PLATFORM_CHECK=1"
set "DB_CLIENT=sqlite"
set "DB_PATH=G:\Database\database.db"
set "DB_BACKUP_DIR=G:\Database\Backups"
set "SQLITE_JOURNAL_MODE=WAL"
set "HOST=0.0.0.0"
set "PORT=5000"

del "%CURRENT_LOG%" >nul 2>&1
echo [%DATE% %TIME%] Recovering database and starting MainProject API> "%CURRENT_LOG%"
echo Keep this window open while using the program.
cd /d "%PROJECT_DIR%"
"%NODE_EXE%" server.js >> "%CURRENT_LOG%" 2>&1
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
echo ERROR: The server stopped with exit code %SERVER_EXIT%.
type "%CURRENT_LOG%"
echo.
pause
exit /b %SERVER_EXIT%
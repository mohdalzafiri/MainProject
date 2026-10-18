@echo off
chcp 65001 >nul
setlocal
title Restart MainProject API on PC-SERVER

set "PROJECT_DIR="
if exist "G:\Database\MainProject.Api\server.js" set "PROJECT_DIR=G:\Database\MainProject.Api"
if exist "%~dp0MainProject.Api\server.js" set "PROJECT_DIR=%~dp0MainProject.Api"
if exist "%~dp0..\server.js" set "PROJECT_DIR=%~dp0.."

if not defined PROJECT_DIR (
	echo ERROR: MainProject.Api could not be found at G:\Database\MainProject.Api or next to this file.
	pause
	exit /b 1
)

for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"
for %%I in ("%PROJECT_DIR%\..") do set "DATABASE_DIR=%%~fI"
set "NODE_EXE=%PROJECT_DIR%\run-link-package\node\node.exe"
set "LOCK_DIR=%DATABASE_DIR%\database.db.api-lock"
set "HEALTH_URL=http://127.0.0.1:5000/api/health"
set "CURRENT_LOG=%PROJECT_DIR%\run-link-package\server-runtime-current.log"
set "DB_CLIENT=sqlite"
set "DB_PATH=%DATABASE_DIR%\database.db"
set "DB_BACKUP_DIR=%DATABASE_DIR%\Backups"
set "SQLITE_JOURNAL_MODE=DELETE"
set "NODE_SKIP_PLATFORM_CHECK=1"
set "HOST=0.0.0.0"
set "PORT=5000"

if /I not "%COMPUTERNAME%"=="PC-SERVER" (
	echo ERROR: Run this file directly on PC-SERVER.
	echo Current computer: %COMPUTERNAME%
	pause
	exit /b 1
)

if not exist "%NODE_EXE%" (
	echo ERROR: Portable Node was not found:
	echo %NODE_EXE%
	pause
	exit /b 1
)

echo Stopping old Node processes...
taskkill.exe /IM node.exe /T /F >nul 2>&1

tasklist.exe /FI "IMAGENAME eq node.exe" 2>nul | findstr.exe /I /C:"node.exe" >nul
if not errorlevel 1 (
	echo ERROR: node.exe is still running. Close it from Task Manager as Administrator.
	pause
	exit /b 1
)

if exist "%LOCK_DIR%" rmdir /S /Q "%LOCK_DIR%"

echo Starting the central API server...
del "%CURRENT_LOG%" >nul 2>&1
echo [%DATE% %TIME%] Starting MainProject API> "%CURRENT_LOG%"
echo Keep this window open while using the program.
echo Runtime output: %CURRENT_LOG%
echo.
cd /d "%PROJECT_DIR%"
"%NODE_EXE%" server.js >> "%CURRENT_LOG%" 2>&1
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
echo ERROR: The server stopped with exit code %SERVER_EXIT%.
echo.
type "%CURRENT_LOG%"
echo.
pause
exit /b %SERVER_EXIT%
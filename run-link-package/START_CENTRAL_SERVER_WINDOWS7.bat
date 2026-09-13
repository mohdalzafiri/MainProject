@echo off
setlocal
cd /d "%~dp0.."

set "NODE_SKIP_PLATFORM_CHECK=1"
set "DB_CLIENT=sqlite"
set "DB_PATH=G:\Database\database.db"
set "DB_BACKUP_DIR=G:\Database\Backups"
set "SQLITE_JOURNAL_MODE=WAL"
set "HOST=0.0.0.0"
set "PORT=5000"
set "LOG=%~dp0server-runtime.log"

>> "%LOG%" echo [%DATE% %TIME%] Starting MainProject API from %CD%
>> "%LOG%" echo Database: %DB_PATH%
"%~dp0node\node.exe" --version >> "%LOG%" 2>&1
if errorlevel 1 (
	>> "%LOG%" echo Node runtime failed with exit code %ERRORLEVEL%.
	exit /b %ERRORLEVEL%
)

"%~dp0node\node.exe" server.js >> "%LOG%" 2>&1
>> "%LOG%" echo Server stopped with exit code %ERRORLEVEL%.
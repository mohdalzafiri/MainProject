@echo off
setlocal
cd /d "%~dp0.."

curl.exe --fail --silent --max-time 2 "http://localhost:5000/api/health" 2>nul | findstr /C:"\"status\":\"ok\"" >nul
if not errorlevel 1 exit /b 0

node server.js >> server-runtime.log 2>&1
@echo off
setlocal
cd /d "%~dp0.."

set "LOCAL_URL=http://localhost:5000"
set "CENTRAL_URL=http://PC-SERVER:5000"

call :is_ready "%LOCAL_URL%/api/health"
if not errorlevel 1 (
	call :open_url "%LOCAL_URL%/login.html"
	exit /b 0
)

call :is_ready "%CENTRAL_URL%/api/health"
if not errorlevel 1 (
	call :open_url "%CENTRAL_URL%/login.html"
	exit /b 0
)

start "MainProject Server" /MIN cmd /c "npm start"
for /L %%I in (1,1,90) do (
	call :is_ready "%LOCAL_URL%/api/health"
	if not errorlevel 1 (
		call :open_url "%LOCAL_URL%/login.html"
		exit /b 0
	)
	timeout /t 1 /nobreak >nul
)

echo تعذر تشغيل الخادم خلال 90 ثانية. راجع اتصال قاعدة البيانات المركزية.
pause
exit /b 1

:is_ready
curl.exe --fail --silent --max-time 2 "%~1" 2>nul | findstr /C:"\"status\":\"ok\"" >nul
exit /b

:open_url
if defined MAINPROJECT_NO_BROWSER exit /b 0
start "" "%~1"
exit /b 0

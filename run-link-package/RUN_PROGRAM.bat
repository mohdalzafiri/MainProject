@echo off
chcp 65001 >nul
setlocal
title MainProject

set "PUBLIC_URL=http://37.34.208.209:5000"

call :is_ready "%PUBLIC_URL%/api/health"
if not errorlevel 1 (
	echo.
	echo الموقع متاح
	call :open_url "%PUBLIC_URL%/login.html"
	timeout /t 2 /nobreak >nul
	exit /b 0
)

echo.
echo الموقع مغلق
echo تعذر الاتصال بالخادم المركزي: %PUBLIC_URL%
echo تحقق من اتصال الإنترنت أو تواصل مع مسؤول الخادم.
pause
exit /b 1

:is_ready
where curl.exe >nul 2>&1
if errorlevel 1 goto :is_ready_powershell
curl.exe --fail --silent --max-time 5 "%~1" 2>nul | findstr /C:"\"status\":\"ok\"" >nul
exit /b %ERRORLEVEL%

:is_ready_powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-RestMethod -Uri '%~1' -TimeoutSec 5; if ($response.status -eq 'ok') { exit 0 }; exit 1 } catch { exit 1 }"
exit /b %ERRORLEVEL%

:open_url
if defined MAINPROJECT_NO_BROWSER exit /b 0
start "" "%~1"
exit /b 0

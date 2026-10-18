@echo off
chcp 65001 >nul
setlocal
title MainProject Local
cd /d "%~dp0.."

set "CENTRAL_SERVER_URL=http://PC-SERVER:5000"
set "LOCAL_HOST=127.0.0.1"
set "LOCAL_PORT=5000"
set "LOCAL_URL=http://localhost:%LOCAL_PORT%"

call :is_ready "%CENTRAL_SERVER_URL%/api/health"
if errorlevel 1 (
	echo.
	echo تعذر الاتصال بالخادم المركزي: %CENTRAL_SERVER_URL%
	echo تأكد من اتصال الجهاز بالشبكة الداخلية.
	pause
	exit /b 1
)

call :is_ready "%LOCAL_URL%/local-health"
if errorlevel 1 (
	start "MainProject Local Client" /min cmd.exe /c "set CENTRAL_SERVER_URL=%CENTRAL_SERVER_URL%&& set LOCAL_HOST=%LOCAL_HOST%&& set LOCAL_PORT=%LOCAL_PORT%&& node local-client.js >> local-client-runtime.log 2>&1"

	for /L %%I in (1,1,10) do (
		timeout /t 1 /nobreak >nul
		call :is_ready "%LOCAL_URL%/local-health"
		if not errorlevel 1 goto :open_local
	)

	echo.
	echo تعذر تشغيل ملفات البرنامج المحلية.
	echo راجع local-client-runtime.log لمعرفة السبب.
	pause
	exit /b 1
)

:open_local
start "" "%LOCAL_URL%/login.html"
exit /b 0

:is_ready
where curl.exe >nul 2>&1
if errorlevel 1 goto :is_ready_powershell
curl.exe --fail --silent --max-time 5 "%~1" 2>nul | findstr /C:"\"status\":\"ok\"" >nul
exit /b %ERRORLEVEL%

:is_ready_powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-RestMethod -Uri '%~1' -TimeoutSec 5; if ($response.status -eq 'ok') { exit 0 }; exit 1 } catch { exit 1 }"
exit /b %ERRORLEVEL%

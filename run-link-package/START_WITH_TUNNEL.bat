@echo off
chcp 65001 >nul
setlocal
title تشغيل البرنامج مع النفق العام

set "PROJECT_DIR=%~dp0.."
for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"
set "LOG_FILE=%PROJECT_DIR%\tunnel-url.log"
set "LOCAL_URL=http://127.0.0.1:5000"

where node >nul 2>&1
if errorlevel 1 (
	echo خطأ: Node.js غير مثبت أو غير مضاف إلى PATH.
	echo ثبّت Node.js ثم أعد تشغيل الملف.
	pause
	exit /b 1
)

where cloudflared >nul 2>&1
if errorlevel 1 (
	echo خطأ: cloudflared غير مثبت أو غير مضاف إلى PATH.
	echo ثبّت Cloudflare Tunnel ثم أعد تشغيل الملف.
	pause
	exit /b 1
)

if not exist "%PROJECT_DIR%\server.js" (
	echo خطأ: لم يتم العثور على server.js في:
	echo %PROJECT_DIR%
	echo احتفظ بمجلد run-link-package داخل مجلد المشروع الرئيسي.
	pause
	exit /b 1
)

if not exist "%PROJECT_DIR%\node_modules" (
	echo خطأ: مكتبات المشروع غير مثبتة.
	echo افتح موجه الأوامر داخل مجلد المشروع وشغّل: npm install
	pause
	exit /b 1
)

echo === تشغيل الخادم ===
call :is_ready "%LOCAL_URL%/api/health"
if errorlevel 1 start "Node Server" /MIN /D "%PROJECT_DIR%" cmd /c "node server.js"

for /L %%I in (1,1,90) do (
	call :is_ready "%LOCAL_URL%/api/health"
	if not errorlevel 1 goto :server_ready
	timeout /t 1 /nobreak >nul
)

echo خطأ: لم يصبح الخادم جاهزاً خلال 90 ثانية.
echo تحقق من اتصال قاعدة البيانات المركزية ثم أعد المحاولة.
pause
exit /b 1

:server_ready
echo الخادم جاهز.

echo === تشغيل النفق ===
del "%LOG_FILE%" >nul 2>&1
if defined CLOUDFLARE_TUNNEL_NAME (
	start "Cloudflare Tunnel" /MIN cmd /c "cloudflared tunnel run %CLOUDFLARE_TUNNEL_NAME% > "%LOG_FILE%" 2>&1"
) else (
	start "Cloudflare Tunnel" /MIN cmd /c "cloudflared tunnel --url %LOCAL_URL% > "%LOG_FILE%" 2>&1"
)

echo.
echo تم تشغيل الخادم والنفق في الخلفية.
echo انتظر 10 ثوانٍ ثم افتح الملف tunnel-url.log لرؤية الرابط العام.
echo.
timeout /t 10 /nobreak > nul

echo === الرابط العام ===
findstr /C:"trycloudflare.com" "%LOG_FILE%" 2>nul || echo لم يظهر الرابط بعد. راجع الملف: %LOG_FILE%

pause
exit /b 0

:is_ready
curl.exe --fail --silent --max-time 2 "%~1" 2>nul | findstr /C:"\"status\":\"ok\"" >nul
exit /b

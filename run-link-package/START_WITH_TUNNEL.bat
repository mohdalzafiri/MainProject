@echo off
chcp 65001 >nul
setlocal
title تشغيل البرنامج مع النفق العام

set "PROJECT_DIR=%~dp0.."
for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"
set "LOG_FILE=%PROJECT_DIR%\tunnel-url.log"

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
start "Node Server" /MIN /D "%PROJECT_DIR%" cmd /c "node server.js"

timeout /t 2 /nobreak > nul

echo === تشغيل النفق ===
del "%LOG_FILE%" >nul 2>&1
start "Cloudflare Tunnel" /MIN cmd /c "cloudflared tunnel --url http://127.0.0.1:5000 > "%LOG_FILE%" 2>&1"

echo.
echo تم تشغيل الخادم والنفق في الخلفية.
echo انتظر 10 ثوانٍ ثم افتح الملف tunnel-url.log لرؤية الرابط العام.
echo.
timeout /t 10 /nobreak > nul

echo === الرابط العام ===
findstr /C:"trycloudflare.com" "%LOG_FILE%" 2>nul || echo لم يظهر الرابط بعد. راجع الملف: %LOG_FILE%

pause

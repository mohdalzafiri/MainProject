@echo off
chcp 65001 > nul
title تشغيل البرنامج مع النفق العام

echo === تشغيل الخادم ===
start "Node Server" /MIN cmd /c "cd /d C:\Users\Admin\MainProject.Api && node server.js"

timeout /t 2 /nobreak > nul

echo === تشغيل النفق ===
start "Cloudflare Tunnel" /MIN cmd /c "cloudflared tunnel --url http://127.0.0.1:5000 > C:\Users\Admin\MainProject.Api\tunnel-url.log 2>&1"

echo.
echo تم تشغيل الخادم والنفق في الخلفية.
echo انتظر 10 ثوانٍ ثم افتح الملف tunnel-url.log لرؤية الرابط العام.
echo.
timeout /t 10 /nobreak > nul

echo === الرابط العام ===
findstr /C:"trycloudflare.com" "C:\Users\Admin\MainProject.Api\tunnel-url.log" 2>nul || echo لم يظهر الرابط بعد، انتظر قليلاً ثم افتح tunnel-url.log

pause

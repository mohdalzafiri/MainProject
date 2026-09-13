@echo off
chcp 65001 >nul
setlocal

where cloudflared >nul 2>&1
if errorlevel 1 (
	echo خطأ: cloudflared غير مثبت أو غير مضاف إلى PATH.
	exit /b 1
)

set /p "TUNNEL_NAME=أدخل اسم النفق، مثال mainproject-api: "
set /p "PUBLIC_HOSTNAME=أدخل النطاق الكامل، مثال app.example.com: "
if not defined TUNNEL_NAME exit /b 1
if not defined PUBLIC_HOSTNAME exit /b 1

if not exist "%USERPROFILE%\.cloudflared\cert.pem" (
	echo سيفتح المتصفح لتسجيل الدخول إلى حساب Cloudflare.
	cloudflared tunnel login
	if errorlevel 1 exit /b 1
)

cloudflared tunnel create "%TUNNEL_NAME%"
if errorlevel 1 (
	echo تعذر إنشاء النفق، أو أن الاسم مستخدم مسبقاً.
	exit /b 1
)

for /f "tokens=1" %%I in ('cloudflared tunnel list --name "%TUNNEL_NAME%" --output json ^| powershell -NoProfile -Command "$input ^| ConvertFrom-Json ^| Select-Object -ExpandProperty id"') do set "TUNNEL_ID=%%I"
if not defined TUNNEL_ID (
	echo تعذر تحديد معرف النفق.
	exit /b 1
)

cloudflared tunnel route dns "%TUNNEL_NAME%" "%PUBLIC_HOSTNAME%"
if errorlevel 1 exit /b 1

set "CONFIG_PATH=%USERPROFILE%\.cloudflared\config.yml"
set "CREDENTIALS_PATH=%USERPROFILE%\.cloudflared\%TUNNEL_ID%.json"
powershell -NoProfile -Command "$lines = @('tunnel: %TUNNEL_ID%', 'credentials-file: %CREDENTIALS_PATH:\=/%', '', 'ingress:', '  - hostname: %PUBLIC_HOSTNAME%', '    service: http://127.0.0.1:5000', '  - service: http_status:404'); Set-Content -Path '%CONFIG_PATH%' -Value $lines -Encoding ascii"
if errorlevel 1 exit /b 1

echo تم إعداد النفق الثابت: https://%PUBLIC_HOSTNAME%
echo شغّل START_WITH_TUNNEL.bat بعد ضبط المتغير CLOUDFLARE_TUNNEL_NAME=%TUNNEL_NAME%
exit /b 0
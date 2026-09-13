@echo off
chcp 65001 >nul
setlocal

set "START_SCRIPT=%~dp0START_SERVER_BACKGROUND.bat"
schtasks.exe /Create /TN "MainProjectApi" /SC ONLOGON /TR "\"%START_SCRIPT%\"" /F >nul
if not errorlevel 1 goto :installed_task

reg.exe add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MainProjectApi" /t REG_SZ /d "\"%START_SCRIPT%\"" /f >nul
if errorlevel 1 exit /b 1

echo تم تثبيت التشغيل التلقائي للمستخدم الحالي.
exit /b 0

:installed_task
echo تم تثبيت التشغيل التلقائي للخادم عند تسجيل دخول Windows.
exit /b 0
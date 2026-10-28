@echo off
chcp 65001 >nul
setlocal
title MainProject Daily Status Migration

set "PACKAGE_ROOT=%~dp0MainProject.Api"
set "NODE_EXE=%PACKAGE_ROOT%\run-link-package\node\node.exe"
set "MIGRATION_SCRIPT=%PACKAGE_ROOT%\scripts\migrate-daily-statuses.js"
set "DATABASE_PATH=%~dp0database.db"
set "BACKUP_DIRECTORY=%~dp0Backups"

if not exist "%NODE_EXE%" (
  echo تعذر العثور على Node.js في مجلد المشروع.
  goto :failed
)
if not exist "%MIGRATION_SCRIPT%" (
  echo ملف ترحيل الحالات غير موجود. انسخه إلى scripts داخل مجلد MainProject.Api.
  goto :failed
)
if not exist "%DATABASE_PATH%" (
  echo قاعدة البيانات غير موجودة: %DATABASE_PATH%
  goto :failed
)

echo سيتم التحقق من القيم وأخذ نسخة احتياطية قبل تعديل الحالات.
echo يجب إيقاف خادم API على PC-SERVER قبل المتابعة.
echo إذا كان الخادم يعمل، سيرفض ملف الترحيل التنفيذ دون تعديل قاعدة البيانات.
echo.
"%NODE_EXE%" "%MIGRATION_SCRIPT%" "%DATABASE_PATH%" "%BACKUP_DIRECTORY%"
if errorlevel 1 goto :failed

echo.
echo اكتمل ترحيل الحالات والتحقق من سلامة قاعدة البيانات.
pause
exit /b 0

:failed
echo.
echo لم يكتمل الترحيل. راجع الرسالة أعلاه؛ لم يتم تجاوز أي خطأ تلقائيا.
pause
exit /b 1

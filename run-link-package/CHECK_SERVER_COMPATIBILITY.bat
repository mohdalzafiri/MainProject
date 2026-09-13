@echo off
setlocal
set "REPORT=%~dp0SERVER_COMPATIBILITY.txt"

> "%REPORT%" echo CheckedAt=%DATE% %TIME%
>> "%REPORT%" echo ComputerName=%COMPUTERNAME%
>> "%REPORT%" echo UserName=%USERNAME%
>> "%REPORT%" echo Architecture=%PROCESSOR_ARCHITECTURE%
>> "%REPORT%" ver

where node.exe >> "%REPORT%" 2>&1
if not errorlevel 1 node --version >> "%REPORT%" 2>&1

where npm.cmd >> "%REPORT%" 2>&1
if not errorlevel 1 npm --version >> "%REPORT%" 2>&1

powershell.exe -NoProfile -Command "$PSVersionTable.PSVersion.ToString()" >> "%REPORT%" 2>&1
net session >nul 2>&1
if errorlevel 1 (
  >> "%REPORT%" echo IsAdministrator=No
) else (
  >> "%REPORT%" echo IsAdministrator=Yes
)

exit /b 0
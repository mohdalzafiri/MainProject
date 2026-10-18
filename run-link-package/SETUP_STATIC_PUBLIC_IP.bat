@echo off
chcp 65001 >nul
setlocal
title MainProject Static Public IP Setup

net session >nul 2>&1
if errorlevel 1 (
	echo ERROR: Run this file as Administrator on LAPTOP-ABDULLAH.
	pause
	exit /b 1
)

if /I not "%COMPUTERNAME%"=="LAPTOP-ABDULLAH" (
	echo ERROR: Run this file directly on LAPTOP-ABDULLAH.
	echo Current computer: %COMPUTERNAME%
	pause
	exit /b 1
)

powershell.exe -NoProfile -Command "if ((Test-NetConnection 169.254.61.2 -Port 5000 -WarningAction SilentlyContinue).TcpTestSucceeded) { exit 0 } else { exit 1 }"
if errorlevel 1 (
	echo ERROR: PC-SERVER is not reachable at 169.254.61.2:5000.
	echo Connect the PC-SERVER Ethernet cable directly to LAPTOP-ABDULLAH, then try again.
	pause
	exit /b 1
)

sc.exe config iphlpsvc start= auto >nul
sc.exe start iphlpsvc >nul 2>&1
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=5000 >nul 2>&1
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=5000 connectaddress=169.254.61.2 connectport=5000
if errorlevel 1 goto :setup_error

netsh advfirewall firewall delete rule name="MainProject API TCP 5000" >nul 2>&1
netsh advfirewall firewall add rule name="MainProject API TCP 5000" dir=in action=allow protocol=TCP localport=5000 profile=any >nul
if errorlevel 1 goto :setup_error

echo.
echo HTTP setup completed successfully.
echo Public URL: http://37.34.208.209:5000/login.html
echo Router rule: TCP WAN 5000 to 192.168.8.4 LAN 5000
pause
exit /b 0

:setup_error
echo ERROR: The HTTP forwarding setup could not be completed.
pause
exit /b 1
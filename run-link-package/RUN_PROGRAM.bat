@echo off
cd /d "%~dp0.."
start "" cmd /k "npm start"
timeout /t 3 >nul
start "" "http://localhost:5000/login.html"

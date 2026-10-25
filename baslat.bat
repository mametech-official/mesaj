@echo off
cd /d "%~dp0"
echo Mesaj baslatiliyor... Tarayici otomatik acilacak. Kapatmak icin bu pencereyi kapat.
start "" http://localhost:5500
node server.js
pause

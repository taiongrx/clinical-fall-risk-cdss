@echo off
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
    echo Requesting Administrator Elevation...
    powershell -Command "Start-Process cmd -ArgumentList '/c `\"%~f0`\"' -Verb RunAs"
    exit /b
)

echo ===================================================
echo   Sai Buri Hospital - Configure Static IP
echo ===================================================
echo Setting Static IP 192.168.6.151 on Ethernet...
netsh interface ipv4 set address name="Ethernet" static 192.168.6.151 255.255.248.0 192.168.0.1
netsh interface ipv4 set dns name="Ethernet" static 192.168.0.1 primary
netsh interface ipv4 add dns name="Ethernet" 8.8.8.8 index=2
echo Static IP configuration completed!
pause

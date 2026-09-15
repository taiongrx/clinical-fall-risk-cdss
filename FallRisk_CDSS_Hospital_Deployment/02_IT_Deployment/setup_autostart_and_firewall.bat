@echo off
chcp 65001 >nul
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
    echo Requesting Administrator Elevation...
    powershell -Command "Start-Process cmd -ArgumentList '/c `"%~f0`"' -Verb RunAs"
    exit /b
)

echo ===================================================
echo   Fall Risk Platform - Setup Intranet & Firewall
echo ===================================================

echo [1/2] Configuring Windows Defender Firewall...
netsh advfirewall firewall delete rule name="FallRisk Platform Web (Port 3030)" >nul 2>&1
netsh advfirewall firewall delete rule name="FallRisk Platform API (Port 8000)" >nul 2>&1
netsh advfirewall firewall add rule name="FallRisk Platform Web (Port 3030)" dir=in action=allow protocol=TCP localport=3030
netsh advfirewall firewall add rule name="FallRisk Platform API (Port 8000)" dir=in action=allow protocol=TCP localport=8000
echo  Firewall rules added for Ports 3030 and 8000!

echo.
echo [2/2] Registering Startup Shortcut...
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut([Environment]::GetFolderPath('Startup') + '\Start-FallRisk-Platform.lnk');$s.TargetPath='%~dp0start_service.bat';$s.WorkingDirectory='%~dp0';$s.WindowStyle=7;$s.Save()"
echo  Registered in Windows Startup!

echo ===================================================
echo   Setup Completed Successfully!
echo ===================================================
pause

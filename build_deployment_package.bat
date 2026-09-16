@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================================================
echo   Clinical Fall Risk CDSS - Automated Hospital Package Builder
echo ==============================================================================

python scripts\build_hospital_deployment.py --zip
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] การสร้างแพ็กเกจล้มเหลว กรุณาตรวจสอบข้อความแจ้งเตือนด้านบน
    pause
    exit /b 1
)

echo.
echo ==============================================================================
echo   การสร้างไฟล์ติดตั้งโรงพยาบาล (Hospital Distribution Package) สำเร็จสมบูรณ์!
echo   โฟลเดอร์แพ็กเกจ: %~dp0FallRisk_CDSS_Hospital_Deployment
echo   ไฟล์ ZIP ติดตั้ง: %~dp0FallRisk_CDSS_Hospital_Deployment.zip
echo ==============================================================================
pause

@echo off
chcp 65001 >nul
echo ==============================================================================
echo 🏥 Clinical Fall Risk CDSS - Automated Hospital Production Installer
echo ==============================================================================

:: Check Docker Desktop
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบโปรแกรม Docker บนเครื่องนี้
    echo กรุณาติดตั้ง Docker Desktop สำหรับ Windows ก่อนดำเนินการต่อ
    pause
    exit /b 1
)

:: Check .env file
if not exist ".env" (
    if exist ".env.example" (
        echo [SETUP] กำลังสร้างไฟล์ .env จาก .env.example...
        copy .env.example .env >nul
        echo [INFO] กรุณาเปิดไฟล์ .env และแก้ไข IP Address / รหัสผ่านฐานข้อมูล HIS ของโรงพยาบาล
        notepad .env
    ) else (
        echo [ERROR] ไม่พบไฟล์ .env.example
        pause
        exit /b 1
    )
)

echo [1/3] กำลังสร้างและเริ่มการทำงานของระบบ (Docker Compose)...
docker compose -f docker-compose.prod.yml up -d --build

if %errorlevel% neq 0 (
    echo [ERROR] ไม่สามารถเริ่มบริการ Docker ได้ กรุณาตรวจสอบ Docker Service
    pause
    exit /b 1
)

echo [2/3] กำลังรอระบบฐานข้อมูลและ AI Engine เริ่มทำงาน (10 วินาที)...
timeout /t 10 /nobreak >nul

echo [3/3] ตรวจสอบความพร้อมของระบบ...
curl -s http://localhost:8000/readyz
echo.

echo ==============================================================================
echo ✅ การติดตั้งและเปิดบริการเสร็จสมบูรณ์!
echo 🌐 หน้าเว็บสำหรับบุคลากรทางการแพทย์: http://localhost:3030
echo 🔌 Backend REST API: http://localhost:8000/docs
echo ==============================================================================
start http://localhost:3030
pause

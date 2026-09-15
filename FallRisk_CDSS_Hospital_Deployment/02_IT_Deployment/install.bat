@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================================================
echo   Clinical Fall Risk CDSS - Automated Hospital Production Installer
echo ==============================================================================

:: Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] ไม่พบ Docker Engine หรือ Docker Desktop บนเครื่องนี้
    echo กรุณาติดตั้ง Docker Desktop สำหรับ Windows จาก https://www.docker.com ก่อน
    pause
    exit /b 1
)

:: Check .env
if not exist ".env" (
    if exist ".env.example" (
        echo [SETUP] กำลังสร้างไฟล์ .env จาก .env.example...
        copy .env.example .env >nul
        echo [INFO] กรุณาแก้ไข IP Address และรหัสผ่านฐานข้อมูล HOSxP ของโรงพยาบาลใน Notepad
        notepad .env
    ) else (
        echo [ERROR] ไม่พบไฟล์ .env.example
        pause
        exit /b 1
    )
)

echo [1/3] กำลังสร้างและเริ่มการทำงานของระบบ (Docker Compose)...
docker compose up -d --build
if %errorlevel% neq 0 (
    echo [ERROR] ไม่สามารถเริ่มบริการ Docker ได้ กรุณาตรวจสอบว่า Docker Desktop เปิดอยู่หรือไม่
    pause
    exit /b 1
)

echo [2/3] รอระบบและฐานข้อมูล AI Engine เริ่มทำงาน (10 วินาที)...
timeout /t 10 /nobreak >nul

echo [3/3] ตรวจสอบ IP เครื่องเครือข่ายโรงพยาบาล...
set "LOCAL_IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set "LOCAL_IP=%%a"
    goto :found_ip
)
:found_ip
set LOCAL_IP=%LOCAL_IP: =%

echo ==============================================================================
echo   การติดตั้งและเปิดบริการเสร็จสมบูรณ์!
echo   หน้าเว็บภายในโรงพยาบาล: http://%LOCAL_IP%:3030
echo   หน้าเว็บเครื่องนี้:      http://localhost:3030
echo   Backend REST API:       http://%LOCAL_IP%:8000/docs
echo ==============================================================================
start http://localhost:3030
pause

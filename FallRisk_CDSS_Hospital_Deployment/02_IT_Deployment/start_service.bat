@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===================================================
echo   Fall Risk Platform - Starting Services...
echo ===================================================

docker info >nul 2>&1
if errorlevel 1 (
    echo Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    :wait_docker
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        echo Waiting for Docker engine to become ready...
        goto wait_docker
    )
)

echo Starting containers...
docker compose up -d

set "LOCAL_IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set "LOCAL_IP=%%a"
    goto :found_ip
)
:found_ip
set LOCAL_IP=%LOCAL_IP: =%

echo ---------------------------------------------------
echo System is LIVE on Hospital Network!
echo Intranet URL: http://%LOCAL_IP%:3030
echo Localhost:    http://localhost:3030
echo API Docs:     http://%LOCAL_IP%:8000/docs
echo ---------------------------------------------------
start http://localhost:3030

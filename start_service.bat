@echo off
cd /d "%~dp0"
echo ===================================================
echo   Sai Buri Hospital - FallRisk Platform
echo   Starting Docker Services...
echo ===================================================

docker info >nul 2>&1
if errorlevel 1 (
    echo Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    :wait_docker
    ping -n 4 127.0.0.1 >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        echo Waiting for Docker engine...
        goto wait_docker
    )
)

echo Starting containers...
docker compose up -d

echo ---------------------------------------------------
echo System is LIVE on Hospital Intranet!
echo Intranet URL: http://192.168.6.151:3030
echo Localhost:    http://localhost:3030
echo API:          http://192.168.6.151:8000
echo ---------------------------------------------------

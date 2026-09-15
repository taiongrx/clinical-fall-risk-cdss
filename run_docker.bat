@echo off
echo ==============================================================================
echo   Sai Buri Hospital - Fall Risk Platform (Docker Launcher)
echo ==============================================================================
echo Starting containers with Docker Compose...
docker-compose up --build -d
echo.
echo ==============================================================================
echo   Services are running:
echo   - Frontend Web UI:  http://localhost:3030
echo   - Backend API Docs: http://localhost:8000/docs
echo   - PostgreSQL DB:    localhost:5432 (fall_risk_db)
echo ==============================================================================
pause

@echo off
echo ==============================================================================
echo   Sai Buri Hospital - Fall Risk Platform (Local Dev Launcher)
echo ==============================================================================
echo 1. Starting Backend API on port 8000...
start cmd /k "cd backend && python -m uvicorn app.main:app --reload --port 8000"

echo 2. Starting Frontend Web UI on port 3030...
start cmd /k "cd frontend && npm run dev"

echo.
echo Frontend will be accessible at http://localhost:3030
echo Backend API Swagger Docs at http://localhost:8000/docs
pause

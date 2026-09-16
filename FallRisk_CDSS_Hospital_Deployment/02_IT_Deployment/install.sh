#!/usr/bin/env bash
# ==============================================================================
# Clinical Fall Risk CDSS - Automated Hospital Production Installer (Ubuntu/Linux)
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================================================="
echo "  Clinical Fall Risk CDSS - Automated Hospital Production Installer (Linux)"
echo "=============================================================================="

# 1. Check Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed on this system."
    echo "Please install Docker Engine using:"
    echo "  sudo apt update && sudo apt install -y docker.io docker-compose-v2"
    echo "  sudo usermod -aG docker \$USER"
    exit 1
fi

if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "[ERROR] Docker Compose plugin is not installed."
    echo "Please install using: sudo apt install -y docker-compose-v2"
    exit 1
fi

# 2. Check & Prepare .env
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "[SETUP] Creating .env from .env.example..."
        cp .env.example .env
        echo "[INFO] Please configure HOSxP Database credentials and Hospital name in .env:"
        echo "       nano .env"
        read -p "Press [Enter] to open nano editor, or Ctrl+C to abort..."
        nano .env || vi .env || sensible-editor .env || true
    else
        echo "[ERROR] .env.example not found!"
        exit 1
    fi
fi

# 3. Docker Compose Up
echo "[1/3] Building and starting CDSS containers (Docker Compose)..."
docker compose up -d --build

# 4. Wait for services
echo "[2/3] Waiting for AI Engine and Database to initialize (10 seconds)..."
sleep 10

# 5. Detect Host IP
echo "[3/3] Detecting Server IP Address..."
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$HOST_IP" ]; then
    HOST_IP="localhost"
fi

echo "=============================================================================="
echo "  Installation and Service Startup Completed!"
echo "  Hospital Network URL: http://${HOST_IP}:3030"
echo "  Localhost URL:        http://localhost:3030"
echo "  Backend API Docs:     http://${HOST_IP}:8000/docs"
echo "  Health Check:         http://${HOST_IP}:8000/healthz"
echo "=============================================================================="

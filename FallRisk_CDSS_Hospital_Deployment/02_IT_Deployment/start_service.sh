#!/usr/bin/env bash
# ==============================================================================
# Clinical Fall Risk CDSS - Service Starter (Ubuntu/Linux)
# ==============================================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting Clinical Fall Risk CDSS Services..."
docker compose up -d

HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HOST_IP=${HOST_IP:-localhost}

echo "=============================================================================="
echo "  Services are running!"
echo "  Web Dashboard: http://${HOST_IP}:3030"
echo "  API Docs:      http://${HOST_IP}:8000/docs"
echo "=============================================================================="

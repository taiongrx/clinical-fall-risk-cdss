#!/usr/bin/env bash
# ==============================================================================
# Setup Firewall (UFW) and Systemd Auto-Start Service on Ubuntu
# ==============================================================================
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$EUID" -ne 0 ]; then
  echo "[ERROR] Please run with sudo: sudo bash setup_systemd_and_firewall.sh"
  exit 1
fi

echo "[1/2] Configuring UFW Firewall for CDSS ports (3030, 8000)..."
if command -v ufw &> /dev/null; then
    ufw allow 3030/tcp comment "Fall Risk CDSS Web Dashboard"
    ufw allow 8000/tcp comment "Fall Risk CDSS REST API"
    echo "  [OK] UFW rules added for ports 3030, 8000."
else
    echo "  [INFO] UFW is not installed. Skipping firewall configuration."
fi

echo "[2/2] Registering Systemd auto-start service..."
SERVICE_FILE="/etc/systemd/system/fall-risk-cdss.service"
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Clinical Fall Risk CDSS Docker Service
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fall-risk-cdss.service
echo "  [OK] Systemd service 'fall-risk-cdss.service' enabled!"
echo "       The CDSS will now automatically start whenever Ubuntu boots."
echo "=============================================================================="

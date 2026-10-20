#!/usr/bin/env bash
# One-time host setup for an Ubuntu EC2 instance created by hand (provision.sh's user-data does
# the same for instances it launches). Idempotent: safe to re-run. Run as root.
set -euxo pipefail

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
fi
systemctl enable --now docker

mkdir -p /opt/teamloom/backups
cat > /etc/systemd/system/teamloom-backup.service <<'UNIT'
[Unit]
Description=TeamLoom nightly Postgres dump
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/teamloom/app/deploy/backup.sh
UNIT
cat > /etc/systemd/system/teamloom-backup.timer <<'UNIT'
[Unit]
Description=Run TeamLoom backup nightly
[Timer]
OnCalendar=*-*-* 20:30:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now teamloom-backup.timer
touch /opt/teamloom/.provisioned

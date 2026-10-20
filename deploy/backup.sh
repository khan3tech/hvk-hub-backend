#!/usr/bin/env bash
# Nightly pg_dump on the EC2 host (installed as a systemd timer by provision user-data).
# Keeps 7 days of compressed dumps in /opt/teamloom/backups.
set -euo pipefail
cd /opt/teamloom/app/deploy
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose -p teamloom -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "/opt/teamloom/backups/teamloom-$STAMP.sql.gz"
find /opt/teamloom/backups -name 'teamloom-*.sql.gz' -mtime +7 -delete

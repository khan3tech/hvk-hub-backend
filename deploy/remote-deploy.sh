#!/usr/bin/env bash
# Runs ON the EC2 host (via SSM, see deploy/deploy.sh). Installs the source bundle at
# /opt/teamloom/app, creates /opt/teamloom/.env with generated secrets on first run, then
# builds and starts the stack and applies migrations.
#   remote-deploy.sh <extracted-bundle-dir> [--seed]
set -euo pipefail

SRC="$1"
SEED="${2:-}"
ROOT=/opt/teamloom
ENV_FILE="$ROOT/.env"

mkdir -p "$ROOT/backups"
rm -rf "$ROOT/app.new"
cp -r "$SRC" "$ROOT/app.new"
rm -rf "$ROOT/app"
mv "$ROOT/app.new" "$ROOT/app"

if [ ! -f "$ENV_FILE" ]; then
  rand() { openssl rand -hex 32; }
  PG_PASSWORD="$(rand)"
  # No domain yet: serve HTTPS on a free sslip.io hostname derived from the instance's public
  # (Elastic) IP, e.g. 13-233-1-2.sslip.io — Caddy obtains a Let's Encrypt cert for it. HTTPS is
  # required because the frontend (Amplify) is served over HTTPS and proxies /api here.
  IMDS_TOKEN="$(curl -sf -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)"
  PUBLIC_IP="$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
  if [ -n "$PUBLIC_IP" ]; then
    SITE="${PUBLIC_IP//./-}.sslip.io"; COOKIE_SECURE_VALUE=true
  else
    SITE=":80"; COOKIE_SECURE_VALUE=false
  fi
  umask 077
  cat > "$ENV_FILE" <<EOF
POSTGRES_USER=teamloom
POSTGRES_PASSWORD=$PG_PASSWORD
POSTGRES_DB=teamloom
DATABASE_URL=postgresql://teamloom:$PG_PASSWORD@postgres:5432/teamloom
JWT_ACCESS_SECRET=$(rand)
JWT_REFRESH_SECRET=$(rand)
AUTH_LOCKOUT_THRESHOLD=3
CORS_ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=info
# SITE_ADDRESS: sslip.io hostname (HTTPS) until a real domain replaces it.
COOKIE_SECURE=$COOKIE_SECURE_VALUE
SITE_ADDRESS=$SITE
SEED_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')
EOF
  echo "Created $ENV_FILE with generated secrets"
fi

cd "$ROOT/app/deploy"
DC="docker compose -p teamloom -f docker-compose.prod.yml"

$DC build api
$DC up -d postgres
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$($DC ps -q postgres)")" = "healthy" ]; do sleep 2; done
$DC run --rm --no-deps api npx prisma migrate deploy
if [ "$SEED" = "--seed" ]; then
  $DC run --rm --no-deps api npx tsx prisma/seed.ts
fi
$DC up -d --remove-orphans
docker image prune -f >/dev/null

for i in $(seq 1 30); do
  if curl -sf http://localhost/health >/dev/null; then echo "DEPLOY OK"; exit 0; fi
  sleep 2
done
echo "API not healthy"; $DC logs --tail 100 api; exit 1

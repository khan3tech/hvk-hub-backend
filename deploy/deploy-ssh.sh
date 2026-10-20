#!/usr/bin/env bash
# Ships the current git HEAD to an Ubuntu EC2 host over SSH (alternative to the SSM-based
# deploy.sh for an instance created by hand). Bootstraps Docker on first run.
#   deploy/deploy-ssh.sh <host> <key.pem> [--seed]
set -euo pipefail

HOST="$1"
KEY="$2"
SEED="${3:-}"
USER_AT="ubuntu@$HOST"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
SHA="$(git rev-parse --short HEAD)"

TMP="$(mktemp -d)"
git archive --format=tar.gz -o "$TMP/bundle.tgz" HEAD
scp "${SSH_OPTS[@]}" -q "$TMP/bundle.tgz" "$USER_AT:/tmp/teamloom-src.tgz"
rm -rf "$TMP"
echo "uploaded $SHA to $HOST"

ssh "${SSH_OPTS[@]}" "$USER_AT" "sudo bash -s -- $SEED" <<'REMOTE'
set -euo pipefail
rm -rf /tmp/teamloom-src && mkdir -p /tmp/teamloom-src
tar -xzf /tmp/teamloom-src.tgz -C /tmp/teamloom-src
test -f /opt/teamloom/.provisioned || bash /tmp/teamloom-src/deploy/bootstrap-ubuntu.sh
bash /tmp/teamloom-src/deploy/remote-deploy.sh /tmp/teamloom-src "${1:-}"
REMOTE

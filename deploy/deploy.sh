#!/usr/bin/env bash
# Runs on your PC (Git Bash). Sends the committed code to the server and runs setup.sh there.
#   bash deploy/deploy.sh <server-ip> <domain>              update the code
#   bash deploy/deploy.sh <server-ip> <domain> --with-data  first deploy: also copy the database and secret.key
# Only committed code is sent (git archive), so commit before deploying.
set -euo pipefail

IP="${1:?usage: deploy.sh <server-ip> <domain> [--with-data]}"
DOMAIN="${2:?usage: deploy.sh <server-ip> <domain> [--with-data]}"
KEY="${SSH_KEY:-$HOME/.ssh/provisoire_oracle}"
SSH_USER="${SSH_USER:-ubuntu}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new)

cd "$ROOT"
git archive --format=tar.gz -o "$TMP/prov-app.tar.gz" HEAD
FILES=("$TMP/prov-app.tar.gz" deploy/setup.sh)

if [ "${3:-}" = "--with-data" ]; then
  # A consistent copy of the live database, even while the app on this PC is running.
  mkdir "$TMP/data"
  # Windows Node can't read Git Bash paths like /tmp/..., so hand it a Windows path.
  SNAP="$TMP/data/prov.db"; command -v cygpath >/dev/null && SNAP="$(cygpath -m "$SNAP")"
  node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('data/prov.db').exec(\"VACUUM INTO '$SNAP'\")"
  cp data/secret.key "$TMP/data/"
  tar -czf "$TMP/prov-data.tar.gz" -C "$TMP/data" prov.db secret.key
  FILES+=("$TMP/prov-data.tar.gz")
fi

scp "${SSH_OPTS[@]}" "${FILES[@]}" "$SSH_USER@$IP:/tmp/"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$IP" "sudo bash /tmp/setup.sh '$DOMAIN'"

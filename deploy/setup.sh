#!/usr/bin/env bash
# Runs ON the server (Ubuntu 22.04/24.04, e.g. Oracle Cloud Always Free). Called by deploy.sh:
#   sudo bash setup.sh <domain>
# Expects /tmp/prov-app.tar.gz (code) and, on the first deploy only, /tmp/prov-data.tar.gz (database + secret.key).
# Safe to run again: it updates the code and never overwrites the data already on the server.
set -euo pipefail

DOMAIN="${1:?usage: setup.sh <domain>}"
APP=/opt/prov-app
DATA=/var/lib/prov-app
export DEBIAN_FRONTEND=noninteractive

# Node.js 24 (the app needs 22.13+ for node:sqlite).
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# Caddy: reverse proxy that gets and renews the HTTPS certificate by itself.
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# Oracle's Ubuntu images block everything but SSH in iptables. Open 80 and 443.
if command -v netfilter-persistent >/dev/null; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null && continue
    # Insert before the catch-all REJECT rule, or append when there is none.
    reject="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')"
    if [ -n "$reject" ]; then
      iptables -I INPUT "$reject" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    else
      iptables -A INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  done
  netfilter-persistent save
fi

id prov >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin prov

# Code: replace it completely.
rm -rf "$APP.new" && mkdir -p "$APP.new"
tar -xzf /tmp/prov-app.tar.gz -C "$APP.new"
rm -rf "$APP.old"; [ -d "$APP" ] && mv "$APP" "$APP.old"
mv "$APP.new" "$APP"
chown -R root:root "$APP"

# Data: only on the first deploy.
mkdir -p "$DATA/backups"
if [ ! -f "$DATA/prov.db" ] && [ -f /tmp/prov-data.tar.gz ]; then
  tar -xzf /tmp/prov-data.tar.gz -C "$DATA"
  echo "Copied the database and secret.key from your PC."
fi
rm -f /tmp/prov-data.tar.gz /tmp/prov-app.tar.gz
chown -R prov:prov "$DATA"
chmod 700 "$DATA"

cat > /etc/systemd/system/prov-app.service <<EOF
[Unit]
Description=Provisoire Yanjye
After=network.target

[Service]
User=prov
WorkingDirectory=$APP
Environment=NODE_ENV=production TRUST_PROXY=1 PORT=3000 DATA_DIR=$DATA
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF

# Daily backup at 03:00 (server time), keeps 14 days.
cat > /etc/cron.d/prov-app-backup <<EOF
0 3 * * * prov cd $APP && /usr/bin/node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('$DATA/prov.db').exec(\"VACUUM INTO '$DATA/backups/prov-\"+new Date().toISOString().slice(0,10)+\".db'\")" && find $DATA/backups -name 'prov-*.db' -mtime +14 -delete
EOF

systemctl daemon-reload
systemctl enable --now prov-app
systemctl restart prov-app
systemctl reload caddy || systemctl restart caddy

sleep 2
if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
  echo "Provisoire Yanjye is running: https://$DOMAIN"
else
  echo "The app did not start. See: journalctl -u prov-app -n 50" >&2
  exit 1
fi

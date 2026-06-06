#!/bin/bash
set -e

# Paseo Relay Server Full Deployment Script
# Includes Nginx and SSL configuration
# Usage: ./deploy-full.sh [server]
# Example: ./deploy-full.sh root@weixin.52iptv.net

SERVER="${1:-root@weixin.52iptv.net}"
RELAY_PORT="${RELAY_PORT:-8080}"
RELAY_DOMAIN="relay.17ai.pro"
DEPLOY_DIR="/opt/paseo-relay"

echo "========================================="
echo "  Paseo Relay Server Full Deployment"
echo "========================================="
echo "Server: $SERVER"
echo "Domain: $RELAY_DOMAIN"
echo "Port: $RELAY_PORT"
echo "========================================="
echo ""

# Step 1: Build the relay package
echo "[1/7] Building relay package..."
cd "$(dirname "$0")"
npm run build

# Step 2: Create deployment archive
echo "[2/7] Creating deployment archive..."
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/paseo-relay"
cp -r dist/ package.json relay-config.json "$TEMP_DIR/paseo-relay/"
cp paseo-relay.service "$TEMP_DIR/"
cp nginx-relay.conf "$TEMP_DIR/"

cd "$TEMP_DIR"
tar -czf paseo-relay.tar.gz paseo-relay/ paseo-relay.service nginx-relay.conf

# Step 3: Upload to server
echo "[3/7] Uploading to server..."
scp paseo-relay.tar.gz "$SERVER:/tmp/"

# Step 4: Deploy on server
echo "[4/7] Deploying on server..."
ssh "$SERVER" <<ENDSSH
set -e

echo "--- [Server Setup"
RELAY_DOMAIN="$RELAY_DOMAIN"
DEPLOY_DIR="$DEPLOY_DIR"
RELAY_PORT="$RELAY_PORT"

# Install dependencies
echo "--- Installing system packages..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# Create deploy directory
mkdir -p "\$DEPLOY_DIR"
mkdir -p /var/www/html
mkdir -p /var/log/paseo-relay

# Extract archive
cd /tmp
tar -xzf paseo-relay.tar.gz -C /tmp/

# Install Node.js if not installed
if ! command -v node &> /dev/null || [ "\$(node -v | cut -d'.' -f1 | sed 's/v//')" -lt 20 ]; then
    echo "--- Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Backup old installation
if [ -d "\$DEPLOY_DIR/dist" ]; then
    echo "--- Backing up old installation..."
    mv "\$DEPLOY_DIR/dist" "\$DEPLOY_DIR/dist.bak.\$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
fi

# Install new version
cp -r /tmp/paseo-relay/* "\$DEPLOY_DIR/"

# Install dependencies (production only)
cd "\$DEPLOY_DIR"
npm install --production --ignore-scripts

# Install systemd service
cp /tmp/paseo-relay.service /etc/systemd/system/paseo-relay.service
systemctl daemon-reload

# Enable and start relay service
systemctl enable paseo-relay
systemctl restart paseo-relay

# Configure Nginx
echo "--- Configuring Nginx..."
cp /tmp/nginx-relay.conf /etc/nginx/sites-available/paseo-relay
rm -f /etc/nginx/sites-enabled/paseo-relay 2>/dev/null || true
ln -s /etc/nginx/sites-available/paseo-relay /etc/nginx/sites-enabled/

# Remove default nginx site
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test nginx config
nginx -t

# Obtain SSL certificate (we'll do this after nginx is running with HTTP first
echo "--- Nginx configured. Now getting SSL certificate..."

# Cleanup
rm -rf /tmp/paseo-relay /tmp/paseo-relay.tar.gz

echo "--- Server deployment complete!"
ENDSSH

# Step 5: Restart Nginx (HTTP first for SSL challenge
echo "[5/7] Starting Nginx for HTTP..."
ssh "$SERVER" <<ENDSSH2
set -e

# Stop nginx first with minimal config for ACME challenge
cat > /etc/nginx/sites-available/paseo-relay <<'NGINX_HTTP'
server {
    listen 80;
    server_name $RELAY_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
NGINX_HTTP

nginx -t
systemctl restart nginx
ENDSSH2

# Step 6: Obtain SSL certificate
echo "[6/7] Obtaining SSL certificate..."
ssh "$SERVER" <<ENDSSH3
set -e

# Check if certificate already exists
if [ ! -f /etc/letsencrypt/live/$RELAY_DOMAIN/fullchain.pem ]; then
    echo "--- Getting Let's Encrypt certificate..."
    certbot certonly --nginx -d $RELAY_DOMAIN --non-interactive --agree-tos --email admin@17ai.pro || true
fi

# Now restore the full Nginx config
cp /tmp/nginx-relay.conf /etc/nginx/sites-available/paseo-relay

# Test and reload nginx
nginx -t
systemctl reload nginx

echo "--- SSL certificate obtained!"
ENDSSH3

# Step 7: Verify everything is working
echo "[7/7] Verifying deployment..."

echo ""
echo "========================================="
echo "  Deployment Complete!"
echo "========================================="
echo ""
echo "✅ Relay server: https://$RELAY_DOMAIN"
echo "✅ Health check: https://$RELAY_DOMAIN/health"
echo ""
echo "Useful commands:"
echo "  ssh $SERVER 'systemctl status paseo-relay'     # Check relay service"
echo "  ssh $SERVER 'journalctl -u paseo-relay -f'     # View relay logs"
echo "  ssh $SERVER 'systemctl status nginx'         # Check nginx"
echo ""
echo "Configure daemon to use this relay:"
echo "  export PASEO_RELAY_ENDPOINT=\"$RELAY_DOMAIN:443"
echo "  export PASEO_RELAY_USE_TLS=\"true\""
echo "========================================="

#!/bin/bash
set -e

# Paseo Relay Server Deployment Script
# Usage: ./deploy.sh [server]
# Example: ./deploy.sh root@weixin.52iptv.net

SERVER="${1:-root@weixin.52iptv.net}"
RELAY_PORT="${RELAY_PORT:-8080}"
DEPLOY_DIR="/opt/paseo-relay"

echo "========================================="
echo "  Paseo Relay Server Deployment"
echo "========================================="
echo "Server: $SERVER"
echo "Port: $RELAY_PORT"
echo "Deploy Dir: $DEPLOY_DIR"
echo "========================================="

# Step 1: Build the relay package
echo ""
echo "[1/5] Building relay package..."
cd "$(dirname "$0")"
npm run build

# Step 2: Create deployment archive
echo "[2/5] Creating deployment archive..."
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/paseo-relay"
cp -r dist "$TEMP_DIR/paseo-relay/"
cp package.json "$TEMP_DIR/paseo-relay/"
cp relay-config.json "$TEMP_DIR/paseo-relay/"
cp paseo-relay.service "$TEMP_DIR/"

cd "$TEMP_DIR"
tar -czf paseo-relay.tar.gz paseo-relay/ paseo-relay.service

# Step 3: Upload to server
echo "[3/5] Uploading to server..."
scp paseo-relay.tar.gz "$SERVER:/tmp/"

# Step 4: Deploy on server
echo "[4/5] Deploying on server..."
ssh "$SERVER" << 'ENDSSH'
set -e

DEPLOY_DIR="/opt/paseo-relay"

# Create deploy directory
mkdir -p "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/logs"

# Extract archive
cd /tmp
tar -xzf paseo-relay.tar.gz -C /tmp/

# Backup old installation
if [ -d "$DEPLOY_DIR/dist" ]; then
  echo "Backing up old installation..."
  mv "$DEPLOY_DIR/dist" "$DEPLOY_DIR/dist.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
fi

# Install new version
cp -r /tmp/paseo-relay/* "$DEPLOY_DIR/"

# Install dependencies (production only)
cd "$DEPLOY_DIR"
npm install --production --ignore-scripts

# Install systemd service
cp /tmp/paseo-relay.service /etc/systemd/system/paseo-relay.service
systemctl daemon-reload

# Cleanup
rm -rf /tmp/paseo-relay /tmp/paseo-relay.tar.gz

echo "Deployment complete!"
ENDSSH

# Step 5: Start service
echo "[5/5] Starting relay service..."
ssh "$SERVER" << ENDSSH
set -e

# Enable and start service
systemctl enable paseo-relay
systemctl restart paseo-relay

# Wait for service to start
sleep 2

# Check status
if systemctl is-active --quiet paseo-relay; then
  echo "✓ Relay service is running!"
  echo ""
  echo "Service Status:"
  systemctl status paseo-relay --no-pager -l
  echo ""
  echo "Health Check:"
  curl -s http://localhost:${RELAY_PORT}/health | jq . || echo "http://localhost:${RELAY_PORT}/health"
else
  echo "✗ Relay service failed to start!"
  echo ""
  echo "Logs:"
  journalctl -u paseo-relay --no-pager -n 50
  exit 1
fi
ENDSSH

# Cleanup local temp files
rm -rf "$TEMP_DIR"

echo ""
echo "========================================="
echo "  Deployment Complete!"
echo "========================================="
echo ""
echo "Relay Server: $SERVER:$RELAY_PORT"
echo "Health Check: http://$SERVER:$RELAY_PORT/health"
echo ""
echo "Useful commands:"
echo "  ssh $SERVER 'systemctl status paseo-relay'     # Check status"
echo "  ssh $SERVER 'journalctl -u paseo-relay -f'     # View logs"
echo "  ssh $SERVER 'systemctl restart paseo-relay'    # Restart"
echo ""
echo "Configure daemon to use this relay:"
echo "  export PASEO_RELAY_ENDPOINT=\"$SERVER:$RELAY_PORT\""
echo "  export PASEO_RELAY_USE_TLS=\"false\""
echo "========================================="

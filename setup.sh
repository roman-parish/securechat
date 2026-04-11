#!/bin/bash
set -e

# Parse arguments
DOMAIN=""
for arg in "$@"; do
    case $arg in
        --domain=*) DOMAIN="${arg#*=}" ;;
        --domain) shift; DOMAIN="$1" ;;
    esac
done

echo "╔═══════════════════════════════════════╗"
echo "║     SecureChat Setup & Launcher       ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check dependencies
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required. Install from https://docs.docker.com/get-docker/"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required."; exit 1; }

# Setup .env if not present
if [ ! -f .env ]; then
    echo "📋 Creating .env from template..."
    cp .env.example .env

    JWT_SECRET=$(openssl rand -hex 64 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(64))")
    JWT_REFRESH_SECRET=$(openssl rand -hex 64 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(64))")
    MONGO_PASSWORD=$(openssl rand -hex 24 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(24))")
    REDIS_PASSWORD=$(openssl rand -hex 24 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(24))")

    sed -i "s/change_this_jwt_secret_in_production/$JWT_SECRET/" .env
    sed -i "s/change_this_refresh_secret_in_production/$JWT_REFRESH_SECRET/" .env
    sed -i "s/change_this_mongo_password/$MONGO_PASSWORD/" .env
    sed -i "s/change_this_redis_password/$REDIS_PASSWORD/" .env

    echo "✅ Generated secure secrets in .env"
    echo ""
fi

# Install Node.js 20 if npx is not available (needed for VAPID key generation)
if ! command -v npx >/dev/null 2>&1 || [ "$(node --version 2>/dev/null | cut -d'.' -f1 | tr -d 'v')" -lt 16 ] 2>/dev/null; then
    echo "📦 Installing Node.js 20 for VAPID key generation..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get remove -y libnode-dev libnode72 >/dev/null 2>&1 || true
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
        apt-get install -y nodejs >/dev/null 2>&1 && echo "✅ Node.js $(node --version) installed"
    else
        echo "⚠️  Could not auto-install Node.js — VAPID keys will be skipped"
    fi
fi

# Generate VAPID keys if not set
VAPID_KEY=$(grep "^VAPID_PUBLIC_KEY=" .env | cut -d'=' -f2)
if [ -z "$VAPID_KEY" ]; then
    echo "🔑 Generating VAPID keys for push notifications..."
    VAPID_GENERATED=false

    if command -v npx >/dev/null 2>&1; then
        VAPID_OUTPUT=$(npx --yes web-push generate-vapid-keys 2>/dev/null || true)
        PUB=$(echo "$VAPID_OUTPUT" | grep -A1 "Public Key:" | tail -1 | tr -d '[:space:]')
        PRIV=$(echo "$VAPID_OUTPUT" | grep -A1 "Private Key:" | tail -1 | tr -d '[:space:]')
        if [ -n "$PUB" ] && [ -n "$PRIV" ]; then
            sed -i "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=$PUB|" .env
            sed -i "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=$PRIV|" .env
            echo "✅ VAPID keys configured"
            VAPID_GENERATED=true
        fi
    fi

    if [ "$VAPID_GENERATED" = "false" ]; then
        echo "⚠️  Could not auto-generate VAPID keys (push notifications disabled)"
    fi
fi

# TLS certificate setup
echo ""
echo "🔒 Checking TLS certificate..."
mkdir -p nginx/ssl
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

if [ -n "$DOMAIN" ]; then
    # Let's Encrypt cert for a real domain
    echo "🌐 Setting up Let's Encrypt certificate for ${DOMAIN}..."
    if ! command -v certbot >/dev/null 2>&1; then
        apt-get install -y certbot -qq >/dev/null 2>&1
    fi
    # Get cert (nginx must be stopped to free port 80)
    certbot certonly --standalone --non-interactive --agree-tos \
        -m "admin@${DOMAIN}" -d "$DOMAIN" 2>/dev/null \
        || { echo "⚠️  Let's Encrypt failed — falling back to self-signed cert"; DOMAIN=""; }

    if [ -n "$DOMAIN" ]; then
        # Point nginx to LE certs and set server_name
        sed -i "s|server_name _;|server_name ${DOMAIN};|" nginx/nginx.conf
        sed -i "s|ssl_certificate .*|ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;|" nginx/nginx.conf
        sed -i "s|ssl_certificate_key .*|ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;|" nginx/nginx.conf
        echo "✅ Let's Encrypt certificate configured for ${DOMAIN}"
        # Set up auto-renewal hook to restart nginx container
        echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'docker compose -f /root/securechat/docker-compose.yml restart nginx'" > /etc/cron.d/certbot-securechat
    fi
fi

if [ -z "$DOMAIN" ]; then
    # Self-signed fallback
    if [ ! -f nginx/ssl/cert.pem ]; then
        openssl req -x509 -newkey rsa:2048 \
            -keyout nginx/ssl/key.pem \
            -out nginx/ssl/cert.pem \
            -days 365 -nodes \
            -subj "/CN=securechat" \
            -addext "subjectAltName=IP:${SERVER_IP},IP:127.0.0.1,DNS:localhost" 2>/dev/null
        echo "✅ Self-signed TLS cert generated for IP: ${SERVER_IP}"
    else
        echo "✅ TLS cert already exists"
    fi
fi

# Update CLIENT_URL
ACCESS_HOST="${DOMAIN:-${SERVER_IP}}"
sed -i "s|^CLIENT_URL=.*|CLIENT_URL=https://${ACCESS_HOST}|" .env

echo ""
echo "🔨 Building and starting SecureChat..."
docker compose up --build -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 5

MAX_TRIES=30
COUNT=0
until curl -sfk https://localhost/api/health >/dev/null 2>&1; do
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_TRIES ]; then
        echo "⚠️  Services may still be starting. Check: docker compose logs"
        break
    fi
    sleep 2
done

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅  SecureChat is running!                                  ║"
echo "║                                                              ║"
printf  "║  🔐  https://%-47s║\n" "${ACCESS_HOST}"
echo "║                                                              ║"
if [ -z "$DOMAIN" ]; then
echo "║  ⚠️   Browser shows a cert warning (self-signed).            ║"
echo "║      Click 'Advanced' → 'Proceed to site' to continue.      ║"
echo "║      Tip: re-run with --domain=yourdomain.com for a real     ║"
echo "║      TLS certificate via Let's Encrypt.                      ║"
echo "║                                                              ║"
fi
echo "║  Commands:                                                   ║"
echo "║    docker compose logs -f    (view logs)                     ║"
echo "║    docker compose down       (stop)                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"

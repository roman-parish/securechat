#!/bin/bash
# SecureChat deploy script — updates code without wiping data
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Deploying SecureChat..."

if [ ! -f .env ]; then
  echo "❌ .env not found. Run setup.sh first."
  exit 1
fi

# Always sync to latest origin/main regardless of local state
echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

# Kill any previous stuck docker compose process so it doesn't block
echo "🧹 Clearing any previous build locks..."
pkill -f "docker compose up" 2>/dev/null || true
sleep 1

# Run the build in background so SSH timeout can't interrupt it.
# Logs stream to a file; we tail them from here so output is visible in CI.
LOG=/tmp/securechat-deploy.log
echo "🔨 Building and starting containers..."
nohup docker compose up --build -d --remove-orphans > "$LOG" 2>&1 &
BUILD_PID=$!

# Stream the log until the background process finishes (or 15 min safety cap)
timeout 900 tail -f "$LOG" --pid="$BUILD_PID" 2>/dev/null || true

# Nginx uses a prebuilt image so `docker compose up` won't restart it when
# only nginx.conf changed. Reload config explicitly so CSP/proxy changes apply.
echo "🔄 Reloading nginx config..."
docker compose exec nginx nginx -s reload 2>/dev/null || true

# Wait for health check — the app may still be starting even if build is done
echo ""
echo "⏳ Waiting for app to be ready..."
for i in $(seq 1 30); do
  if curl -sfk https://localhost/api/health >/dev/null 2>&1; then
    SERVER_IP=$(grep "^CLIENT_URL=" .env | cut -d'=' -f2 | sed 's|https://||')
    echo ""
    echo "✅ SecureChat is up!"
    echo "   🔐 https://${SERVER_IP}"
    echo ""
    echo "📊 Container status:"
    docker compose ps --format "table {{.Name}}\t{{.Status}}"
    exit 0
  fi
  printf "."
  sleep 2
done

echo ""
echo "⚠️  App is slow to start. Check logs:"
echo "   docker compose logs --tail=50"

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

# Rebuild changed containers
echo "🔨 Building and starting containers..."
docker compose up --build -d --remove-orphans

# Wait for health check
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

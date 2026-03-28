#!/bin/sh
set -e

# DATABASE_URL from Railway/Render: postgres://user:pass@host:port/dbname
# Nakama expects: user:pass@host:port/dbname
if [ -n "$DATABASE_URL" ]; then
  DB_ADDR=$(echo "$DATABASE_URL" | sed 's|postgres://||' | sed 's|postgresql://||')
else
  DB_ADDR="${DB_USER:-postgres}:${DB_PASS:-localdb}@${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-nakama}"
fi

echo "Running migrations..."
/nakama/nakama migrate up --database.address "$DB_ADDR"

echo "Starting Nakama..."
exec /nakama/nakama \
  --name nakama1 \
  --database.address "$DB_ADDR" \
  --logger.level INFO \
  --session.token_expiry_sec 7200 \
  --socket.port 7350 \
  --runtime.js_entrypoint "build/index.js"

#!/bin/bash
# Sets up the attendance_db database and applies the schema.
# Usage: bash database/setup.sh
#
# Reads DB_* variables from backend/.env if present,
# otherwise falls back to defaults.

set -e

# Load .env if available
ENV_FILE="$(dirname "$0")/../backend/.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep -E '^DB_' | xargs)
  echo "Loaded DB config from backend/.env"
fi

DB_NAME="${DB_NAME:-attendance_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
SCHEMA="$(dirname "$0")/schema.sql"

echo "──────────────────────────────────────────"
echo " Host : $DB_HOST:$DB_PORT"
echo " User : $DB_USER"
echo " DB   : $DB_NAME"
echo "──────────────────────────────────────────"

echo "Creating database '$DB_NAME' (skipped if already exists)..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  -c "CREATE DATABASE \"$DB_NAME\";" 2>/dev/null \
  && echo "Database created." \
  || echo "Database already exists — continuing."

echo "Applying schema..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA"

echo ""
echo "✅ Database setup complete."
echo "   Default admin → username: admin   password: Admin@1234"
echo "   ⚠️  Change the password before going to production."

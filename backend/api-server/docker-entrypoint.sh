#!/bin/bash
set -e

echo "Running database migrations..."
sqlx migrate run --source /app/migrations

echo "Starting application..."
exec "$@"

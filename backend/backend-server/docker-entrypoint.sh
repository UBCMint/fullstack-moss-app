#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

# Wait for PostgreSQL to be ready
# We use pg_isready which is provided by the postgresql-client package.
echo "--- Waiting for PostgreSQL to become available ---"
until pg_isready -h db -p 5432 -U postgres -d postgres -t 1; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done
echo "--- PostgreSQL is up and running ---"

# Run database migrations using sqlx-cli
# The DATABASE_URL environment variable is expected to be set in docker-compose.yml
echo "--- Running database migrations with sqlx-cli ---"
# Call sqlx directly, specifying the path to the migrations directory.
# Assuming migrations are in /app/backend-server/migrations within the container.
sqlx migrate run --source /app/backend-server/migrations
echo "--- Database migrations complete ---"

# Execute the main application command (pass all arguments to it)
echo "--- Starting API Server ---"
exec "$@"

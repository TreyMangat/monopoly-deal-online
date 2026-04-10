#!/usr/bin/env bash
# ============================================================
# Start the dev server, run the E2E test, then clean up.
# Usage: bash scripts/dev-test.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "Starting dev server..."
npm run dev &
SERVER_PID=$!

# Ensure server is killed on exit (even on failure)
trap "echo 'Stopping server (PID $SERVER_PID)...'; kill $SERVER_PID 2>/dev/null; wait $SERVER_PID 2>/dev/null" EXIT

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 2

echo "Running E2E connection test..."
npx tsx scripts/test-connection.ts ws://localhost:3000/ws

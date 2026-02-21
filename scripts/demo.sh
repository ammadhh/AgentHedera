#!/bin/bash
# ClawGuild Demo Script — Run all services locally
set -e

echo "╔═══════════════════════════════════════╗"
echo "║   ClawGuild — Autonomous Agent Market ║"
echo "║         Starting Demo...              ║"
echo "╚═══════════════════════════════════════╝"

# Ensure state directory exists
mkdir -p state

# Kill any existing processes
lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

# Clean DB for fresh demo
rm -f state/clawguild.db

echo ""
echo "Starting Backend on :3001..."
COREPACK_ENABLE_STRICT=0 npx pnpm@latest -C backend dev &
BACKEND_PID=$!
sleep 4

echo "Starting Agents..."
COREPACK_ENABLE_STRICT=0 npx pnpm@latest -C agents dev &
AGENTS_PID=$!

echo "Starting UI on :3000..."
COREPACK_ENABLE_STRICT=0 npx pnpm@latest -C ui dev &
UI_PID=$!

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║   All services running!               ║"
echo "║   Dashboard: http://localhost:3000     ║"
echo "║   API:       http://localhost:3001     ║"
echo "║   Health:    http://localhost:3001/health"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for any process to exit
wait

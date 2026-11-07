#!/usr/bin/env bash
set -e

echo ""
echo "  INDI AI — Your AI. Your PC. Your rules."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  ! Node.js 18+ is required: https://nodejs.org"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env — add at least 2 API keys, then run this script again."
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "  Installing dependencies..."
  npm install
fi

echo "  Starting INDI AI..."
npm run local

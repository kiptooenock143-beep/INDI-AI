#!/data/data/com.termux/files/usr/bin/bash
# INDI AI - one-time setup for Termux
set -e
cd "$(dirname "$0")"

echo ""
echo "  INDI AI - Termux setup"
echo ""

pkg update -y
pkg install -y nodejs git

# --ignore-scripts skips the desktop-only Electron / image-tool downloads,
# which are not needed (and do not work) on Android.
npm install --ignore-scripts --no-audit --no-fund

if [ ! -f .env ]; then
  cp local/.env.example .env
  echo "  Created .env (you can also paste API keys in the app: Settings -> API)."
fi

echo ""
echo "  Setup complete. Start INDI AI with:  bash termux-start.sh"
echo ""

#!/data/data/com.termux/files/usr/bin/bash
# INDI AI - start everything on ONE port (http://localhost:8787)
#   bash termux-start.sh            normal start (builds the app the first time)
#   bash termux-start.sh rebuild    force a fresh build (after updating files)
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "  Run setup first:  bash termux-setup.sh"
  exit 1
fi

# Keep the phone from sleeping the process (ignored if Termux:API is absent)
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# Stop any copy that is still running from an earlier session
pkill -f local/server.mjs 2>/dev/null
pkill -f vite 2>/dev/null
sleep 1

if [ "$1" = "rebuild" ] || [ ! -f dist/index.html ]; then
  echo ""
  echo "  Building INDI AI (the first time takes a minute or two)..."
  if ! npm run build; then
    echo ""
    echo "  Build failed - starting in dev mode instead (http://localhost:8080)."
    export VITE_EXILE_LOCAL_API=http://127.0.0.1:8787
    exec node local/dev.mjs
  fi
fi

echo ""
echo "  INDI AI is running."
echo "  Open  http://localhost:8787  in your phone browser (or the INDI AI app)."
echo "  Press Ctrl+C to stop."
echo ""

exec node local/server.mjs

#!/usr/bin/env bash
# Bootstrap the Harper app from scratch.
#
# Idempotent: safe to re-run. Skips work that's already done.
#
# Usage:
#   ./scripts/bootstrap.sh                   # use defaults
#   HDB_ROOT=/custom/path ./scripts/bootstrap.sh
#
# What this does:
#   1. npm install (if node_modules missing)
#   2. harperdb install into $HDB_ROOT (if not already installed)
#   3. Patch the Harper config for sandbox-friendly defaults:
#        threads.count: 1   (works around kernels without SO_REUSEPORT)
#        mqtt: disabled     (we don't use it; failed binds spam logs)
#   4. Symlink ./harper-app into <HDB_ROOT>/components/advisor-app
#   5. Start Harper in the background

set -euo pipefail

HDB_ROOT="${HDB_ROOT:-$HOME/.harperdb}"
HDB_ADMIN_USERNAME="${HDB_ADMIN_USERNAME:-admin}"
HDB_ADMIN_PASSWORD="${HDB_ADMIN_PASSWORD:-admin-local}"
COMPONENT_NAME="advisor-app"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HDB_BIN="$REPO_ROOT/node_modules/.bin/harperdb"

say() { printf '\n[bootstrap] %s\n' "$*"; }

# ── 1. npm install ───────────────────────────────────────────────
if [ ! -d "$REPO_ROOT/node_modules/harperdb" ]; then
  say "Installing npm dependencies…"
  (cd "$REPO_ROOT" && npm install)
else
  say "node_modules/harperdb already present — skipping npm install"
fi

# ── 2. harperdb install ──────────────────────────────────────────
if [ ! -f "$HDB_ROOT/harperdb-config.yaml" ]; then
  say "Running harperdb install into $HDB_ROOT…"
  HDB_ROOT="$HDB_ROOT" \
  TC_AGREEMENT="yes" \
  HDB_ADMIN_USERNAME="$HDB_ADMIN_USERNAME" \
  HDB_ADMIN_PASSWORD="$HDB_ADMIN_PASSWORD" \
  OPERATIONSAPI_NETWORK_PORT=9925 \
  HTTP_PORT=9926 \
  ANALYTICS_ENABLED=false \
  LOGGING_LEVEL=warn \
    "$HDB_BIN" install
else
  say "Harper already installed at $HDB_ROOT — skipping install"
fi

# ── 3. Patch sandbox-friendly defaults ───────────────────────────
CFG="$HDB_ROOT/harperdb-config.yaml"
say "Applying sandbox-friendly config to $CFG"

# threads.count: 1
if grep -qE '^[[:space:]]*count:[[:space:]]+[0-9]+' "$CFG"; then
  sed -i.bak -E 's/^([[:space:]]*count:[[:space:]]+)[0-9]+/\11/' "$CFG"
fi

# Disable MQTT listeners (sandbox kernels often reject these binds)
python3 - "$CFG" <<'PY'
import sys, pathlib, re
p = pathlib.Path(sys.argv[1])
text = p.read_text()
# Only patch the mqtt block, leave others alone
new = re.sub(
    r'(mqtt:\s*\n\s*network:\s*\n)(\s*port:.*\n\s*securePort:.*\n)(\s*mtls:.*\n)(\s*webSocket:).*',
    r'\1    port: null\n    securePort: null\n\3\4 false',
    text, flags=re.MULTILINE,
)
if new != text:
    p.write_text(new)
    print("  mqtt block patched")
else:
    print("  mqtt block already patched (or shape changed)")
PY

# ── 4. Symlink component ─────────────────────────────────────────
COMPONENTS_DIR="$HDB_ROOT/components"
mkdir -p "$COMPONENTS_DIR"
LINK="$COMPONENTS_DIR/$COMPONENT_NAME"
TARGET="$REPO_ROOT/harper-app"

if [ -L "$LINK" ] && [ "$(readlink "$LINK")" = "$TARGET" ]; then
  say "Component symlink already correct"
else
  say "Linking $LINK → $TARGET"
  ln -sfn "$TARGET" "$LINK"
fi

# ── 5. Start Harper ──────────────────────────────────────────────
status=$("$HDB_BIN" status 2>/dev/null | grep -oE 'status:[[:space:]]+(running|stopped)' | head -1 || true)
if [[ "$status" == *running* ]]; then
  say "Harper already running — restarting to pick up config & component changes"
  "$HDB_BIN" stop >/dev/null 2>&1 || true
  sleep 2
fi

say "Starting Harper…"
"$HDB_BIN" start | grep -av '▒\|▓' | tail -5

# Wait for the operations socket to appear
for i in $(seq 1 20); do
  if [ -S "$HDB_ROOT/operations-server" ]; then
    break
  fi
  sleep 1
done

if [ -S "$HDB_ROOT/operations-server" ]; then
  say "Harper is up. Operations API:"
  echo "    Unix socket: $HDB_ROOT/operations-server"
  echo "    TCP:         http://127.0.0.1:9925/  (if SO_REUSEPORT works on this kernel)"
  echo "    REST:        http://127.0.0.1:9926/<TableName>"
else
  say "Operations socket did not appear within 20s — check $HDB_ROOT/log/hdb.log"
  exit 1
fi

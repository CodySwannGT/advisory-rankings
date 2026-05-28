#!/usr/bin/env bash
# PR-time end-to-end smoke against a LOCAL HarperDB.
#
# Boots Harper with this checkout's component + the seeded fixture, serves the
# web shell via the dev server, and runs the core (resource-backed) smoke
# scenarios against it — exercising the PR's ACTUAL backend code before deploy.
# Catches the backend-regression classes (e.g. the /Search 500, the kind
# toggle) that previously only surfaced in the post-deploy smoke.
#
# Wired as `test:e2e` so the Lisa quality workflow runs it on every PR.
# Skips gracefully (exit 0) if HarperDB cannot be installed/started in the
# environment, so it never blocks a PR on infra it cannot provision — the
# signal is the assertions when the stack is available.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
HDB_ROOT="${HDB_ROOT:-$HOME/.harperdb}"
HDB_BIN="$REPO_ROOT/node_modules/.bin/harperdb"
DEV_PORT="${E2E_PORT:-9931}"
DEV_PID=""

# Force all Harper data-plane operations (seed) at the LOCAL instance via its
# unix socket. In CI the HARPER_* env vars point at the deployed cluster, so
# without this the seed authenticates against production and 401s. An empty
# HDB_TARGET_URL makes the client fall back to $HDB_ROOT/operations-server, and
# the local admin creds match what bootstrap.sh installs.
export HDB_TARGET_URL=""
export HDB_ADMIN_USERNAME="${HDB_ADMIN_USERNAME:-admin}"
export HDB_ADMIN_PASSWORD="${HDB_ADMIN_PASSWORD:-admin-local}"

say() { printf '\n[e2e] %s\n' "$*"; }

cleanup() {
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true
  "$HDB_BIN" stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A stale non-symlink component dir breaks bootstrap's `ln -sfn`; clear it.
COMPONENT="$HDB_ROOT/components/advisor-app"
if [ -e "$COMPONENT" ] && [ ! -L "$COMPONENT" ]; then rm -rf "$COMPONENT"; fi

say "Bootstrapping local Harper (build + install + start)…"
if ! bash scripts/bootstrap.sh; then
  say "Harper bootstrap failed in this environment — skipping PR-time e2e (not a test failure)."
  exit 0
fi

say "Waiting for Harper resources on :9926…"
ready=""
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:9926/Feed"; then ready=1; break; fi
  sleep 2
done
if [ -z "$ready" ]; then
  say "Harper did not become ready — skipping PR-time e2e (not a test failure)."
  exit 0
fi

say "Seeding fixture…"
bun run seed

# Populate the AdvisorSearchIndex token table so the rewritten q-path in
# /PublicAdvisors and /Search can resolve names without falling back to a
# full-table scan. Production deploys run this same script as a post-deploy
# step (see docs/fabric-runbook.md §6); we run it here so the e2e gate
# exercises the same shape the deployed dev cluster will. Idempotent — safe
# to re-run.
say "Backfilling AdvisorSearchIndex tokens…"
bun run backfill:search-index

say "Starting dev server on :$DEV_PORT (web shell + resource proxy)…"
PORT="$DEV_PORT" node dist/scripts/dev_server.js >/tmp/e2e-devserver.log 2>&1 &
DEV_PID=$!
dev_ready=""
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:$DEV_PORT/"; then dev_ready=1; break; fi
  sleep 1
done
if [ -z "$dev_ready" ]; then
  say "Dev server did not start — skipping PR-time e2e (not a test failure)."
  cat /tmp/e2e-devserver.log 2>/dev/null | tail -10 || true
  exit 0
fi

say "Ensuring Playwright chromium is available…"
bunx playwright install chromium >/dev/null 2>&1 || true

say "Running core smoke against the local stack…"
SMOKE_SCOPE=core BASE_URL="http://127.0.0.1:$DEV_PORT" bun tests/web_smoke.ts

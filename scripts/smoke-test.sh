#!/usr/bin/env sh
# Local smoke test for the Worker API.
# Applies D1 migrations, boots `wrangler dev --local`, exercises the API, then stops it.
# Usage: sh ./scripts/smoke-test.sh [port] [password]
set -u

PORT="${1:-8787}"
PASSWORD="${2:-demo}"
BASE="http://127.0.0.1:${PORT}"
WORKER_DIR="$(cd "$(dirname "$0")/../worker" && pwd)"
LOG="/tmp/wrangler-smoke.log"

fail() {
  echo "FAIL: $1"
  [ -n "${PID:-}" ] && kill -9 "$PID" 2>/dev/null
  tail -20 "$LOG" 2>/dev/null
  exit 1
}

expect_status() {
  expected="$1"; label="$2"; shift 2
  status=$(curl -s -o /dev/null -w '%{http_code}' "$@") || fail "$label (curl error)"
  [ "$status" = "$expected" ] || fail "$label expected HTTP $expected, got $status"
  echo "ok: $label -> $status"
}

cd "$WORKER_DIR" || exit 1

echo "== applying D1 migrations (local) =="
npx wrangler d1 migrations apply leads-db --local >/dev/null 2>&1 || fail "d1 migrations apply"

echo "== starting wrangler dev --local on :$PORT =="
npx wrangler dev --local --port "$PORT" > "$LOG" 2>&1 &
PID=$!

for i in $(seq 1 30); do
  curl -sf "$BASE/" >/dev/null 2>&1 && break
  kill -0 "$PID" 2>/dev/null || fail "wrangler exited early"
  sleep 1
done

trap 'kill -9 $PID 2>/dev/null' EXIT

echo "== running API checks =="
expect_status 200 "GET / (health)" "$BASE/"
expect_status 401 "PATCH /api/leads/1 without token" -X PATCH "$BASE/api/leads/1"
expect_status 401 "POST /api/login wrong password" -H 'Content-Type: application/json' -d '{"password":"nope"}' "$BASE/api/login"
expect_status 204 "OPTIONS preflight" -X OPTIONS -H 'Origin: http://localhost:5173' "$BASE/api/leads"
expect_status 200 "POST /api/login correct password" -H 'Content-Type: application/json' -d "{\"password\":\"$PASSWORD\"}" "$BASE/api/login"

TOKEN=$(curl -s -H 'Content-Type: application/json' -d "{\"password\":\"$PASSWORD\"}" "$BASE/api/login" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || fail "could not extract token"

AUTH="Authorization: Bearer $TOKEN"

expect_status 200 "GET /api/leads" -H "$AUTH" "$BASE/api/leads"

curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test","phone":"+1 555 0100","email":"smoke@test.io","status":"new","description":"created by smoke test"}' \
  "$BASE/api/leads" > /tmp/smoke-create.json || fail "create lead"
echo "ok: POST /api/leads -> $(cat /tmp/smoke-create.json)"

LEAD_ID=$(sed -n 's/.*"id":\([0-9]*\).*/\1/p' /tmp/smoke-create.json | head -1)
[ -n "$LEAD_ID" ] || fail "could not extract created lead id"

curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' -d '{"status":"contacted","value":500}' \
  "$BASE/api/leads/$LEAD_ID" > /tmp/smoke-patch.json || fail "patch lead"
echo "ok: PATCH /api/leads/$LEAD_ID -> $(cat /tmp/smoke-patch.json)"
[ "$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{})" 2>/dev/null; true)" ] && true
grep -q '"value":500' /tmp/smoke-patch.json || fail "deal value not persisted (value should be 500)"
echo "ok: deal value persisted"

expect_status 404 "DELETE unknown lead" -H "$AUTH" -X DELETE "$BASE/api/leads/99999"
expect_status 200 "DELETE created lead after patch" -H "$AUTH" -X DELETE "$BASE/api/leads/$LEAD_ID"

# Budget endpoints
echo "-- budget --"
expect_status 200 "GET /api/budget" -H "$AUTH" "$BASE/api/budget"

curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"month":"2026-10","type":"spending","label":"Smoke ads","amount":123.45}' \
  "$BASE/api/budget" > /tmp/smoke-budget.json || fail "create budget entry"
echo "ok: POST /api/budget -> $(cat /tmp/smoke-budget.json)"

BUDGET_ID=$(sed -n 's/.*"id":\([0-9]*\).*/\1/p' /tmp/smoke-budget.json | head -1)
[ -n "$BUDGET_ID" ] || fail "could not extract budget entry id"

curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' -d '{"amount":150,"type":"made"}' \
  "$BASE/api/budget/$BUDGET_ID" > /tmp/smoke-budget-patch.json || fail "patch budget"
echo "ok: PATCH /api/budget/$BUDGET_ID -> $(cat /tmp/smoke-budget-patch.json)"

expect_status 400 "POST /api/budget bad month" -H "$AUTH" -H 'Content-Type: application/json' -d '{"month":"2026/10","type":"spending","amount":10}' "$BASE/api/budget"
expect_status 400 "POST /api/budget bad amount" -H "$AUTH" -H 'Content-Type: application/json' -d '{"month":"2026-10","type":"spending","amount":"abc"}' "$BASE/api/budget"
expect_status 404 "PATCH unknown budget entry" -H "$AUTH" -H 'Content-Type: application/json' -X PATCH -d '{"amount":1}' "$BASE/api/budget/99999"
expect_status 200 "DELETE budget entry" -H "$AUTH" -X DELETE "$BASE/api/budget/$BUDGET_ID"

echo "ALL SMOKE TESTS PASSED"

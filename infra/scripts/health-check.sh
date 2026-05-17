#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:5173}"

curl -fsS "$API_URL/api/health/live" >/dev/null
curl -fsS "$API_URL/api/health/ready" >/dev/null
curl -fsS "$WEB_URL" >/dev/null

echo "SmartTaxi health check passed"

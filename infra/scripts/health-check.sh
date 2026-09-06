#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:${SMARTTAXI_API_PORT:-4001}}"
WEB_URL="${WEB_URL:-http://127.0.0.1:${SMARTTAXI_WEB_PORT:-5175}}"

curl --connect-timeout 5 --max-time 15 -fsS "${API_URL%/}/api/health/live" >/dev/null
curl --connect-timeout 5 --max-time 15 -fsS "${API_URL%/}/api/health/ready" >/dev/null
curl --connect-timeout 5 --max-time 15 -fsS "$WEB_URL" >/dev/null

echo "SmartTaxi health check passed"

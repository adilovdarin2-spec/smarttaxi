#!/usr/bin/env bash
set -euo pipefail
cd /opt/smarttaxi/app
docker compose up -d --build
docker compose exec api npm run seed || true
docker compose ps
curl -f http://127.0.0.1:4000/api/health

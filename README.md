# SmartTaxi v1.0

SmartTaxi is a production-oriented taxi dispatch starter for Atakent:

- `apps/api`: Express API with PostgreSQL, Redis, JWT auth, Socket.IO, audit logs, tariffs, orders, drivers, finance, health, maps fallback estimates.
- `apps/web`: PWA-style web app for `/client`, `/driver`, `/owner`.
- `infra`: nginx example, deploy, backup, restore, logs, health scripts.

## Local Start

1. Copy environment file:

```bash
cp .env.example .env
```

2. For local Docker development, keep `NODE_ENV=development` or use the compose defaults. For production, fill real secrets before deploy.

3. Start services:

```bash
docker compose up -d --build
docker compose exec api npm run seed
curl http://127.0.0.1:4000/api/health/ready
```

4. Open:

```txt
Client: http://localhost:5173/
Driver: http://localhost:5173/driver
Owner:  http://localhost:5173/owner
```

## Required Environment

Fill `.env` from `.env.example`:

```txt
POSTGRES_DB=smarttaxi
POSTGRES_USER=smarttaxi
POSTGRES_PASSWORD=strong-password
POSTGRES_PORT=5433
DATABASE_URL=postgresql://smarttaxi:strong-password@127.0.0.1:5433/smarttaxi
REDIS_URL=redis://127.0.0.1:6379
API_DATABASE_URL=postgresql://smarttaxi:strong-password@postgres:5432/smarttaxi
API_REDIS_URL=redis://redis:6379
JWT_SECRET=random-64-character-production-secret
CORS_ORIGINS=https://app.smarttaxi.kz,https://smarttaxi.kz
API_ORIGIN=https://api.smarttaxi.kz
APP_ORIGIN=https://app.smarttaxi.kz
VITE_GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_SERVER_KEY=
```

`JWT_SECRET` must be at least 32 characters. In production, do not use demo values.

For local host runs (`npm --prefix apps/api run dev`), `DATABASE_URL` and `REDIS_URL`
must point to ports reachable from Windows, for example `127.0.0.1:5433` and
`127.0.0.1:6379`. For Docker Compose, the API container uses
`API_DATABASE_URL` and `API_REDIS_URL`; keep those pointed at the Compose service
names `postgres` and `redis`.

Google Maps keys are optional for now. If they are empty, `/api/maps/estimate` returns a safe fallback estimate and the client app keeps working.

## SMS Provider

Local development uses the built-in dev SMS code flow. For real SMS on VPS, keep the Infobip token only in `.env` or server secrets:

```txt
SMS_PROVIDER=infobip
SMS_FROM=ServiceSMS
INFOBIP_BASE_URL=https://YOUR_INFOBIP_SUBDOMAIN.api.infobip.com
INFOBIP_API_KEY=YOUR_INFOBIP_APP_KEY
```

Do not commit the real `INFOBIP_API_KEY`. If `SMS_PROVIDER=infobip` is enabled and delivery fails, `/api/auth/sms/send` returns a clean backend error instead of pretending the SMS was sent.

## VPS Deploy

Expected app path:

```bash
/opt/smarttaxi/app
```

Deploy:

```bash
cd /opt/smarttaxi/app
cp .env.example .env
# edit .env with production values
./infra/scripts/deploy.sh
```

Install nginx config example:

```bash
sudo cp infra/nginx/smarttaxi.conf /etc/nginx/sites-available/smarttaxi.conf
sudo ln -s /etc/nginx/sites-available/smarttaxi.conf /etc/nginx/sites-enabled/smarttaxi.conf
sudo nginx -t
sudo systemctl reload nginx
```

The nginx example routes:

- `api.smarttaxi.kz` to `127.0.0.1:4000`
- `app.smarttaxi.kz` to `127.0.0.1:5173`
- `/socket.io/` to the API Socket.IO server

## Backup

Create a PostgreSQL backup:

```bash
./infra/scripts/backup-db.sh
```

Backups are written to:

```txt
/opt/smarttaxi/backups
```

## Restore

Restore from a backup:

```bash
./infra/scripts/restore-db.sh /opt/smarttaxi/backups/smarttaxi_YYYYMMDD_HHMMSS.sql.gz
```

This overwrites the current database. Make a fresh backup first.

## Logs

All services:

```bash
./infra/scripts/logs.sh
```

One service:

```bash
./infra/scripts/logs.sh api
./infra/scripts/logs.sh web
./infra/scripts/logs.sh postgres
./infra/scripts/logs.sh redis
```

## Health

```bash
./infra/scripts/health-check.sh
```

Checks:

- API liveness
- API readiness
- web homepage

## Safety Rule

Do not run:

```bash
docker compose down -v
```

unless you have created and verified a database backup. The `-v` flag deletes PostgreSQL volumes and can destroy production data.

## Test Accounts

Owner:

```txt
admin@smarttaxi.local / ChangeMe_2026!
```

Driver:

```txt
+77000000000 / 123456
```

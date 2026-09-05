# VPS deployment

**NOT USED IN PROD (2026-07-15)** — Railway is the only live production
deployment now; this VPS/nginx/docker-compose path is kept in the repo for
reference but is not currently running anything and is not the deploy
target. See docs/status/railway-domain-setup-2026-07-15.md for the current
plan to attach a custom domain directly to Railway instead.

Target baseline:

- VPS IP: `78.140.245.205`
- API domain: `api.smarttaxi.kz`
- Web domain: `app.smarttaxi.kz` or `smarttaxi.kz`
- OS: Ubuntu 24.04
- Runtime: Docker Compose, Nginx, Let's Encrypt

**QA note (2026-07-15)**: as of this check, neither `api.smarttaxi.kz`
nor `smarttaxi.kz` currently resolves/responds (`curl` → connection
failure on both, independently confirmed and also reported live by the
mobile session in `apps/mobile/smarttaxi_app/docs/status/mobile-overnight-2026-07-15.md`
§8). The actual live backend right now is
`https://smarttaxi-api-production.up.railway.app` (confirmed `200` on
`/api/health`), which is also the mobile app's compiled-in default when
`API_BASE_URL` isn't overridden. This VPS baseline (this domain, this
IP) hasn't been stood up yet — treat the steps below as the target
plan, not the current state, until the domains actually resolve.

Do not put SSH passwords, private keys, or real `.env` values in this repository.

## 1. DNS

Create A records:

- `api.smarttaxi.kz -> 78.140.245.205`
- `app.smarttaxi.kz -> 78.140.245.205`
- optionally `smarttaxi.kz -> 78.140.245.205`

## 2. Server packages

```bash
apt update
apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 3. App directory

```bash
mkdir -p /opt/smarttaxi
cd /opt/smarttaxi
git clone <repo-url> .
git checkout dev
cp .env.example .env
nano .env
```

Replace every placeholder. Production essentials:

```env
NODE_ENV=production
API_PUBLIC_URL=https://api.smarttaxi.kz
WEB_PUBLIC_URL=https://app.smarttaxi.kz
SMS_PROVIDER=infobip
RATE_LIMIT_ENABLED=true
CORS_ORIGINS=https://app.smarttaxi.kz,https://smarttaxi.kz
```

## 4. Start containers

```bash
docker compose config --quiet
docker compose up -d postgres redis
docker compose up -d --build api web
docker compose ps
```

For the maintained Compose helper, use `bash infra/scripts/deploy.sh` on an
existing installation. On the first installation only, use
`bash infra/scripts/deploy.sh --first-deploy`; this provisions Postgres first
and still requires a successful baseline backup before starting the app.
Backup/pull/readiness failures stop the helper. It never seeds accounts.

If OSRM data is prepared:

```bash
docker compose --profile routing up -d osrm
docker compose up -d --build api web
```

## 5. Verify

```bash
bash infra/scripts/health-check.sh
curl http://127.0.0.1:4001/api/maps/diagnostics
```

Host defaults are API `4001` and web `5175`; container ports remain `4000`
and `80`. For standalone health checks, export `SMARTTAXI_API_PORT` /
`SMARTTAXI_WEB_PORT` or explicit `API_URL` / `WEB_URL` when using different
published ports. The deploy helper reads the actual bindings from Compose.

Seed/test-account and business-flow smoke commands are **local-development
only**, against the separate QA stack. Account provisioning for a live service
is not a deployment step. After confirming `NODE_ENV=development` in that
local API, its smoke commands can run inside the container:

```bash
docker compose exec -T -e API_URL=http://127.0.0.1:4000 api npm run smoke:health
docker compose exec -T -e API_URL=http://127.0.0.1:4000 api npm run smoke:maps
docker compose exec -T -e API_URL=http://127.0.0.1:4000 api npm run smoke:stage3
```

## 6. Nginx

```bash
cp infra/nginx/smarttaxi.conf /etc/nginx/sites-available/smarttaxi.conf
ln -sf /etc/nginx/sites-available/smarttaxi.conf /etc/nginx/sites-enabled/smarttaxi.conf
nginx -t
systemctl reload nginx
```

TLS:

```bash
certbot --nginx -d api.smarttaxi.kz -d app.smarttaxi.kz -d smarttaxi.kz
```

Verify:

```bash
curl https://api.smarttaxi.kz/api/health
curl https://api.smarttaxi.kz/api/health/ready
curl https://api.smarttaxi.kz/api/maps/diagnostics
```

## 7. Backup

```bash
BACKUP_DIR=/opt/smarttaxi/backups bash infra/scripts/backup-db.sh
```

Add a daily cron/systemd timer after testing restore.
See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for recovery into a separate new
database and verification; the helpers do not delete earlier recovery points.

## 8. Rollback

```bash
git fetch
git checkout <previous-good-commit>
docker compose up -d --build api web
curl https://api.smarttaxi.kz/api/health/ready
```

Database recovery is a separate operation from application rollback. The
restore helper creates a new database and leaves the running connection
unchanged; verify it before considering promotion.

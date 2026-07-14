# VPS deployment

Target baseline:

- VPS IP: `78.140.245.205`
- API domain: `api.smarttaxi.kz`
- Web domain: `app.smarttaxi.kz` or `smarttaxi.kz`
- OS: Ubuntu 24.04
- Runtime: Docker Compose, Nginx, Let's Encrypt

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

If OSRM data is prepared:

```bash
docker compose --profile routing up -d osrm
docker compose up -d --build api web
```

## 5. Seed and verify

```bash
docker compose exec api npm run seed
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:4000/api/health/ready
curl http://127.0.0.1:4000/api/maps/diagnostics
```

Run smokes:

```bash
API_URL=http://127.0.0.1:4000 docker compose exec api npm run smoke:health
API_URL=http://127.0.0.1:4000 docker compose exec api npm run smoke:maps
API_URL=http://127.0.0.1:4000 docker compose exec api npm run smoke:stage3
API_URL=http://127.0.0.1:4000 docker compose exec api npm run smoke:stage9
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
POSTGRES_USER=smarttaxi POSTGRES_DB=smarttaxi ./infra/scripts/backup-db.sh
```

Add a daily cron/systemd timer after testing restore.

## 8. Rollback

```bash
git fetch
git checkout <previous-good-commit>
docker compose up -d --build api web
curl https://api.smarttaxi.kz/api/health/ready
```

Do not run destructive restore as rollback unless the database migration itself broke data.

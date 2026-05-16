# SmartTaxi v1.0 GitHub Starter

Это папка, которую можно загрузить в GitHub. Она сделана специально, чтобы Codex мог дальше удобно менять код по этапам.

## Структура

```txt
smarttaxi/
  apps/api        # backend: Express + PostgreSQL + Redis + Socket.IO
  apps/web        # PWA: /client /driver /owner
  apps/mobile     # место под Expo mobile
  packages/shared # общие статусы, роли, расчеты
  infra           # nginx, deploy, backup scripts
```

## Быстрый запуск

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api npm run seed
curl http://localhost:4000/api/health
```

Web:
```txt
http://localhost:5173/client
http://localhost:5173/driver
http://localhost:5173/owner
```

## Тестовые данные

Owner:
```txt
admin@smarttaxi.local / ChangeMe_2026!
```

Driver:
```txt
+77000000000 / 123456
```

## Что реализовано

- Backend health
- PostgreSQL schema
- Redis
- JWT auth
- Owner/driver login
- Create order
- List orders
- Driver accept order
- Driver arrived/start/complete/cancel
- Transaction protection from double-accept
- Tariffs
- Cashback 2%
- Driver debt for CASH/KASPI
- Owner finance stats
- Driver stats
- Basic Socket.IO realtime
- Web pages: /client /driver /owner
- Docker compose
- Nginx example
- Backup script

## Что делать после загрузки в GitHub

1. Создай ветку `dev`.
2. Дай Codex файл `CODEX_PROMPTS.md`.
3. Пусть он улучшает проект по этапам.
4. Не загружай `.env` в GitHub.

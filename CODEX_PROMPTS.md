# Codex workflow for SmartTaxi

## Стартовый промпт

Ты работаешь как senior full-stack engineer / architect / DevOps / QA.
Работай только в ветке `dev`. Не меняй main напрямую.
Проект: SmartTaxi для Atakent.

Цель: довести проект до SmartTaxi v1.0 Stable.

Сначала:
1. Проанализируй структуру.
2. Запусти проверки.
3. Исправь ошибки.
4. Создай Pull Request.

## Этапы

### Этап 1 — Backend hardening
Проверь auth, orders, drivers, tariffs, finance, health.
Добавь валидацию, нормальные ошибки, audit logs, rate limit.

### Этап 2 — Web polish
Улучши /client /driver /owner.
Темно-золотой дизайн, loading/error states, realtime.

### Этап 3 — Google Maps
Добавь geolocation, Places autocomplete, route calculation fallback.

### Этап 4 — Finance
Улучши cashback, driver debt, payments, reports.

### Этап 5 — Mobile
Добавь Expo mobile app.

После каждого этапа:
- npm install/build
- docker compose config
- docker compose up -d --build
- curl /api/health
- проверить create order → driver accept → complete

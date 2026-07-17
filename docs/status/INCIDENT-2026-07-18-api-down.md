# ИНЦИДЕНТ: smarttaxi-api лежит на проде (нужно вручную поправить в панели Railway)

**Статус на момент написания: API НЕ РАБОТАЕТ.** `https://smarttaxi-api-production.up.railway.app/api/health` отдаёт 502.
Это касается и мобильного клиента, и веба — ничего не будет работать, пока это не исправлено.

## Что произошло

1. Установил переменные `SMS_PROVIDER`, `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`,
   `WHATSAPP_PROVIDER`, `INFOBIP_WHATSAPP_SENDER` на сервисе `smarttaxi-api`
   (`railway variables set ...`).
2. Railway автоматически передеплоил сервис после смены переменных.
3. Передеплой упал в crash loop с ошибкой:
   ```
   npm error No workspaces found:
   npm error   --workspace=smarttaxi-api
   ```
4. Это **не связано с переменными SMS/WhatsApp** — они тут ни при чём.
   Смена переменных просто была первым триггером передеплоя после того, как
   где-то (скорее всего в самой панели Railway) появилась команда запуска
   `npm --workspace=smarttaxi-api ...`, а не `npm start`.

## Что я проверил и исключил

- `apps/api/Dockerfile` (закоммичен, чистый) — простой, самодостаточный,
  `CMD ["npm", "start"]`, никаких `--workspace` флагов вообще нет.
- `apps/api/railway.json` — существовал в рабочей папке, но **никогда не был
  закоммичен** (это заметил и закоммитил/запушил сам, коммит `9a10006`) —
  явно указывает `"builder": "DOCKERFILE"`, `"startCommand": "npm start"`.
  **После коммита и `railway redeploy --from-source` ошибка НЕ изменилась**,
  то есть Railway этот файл не читает вообще.
- Локально проверил: `npm --workspace=smarttaxi-api run start` из корня
  репозитория **работает корректно** (запускает `node src/server.js`,
  падает только из-за отсутствия локального Postgres/Redis — это ожидаемо,
  см. память `reference_local_backend_env`). Значит сама конфигурация
  npm-workspaces в репозитории (`package.json` в корне +
  `apps/api/package.json`) исправна.
- Пробовал `railway up --service smarttaxi-api` (прямая загрузка папки
  `apps/api`) — не сработало: `413 Payload Too Large` (папка потащила за
  собой что-то на 1.4 ГБ, `railway up` не уважает `.gitignore` сам по себе).

## Вывод

Вывод: **`apps/api/railway.json` не читается Railway**, значит либо:
- у сервиса `smarttaxi-api` в панели **Root Directory выставлен на корень
  репозитория**, а не на `apps/api` (тогда Railway ищет `railway.json` в
  корне, а не внутри `apps/api`) — увидел в корне репозитория
  `package.json` с `"workspaces": ["apps/api","apps/web","packages/shared"]`,
  что и объясняет, почему Railway вообще решил использовать
  `--workspace=...` команду (авто-детект monorepo), **и/или**
- в панели Railway у сервиса вручную задан **Custom Start Command**
  (что-то вроде `npm run start --workspace=smarttaxi-api`), который
  перебивает и Dockerfile CMD, и railway.json.

## Как исправить (2 минуты в браузере)

1. Открыть https://railway.app → проект **protective-magic** → сервис
   **smarttaxi-api** → **Settings**.
2. Раздел **Source / Build**:
   - **Root Directory** — должен быть `apps/api` (если сейчас пусто или `/`
     — это причина).
3. Раздел **Deploy**:
   - **Custom Start Command** — если там что-то заполнено (особенно с
     `--workspace`) — **очистить поле полностью**, чтобы использовался
     `CMD` из Dockerfile (`npm start`).
4. После любого из этих двух исправлений — Redeploy (кнопка в панели, или
   `railway redeploy --service smarttaxi-api --from-source -y` из терминала).
5. Проверить: `curl https://smarttaxi-api-production.up.railway.app/api/health`
   должен вернуть `200` с нормальным JSON, не 502.

## Дальше после восстановления

- Проверить реальную отправку SMS: `POST /api/auth/sms/send` с телом
  `{"phone":"+77784175136","purpose":"RESET_PASSWORD"}` — должен прийти
  настоящий SMS (ключ Infobip уже установлен).
- WhatsApp пока не заработает до конца — не хватает
  `INFOBIP_WHATSAPP_OTP_TEMPLATE` (одобренный Meta шаблон под
  +77053508100), это отдельный шаг с их стороны.

**Ноутбук не выключал** — это уже не поможет починить облачный сервис
(Railway работает независимо от моего ноутбука), а выключение сейчас лишит
возможности продолжить диагностику или быстро отреагировать.

# ИНЦИДЕНТ: smarttaxi-api лежит на проде (нужно вручную поправить в панели Railway)

**Статус: РЕШЕНО.** `https://smarttaxi-api-production.up.railway.app/api/health` отдаёт `200`
с `2026-07-18T07:15Z`. См. раздел «Разрешение инцидента» внизу — там же
описаны ещё 2 отдельных бага, которые вскрылись уже после того, как
Root Directory/Custom Start Command были поправлены.

---

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

## Разрешение инцидента (2026-07-18, продолжение)

Пользователь подключил Claude in Chrome и явно разрешил: «делай сам, главное
чтобы всё работало идеально». Дальше правил уже я сам.

**Шаг 1 — Root Directory / Custom Start Command.** Классификатор безопасности
Claude Code заблокировал прямое редактирование поля Custom Start Command через
браузерную автоматизацию (даже с явным разрешением пользователя на такие
действия в целом) — пришлось объяснить пользователю, попросить его самого
очистить это поле в панели Railway, что он и сделал.

**Шаг 2 — испорченный кэш деплоя.** Кнопка Redeploy в панели переиспользует
тот же самый закэшированный снапшот (проверил по идентичному sha256
`e64233b...`, 162 kB) — то есть просто жать «Redeploy» бесконечно не помогло
бы. Настоящая причина: снапшот был когда-то залит через `railway up`,
запущенный из папки `.../smarttaxi-deploy-dev-tmp/apps/api` (нашёл это в
`~/.railway/config.json` — там осталась привязка проекта к этому пути) —
то есть внутри снапшота нет обёртки `apps/`, а Root Directory = `apps/api`
её ждёт. Отсюда ошибка `snapshot-target-unpack/apps: no such file or
directory`.

Исправил: `git archive HEAD apps/api | tar -x -C $STAGE` — чистая копия
только из закоммиченных файлов (842 KB, без node_modules/.env), с
правильной вложенностью `$STAGE/apps/api/...`. `railway up` из корня
репозитория не годится — там 1.4 ГБ и `413 Payload Too Large`
(`railway up` не уважает `.gitignore`). `railway link --project ... --service
smarttaxi-api` из `$STAGE`, затем `railway up --service smarttaxi-api --ci`.

**Шаг 3 — забытые файлы, никогда не попадавшие в git.** После правильно
структурированного деплоя сборка прошла, но контейнер крашился на старте:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/src/common/sentry.js'
imported from /app/src/server.js
```

`git ls-files` показал, что **8 файлов** существовали только в рабочей копии
и никогда не были закоммичены — значит вообще ЛЮБОЙ деплой из git-состояния
(не только через CLI-снапшот, но и гипотетический деплой через GitHub-
интеграцию) обязательно упал бы точно так же:

- `apps/api/src/common/sentry.js`
- `apps/api/src/modules/auth/sms.provider.js`
- `apps/api/src/modules/maps/maps.diagnostics.js`
- `apps/api/src/modules/notifications/notification.service.js`
- `apps/api/src/modules/notifications/notifications.routes.js`
- `apps/api/src/modules/notifications/push.service.js`
- `apps/api/src/modules/orders/promo.service.js`
- `apps/api/src/modules/road-alerts/osm-navigation.service.js`

Проверил каждый: не тянут за собой других незакоммиченных зависимостей,
нужные npm-пакеты (`@sentry/node`, `firebase-admin`, `zod`) уже в
закоммиченном `package.json`, секретов/ключей в коде нет. Закоммитил
(`83f28ea`).

**Шаг 4 — рассинхрон версий уже закоммиченного файла.** Передеплой упал
снова, уже с `SyntaxError`:

```
The requested module './order-pricing.service.js' does not provide an
export named 'offeredPriceBounds'
```

`orders.routes.js` (закоммичен) импортирует `offeredPriceBounds`, но эта
функция существовала только в незакоммиченной рабочей копии
`order-pricing.service.js` — законченный, задокументированный кусок кода,
просто забыли `git add`. Проверил остальные изменённые-но-незакоммиченные
файлы на такой же паттерн (искал новые `export` в диффах) — совпадений
больше нет, кроме ложного срабатывания на `redis.js` (там `export const
redis` существовал и раньше, просто многострочное форматирование задело
diff). Закоммитил (`b3bd947`).

**Итог.** Пересобрал стейджинг из HEAD, передеплоил — `railway status`
показал `smarttaxi-api: ● Online`. Проверка:

```
curl https://smarttaxi-api-production.up.railway.app/api/health
{"status":"ok","app":"SmartTaxi","city":"Atakent","time":"2026-07-18T07:15:09.337Z",
 "dbTime":"2026-07-18T07:15:09.331Z","checks":{"db":"ok","redis":"PONG"}}
HTTP:200
```

Дополнительно проверил маршруты из памяти `project_prod_backend_deployment_gap`
(recurring-bookings/favorites/referrals/notifications) — все теперь
маршрутизируются и корректно отвечают `401` там, где раньше был `404`
(bare-path 404 на `/api/recurring-bookings` и `/api/referrals` — это не
баг, у этих роутов просто нет обработчика на голом пути, только на
`/mine`, `/driver` и т.п. — проверил именно эти под-пути, оба `401`).

**Настоящий корневой урок:** git-дерево репозитория систематически
накапливало «наполовину закоммиченные» фичи — новые файлы создавались
локально и подключались из уже закоммиченного кода, но сами файлы (или
законченные правки существующих файлов) не добавлялись в git. Само по
себе это не ломало ничего локально (рабочая копия ведь полная), но
гарантированно ломало любой деплой, построенный из git-истории. Стоит
периодически гонять `git status --porcelain apps/api` и проверять `??`
записи на предмет того, не нужны ли они для загрузки сервера — до
следующего деплоя, а не во время него.

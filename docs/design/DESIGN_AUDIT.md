# Smart Taxi UI Design Audit

Date: 2026-05-18
Branch: dev
Scope: UI/UX only. No backend, auth, API calls, WebSocket, real order creation, database or deploy changes.

## Reference Sources

Primary visual source:

- `C:\Users\Adilove\Downloads\ChatGPT Image 17 мая 2026 г., 23_46_19.png`
- Repo copy: `docs/design/references/smarttaxi_dark_gold_reference_2026-05-17_23-46-19.png`

Secondary handoff source:

- `C:\Users\Adilove\Downloads\SmartTaxi_V2_UIUX_Handoff_Pack(2).zip`
- Extracted to: `docs/design/smart-taxi-handoff-v2/smarttaxi_v2_handoff/`

Important conflict:

- The handoff docs describe a white/gold design system.
- The primary `23_46_19` reference image is dark/gold and shows all final screen visuals.
- For this UI-only pass, the primary PNG is treated as the source of truth: dark graphite screens, gold CTA, dark cards, dark map.

## Protected Files Not To Delete

The following categories were identified and must be preserved:

- `.env`, `.env.*`, `.env.example`
- `docker-compose.yml`
- `.github/workflows/*`
- `infra/scripts/deploy.sh`
- `infra/nginx/*` if present
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/web/nginx.conf`
- `apps/api/src/config/env.js`
- `apps/api/src/modules/maps/*`
- Firebase, Google Maps, API key, SSL/cert/deploy/VPS config files
- root and workspace `package.json` / lockfiles
- backend source unless a later backend stage explicitly requires it

No secrets or key values are printed in this document.

## Visual System From Primary PNG

- Background: near black `#0D0F12`
- Deep background: `#080B0E`
- Cards and panels: graphite `#1B1F27`, elevated `#20252D`
- Primary gold: `#FFC000`
- Gold highlight: `#FFD45C`
- Text: `#F5F5F5`
- Muted text: `#8A8F99`
- Borders: `rgba(255,255,255,.08)`
- Active/selected borders: gold
- Danger: red/dark red for cancel, SOS, logout
- Radius: phone shells 24-28px, cards 14-18px, CTA 18px
- Shadows: soft black shadows, subtle gold glow only on selected cards and CTA
- Icons: thin SVG line icons only. No emoji.
- Typography: compact mobile hierarchy, bold titles and prices, muted captions.

## Screens And Components In The Reference

### 1. Welcome / Intro

- Large gold Smart Taxi S/shield mark at top.
- `SmartTaxi` wordmark with white `Smart` and gold `Taxi`.
- Slogan: `Ваш комфорт. Ваш город.`
- City skyline and premium black car artwork.
- Benefit list with gold circular SVG icons:
  - Быстрый заказ
  - Честные цены
  - Маленькая комиссия
  - Безопасные поездки
  - Поддержка 24/7
- Bottom gold CTA: `Начать поездку`.

### 2. Client Home

- Dark map as top visual center.
- Floating round menu button top-left.
- Bonus pill top-right with S mark and `850 ₸`.
- Gold route line, pickup blue marker, destination gold marker, ETA badge.
- Bottom sheet overlapping map.
- Route card:
  - `Откуда` / `улица Шамо, 58`
  - `Куда` / `Орталык базар`
  - blue pickup dot and gold destination dot
  - plus icons on the right
- Quick actions: Дом, Работа, Избранное, Недавние.
- Tariff cards: Эконом, Комфорт, Бизнес, Доставка.
- Selected tariff: gold border, gold glow/check.
- Main gold CTA: `Заказать такси`.
- Bottom navigation:
  - Главная
  - История
  - centered S logo
  - Сообщения
  - Профиль

### 3. Address Search

- Header with back arrow and `Куда едем?`.
- Dark search input.
- Tabs: Все, Адреса, Организации.
- Sections:
  - Избранные адреса
  - Популярные места
  - Недавние
- Rows use SVG icons, title, subtitle, chevron.

### 4. Bonuses / Invite

- Header `Бонусы`.
- Large dark/gold balance card: `Ваш баланс 850 ₸`.
- Three action cards: История, Промокод, Пригласить.
- Referral card with gift visual and numbered steps.
- Gold CTA: `Пригласить друга`.

### 5. Active Trip

- Header `Поездка` with cancel action.
- Driver card: avatar/photo, name, Toyota Camry, plate, rating.
- Dark map with gold route and real-looking car marker.
- ETA metrics and car details.
- Actions: Поделиться, Поддержка.
- SOS belongs only to active ride context.

### 6. Completed / Review

- Header `Поездка завершена`.
- Large gold amount.
- Route summary: tariff, distance, time, pickup/dropoff.
- Payment row.
- Gold star rating.
- Buttons: Чек and Повторить поездку.

### 7. History

- Header `История поездок`.
- Segmented tabs: Все, Завершённые, Отменённые.
- Dense list rows with date, address, price, tariff/status.

### 8. Profile / Menu

- Header `Профиль`.
- Profile card: avatar, name, phone, edit link.
- Menu rows:
  - Способы оплаты
  - Бонусы
  - Промокоды
  - Пригласить друга
  - Избранные адреса
  - История поездок
  - Настройки
  - Поддержка
  - Выйти

### 9. Payment Methods

- Header `Способы оплаты`.
- Dark rows:
  - Наличные
  - Kaspi QR
  - Kaspi Перевод
  - Банковская карта / Добавить карту
- Selected method uses gold check.

### 10. Become Driver / Driver Application

- `Стать водителем` screen with car/driver visual and gold benefits.
- Gold CTA `Оставить заявку`.
- `Заявка водителя` form:
  - ФИО
  - phone
  - car model
  - plate number
  - year
  - ownership selector
  - gold CTA `Отправить заявку`.

### 11. Support

- Header `Поддержка`.
- Dark chat screen.
- User bubbles are gold.
- Operator bubbles are dark graphite.
- Bottom input with send button.

### 12. Driver UI

- Driver login / registration.
- Driver home:
  - profile/status card
  - balance/trips/rating stats
  - online/offline CTA
  - order cards with map preview
- Active order:
  - map
  - current step
  - status CTA.

### 13. Operator UI

- Desktop-friendly dispatch panel.
- Left navigation.
- Ticket tabs.
- Ticket list.
- Details panel with map preview.
- Manual driver assignment rows.
- Gold/dark action buttons.

### 14. Admin UI

- Left sidebar.
- KPI cards.
- Trip chart.
- Recent orders.
- Drivers/status cards.
- Dark/gold dashboard theme matching the product style.

## Implementation Rules

- UI data is hardcoded demo data only.
- Buttons navigate to UI screens or local UI state only.
- No real backend requests are made from the rebuilt UI.
- No WebSocket or auth logic in this stage.
- No emoji icons.
- No visible disabled placeholder junk in the main flow.
- Map is a premium SVG/CSS placeholder matching the reference, with gold route and markers.

## Current Mismatches Being Tracked

- Primary PNG is dark while secondary docs are white; primary PNG wins.
- Real car/city photographic assets are approximated with local SVG/CSS visuals for now.
- Backend integration is intentionally deferred to the next stage.

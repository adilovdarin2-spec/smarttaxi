# Smart Taxi Dark/Gold Pixel Design Audit

Date: 2026-05-18
Branch: dev
Stage: UI-only pixel rebuild

## Primary Reference

The current source of truth is:

- `docs/design/references/smarttaxi_dark_gold_reference_2026-05-17_23-46-19.png`
- Original location found on this machine: `C:\Users\Adilove\Downloads\ChatGPT Image 17 мая 2026 г., 23_46_19.png`
- Size: 1024 x 1536

The image shows the complete dark/gold Smart Taxi mobile UI set. This overrides the previous white/gold handoff for this stage.

## Protected Files

Do not delete or rewrite:

- `.env`, `.env.*`, `.env.example`
- any keys, secrets, certificates, SSL, VPS or production access files
- `docker-compose.yml`
- `.github/workflows/*`
- `infra/nginx/*`
- `infra/scripts/*`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/web/nginx.conf`
- root `package.json`, `package-lock.json`
- workspace `package.json` files
- backend source and database/deploy configuration
- README or notes that may contain access/deploy context

Only frontend UI source, frontend components, frontend styles, old demo screens and mock UI may be replaced.

## Theme Extracted From Reference

- Main background: near black `#0D0F12`
- Deeper background: `#080B0E`
- Secondary panels: `#1B1F27`
- Elevated cards: dark graphite `#20252D`
- Primary gold: `#FFC000`
- Gold gradient: `#FFD45C` to `#DFA21A`
- Main text: `#F5F5F5`
- Secondary text: `#8A8F99`
- Muted border: `rgba(255,255,255,0.08)`
- Gold border: `rgba(255,192,0,0.45)`
- Danger: red/dark red for cancel/SOS/logout
- Radius: mostly 12 to 18px, phone shells around 22 to 28px
- Shadows: soft black shadows, subtle gold glows only on selected/CTA

## Screens In The Reference

### 1. Welcome / Login

- Dark premium background.
- Large gold shield/S mark at top.
- Wordmark `SmartTaxi`; Smart in white, Taxi in gold.
- Slogan: `Ваш комфорт. Ваш город.`
- City skyline and premium black car visual in the middle.
- Benefit list with small gold circular icons:
  - Быстрый заказ
  - Честные цены
  - Маленькая комиссия
  - Безопасные поездки
  - Поддержка 24/7
- Bottom gold CTA: `Начать поездку`.

### 2. Passenger Home

- Full top dark map with thin street grid.
- Floating round menu button top-left.
- Floating bonus pill top-right with `850 ₸`.
- Yellow route line and circular ETA badge.
- Bottom route card:
  - pickup row: `Откуда`, `улица Шамо, 58`
  - destination row: `Куда`, `Орталык базар`
  - plus icons right.
- Quick action row: Дом, Работа, Избранное, Недавние.
- Tariff cards: Эконом, Комфорт, Бизнес, Доставка.
- Selected tariff has gold border and check.
- Large gold CTA: `Заказать такси`.
- Bottom nav: Главная, История, center S logo, Сообщения/Поддержка, Профиль.

### 3. Address Search

- Header back arrow + title `Куда едем?`.
- Search input.
- Sections:
  - Избранные адреса
  - Популярные места
  - Недавние
- Rows with small icons, address title, subtitle, chevron.

### 4. Bonuses

- Header `Бонусы`.
- Big card `Ваш баланс 850 ₸` with gold coin/S artwork.
- Three action cards: История, Промокод, Пригласить.
- Referral card with gift icon and three numbered steps.
- Gold CTA `Пригласить друга`.

### 5. Active Trip

- Header `Поездка`, cancel/danger action.
- Driver card: avatar/photo, name, Toyota Camry, plate, rating.
- Dark map with gold route and car marker.
- ETA/vehicle/plate metric row.
- Buttons: Поделиться, Поддержка.
- SOS only in active ride context if shown.

### 6. Completed / Review

- Header `Поездка завершена`.
- Large gold amount `650 ₸`.
- Route summary card with tariff, distance/time, pickup/dropoff and times.
- Payment method row.
- Rating stars in gold.
- Buttons: `Чек`, `Повторить поездку`.

### 7. Trip History

- Header `История поездок`.
- Segmented tabs: Все / Завершённые / Отменённые.
- Dense list rows with date, address, price and tariff/status.

### 8. Profile

- Header `Профиль`.
- Profile card with avatar, name, phone and edit link.
- Menu rows:
  - Способы оплаты
  - Бонусы 850 ₸
  - Промокоды
  - Пригласить друга
  - Избранные адреса
  - История поездок
  - Настройки
  - Поддержка
  - Выйти

### 9. Payment Methods

- Header `Способы оплаты`.
- Dark rows with line icons:
  - Наличные
  - Kaspi QR
  - Kaspi Перевод
  - Банковская карта / Добавить карту
- Selected method has gold check.

### 10. Become Driver / Driver Application

- Become driver screen:
  - title `Стать водителем`
  - car/driver visual
  - benefit list with gold checks
  - gold CTA `Оставить заявку`
- Driver application screen:
  - form rows: ФИО, phone, car model, plate, year
  - ownership segmented control
  - gold CTA `Отправить заявку`.

### 11. Support Chat

- Header `Поддержка`.
- Dark chat screen.
- User messages gold bubbles, operator messages dark bubbles.
- Bottom input with send button.

### 12. Bottom Navigation

- Dark rounded floating bar.
- Active item gold.
- Center S logo is larger and elevated.

## Required Component Direction

- SVG icons only. No emoji.
- Components:
  - `AppHeader`
  - `AppButton`
  - `AppCard`
  - `AppInput`
  - `BottomNav`
  - `RideMap`
  - `TariffCard`
  - `PaymentRow`
  - `DriverCard`
  - `MenuItem`
  - `ChatBubble`
- Role code split:
  - `features/client`
  - `features/driver`
  - `features/operator`
  - `features/admin`
  - shared UI/core components.

## Implementation Scope For This Stage

UI only.

- No backend implementation.
- No WebSocket implementation.
- No auth implementation.
- Demo data is allowed.
- Buttons must navigate to the correct UI state/screen.
- No real orders should be created.

## Current First Fixes Needed

- Convert current white/gold UI to dark/gold reference.
- Replace login/register-like first screen with the reference welcome screen.
- Keep passenger home composition tight: map, route card, quick actions, tariffs, CTA, bottom nav.
- Ensure all client reference screens are reachable.
- Ensure driver/admin/operator have dark/gold UI shells, but logic remains UI-only.
- Remove temporary screenshots and Chrome temp folders before commit.

# Промпт для следующей сессии (скопируй и отправь целиком)

Работай над `apps/mobile/smarttaxi_app/**` (клиентская + со временем водительская часть, как ниже) и `apps/api/**` там, где нужно бэкенду. Доведи приложение SmartTaxi до идеала — красиво, удобно, функционально, без единой недоделки. Не спрашивай меня ни о чём, я недоступен — принимай решения сам, документируй их в docs/status, коммить точечно (никогда `git add -A`), проверяй `flutter analyze`/`flutter test`/`npm run syntax` после каждого изменения.

## Что уже сделано (не переделывать, проверить что не сломано)

- Регион-пикер пассажира починен (`_RegionSelectSheet`/`_RegionConfirmSheet` подключены), добавлен пункт «Регион» в Настройки.
- SMS + WhatsApp через Infobip реализованы (`apps/api/src/modules/auth/{sms,whatsapp}.provider.js`), реальные ключи уже стоят на Railway.
- Экран «нужно обновление» (`main.dart`, `_UpdateRequiredScreen`/`_UpdateAvailableSheet`) + бэкенд `GET /api/app-version` — готов, работает через `AppConfig.appVersion`.
- Аватарка водителя (только с камеры, не из галереи) показывается в: driver-found/en-route (`_DriverContactCard`), в поездке, на экране отзыва (`_RateDriverPanel`), в деталях поездки (`_TripDetailScreen`). Проверь: не появились ли новые экраны с именем водителя без фото.
- Продакшен API стабилен (`docs/status/INCIDENT-2026-07-18-api-down.md` — полная история инцидента и решения, включая правило: перед любым деплоем гонять `git status --porcelain apps/api` и коммитить забытые файлы).

## Главная незакрытая задача — тема и меню

`apps/mobile/smarttaxi_app/lib/core/theme/app_theme.dart` уже содержит ПРАВИЛЬНУЮ тему-зависимую систему (`SmartTaxiPalette`, `context.palette` — автоматически меняется light/dark). Она используется только в новых водительских экранах (`lib/features/driver/widgets/driver_shell_chrome.dart`, `driver_common_widgets.dart` — `DriverDrawer`, `DriverHeader`, `DrawerItem`, `DrawerSectionLabel`).

`passenger_shell.dart` (весь, 16000+ строк) и большая часть `driver_shell.dart` всё ещё используют статичные `SmartTaxiColors.xxx` — они НЕ меняются при переключении темы. Это и есть причина, почему тёмная тема выглядит наполовину рабочей.

Задачи по приоритету — **готово**: `_SmartDrawer`/`_DrawerItem`/`_DrawerSectionLabel` (commit `0aaa077`), `_AppHeader` (`c94100d`), `_PaymentMethodSheet`/`_PaymentIcon` (`8fa141b`).

**КРИТИЧНО — прочитай перед тем как продолжать мигрировать что-либо ещё:**
Корневой `Scaffold` всего `PassengerShell` (`build()` метода `_PassengerShellState`, там же где `drawer: _SmartDrawer(...)`) имеет `backgroundColor: SmartTaxiColors.appBackground` — статичный, немигрированный. Это ЕДИНЫЙ фон для содержимого ВСЕХ вкладок (Настройки, Профиль, История и т.д.) — они сами не оборачивают себя в `Scaffold`.

**Из-за этого миграция текста/карточек, лежащих ПРЯМО на этом фоне (`_TitleBlock`, `_PremiumCard` и всё что внутри — `_SettingsGroup`, `_SettingsRow`, `_ProfileGroupLabel`, `_MenuLine` и т.д.), НЕБЕЗОПАСНА поштучно** — если помигрировать, например, только `_SettingsGroup`'s текст на `palette.text` (в тёмной теме — почти белый), а фон Scaffold и `_PremiumCard` останутся белыми — получится светлый текст на светлом фоне, то есть станет ХУЖЕ, чем сейчас (сейчас всё просто "не адаптируется", а не "нечитаемо").

**Безопасны только самодостаточные оверлеи** — виджеты, у которых СВОЙ явный `Container`/`decoration` с фоном, не зависящий от Scaffold: `Drawer`, `showModalBottomSheet`-шторки (`_PaymentMethodSheet` уже сделан; ещё есть `_CancelConfirmSheet`, `_SafetySheet`, `_ConfirmSheet`, `_OrderNoteSheet`, `_AddDriverPreferenceSheet`, `_CreateFavoriteAddressSheet`, `_SimpleAddressSearchSheet`, `_CreateRecurringBookingSheet`, `_ChatSheet`, `_AddressSearchSheet`, `_LocationPermissionSheet`, `_CollapsibleOrderSheet`, `_OrderSheet` — но последние два входят в защищённый tariff/address-flow, не трогать), плавающая chrome вроде `_AppHeader` (сделан).

**НЕ трогай пока**: `_MapGlassChrome`/`_MapBrandPill`/`_MapChromeButton`/`_NotificationButton` — это полупрозрачное "стекло" поверх карты (`Colors.white.withValues(alpha: 0.72)`), возможно ЗАДУМАНО оставаться светлым независимо от темы (карта не темнеет). Нужна визуальная проверка перед решением, не мигрировать вслепую.

Следующие шаги по приоритету:
1. Догнать оставшиеся безопасные шторки (список выше) — по одной, коммитить каждую отдельно.
2. Затем — большая, атомарная задача: мигрировать корневой `Scaffold.backgroundColor` (`palette.appBackground`) И `_PremiumCard`, И все ~29 мест, где `_PremiumCard(` вызывается (`grep -c "_PremiumCard(" passenger_shell.dart`), В ОДНОМ (или тщательно спланированной серии) коммитов — частично нельзя, будет хуже чем сейчас. Это правда большая задача, не торопись, проверяй каждый экран.
3. `driver_shell.dart` — та же болезнь, вероятно та же ловушка с корневым Scaffold. Проверь так же, прежде чем трогать.

## Дальше — общая полировка

Пройдись по всему пассажирскому опыту (карта, тарифы, поиск водителя, чат, история, настройки, FAQ, правовая информация) и по водительскому (после того как чат "SmartTaxi driver app features" закончит и не будет активен) с придирчивым взглядом дизайнера: отступы, тени, состояния загрузки/ошибки/пустых списков, читаемость в обеих темах, доступность (контраст, размеры тап-зон). Каждую находку — фиксируй и чини, а не просто отмечай.

## Границы

- Никогда не удаляй чужую незакоммиченную работу без крайней необходимости — сначала проверяй `git status`, если что-то не твоё, коммить отдельно с понятным сообщением или оставь как есть и опиши в статус-доке.
- Секреты (API-ключи, токены, пароли) никогда не пиши в код/коммиты — только через переменные окружения Railway.
- Живая проверка на телефоне — если он свободен (`adb devices` показывает устройство и `adb shell input tap` не падает с `SecurityException`); если недоступен — работай через `flutter analyze`/`flutter test`, честно помечай что не проверено вживую.

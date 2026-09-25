# SmartTaxi — product and design handoff for Claude

## One-line description

**SmartTaxi is a mobile-first local taxi-dispatch platform for Kazakhstan:** a
passenger orders a city or approved intercity ride in KZT, a verified driver
accepts and navigates it, and the owner operates tariffs, regions, drivers,
orders, support and finance from an admin console.

The launch geography began with Atakent and is designed to expand only through
explicit service regions. It is not a generic map demo and it must not expose
raw coordinates or road-reference codes as rider addresses.

## Product vision

SmartTaxi was conceived as a locally trusted alternative in the interaction
category of Uber / inDrive / Grab, adapted for Kazakhstan:

- premium but calm **blue-and-white** visual language;
- prices in **KZT (₸)**, with two clear bookable tariff choices;
- a fast map-first booking flow, not a form-heavy web page;
- real street + house pickup and destination, plus places/POIs;
- driver workflow that is practical while driving: online state, new order,
  arrival, navigation, trip, and completion;
- controlled intercity travel rather than allowing arbitrary cross-region
  orders;
- one product across Android and web: the web version is a first-class
  alternative for people who do not install the app, not a separate prototype.

## Experience principles

1. **Map is the product canvas.** The order sheet is light, compact and never
   hides essential map state.
2. **Address precision before an order.** A user selects `Street, house` or a
   recognisable place — never `KZ-12`, coordinates, or a bare road name.
3. **One obvious next action.** Every passenger/driver state has one primary
   CTA, with secondary actions visually quieter.
4. **Honest data.** Fare, duration, driver state, route and safety information
   are server-backed; the client does not invent a production price.
5. **Safety and trust are visual.** Clear confirmation, state feedback,
   readable routes, distinct pickup/destination markers, and explainable
   failures are more important than decoration.

## What is in the repository now

### Applications

- **Android / Flutter app** — current mobile implementation:
  `apps/mobile/smarttaxi_app`.
- **Web PWA** for client, driver, and owner roles:
  `apps/web`.
- **Express API** with PostgreSQL, Redis, JWT, Socket.IO and audit events:
  `apps/api`.
- Docker, nginx/deploy/backup/health scripts:
  `infra` and `docker-compose.yml`.

### Working product domains

- phone-based auth shell and account/session storage;
- passenger trip flow: pickup, destination search/map point, route preview,
  two tariff choices, price adjustment, payment choice, order creation,
  searching/driver/trip/completion states;
- driver onboarding/documents, availability, incoming orders, accept/arrive/
  start/complete lifecycle, earnings, profile and support;
- routes, region boundaries, controlled intercity routes, nearby drivers,
  WebSocket updates, server-side fare estimates;
- maps with 3D buildings, map markers, route geometry, map movement and
  current-location support;
- owner/admin domains for regions, drivers, tariffs, orders, support,
  finance/audit, promos/referrals and operational controls;
- API hardening: input validation, rate limiting, audit logging, order state
  transitions and Docker-ready local stack.

## Recent non-negotiable fixes

- 3D buildings are inserted **below street/city/POI labels**; annotations and
  pickup/dropoff/driver markers remain above buildings.
- Address picker rejects road codes, raw coordinates, and bare street labels.
  It confirms only a real address with a house number or a valid named POI.
- Reverse geocoding parses providers that return `Street, 15` in one field so
  the house number is not dropped.
- Android location access was checked on the connected device: GPS and app
  permission were enabled. The app now tries a fresh cached system position
  before waiting for a cold GPS fix.
- Checks as of 2026-09-04: Flutter **42/42** and `flutter analyze` clean (with
  four extra lints now enabled); API `npm test` **35/35**, which was failing
  before this date on an assertion that needed a database CI does not provide;
  the web build passes.

## What remains before commercial launch

This is the priority order. Do not claim these are done.

1. **Complete address coverage.** Import a reviewed, signed/licensed address
   dataset for every active region. Each region export needs an immutable
   `.meta.json` passport with checksum and record counts. This is the blocker
   for the promise “every building/house/address in every enabled region”.
2. **Real-device UX QA.** Verify passenger and driver flows on physical Android
   devices: GPS first launch, map pan/zoom speed, address pin behavior,
   route/tariff/payment/order states, offline/retry states, small screens.
3. **Finish web/mobile parity.** Every meaningful passenger and driver state
   must have the same logic, copy, KZT pricing and visual design; consolidate
   drift rather than maintaining two competing flows.
4. **Final visual pass.** The address picker and tariff selector are priority
   screens. Keep the supplied visual references as direction, not copy.
5. **Navigation safety data.** Cameras, speed limits, signs and road alerts
   require a legal, maintained data provider for the launch regions. Do not
   present scraped/uncertain data as authoritative.
6. **Production operations.** Configure real domain/DNS/TLS, production secrets,
   backup restore rehearsal, monitoring/error tracking, health checks, load
   testing and release checklist. Railway/server choice comes after this.
7. **Payments and SMS/Infobip.** Deliberately postponed. Integrate only after
   legal entity, merchant account and production provider credentials exist.
8. **iOS.** Deliberately postponed: Mac/Xcode signing, TestFlight and App Store
   work happen at the end.

## Design direction for Claude

Build a distinctive SmartTaxi design — do **not** clone external products.

- Palette: primary `#1D6FFF`, deep blue `#0B4FD1`, pale blue `#EAF3FF`, white
  surfaces, dark readable text, restrained success/warning/danger states.
- Tone: precise, calm, premium, local, trustworthy; no fake “luxury” gold.
- Typography: strong hierarchy, large actionable prices, compact supporting
  copy, generous but purposeful spacing.
- Map: pale readable 3D city; labels above buildings; blue square marker with
  an inverted triangle tail for address selection; compact current-location
  marker; finish flag at destination; markers visually above map/buildings.
- Passenger screen priority: home -> address search/picker -> route -> tariff
  -> payment -> driver search -> active trip -> receipt.
- Driver screen priority: online/offline -> incoming order -> navigation ->
  arrived -> active ride -> earnings/complete.
- Every screen needs loading, empty, error, disabled, and offline/retry states.

## Images to attach to Claude

### First attach the three visual references supplied by the founder

Use only as inspiration for quality, visual hierarchy, map prominence and
blue/white mood. Do not copy their logo, copy, assets or layouts literally.

- `C:\Users\User\Downloads\Смарт дизайн 1`
- `C:\Users\User\Downloads\Смарт дизайн 2`
- `C:\Users\User\Downloads\смарт дизайн 3`

### Then attach these current-product screenshots

1. `C:\dev\smarttaxi\tmp-tariff-flow-final.png` — current tariff screen.
2. `C:\dev\smarttaxi\tmp-tariff-flow-picker-ready.png` — address map picker
   and target marker.
3. `C:\dev\smarttaxi\docs\status\phone-3d-final-qa.png` — native 3D map.
4. `C:\dev\smarttaxi\tmp-smarttaxi-passenger-menu.png` — passenger menu.
5. `C:\dev\smarttaxi\tmp-smarttaxi-payment.png` — payment selection.
6. `C:\dev\smarttaxi\tmp-smarttaxi-driver-home.png` — driver home.
7. `C:\dev\smarttaxi\tmp-smarttaxi-driver-navigator.png` — driver navigator.
8. `C:\dev\smarttaxi\docs\design\screenshots-real-device-passenger-home-light.png`
   — real device passenger home.
9. `C:\dev\smarttaxi\docs\design\screenshots-real-device-passenger-tariff-light.png`
   — real device tariff state.
10. `C:\dev\smarttaxi\docs\design\screenshots-real-device-driver-home-light.png`
    — real device driver state.

### Existing assets Claude may inspect, but should not replace without reason

- `apps/mobile/smarttaxi_app/assets/map/marker_address_pick_2026.png`
- `apps/mobile/smarttaxi_app/assets/map/marker_my_location_2026.png`
- `apps/mobile/smarttaxi_app/assets/map/marker_destination_2026.png`
- `apps/mobile/smarttaxi_app/assets/map/driver_car_topview_white.png`
- `apps/mobile/smarttaxi_app/assets/cars/tariff_economy_white_sedan_flutter.png`
- `apps/mobile/smarttaxi_app/assets/cars/tariff_comfort_white_sedan_flutter.png`
- `apps/mobile/smarttaxi_app/assets/cars/tariff_business_white_premium_sedan_flutter.png`

## Prompt to paste into Claude

> You are a principal product designer and staff engineer joining SmartTaxi,
> a Kazakhstan-focused taxi dispatch product. Work only inside the existing
> SmartTaxi repository. Preserve real product logic, server-side pricing,
> regions, rider/driver roles and KZT currency. Do not replace working flows
> with static mockups or fake data.
>
> Create a coherent premium blue-and-white design system for Flutter and web,
> based on the attached references as inspiration only. Prioritise the address
> picker and tariff screen. The map must stay central, fast and readable; its
> street/city/POI labels and all custom markers must be above 3D buildings.
> Address confirmation must show a real street + house number or a named POI,
> never raw coordinates, KZ road codes or a bare street.
>
> Audit each passenger and driver screen before changing it. Make web and
> mobile functionally and visually consistent. Implement changes incrementally,
> run available tests/builds, and report the exact files changed plus evidence
> for each completed screen. Do not claim payments, SMS, complete official
> addresses, production deployment, or iOS are done unless their external
> prerequisites are actually completed.

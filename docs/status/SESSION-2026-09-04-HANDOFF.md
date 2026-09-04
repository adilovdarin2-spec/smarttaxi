# Session handoff — 2026-09-04

Read this before touching the address, map or CI code. 30 commits on `dev`
(`7f42da0..db9f46d`), all pushed, tree clean, CI green.

The point of this file is to stop you repeating work: what changed and why,
what was checked and found **correct** (do not re-audit it), what was
deliberately left alone and on what reasoning, and what is waiting on the
owner.

---

## Start here

```bash
npm --prefix apps/api run syntax        # fast
npm --prefix apps/api test              # 35 checks, needs no database
npm --prefix apps/web run build
cd apps/mobile/smarttaxi_app && flutter analyze && flutter test   # 42 tests
```

Flutter lives at `C:/dev/flutter-sdk` and is **not on PATH** — call
`/c/dev/flutter-sdk/bin/flutter.bat`. Two earlier status docs claim there is no
Flutter toolchain here; that was wrong and is corrected in
`emulator-pass-2026-09-04.md`.

The API checks run without Postgres by design. `npm test` used to die on the
first check that needed one, so the twenty-nine after it never ran — see
commit 96be5c2 before you assume a check has been passing.

---

## What changed, by area

### Addresses and regions

- **Атамекен's service area was inside Uzbekistan** (7848605). Its polygon ran
  to 68.62 and its centre sat at 68.5839 — both across the border. 40% of
  everything harvested inside the box was Uzbek. The border is located from the
  harvest's own customs nodes; see the comment on `SERVICE_BOUNDARIES.ATAMEKEN`.
- **`Мақтаарал` vs `Мактаарал`** — one letter, and `regionRadiusKmByName()`
  matches on display name, so the region silently searched a 25 km box instead
  of 12. `REGION_SEED` in `region-geo.js` now generates the migration seed, so
  the two copies cannot drift again.
- **Foreign rows purged from the catalogue**: 142 716 → 121 361 objects, Uzbek
  address vocabulary 11 060 → 0, loadable rows unchanged.
  `harvest-addresses.js --prune` re-files the committed data after any boundary
  change. Run it if you touch a polygon.
- **Search bypassed its own index** (e42a8fa). The predicate was
  `COALESCE(a.search_text, a.label) ILIKE $1`, which no index matches, so every
  keystroke scanned 121 361 rows past two idle trigram indexes. Root cause was
  two loaders with different column sets — `import-addresses.js` never wrote
  `search_text`, not even on conflict. Both write it now.
- **A provider outage took search down** (d5cdeb1) even when the local
  catalogue had the answer, because the remote call sat inside the gazetteer's
  own `try`. Five of thirteen regions have no house-level OSM data at all; the
  catalogue is the only thing that answers for them.
- **Map pick contradicted itself** (d043ea2): the "could not resolve" object
  carried `fallback: true`, and both return paths stamped `fallback: false`
  over it. Bare streets were also handed to clients that both reject them.

### Map

- Web route line was painted **over** the street labels; both route layers now
  take the same label anchor the 3D buildings use (e168638).
- The driver map passed **no** anchor for its 3D buildings, so houses covered
  the street names on the navigation screen; the passenger map hardcoded one
  style's layer id, which throws elsewhere and was swallowed. Both now use
  `resolveLabelAnchorLayerId()` in `core/utils/map_layers.dart` (7e98eb2).
- The picker marker is now drawn from the approved reference's own coordinates
  (6a10ca2). **`design-reference/README.md` says which file is the
  specification** — the owner confirmed the SVG on 2026-09-04, and the
  contradicting PNG has moved to `design-reference/rejected/`.

### Mobile

- The auth tagline was **painted into the background PNG**, so it was Russian
  in all four locales. Repainted out, `authTagline` added, drawn as widgets.
- All five language controls reported Russian on a non-Russian device
  (`?? 'ru'` against an unset preference). `core/utils/active_locale.dart`.
- Four lints enabled (ce08084); `use_build_context_synchronously` found nothing,
  which is worth keeping that way.

### CI

- The api job had been failing since at least 2026-08-11 on an assertion that
  needed a database the workflow never provided (96be5c2).
- The mobile job pinned Flutter 3.41.9 while the app is built on 3.47.2. That
  skew let a red analyze reach the branch. **Now aligned** (f885d51) — if you
  change the local SDK, change the workflow with it.

---

## Checked and found correct — do not re-audit

Each of these looked like a bug and is not. The reasoning is in the commit or
the linked doc.

| Area | Why it is fine |
|---|---|
| Order creation vs service area | `prepareOrderPricing` resolves the region for both points and 403s outside it. The address defence is complete: search scoped, picker blocked, server refuses. |
| Double-charging a driver on completion | Order row `FOR UPDATE`, state machine refuses a second `TRIP_COMPLETED`, one transaction. `money-path-audit-2026-09-04.md`. |
| `COMPLETED` / `IN_PROGRESS` / `DRIVER_ASSIGNED` in `TRANSITION_RULES` | Unreachable — `updateStatus()` takes the status as an argument and all eleven routes pass literals. **Do not delete them**: they appear in allowed-from lists, so removing them strands legacy rows. |
| Cancellation / no-show fee logic | Client row locked, capped at real balance, driver credited only what was collected, idempotent via the state machine. |
| `schema.sql` "missing" tables | It is the **base** schema, applied by Postgres from `docker-entrypoint-initdb.d`; `migrations.js` is the delta and does not create users/clients/drivers/orders/tariffs. I concluded order creation was broken before I understood this. The file now says so in its header. |
| Placeholder phone suppression | Both platforms reject seed numbers; Flutter's `usableServicePhone` is the stricter of the two. |
| Web address search | Already guarded by effect cleanup and region-scoped. The mobile sheets were the ones missing a request id. |
| Road-code filter | 3 hits in 121 361 rows, two of them substations. Well calibrated. |

---

## Deliberately not done, and why

Three things I could have changed and did not. Each is written up with the
exact fix; none should be done without being able to look at the result.

1. **The native route line draws over the street labels.** Both Flutter shells
   use `controller.addLine`, whose annotation layer sits above the whole style.
   Fix is `addGeoJsonSource` + `addLineLayer(belowLayerId: …)` + a
   `setGeoJsonSource` in `_syncScene` — steps in
   `map-and-address-pass-2026-09-04.md`. Not done blind because the route line
   is the most important thing on those two screens and neither can be reached
   from a session that cannot log in.
2. **The speed limit is drawn and spoken as if it were regulatory.**
   `_SpeedLimitSign` is an exact replica of a road sign, and the navigator says
   «Ограничение скорости 60» aloud, from community OSM tags. Three options in
   `speed-limit-authority-2026-09-04.md`. Needs a native ear and probably the
   lawyer; handoff risk #5 already assigns it to the owner.
3. **Regenerating `schema.sql` to match migrations.** It runs on fresh-volume
   provisioning, where a mistake costs a broken deployment rather than a failed
   check, and there is no Postgres here to test against.

---

## Waiting on the owner

- **Log in on an emulator.** Everything in the picker, search, tariff and trip
  flows is verified by analyzer, tests and reading only — **none of it has been
  seen on screen**. This one unblocks most of the rest.

  ```bash
  "$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Pixel_7a -gpu auto &
  # kz.smarttaxi.app is already installed on this AVD - tapping the icon is
  # enough. Only build if you changed Dart since:
  cd apps/mobile/smarttaxi_app && /c/dev/flutter-sdk/bin/flutter.bat run -d emulator-5554
  ```

  **Start it from your own terminal, not from an agent.** Tried three times
  from a tool session, including detached through `cmd start`: the emulator
  comes up, boots, runs the app — and dies when the spawning task is reaped.
  An agent cannot hand you a running device, only the command that starts one.

  The AVD is `Pixel_7a`; the debug build talks to `api.smarttaxi.kz`, which is
  live. Registration is SMS-only and Infobip returns 403, so an existing account
  and its password are the only way in — `POST /auth/login/password` exists for
  that. An assistant should not be typing the password; a person has to.
- **RKA address import.** Киров, Ынтымак, Бирлик, Жана Жол and Атамекен have
  zero house numbers within 3 km of their centres. Not fixable from OSM.
- **Infobip sender ID** — 403, so no OTP, so no login.
- **`www.smarttaxi.kz` returns 502.** That is the host in `AppConfig.webBaseUrl`,
  the "поделиться поездкой" link a rider sends family mid-trip. Live break.
- **Cancellation and no-show fees are charged only from the cashback balance**,
  so every new rider pays nothing and the driver who set off is credited
  nothing. Business decision, not a defect.
- **PR #3** is titled "Stage 2 backend lifecycle hardening" and now contains
  this entire session.
- Legal documents are Russian-only in a four-language app.
- Overlapping service polygons (17 pairs) need local knowledge to trim.

---

## Conventions worth keeping

- **Checks run without a database.** Both `reverseAddress` and `searchAddresses`
  take an executor so the local-catalogue half can be exercised with fixtures —
  that seam is what surfaced the two bugs in `address-selection-check.js`. Keep
  it when adding paths.
- **Comments here explain *why*, and often what went wrong before.** They are
  load-bearing; several saved me from re-breaking something. Match that.
- **Two copies of anything drift.** This session found three: region names,
  loader column sets, and marker geometry. When you see a second copy, either
  generate it or assert it.

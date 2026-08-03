# Blue/white design pass + route-logic fixes — 2026-08-02 (night)

Round brief: bring the whole product to one blue/white system, taking
composition cues from the uploaded reference packs, and make the route /
navigator logic correct — not just the colours.

## Headline: the design system had drifted from the code

The reference packs that were uploaded (`_ui_handoff/`,
`.codex_tmp_client_pack*/`, `_smarttaxi_final_images_only/`,
`.codex_tmp_darkgold_handoff/`) are **gold-themed**. They are good
references for composition — bottom sheets, tariff cards, the
driver-found card, the trip-details modal — but explicitly superseded on
colour by `docs/design/BLUE_WHITE_DESIGN_SYSTEM_2026-07-15.md`.

Checking what the browser actually computes, rather than reading the
files, turned up the real problem: **the canonical doc's hexes were
never implemented anywhere.**

| | doc claimed | actually shipped |
|---|---|---|
| accent | `#2C5FE0` | `#1D6FFF` |
| accent-sky | `#6FA8FF` | `#65A3FF` |
| accent-deep | `#152352` | `#0B4FD1` |
| bg | `#F4F7FD` | `#F7FBFF` |

Adopting the doc's values would have repainted every screen already
signed off. So the shipped ramp wins and the doc was corrected to record
it, with a note not to "restore" the old hexes.

### `apps/web/src/styles.css` fights itself

21k lines carrying **four** separate `:root`-ish override layers, added
by different sessions at different times, each with its own near-miss
hexes and `!important`:

1. `:root` at the top of the file — dead, overridden by everything below
2. "ultimate gold/white visual QA lock" (~line 867)
3. "premium gold/white visual lock" (~line 1692)
4. a scoped `.taxi-client-shell, .driver-shell` block at the very end

Plus a fifth trap: **`.phone-frame.taxi-pwa` is two classes**, so it
outranks the single-class end-of-file layer regardless of source order —
and `ClientApp.jsx:1616` really does render that class, so the client
panel read its colours from there. It was still on `#2e69c9` over a warm
cream.

All layers now agree. One fully-duplicate block was deleted; the rest are
annotated with which one actually wins.

## What changed

### Tokens (affects every screen)

- **`warning` was a blue** (`0xff0b66d8`) all but identical to the
  accent, so every "needs attention" state — road hazards, pending
  payouts, active-trip pills, rating stars — rendered as an ordinary
  CTA. Now a real amber (`#C98A12` / `#E0A93A`), with a new
  `warningSoft` so `StatusPill` uses the same `(fg, softBg, border)`
  shape as its success/danger siblings instead of borrowing the accent
  surface.
- **`goldSky` added** (accent-sky). Both primary CTA gradients had
  hardcoded the same unnamed light blue; on the passenger side the
  gradient was also `const`, which froze it at light-theme values in
  dark mode.
- Rating stars, a route-timeline origin dot, and the auth field
  label/hint greys were off-token; all now read from the palette.
- **54 warm off-whites** from the gold theme (`#fffaf0`, `#fffdf8`,
  `#fffcf6`, `#fffefb`, plus seven more hiding in `rgba(255, 253, 248, …)`
  notation that a hex-only pass could not see) swapped for cool
  blue-white equivalents. These were the tints making otherwise-blue
  surfaces read faintly yellow.

### Route / navigator logic — one real bug

Both shells refetch the driver's active route on a timer while a trip is
running: the driver's every ~12s (or on deviation), the rider's on
roughly every driver GPS ping. **Either one's catch block
unconditionally nulled the held route and raised an error.** A single
failed poll therefore wiped the route line off the map:

- driver: `_driverRoute = null` + the shell-wide `_error`, which also
  fires an error toast — mid-navigation, on the screen being driven with
- rider: `_driverPickupRoute = null` + "маршрут недоступен"

Losing coverage for one poll is routine while actually driving (tunnels,
dead zones) and the route already drawn is still correct, so both now
keep rendering it and let the next poll reconcile.

The exception is a **leg change**: a route fetched for `to_pickup`
genuinely points the wrong way once the rider is aboard and the trip is
running to the dropoff. Both sides compare the held route's leg against
the leg the current order status implies, and only keep it when they
match — so a stale wrong-leg route is still cleared and surfaced. The
rider side gained a `_expectedRoutePhase` helper mirroring the backend's
`resolveActiveLeg` (`routing.service.js`); the driver side already had
`_routePhaseForStatus`.

### Audited, found correct (no change)

- Navigator GPS-lost handling — a 500ms tick drives the rebuild, so the
  banner does appear, and the maneuver banner is correctly suppressed
  against a stale fix.
- `_computeLiveRouteProgress` / `_computeNextManeuverHint` — both carry a
  120m staleness guard and fall back cleanly.
- `_loadRegions` clearing its list on failure — it only runs at startup,
  so there is nothing loaded to preserve. Not the same bug class.
- Driver-side `driverAvatarUrl` — never referenced, so no backfill needed.

## Verification

- `flutter analyze` — no issues.
- `flutter test` — 35/35 pass.
- Web production build — succeeds; emitted CSS grepped directly: **126**
  occurrences of the canonical accent, **0** of the superseded one, **0**
  warm tints in either hex or `rgba()` notation.
- Dev server's transformed CSS refetched and every winning accent
  declaration confirmed.

**Mobile: visually verified on device** (2409BRN2CY), screenshots in
`qa_screenshots/bluewhite_2026-08-03/`. The browser pane never
composited this session, so the *web panels* remain
computed-value-verified only.

Getting onto the device needed one trick worth remembering: plain
`adb install` fails on this phone with
`INSTALL_FAILED_USER_RESTRICTED: Install canceled by user` and no
prompt ever appears. **Adding `-t` succeeds** — no file-manager
sideload or physical tap needed, which is what previous sessions had
resorted to.

### What the screenshots actually showed

The one thing no amount of code reading would have caught: **the map
tiles were warm.** Stock OSM raster tiles are cream land, beige
buildings, yellow roads — and the map is the largest surface on the
home screen. Light theme was passing the *identity* matrix (no
correction at all) while dark theme already had its own, so the map was
the only warm thing on an otherwise cool blue-white screen and visibly
fought the sheet sitting on it. Fixed with a light-theme matrix (18%
desaturation + a slight per-channel cool tilt); before/after of the
identical view confirms land goes cool blue-white, water reads properly
blue, and every label stays readable. Applied to all six map instances.

Also confirmed by eye and found *correct*, not broken: the blank map on
the very first screenshot was just tiles still loading; the drawer,
header, CTA gradient and region-confirmation dialog are all coherent.

### Dark theme — checked, and the map matrix turned out to be wrong too

The theme toggle lives in Профиль → Настройки → Интерфейс → Тема
(Светлая / Тёмная / Как в системе) and was set explicitly to Светлая,
which is why toggling the *system* night setting changed nothing
earlier. Not a bug.

Dark theme itself applies instantly and correctly, and the map carries
no cream haze — confirming the vignette fix. But the dark map was
rendering brown, and working the matrix through by hand found why:

- a plain invert of OSM's cream land (250,245,237) gives (5,10,18),
  already cool blue — the inversion was never the problem
- the `hue-rotate(180deg)` chained after it rotated that back to orange,
  landing land on (14,9,1) and beige buildings — the largest area on a
  tile — on (53,44,37)
- but the hue-rotate cannot just be removed: without it a pure invert
  turns water (170,211,223) brown (85,44,32) and parks purple. Warm and
  cool sources want opposite corrections.

Fixed by inverting *one* partially-desaturated luminance and re-tinting
cool per channel, so every hue lands on the same blue-black ramp. Land
now (12,16,24), buildings (45,50,60), white ≈ `palette.appBackground`,
labels still legible at (189,199,215).

**Tradeoff:** water and parks now separate from land by lightness rather
than hue. That is the cost of guaranteeing nothing renders warm.

**Confirmed on device.** Sampling the same land pixels before and after
shows the channel order flipping exactly as designed:

| | land (R, G, B) | |
|---|---|---|
| before | (8, 6, 5) | R > B — warm/brown |
| after | (4, 6, 10) | B > R — cool blue |

Screenshot 22 in `qa_screenshots/bluewhite_2026-08-03/`.

Theme was switched back to Светлая afterwards (screenshot 24), so the
device is left as it was found.

### Still not visually checked

Web client/driver/admin panels remain computed-value-verified only — the
browser pane never composited a frame this whole session, so every web
claim rests on reading emitted CSS rather than seeing it rendered.

## Operational note

`npx vite build` **fails through the `C:\Users\...\Desktop` junction**
("fileName … must not be an absolute path") after the repo was relocated
to `D:`. Modules transform fine; only the HTML-emit step dies. Build from
`D:\smarttaxi-github-starter` directly. `vite dev`, `flutter analyze` and
`flutter test` are unaffected. Clear `apps/web/node_modules/.vite` if the
dev server starts reporting `Failed to load url /src/main.jsx` — the
optimizer cache holds pre-move paths.

## Still open

Per-screen composition polish against the reference packs — the token
foundation under every screen is now correct and consistent, but the
individual screens have not each been reworked this round. Tracked as
tasks #223–228 and #230–232.

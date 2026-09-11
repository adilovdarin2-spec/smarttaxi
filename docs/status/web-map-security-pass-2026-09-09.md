# Web map runtime security and visual compatibility — 2026-09-09

## Reason and change

The local Docker build exposed a **critical** advisory in the direct web
dependency `maplibre-gl@4.7.1`: consecutive dangerous attribution HTML attributes
could survive sanitization. Upstream fixes this in 6.4.1; versions through 6.4.0
are affected. Sources: [security advisory](https://github.com/advisories/GHSA-jrc7-96c5-q579),
[patched release](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.4.1).

Pinned **6.4.1** and regenerated the workspace lock with a targeted install.
No `audit fix --force`, bulk dependency upgrade, authentication relaxation or
production deployment. The migration follows the upstream
[v6 migration guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
and [Vite installation instructions](https://maplibre.org/maplibre-gl-js/docs/).

- Taxi and dispatch maps share an ESM runtime entry and the same MapLibre CSS.
- The worker uses Vite `?worker&url`, not a raw asset URL. Its shared imports
  are bundled into a standalone hashed worker, avoiding a production-only
  blank vector map. The entry remains in the lazy map path.
- Missing POIs now resolve through `setMissingStyleImageResolver`; v6's
  `styleimagemissing` event is notification-only. Existing sprites remain intact
  and a style reload receives fresh neutral fallback icons.
- A map instance replaced by Fast Refresh cannot reuse the old instance's ready
  flag to add route sources before the new style loads. Confirmed during QA.
- `postbuild` verifies that the worker is emitted, syntactically self-contained,
  referenced by runtime JS, and accompanied by marker-positioning CSS.

No route selection algorithm, road/building geometry, building height policy,
native Flutter map layer, map asset or user fare changed in this security pass.
The map still uses real provider footprints/heights, labels and approved markers.

## Verification

- **76/76 web tests passed**, including four new runtime/security/POI regressions.
- Web production build and new map postbuild check passed.
- Full API test chain passed after lock regeneration, with injected executors.
- Docker rebuilt locally; config valid; API readiness `development / ok` with
  DB, Redis and OSRM healthy. Volumes were preserved.
- Hashed worker served by nginx: HTTP 200, `application/javascript`, 471,371 bytes,
  immutable asset caching. Not an SPA HTML fallback.
- `npm audit --workspace=apps/web --json`: **0 advisories**.
- `npm audit --omit=optional --workspace=apps/api --json`: **0 advisories**,
  matching the dependency scope actually installed in this Docker API image.
- Unfiltered root `npm audit`: **8 moderate, 0 high, 0 critical**, from the
  optional Firebase/Google chain and `uuid` advisory GHSA-w5hq-g745-h8pq.
  This is not a clean-all-dependencies claim. Optional push dependencies need
  their own compatible update/test before enabling that distribution; no live
  Firebase credentials or push delivery were tested in this pass.

## Browser evidence

The built nginx app at `http://127.0.0.1:5175/order` was exercised through UI:

1. Cold launch loads actual vector streets/buildings without browser warnings/errors.
2. Search `Амангелды 29` returns distinct `29` and `29 А` results.
3. Map selection reports `Амангелды улица, 29 — В выбранном здании`.
   Rendered diagnostic: five building layers, ten returned features,
   `firstType=MultiPolygon`, `selected=true`. No horizontal document overflow.
4. Route to `Базар Атакент`: **0.6 km / 3 min**, both endpoints visible with
   a street-following route. No order was created by this web verification.
5. Economy **700 ₸** / Delivery **800 ₸**; selecting Delivery updates both the
   price and the order button. Payment sheet shows cash/bonus choices, not a
   fabricated working merchant/card checkout.

The dev-only navigator fixture separately verifies the production components
with **explicitly labeled test GPS** and real OSRM geometry: the car is visible
on the road, turn instructions show, stale GPS hides speed/ETA/car guidance,
and the retry control restores it. This does not prove real driving behavior.

Screenshots: [evidence/web-map-security-2026-09-09](evidence/web-map-security-2026-09-09).
The navigator fixture used 390×844; the built app screenshots show its 390 px
phone layout inside the actual desktop browser viewport. Screenshot files are
unmodified UI captures, not design mockups.

## Compatibility/release boundary

MapLibre 6 requires **WebGL2** and a modern browser. Local Chromium compatibility
passed; older-browser/device coverage remains necessary. An admin account/full
dispatch workflow was not reopened in this pass; its shared runtime wiring is
covered by tests. This update does not solve missing official address data,
traffic feeds, provider availability/SLAs, SMS, merchant, legal or store gates.
Do not claim every address or route is perfect, or that this is public-release approval.

# Address search / geocoding correctness fixes — 2026-07-24 (apps/api/src/modules/routing/routing.service.js)

Triggered by a live user complaint: the navigator/map must show cameras
and be "perfect", and addresses must be correct — not just street
addresses but business names (cafes, shops, pharmacies). Scope was
`apps/api/src/modules/routing/routing.service.js` (`searchAddresses`,
`reverseAddress`, and their MapTiler/Photon/Nominatim helpers) plus one
small mobile UI polish in `passenger_shell.dart`. Six backend commits on
`dev`, each tested (`npm test`, 27/27 suites) and live-verified against
`https://api.smarttaxi.kz` before moving to the next, then deployed via
Railway (auto-deploys on push to `dev`).

---

## Context: MAPTILER_API_KEY was just configured

Earlier in this session `MAPTILER_API_KEY` was set on Railway for the
first time (previously unset, so `searchAddressesWithMapTiler` /
`reverseAddressWithMapTiler` always silently returned `[]`/`null`). Two
bugs were fixed as part of getting the key working:

- **Reverse geocoding always failed even with a valid key**:
  `reverseAddressWithMapTiler` sent `limit=5` with no `type` filter —
  MapTiler's reverse endpoint hard-rejects that combination
  (`ERR_VALIDATION: Parameter limit must be combined with a single type
  parameter when reverse geocoding`). Every reverse geocode silently fell
  through to Nominatim/Photon; the fallback chain's `.catch(() => null)`
  meant this produced no visible error. Fixed by dropping `limit` (only
  `features[0]` is ever used, so nothing was gained from it).
- Once the key was live, enabling MapTiler forward search **exposed** the
  four bugs below — they existed in the code already, but were invisible
  while `searchAddressesWithMapTiler` always returned `[]`.

## 1. MapTiler forward search was shadowing real business-name matches

`searchAddresses` tried MapTiler first and returned immediately on any
non-empty result. MapTiler's forward search is a place/address geocoder,
not a free-text POI search: given `"аптека Атакент"` or `"Magnum
Shymkent"` it silently drops the business-name word and returns a generic
town-level match instead of an empty result (confirmed by querying
MapTiler directly — it matches only the town name, ~0.5-0.6 relevance).
Treating that as a satisfying "first" result permanently blocked
Photon/Nominatim, which do match business names, from ever running.

Fix: `mapTilerFirst` is now only ever merged into whichever provider's
results end up being returned (same pattern the code already used for
`localFallback`), never used to return early by itself.

## 2. `buildAddressSearchQuery` corrupted every unscoped search

Any search whose caller didn't pass an explicit `region` (the app's
region-picker hasn't loaded yet, or a search sheet that doesn't wire
`region` at all) got `env.CITY` ("Atakent", a single tiny launch town)
silently appended to the query text sent to Photon/Nominatim. `"Magnum
Shymkent"` became `"Magnum Shymkent Atakent Kazakhstan"` — contradictory
text no real place matches, so both providers returned empty and only
MapTiler's generic guess survived.

Fix: removed the `region || env.CITY` fallback inside
`buildAddressSearchQuery` itself. Callers that want the launch-town
default already pass it in explicitly (`searchAddresses`'s own
`explicitRegion || env.CITY` before calling `searchAddressesWithMapTiler`
and `searchLocalAddressHints`).

## 3. `regionAliases`/`regionCenterRule` had the same env.CITY default

One layer deeper: even after fixing #2, `filterRegionAddressSuggestions`
still forced regional filtering to Atakent whenever no explicit region was
given, because `regionAliases()`/`regionCenterRule()` had their own
internal `regionHint || env.CITY` fallback. Atakent has a known
`centerRule` (real lat/lng + radius), and the function deliberately
returns `[]` when nothing survives a known region's radius check ("better
to come back empty than country-wide noise") — so Photon's 5 genuine
Shymkent "Magnum" results were discarded even after #2 landed, because
none are near Atakent.

Fix: both functions now return no aliases / no center rule when no region
was given, so `filterRegionAddressSuggestions`'s own no-aliases early
return (`if (!aliases.length) return sorted.slice(0, max);`) passes real
results through unfiltered.

**Regression test updated**: `routing-location-check.js`'s "аптека"-style
bare-query assertion baked in the old behavior (exactly 1 result, the
local Atakent hint). It now asserts both the local hint *and* the genuine
out-of-region provider result are returned.

## 4. MapTiler generic guess still outranked real matches on ties

After #1–#3, real results and MapTiler's generic guess could both survive
into the final list, but `sortAddressSuggestions`'s tie-break is array
position, and MapTiler was listed first in every merge — so e.g. "Аптека
Алматы" showed an irrelevant "улица Алматы, Атакент" (MapTiler matched the
street name coincidence) above the actual Алматы pharmacies.

Fix: swapped merge order in all 6 return paths to `[...localFallback,
...<realProviderResults>, ...mapTilerFirst]` — ties now resolve in favor
of the real search-engine result.

## 5. Reverse geocoding: MapTiler locality picked the postal code

`publicMapTilerAddressSuggestion`'s locality fallback took
`context[0]`'s text whenever a feature had no `properties.city/town/
village` — but MapTiler's `context` array isn't ordered by semantic type.
For a plain street/address feature, position 0 is often the `postal_code`
entry (no `place_designation` of its own), not the city. A real Алматы
street reverse-geocoded to `city: "050013"` instead of `city: "Алматы"`
(confirmed against MapTiler's raw response: the actual city is a
different context entry tagged `place_designation: "city"`, listed after
the postal code).

Fix: prefer the context entry whose `place_designation` is
city/town/village/municipality over the positional fallback.

## Live verification performed (production, post-deploy)

- `аптека Атакент` → local pharmacies + town match, all correct.
- `Magnum Shymkent` → 7 real Magnum stores in Shymkent with addresses
  (was: only "Атакент").
- `аптека Шымкент` → 3 real named pharmacies with addresses.
- `Аптека Алматы` → 8 real Алматы pharmacies, correctly ranked above the
  generic MapTiler hit.
- `магазин Мырзакент` (with `region=Мырзакент` passed, matching real app
  usage via `_selectedRegion?.name`) → correctly scoped to the real town,
  no noise from other cities.
- `кафе Жетысай` → 1 real café in Жетысай, correct.
- `Кафе Астана` → real cafés across Astana with addresses.
- Reverse geocode: Алматы / Шымкент / Астана coordinates all now return
  the correct city name (previously postal codes for Алматы/Шымкент).

## Confirmed NOT stale: the region alias table

`LEGACY_REGION_SEARCH_ALIASES`/`LEGACY_REGION_SEARCH_CENTERS` (13 small
Түркістан-area towns + Shymkent) were checked against the live `/api/regions`
endpoint — they match the real configured operating regions exactly. Not
a bug; the service genuinely only operates in this corridor today.

## Mobile: address search result icons

`_addressIconFor` (passenger_shell.dart) had no case for "аптека"/"кафе"/
"магазин" — exactly the categories the backend fixes above now surface —
so every one fell through to a plain pin. Added
`local_pharmacy_rounded`/`restaurant_rounded`/`local_grocery_store_rounded`
cases. `flutter analyze` clean, `flutter test` 35/35 passing. **Not
visually confirmed on-device**: Cyrillic text cannot be injected via `adb
shell input text` on the current test device/Android build (a
`NullPointerException` in Android's own `InputShellCommand`, not a
tooling-quoting issue) — no ADBKeyboard or equivalent IME automation is
installed. If this needs pixel-verification later, either install
ADBKeyboard or test via a real keyboard tap sequence instead.

## Known non-bugs found along the way (do not "fix" these)

- Searching a bare category word ("магазин") instead of a specific
  business name returns poor results — expected: OSM/Photon/Nominatim
  match on the `name` tag, and most shops aren't literally named
  "магазин". A real "find nearby shops" feature would need category/POI
  browsing, a different feature from free-text address search.
- `sortAddressSuggestions`'s own `regionHint || env.CITY` fallback (used
  only for the soft local-text tie-break, not filtering) was left as-is —
  it's a mild ranking nudge, not a correctness bug, and removing it turns
  into a no-op given `"".includes("")` is always `true` in JS.

## What's still open (unchanged from before this session)

- No public API for Kazakhstan's real speed-camera/radar locations
  ("Sergek" network) — `osm-navigation.service.js`'s Overpass queries for
  OSM-tagged `speed_camera`/`traffic_sign` nodes are the only source, and
  coverage is whatever OSM has. Would need a user-supplied curated list to
  do better.

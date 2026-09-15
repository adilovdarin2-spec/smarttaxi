# Regional routing and provider validation — 2026-09-05

Local development follow-up on `dev` after `539dd69`.

## Fixed and reproduced

- A malformed OSRM alternative with `null` distance/duration won selection as
  zero seconds because `Number(null)` is zero. The regression failed before
  the fix (`0 !== 480`). Route metrics and geometry now require actual finite
  JSON numbers; malformed candidates cannot outrank valid driving alternatives.
- Non-`Ok` provider responses now fail closed even if they contain route-like
  data. Cached routes are validated and use a new `fastest-v2` namespace;
  old entries expire normally, with no Redis flush.
- Maneuvers with invalid coordinates/distances are discarded instead of
  becoming coordinates at zero. Missing/non-positive roundabout exits remain
  unknown, not an instruction to take exit zero. Valid arrival distance zero,
  actual roundabout exits and usable route geometry remain supported.
- A SQL `NULL` intercity kilometre override became a zero rate, suppressing
  distance pricing. The regression also failed before the fix (`0 !== 100`).
  Missing overrides now inherit the existing tariff/fallback policy. An
  explicitly configured zero still stays zero. No owner tariff settings,
  stored prices, financial records or migrations were changed.

The quickest usable alternative remains selected by duration, with distance
breaking ties. Route preview/pricing still fails when no valid route exists;
the separately marked tracking-only fallback and legacy statuses are retained.

## Real local regional pass

`apps/api/src/tools/smoke-regional-routing.js` reads the existing OSM catalogue
and public local API. It checks two separated house/POI coordinates belonging
to each current service region, plus four enabled intercity directions.
This is read-only estimate/geometry QA, not new orders, official registry
validation or physical navigation acceptance.

- 13 regions, both Economy and Delivery: 26 local previews passed.
- Four intercity directions, both tariffs: 8 more previews passed.
- 37 local API requests in the final run, serial with a three-second pause
  between unique pairs and an absolute 50-request cap. Fare pairs reuse the
  backend route cache. No public-provider load/capacity test was performed.
- Region ownership, destination, intercity flag, finite road geometry,
  positive duration/distance, KZT pricing and matching route metrics across
  both tariffs passed. Endpoint road snapping was at most 93 metres in this
  sample; this is not proof of a legally/physically accessible entrance.

| Direction | Distance | Time | Economy | Delivery |
|---|---:|---:|---:|---:|
| Atakent → Myrzakent | 24,116 m | 1,626 s | 4,076 ₸ | 4,176 ₸ |
| Myrzakent → Atakent | 24,633 m | 1,666 s | 4,149 ₸ | 4,249 ₸ |
| Zhetysay → Shymkent | 234,384 m | 11,104 s | 33,514 ₸ | 33,614 ₸ |
| Shymkent → Zhetysay | 234,257 m | 11,156 s | 33,496 ₸ | 33,596 ₸ |

These are observed local QA estimates using the current local configuration,
not published commercial fare promises or live-traffic arrival guarantees.

### Access review still open: Maktaaral

The sampled pair from `улица М. Жумабеков, 53` (40.7248972, 68.5327223) to
`улица Сатпаева, 39` (40.723856, 68.5300275) is about 255 metres apart directly,
but the provider returns 2,568.7 metres / 340.1 seconds by road (ratio 10.08).

A separate read-only request to the configured OSRM demo with
`alternatives=true` returned exactly one route, not a shorter alternative that
the app ignored. Its source snaps 60 metres to an unnamed road, then routes
south via `улица Н. Машбека` and `улица А. Нурманули` before returning along
`улица Сатпаева`. The provider's weight and duration were both 340.1.

This proves which provider route was used, not whether that detour is correct
on the ground. Road connectivity, legal access, barriers and current conditions
need verification; no shortcut, foreign road-data edit or regional-boundary
change was fabricated. The smoke report flags high detours/large snaps for
review separately from its successful API-contract assertions.

## Verification and evidence

- API: dependency policy and all 36 checks pass, with added malformed-provider,
  maneuver, alternative/tie, absent/explicit override, directional and
  intercity-limit regressions. Tests use injected data, not a live database.
- Web: 46 tests pass; Flutter: all 89 tests pass. No web/Flutter source or
  design assets changed, so the previous explicit-local APK remains current.
- API root-lock Docker image rebuilt and only the local API service recreated.
  PostgreSQL/Redis volumes were retained; all four services are healthy.
- Full compiled-nginx passenger/driver lifecycle passed against the updated
  API, including both drawn legs, car/finish visibility, GPS publication,
  permission recovery, failed actions, unpaid restoration and cash settlement.
  This run's local order `bb51cd06-4507-4af7-bab9-89c65976c4a1` reached `PAID`.

Evidence:

- [Regional route/price report](evidence/2026-09-05-regional-routing/regional-routing.json)
- [Paired lifecycle results](evidence/2026-09-05-regional-routing/lifecycle-result.json)
- [Paired route/GPS evidence](evidence/2026-09-05-regional-routing/lifecycle-network.json)

Reproduce only against local development:

```text
rtk node apps/api/src/tools/smoke-regional-routing.js
```

Optional `QA_API_URL` must be loopback. `QA_OUTPUT_DIR` chooses the report
directory; the default is ignored `tmp-regional-routing-qa` in the repository.
Reports contain catalogue coordinates/provider geometry, not account tokens.

## Boundaries

The physical phone remains ADB-visible, but its earlier USB-install rejection
has not been cleared. No new native UI, road journey, voice/background
navigation or driver route-renderer approval is claimed. The OSRM demo is not
production routing capacity. Official RKA exports, legal/operator decisions,
merchant/SMS authorization, signing/store and iOS prerequisites remain open.

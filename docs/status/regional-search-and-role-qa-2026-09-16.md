# BaiSapar: regional address search and role QA — 2026-09-16

## Fixed

The local catalogue used literal substring matching. `Амангелды улица, 29`
matched locally, but `Амангелды 29` and `29 Амангелды` unnecessarily depended
on Photon even though the house was already in PostgreSQL.

- Match independent words regardless of punctuation/order and common street
  and house prefixes. Keep the longest token on the existing trigram-indexed
  column and use bound SQL parameters throughout.
- A request for house 29 excludes 129 and 290. Exact labels rank ahead of
  letter-suffixed alternatives. Punctuation-only requests do not scan the DB.
- A scoped house-number match returns immediately from the catalogue. Broad
  street/business searches retain external POI discovery and regional filtering.
- Catalogue search results include kind, city and subtitle for both clients.

Local HTTP sample: 8–49 ms after the change versus 227–875 ms before it
(four short requests, not a load test or production latency guarantee).

## Executed verification

- API test suite and targeted address/routing checks passed.
- Real PostgreSQL search: 42 queries across 13 active regions with external
  providers unavailable, including reversed words, punctuation and numeric
  collisions. Fixtures are connection-local temporary rows, rolled back.
- Exact reverse-address samples passed in 13 regions (8 houses, 5 POIs).
- Real OpenFreeMap tiles + shared building selector + local reverse API:
  all 13 sampled points returned their catalogue names; 11 had a selected
  building footprint. Birlik and Zhana Zhol samples were POIs without a
  footprint directly under the point. Samples are filtered to their owning
  service region; overlapping harvest files are not treated as extra coverage.
- Regional route/pricing check: 34 previews (two tariffs in all 13 regions and
  four intercity directions). Both tariffs use the same road geometry.
- Real browser on built local nginx web: booking, house selection, search,
  tariffs, payment chooser, provider-error recovery at 390/360 widths passed.
- Passenger account: 15 sections at 390/360 widths passed.
- Driver browser: six tabs at 390/360/320 widths; accept, approach, arrival,
  waiting, trip, payment, reload recovery, GPS permission loss, delayed GPS
  acknowledgement and failed actions passed. Browser coordinates were explicit
  test inputs, not evidence of physical navigation.
- Owner: all 19 sections loaded without failed management endpoints or uncaught
  browser errors. FINANCE: all 16 permitted sections passed; the three
  owner-only sections were absent from its navigation.
- Local taxi stand HTTP lifecycle passed earlier in this session: geofence,
  offline rejection, duplicate queue rejection, phone/app seats, confirmation,
  capacity protection, departure and cleanup.

Reusable tools:

- `apps/api/src/tools/smoke-regional-address-search.js`
- `apps/web/tools/smoke-regional-building-picks.mjs`
- `apps/web/tools/smoke-admin-ui.mjs` (`QA_ADMIN_ROLE=OWNER|FINANCE`)
- Existing client/account/driver browser smoke tools.

Browser tools use `QA_PLAYWRIGHT_PACKAGE` and `QA_BROWSER_EXECUTABLE` to run
the installed runtime and Edge; no dependency was added to the application.
Screenshots and JSON results are in `%TEMP%/smarttaxi-web-ui-qa`,
`%TEMP%/smarttaxi-account-ui-qa`, `%TEMP%/smarttaxi-driver-ui-qa`,
`%TEMP%/baisapar-admin-ui-qa`, `%TEMP%/baisapar-finance-ui-qa`, and
`%TEMP%/baisapar-regional-building-qa`.

## Still requires evidence/data

These checks sample each region; they do not prove an address for every building.
Unlabelled footprints still require source-backed address data. Official RKA
imports require `rka,label,lat,lng` and regional checksummed `meta.json`; the
unrelated Pavlodar spreadsheet was not imported.

One routing sample needs road-data/on-road review: Мақтаарал,
`улица М. Жумабеков, 53` → `улица Сатпаева, 39`, 2,569 m / 340 s,
about 10× the direct distance. The geometry follows the OSRM road network;
this run does not establish whether a missing connection or legal road access
causes that detour. No straight-line shortcut was substituted.

Physical Android navigation, background GPS/push, legal/merchant/SMS setup,
official address completeness and production load acceptance remain separate
release gates. No production accounts or orders were used for QA.

# Free address and building-name pass — 2026-09-17

## Outcome

The committed local catalogue was refreshed from legal, free OpenStreetMap
data and expanded to preserve more named destinations. It now contains
122,113 loadable rows across all 13 active BaiSapar regions:

- 112,038 house-number addresses;
- 5,836 named streets;
- 3,622 POIs;
- 617 named buildings.

Compared with the prior owned catalogue, the total grew by 752 rows and named
POIs/buildings grew from 2,655 to 4,239 (+1,584). The plain-house count fell by
874 because features that are both an address and a named school, shop, clinic
or building are now classified under their more useful named identity; their
street and house number remain in the label/search fields.

This is the maximum coverage verified from the currently available free
sources. It is not an official claim that every registered Kazakhstan address
is present. Five active regions still have zero public OSM house numbers:
KIROV, YNTYMAK, BIRLIK, ZHANA_ZHOL and ATAMEKEN.

## Improvements made

`harvest-addresses.js` now:

- collects address relations as well as nodes and ways;
- gives a named POI or named building priority over the same feature's plain
  house-number identity, preserving the destination name shown to a rider;
- collects named buildings represented as multipolygon relations;
- includes tourism, office, leisure, healthcare, craft, public transport,
  railway stations, aerodromes/terminals, historic, emergency, government and
  named man-made features in addition to amenity/shop;
- keeps official, short, local, old, brand and operator names as search
  variants;
- writes SHA-256 checksums and ODbL source attribution into the manifest.

The loader now records the applied OSM snapshot checksum per region in
`address_catalog_snapshots`. An equal row count no longer causes a changed
catalogue to be skipped. Existing deployments reload once after this migration;
subsequent unchanged boots remain fast.

## Government spatial-data audit

The Kazakhstan NSDI GeoServer is anonymously readable and its WFS capabilities
declare `Fees: NONE` and `AccessConstraints: NONE`:

- https://map.gov.kz/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities
- layer `openmap:buildings_a`

The building layer contains 2,820,172 real footprints and exposes fields
`addr_str` and `addr_num`, but live WFS `resultType=hits` checks returned zero
non-null values for both fields. It is therefore useful as a building-geometry
source, not as an address catalogue. The non-null `label` values are building
construction classifications such as `КЖ`/`КН`, not public destination names.

The public `data.egov.kz` datasets `s_buildings`, `s_ats` and related Address
Register tables are archived. The inspected `s_buildings-data.xlsx` is only
100 Pavlodar rows and has no coordinates, so it remains deliberately rejected.

## Coverage after refresh

| Region | Rows | Houses | Streets | POI | State |
|---|---:|---:|---:|---:|---|
| ATAKENT | 3,165 | 2,806 | 114 | 84 | public coverage available |
| MYRZAKENT | 4,052 | 3,785 | 209 | 39 | public coverage available |
| ZHETYSAY | 7,451 | 6,555 | 418 | 348 | public coverage available |
| SHYMKENT | 106,647 | 98,496 | 4,774 | 3,081 | public coverage available |
| KIROV | 29 | 0 | 23 | 4 | official RKA required |
| ASYKATA | 205 | 14 | 154 | 34 | sparse; official RKA required for completeness |
| DOSTYK | 55 | 33 | 20 | 2 | sparse; official RKA required for completeness |
| YNTYMAK | 12 | 0 | 9 | 2 | official RKA required |
| BIRLIK | 78 | 0 | 57 | 20 | official RKA required |
| FIRDOUSI | 113 | 104 | 7 | 1 | sparse; official RKA required for completeness |
| ZHANA_ZHOL | 9 | 0 | 6 | 2 | official RKA required |
| MAKTAARAL | 274 | 245 | 24 | 3 | public coverage available |
| ATAMEKEN | 23 | 0 | 21 | 2 | official RKA required |

## External blocker that remains

No verified free bulk source currently supplies every official house address,
RKA and coordinate for the launch geography. Complete coverage still requires
one reviewed file per region with `rka,label,lat,lng` and the immutable
`.meta.json` passport described in `docs/ADDRESS_REGISTRY_IMPORT.md`.

The free path is to request publication/actualisation of the Address Register
export through https://data.egov.kz/proposals/publish or eOtinish. Scraping
2GIS, Yandex or a restricted cadastral UI is not an acceptable replacement:
the resulting data would not have a distributable licence.

## Verification

- `node src/tools/address-harvest-check.js` — passed;
- `node src/tools/address-loader-check.js` — passed;
- `node src/tools/addresses-data-check.js` — passed, including SHA-256 for all
  13 files;
- `npm --prefix apps/api test` — passed;
- `npm --prefix apps/api run syntax` — passed;
- `docker compose config -q` — passed;
- local Docker Engine was unavailable, so the live PostgreSQL application of
  the migration was not run in this pass.

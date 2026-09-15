# Official address coverage

SmartTaxi keeps OSM as a searchable map/POI layer, but the source of truth for
house-level addresses is Kazakhstan's **Address Register** (RKA).  The service
has a stable RKA for an address object, so an official update is an upsert —
not a second, conflicting copy of the same house.

## Obtaining the data

The primary public catalogue is `s_buildings` (the Address Register's list of
primary address objects). Its API endpoint is
`https://data.egov.kz/api/v4/s_buildings/data?apiKey=…`; an API key from the
Open Data developer cabinet is required. Pair it with `s_geonims` for street
and settlement names, `s_pb` for secondary objects (apartments, offices and
rooms), and the relevant type dictionaries. For live, legally controlled
lookups use the Address Register's Smart Bridge service rather than inventing
or scraping RKA values.

The portal also exposes a public, page-bounded export used by the dataset UI:
`https://data.egov.kz/datasets/exportjson?index=s_buildings&version=data&from=1&count=100`.
For a reproducible small review sample use
`npm --prefix apps/api run fetch:rka-page -- --from=1 --count=100`.
The helper preserves the exact URL and timestamp in its output. It deliberately
does **not** crawl all 4.5M records and does not turn the result into map
addresses: the `s_buildings` export has RKA and text but no coordinates.
Use the authenticated API/approved full export for the real regional load,
then validate every coordinate before importing.

The sample `s_buildings-data.xlsx` currently supplied with the project is a
100-row Pavlodar-only extract. It has valid RKA and address text, but no
latitude/longitude and no records from SmartTaxi's active southern regions;
it is useful for schema review only and must not be loaded into this project.

Request a machine-readable export or approved Smart Bridge integration from
the Address Register for every active SmartTaxi region. Keep credentials and
any government-issued client certificate in secret storage; never commit them
to the repository. Exported records must include the RKA, a display address
and coordinates.

## Loading a reviewed export

1. Put one reviewed file in `apps/api/data/official-addresses/`, named with
   the exact region code: `KIROV.csv`, `YNTYMAK.jsonl`, etc.
   Put its required immutable passport alongside it as `KIROV.meta.json`.
2. Use CSV, JSONL, JSON or GeoJSON. Required fields: `rka`, `label`, `lat`,
   `lng`; `rka` must be the exact 16-digit Address Register code. Optional
   fields are `street`, `housenumber`, `name`, `kind`, and `variants`.
3. Build/redeploy the API or use the owner-only address reload endpoint.
4. Run `npm --prefix apps/api run check` and
   `npm --prefix apps/api run report:address-coverage`.

The passport is deliberately required before an RKA file can affect riders.
It must contain the exact region and source provenance, and its checksum must
match the byte-for-byte data file:

```json
{
  "region_code": "YNTYMAK",
  "source_dataset": "s_buildings + Smart Bridge geocoding",
  "source_version": "2026-09-02",
  "downloaded_at": "2026-09-02T08:30:00Z",
  "source_record_count": 12480,
  "accepted_record_count": 12341,
  "sha256": "<sha256 of YNTYMAK.jsonl>"
}
```

`source_record_count` may be greater than the accepted count when rows are
rejected during the documented review; it can never be less. `sha256` can be
generated with `Get-FileHash -Algorithm SHA256 YNTYMAK.jsonl` on Windows.

The loader rejects malformed RKA values, coordinates outside the selected
SmartTaxi service polygon, and duplicate RKA entries.  OSM refreshes never
delete RKA addresses.  Conversely, an intentionally supplied RKA snapshot
removes only stale RKA entries from its own region.

## Coverage rule

Do not mark a region complete merely because a map displays roads.  A release
region needs house numbers, streets and POIs in the local catalogue, plus a
sample search and reverse-geocoding check from a real device. For a region
that supports apartment-level pickup, the reviewed export must also cover
`s_pb` (secondary address objects); a building-level record alone is not
evidence that every entrance or apartment can be found.

## Source traceability

Record the source dataset version, download time, source record count,
accepted record count, rejected record count and a checksum in the deployment
artifact. This makes it possible to prove which official snapshot produced an
address and to roll back a bad import without mixing it with OSM or
user-created POIs.

# Address coverage — measured, and a correction (2026-08-04)

## I was wrong about the data

I told the customer that free OSM data for rural Kazakhstan has
"almost no house numbers, and building names even less", and that the
request for "every street, every house number, every building name" was
therefore unreachable on free data. **That was wrong**, and it was said
from general impression rather than measurement.

Counted against Overpass:

| region | house numbers | named streets | named buildings |
|---|---|---|---|
| Атакент | **2 914** | — | — |
| Шымкент | **99 386** | — | **609** |
| Мырзакент | (probe rate-limited) | 239 | 26 |

Atakent alone carries nearly three thousand house numbers. Shymkent
carries a hundred thousand. This is a usable address base, not a
wasteland. The remaining regions were not measured — the public Overpass
endpoints rate-limited and then timed out the probe — but there is no
longer any reason to assume they are empty.

## So the problem is not the data, it is that we don't use it

The app currently resolves addresses through live geocoding calls. What
it should do, given the counts above, is **harvest the OSM address data
for the 13 configured regions into our own database** and serve search
and autocomplete from there.

That gets, on free data:

- every `addr:housenumber` OSM holds for those bounding boxes
- every named street (`highway` + `name`)
- every named building (`building` + `name`)
- every named POI (`amenity` / `shop` + `name`) — shops, schools,
  clinics, which is what people actually type

and as a side effect: instant local search with no third-party rate
limit, no per-request latency, and no dependency on an external service
being awake.

## Plan

1. Import script: for each region's bbox, pull the four element classes
   above from Overpass, normalise to `{type, name, street, housenumber,
   lat, lng, region_id}`, upsert into an `addresses` table. Run it
   region by region with backoff — the public endpoints rate-limit hard,
   which is exactly what broke the probe.
2. Index for prefix and trigram search on the name/street text so
   autocomplete is fast in both Cyrillic and Latin.
3. Point the address search endpoint at the table, keeping live
   geocoding as the fallback for anything not found locally.
4. Re-run the import on a schedule so OSM edits flow through.

## Honest caveat, stated separately from the mistake above

"Every single one" still depends on what OSM contains. Where a street
genuinely has no numbered buildings mapped, no amount of importing
invents them. What changes is that we will surface **everything that
does exist**, which — per the counts — is far more than the app shows
today.

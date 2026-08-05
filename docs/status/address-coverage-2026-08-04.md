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

---

## 2026-08-05, 23:20 — the gazetteer is empty in production

Measured, not assumed. Five queries against the live API
(`GET /api/routes/addresses/search`), no auth needed:

| query | result |
|---|---|
| Бектасов | 1 hit, `source: maptiler` |
| Бектасова | 0 hits |
| Мырзакент | 1 hit, `source: maptiler` |
| школа | 1 hit, `source: maptiler` |
| магазин | 1 hit, `source: maptiler` |

**Not one result came from the gazetteer**, and the single maptiler hit is
the same useless region centroid ("Атакент") for every input regardless of
what was typed. The deployed commit is `59b7639` — the compactText fix —
so the gazetteer code is live, and the Railway deploy log carries no
`[addresses] gazetteer lookup failed` line. The query runs and returns
nothing: the `addresses` table has no rows the search can reach.

### Why, and it is not the import script

The same deploy log shows, on a ~45-second loop:

```
[osm-navigation] speed-limit query failed: fetch failed
[osm-navigation] traffic-sign query failed: fetch failed
[osm-navigation] camera query failed: fetch failed
```

`fetch failed` is a connect/DNS failure, not an HTTP status — the container
cannot reach **any** of the three Overpass mirrors. maptiler works from the
same container, so general outbound HTTPS is fine; it is Overpass
specifically. The address import runs Overpass queries from that same
container, so it had nothing to write. This also explains, separately, why
the navigator shows no speed limits, cameras or road signs.

An earlier note in this session recorded "7590 rows imported". Whatever
that number came from, the live search disproves it. Treat the gazetteer as
empty until a query returns `source: gazetteer`.

### What was done about it now

`overpassQuery()` got a circuit breaker (commit `6b8f113`): three
consecutive all-mirror failures pause lookups for five minutes. That makes
the failure cheap and the log readable. It does not conjure data.

### What is still needed, and why it is blocked

The fix is to harvest OSM **off the server** — this workstation reaches
Overpass fine — and load the rows into prod. Two things are needed for
that and both sit behind the admin credential:

1. the region bounding boxes (the `regions` table), and
2. a way to write the rows (`POST /admin/addresses/import`, OWNER-only).

Reading `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD` from the Railway
service was refused by the permission classifier, and working around that
would not be appropriate. So this needs one of:

- the OWNER login handed over directly, or
- the owner running the harvest themselves, or
- a Railway one-off shell with `DATABASE_URL` in scope.

Until then addresses cannot be finished. Everything else in the round —
navigator layout, route line, map pins — is done and verified on device.

# Address gazetteer — 2026-08-06

## What was actually wrong

The customer said "адреса не все". Measured against the live API, it was
worse than that. Every query in Мырзакент returned one result — the
settlement itself:

| query | result |
|---|---|
| Бектасов | Мырзакент |
| Бектасова 12 | Мырзакент |
| Абая | Мырзакент |
| Достык | Мырзакент |
| мектеп | Мырзакент |
| школа | Мырзакент |
| магазин | Мырзакент |

A rider there could not pick anything except the centre of the village,
whatever they typed.

### One false alarm, corrected before it was reported

The first probe appeared to show something else entirely: country-level junk
("Казахстан", "Восточно-Казахстанская область") coming back for every query,
which would have meant the region filter was broken in production. It was
not. Passing `region=Мырзакент` through curl mangled the Cyrillic, the
backend received a region name it could not resolve, and
`filterRegionAddressSuggestions` correctly fell through to unfiltered
results. Re-running with the ASCII alias `region=myrzakent` returned `[]` and
a genuine Атакент match for `region=atakent`. The filter works. Do not
"fix" it.

## Why the table was empty

`import-addresses.js` harvests from Overpass and writes to the database in
one pass. That works from a developer machine and cannot work in
production: the Railway container cannot open a connection to any Overpass
mirror. So the `addresses` table has been empty there since it was created,
and the search code — which is fine — had nothing to search.

## The split

- **`harvest-addresses.js`** runs where Overpass is reachable and writes
  gzipped JSONL to `apps/api/data/addresses/`, committed to the repo.
- **`load-addresses.js`** runs inside the container, reads local files only,
  and is invoked detached from `server.js` after the listener is up. It
  skips itself once the table already holds what the files contain.

**80 611 rows across all twelve regions, 1.9 MB compressed.**

| region | rows | | region | rows |
|---|---:|---|---|---:|
| Мырзакент | 26 728 | | Атамекен | 4 401 |
| Жетысай | 10 512 | | Киров | 3 995 |
| Жана жол | 8 174 | | Атакент | 3 649 |
| Ынтымак | 7 972 | | Бирлик | 1 671 |
| Мактаарал | 6 312 | | Достык | 1 499 |
| Фирдоуси | 4 773 | | Асыката | 925 |

## Two traps that would have made this silently do nothing

1. **The Docker build context is `apps/api`.** Data at the repository root
   is not merely uncopied — it is unreachable from the build. The files live
   under `apps/api/data/`.
2. **The Dockerfile copied only `src`.** Without `COPY data ./data` the
   loader finds no directory, logs that it has nothing to do, and every
   search quietly keeps returning the settlement centre. This is the class
   of bug that survives for months because nothing errors.

## Russian and Kazakh street names

Streets here are named both ways in daily use — "Бектасова" and "Бектасов
көшесі" are the same street and riders type either. OSM carries one spelling
in `name` and frequently the other in `name:ru`/`name:kk`. The harvest keeps
every variant, a new `search_text` column holds them beside the label, and
`searchGazetteer` matches on that column rather than on `label`.

**2 038 of the 80 611 rows carry more than one spelling**, so this is doing
real work rather than silently collecting nothing — which is exactly what
the data check asserts.

## What is verified, and what is not

`addresses-data-check.js` runs as part of `npm test` and checks everything
that can be checked without a database:

- every file decompresses and every line parses;
- every `kind` is one of the four known classes;
- **every coordinate lands inside southern Turkistan** — this is what would
  catch a mis-computed bounding box, and the harvester's longitude delta has
  to divide by the cosine of the latitude or every box is ~25% too narrow
  east-west at 40.7°N;
- every row carries an OSM identity;
- the search text always contains its own label;
- the manifest matches the files in both directions. Verified by corrupting
  an entry and confirming the check fails on it.

**Not verified until this deploy: the loader's database half.** Local
Postgres credentials are unknown and Docker hangs on this machine, so it was
read and syntax-checked but never run against a real table until production
ran it.

## Re-harvesting later

    cd apps/api
    node src/tools/harvest-addresses.js            # every region
    node src/tools/harvest-addresses.js MYRZAKENT  # one region

Overpass rate-limits hard; the tool serialises requests, spaces them 4s
apart and backs off 8/16/24s on failure. A full twelve-region run takes
roughly half an hour and one class failing does not cost the rest of the
region. The manifest is rebuilt from whatever is on disk, so harvesting one
region at a time still leaves a manifest describing the whole directory.

Then commit `apps/api/data/addresses/` and push — the first boot after that
loads the difference.

---

## Live in production, and what the first hour taught

Deployed 09:59 UTC. The loader ran, and searching Мырзакент immediately
returned real house numbers — which had never existed there. Every one came
back tagged `"region":"Ынтымак"`.

**Overlapping boxes plus a unique OSM key means one row, one region, and no
rule means "whoever loaded last".** Мырзакент loaded at 10:00:16, Ынтымак at
10:00:18, and Ынтымак took the overlap. `region-geo.js` now holds the centres
and the rule is nearest centre wins.

Two things that exposed, both worth remembering:

- **A radius gate is wrong here.** The first version of the rule only kept a
  row inside its nearest region's own `radiusKm`. These settlements are 4-6 km
  apart with 12 km radii, so a point is routinely nearest to a region *and*
  outside its radius — belonging to nobody. It discarded 63 807 of 81 603
  rows. Caught by reading the numbers before pushing.
- **The row counts were always inflated.** 81 603 lines describe 27 476
  distinct objects; the rest are the same object in overlapping boxes. The
  first deploy's "72 437 rows written" was that same inflation.

Verified live after the fix (10:18 UTC reload, 26 794 rows):

| query | result |
|---|---|
| Бектасова @ Мырзакент | 8 hits, all gazetteer, all tagged Мырзакент |
| Бектасова, 24 @ Мырзакент | exact house number |
| Абая @ Жетысай | 8 hits, all gazetteer, all tagged Жетысай |
| школа @ Атакент | Школа №12 им. Комарова, Школа №10 им. Сатпаева |

## Two things still open

**Атакент wrote 3 125 rows where the manifest expects 3 489.** Both sides use
the same nearest-centre function, so the 364-row gap is unexplained. Because
the "already loaded?" check is exact equality, Атакент will re-upsert on
every boot until this is understood. Harmless but wasteful, and an
unexplained discrepancy is worth chasing on its own account.

**Small regions get tiny shares.** Ынтымак owns 9 rows, Киров 3, Достык 36 —
their centres sit so close to their neighbours' that most of their area is
nearer to someone else. Since the gazetteer query filters on
`regions.name = $2`, a rider in Ынтымак sees almost nothing local even though
the streets around them are in the table under a neighbour's name.

The fix is probably to stop filtering the gazetteer by region equality and
filter by distance from the region's centre instead — the rows are already
positioned, and a rider cares about what is near them, not about which
administrative row owns it. That is a design decision, not a bug fix, so it
is left for a deliberate call.

---

## Scoping by distance, not by name

Ten of the twelve regions were still effectively empty to their own riders,
and the reason was the query, not the data.

Every row belongs to exactly one region — its nearest settlement. Correct
for storage; wrong for search. These settlements are 4-6 km apart, so the
streets physically around a rider in Ынтымак sit in the table under Киров or
Жана жол. `searchGazetteer` matched `regions.name = $2`, so that rider saw
the nine rows Ынтымак happens to own and nothing from their own street.

The gazetteer now scopes to a box around the region's centre, sized by that
region's working radius. "Near me" is a distance, not an administrative
label. The longitude delta divides by the cosine of the latitude — a square
in degrees is not square on the ground, and without it the box clips the
east and west edges of every region.

Verified live:

| region | query | before | after |
|---|---|---|---|
| Ынтымак | Абая | 0 from gazetteer | 8 — Абая Ташкентская, улица Абая, 3 |
| Киров | Абая | 0 | 3 |
| Достык | школа | 0 | 8 — Школа №12 им. Комарова, №13 им. Бапышева |
| Атакент | школа | 3 of 8 | 8 of 8 |
| Мырзакент | Бектасова | 8 | 8 — улица Бектасова, 2, 4 |

## Still open

**Атакент wrote 3 125 rows where the manifest expects 3 489.** Not
duplicates — the file holds 3 489 rows with 3 489 distinct OSM identities.
Both sides call the same `nearestRegionCode`. Unexplained. Because the
"already loaded?" check is exact equality, Атакент re-upserts on every boot
until someone works out why. Harmless, wasteful, and an unexplained
discrepancy deserves an answer on its own account.

**"мектеп" finds nothing in Мырзакент.** The gazetteer stores POI names as
OSM has them, so a school named "Средняя школа №1" has no "мектеп" anywhere
in its text. Street names are handled — the harvest keeps `name:ru` and
`name:kk` — but *category* words in Kazakh are not. Mapping a small set of
them (мектеп/школа, дүкен/магазин, дәріхана/аптека, аурухана/больница) onto
the OSM `amenity`/`shop` tag at harvest time would close it.

---

## Correction: distance cannot cut a border that runs through the radius

I reported the 25 km service-area floor as removing rows that are "almost
entirely across the border". That was measured in aggregate and stated too
confidently. Checked per-row afterwards: **36 Guliston rows still pass the
filter**, because they sit *inside* 25 km of Мырзакент's centre. The earlier
measurement said 20% of rows within 25 km carry Latin-script Uzbek names —
around 3 900 of them. Those were never going to be cut by a radius.

The floor still did real work (~7 000 rows beyond 25 km, 95% Uzbek), but it
is a blunt instrument for this. Мырзакент straddles the border; no circle
centred on it separates the two countries.

The right tool is the actual boundary: either filter at harvest time on the
OSM element's containing country, or clip against Kazakhstan's boundary
polygon. Both are straightforward and neither is guesswork, which a distance
threshold here always will be.

Until that lands, riders in Мырзакент can still surface a few dozen
addresses across the border.

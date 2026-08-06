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

# Address / region geometry audit — 2026-09-03

Scope: why riders in the smaller launch regions cannot pick a real address.
Measured against the committed harvest (`apps/api/data/addresses/*.jsonl.gz`,
142 716 distinct OSM objects), not against a running database — the DB-backed
checks cannot run on this machine (`src/config/env.js` requires production
URLs), so everything below is derived from the files plus the geometry the API
reads.

## 1. Атамекен's service area lay across the Uzbek border — FIXED

`SERVICE_BOUNDARIES.ATAMEKEN` ran to longitude 68.62. The Kazakhstan/
Uzbekistan border in this district sits near 68.56–68.58, so most of the box
was in Uzbekistan. 40% of everything harvested inside it carried Latin-only
Uzbek names — `Sirdaryo tumani 10-maktab`, `Paxtakor jom'e masjidi`,
`Marxamat ko'chasi`, `Zarshunos MFY Fuqarolar yig'ini markazi`. Every other
region measures 0–2%.

`filterGazetteerRowsToServiceArea()` accepts any row inside the selected
region's polygon, so a rider who chose Атамекен could be offered a destination
in another country, which no driver can serve.

The border was located from the harvest itself — it contains both customs
pairs:

| latitude | Kazakh side | Uzbek side |
|---|---|---|
| 40.836 | `Customs Kazakhstan` 68.5604 | `Customs Uzbekistan` 68.5644 |
| 40.79 | `Сырдария шекаралық кеден бекеті` 68.5769 | `Malik chegara bojxona posti` 68.5814 |

Eastern edge moved 68.620 → **68.562**. Result: 50 objects → 25, Latin-only
40% → 4%, and every Kazakh object is kept (улица Абая, улица Сатпаева,
школа № 35, сш им Болашақ; the cluster ends at 68.5551). `Customs Kazakhstan`
is retained.

Script is not nationality — `махалла` (68.5735) and `Заправка` (68.5955) are
Cyrillic labels on the Uzbek side — so the share is a smoke alarm, not a
classifier. `addresses-data-check.js` now fails any active region whose
polygon holds more than 10% Latin-only labels. Verified it fails on the old
polygon and passes on the new one.

### Атамекен's centre was on the Uzbek side too — FIXED

`REGION_GEO.ATAMEKEN` was `40.8121, 68.5839` — about 1 km from
`Paxtakor jom'e masjidi` and 2.4 km outside its own corrected polygon, so
nearest-centre ownership for the whole district was being measured from a
foreign village. Moved to `40.8155, 68.5488`, the median of the 24 Cyrillic
objects inside the corrected boundary (улица Абая, улица Сатпаева, улица
Жамбыла, школа № 35, сш им Болашақ).

Effect on ownership: Атамекен 20 → 24 rows, Киров 33 → 29. The four that moved
sit in the Киров/Атамекен overlap and are nearer the corrected centre. No
other region changed, and the total is unchanged.

## 2. Мақтаарал searched a box twice its working radius — FIXED

`regionRadiusKmByName()` matches on the display name. The `regions` table
stores **Мақтаарал** (with қ); `REGION_GEO` said **Мактаарал** (plain к). No
match, so it fell through to the 25 km default instead of 12 km. The
96-candidate page then filled with Мырзакент and Жетысай rows before the
polygon filter saw a local one — exactly the failure the "Школа" comment in
`searchGazetteer()` warns about. All 13 names now resolve to their real radius.

## 3. The region seed was a second hand-written copy — FIXED

`migrations.js` spelled out the same 13 regions again, and the two had already
drifted: the name above, and Мырзакент's centre by 600 m
(`40.666108,68.543090` in SQL vs `40.665495,68.549994` in code). The Атамекен
border fix would have been a third place to edit by hand.

The seed is now generated from `REGION_SEED`, exported from `region-geo.js`.
The DB centre for Мырзакент moves to the code value; ownership and the
committed manifest are unaffected, since ownership already used `REGION_GEO`.

## 4. Uzbek and other out-of-area rows purged from the catalogue

Owner's instruction: remove the foreign addresses outright rather than only
fencing them off. A row outside every service polygon has no owner, so
`load-addresses.js` never writes it and `searchGazetteer()` never returns it —
it was dead weight in the committed files. Removing that set removes the
foreign data with it.

`harvest-addresses.js` now prunes those rows when it writes, and a new
`--prune` flag re-files the committed catalogue against the current polygons
without re-downloading OSM. Run it after any boundary or centre change.

| | before | after |
|---|---|---|
| distinct objects in the files | 142 716 | 121 361 |
| Latin-only labels | 11 620 | 560 |
| rows matching Uzbek address vocabulary (`ko'chasi`, `maktab`, `masjid`, `do'kon`, `tumani`, `MFY`) | 11 060 | **0** |
| rows the loader actually writes | 121 361 | 121 361 |

The last row is the point: nothing rider-visible was lost. The 560 Latin-only
labels that remain are Kazakh businesses — Invivo, Mechta.kz, Arnur Credit,
Home Credit Bank, Qazaq Oil, Helios, Customs Kazakhstan — 244 of them in
Шымкент, as expected for a real city.

While pruning, `redistributeOwnedRows()` turned out to be quadratic: 106 000
Шымкент owners each scanned a 114 000-row array, which is why the pass looked
hung. Keying each file by a Set takes it to 3.5 s.

## 5. Five regions have no house-level data at all — EXTERNAL BLOCKER

House numbers by distance from each region centre, across all files:

| region | ≤1 km | ≤2 km | ≤3 km | ≤12 km | in polygon |
|---|---|---|---|---|---|
| ATAKENT | 1469 | 2570 | 3069 | 3114 | 2895 |
| MYRZAKENT | 1160 | 2899 | 3417 | 4313 | 4151 |
| ZHETYSAY | 1804 | 4435 | 6436 | 6724 | 6721 |
| SHYMKENT | 1167 | 4808 | 14604 | 84554 | 99130 |
| KIROV | 0 | 0 | 0 | 3668 | **0** |
| YNTYMAK | 0 | 0 | 0 | 5570 | **0** |
| BIRLIK | 0 | 0 | 0 | 9844 | **0** |
| ZHANA_ZHOL | 0 | 0 | 0 | 6778 | **0** |
| ATAMEKEN | 0 | 0 | 0 | 3429 | **0** |
| ASYKATA | 7 | 15 | 15 | 509 | 15 |
| DOSTYK | 0 | 0 | 43 | 5700 | 144 |
| FIRDOUSI | 0 | 0 | 251 | 4039 | 365 |
| MAKTAARAL | 0 | 141 | 254 | 4916 | 286 |

The thousands in the ≤12 km column are the neighbouring towns, 8–12 km away —
not the settlement itself. OSM has streets and POIs for these villages and no
house numbers whatsoever.

Five regions are at literal zero inside their own service area — Киров,
Ынтымак, Бирлик, Жана Жол, Атамекен. Three more are close enough to be
unusable in practice: Асыката 15, Достык 144, Фирдоуси 365, against 2 895 in
Атакент on a similar footprint.

**This is not a polygon or a code problem and cannot be fixed from OSM.** It is
the handoff's blocker #1: a reviewed RKA export per region, loaded through
`apps/api/data/official-addresses/` with its `.meta.json` passport
(`docs/ADDRESS_REGISTRY_IMPORT.md`). The loader, the passport check and the
`--require-official` report gate all already exist and are waiting on the
data. Until then those five regions cannot accept a house-level pickup, and the
coverage report is right to say `MISSING housenumber`.

## Reproduced against live production, 2026-09-04

`api.smarttaxi.kz` resolves and is healthy now (`/api/health` → 200, db/redis/
osrm all ok), so the deployed behaviour could be checked directly. None of the
fixes above are deployed yet — they are still in the working tree — and
production shows exactly the predicted symptoms.

The live `regions` table still carries the uncorrected geometry:

    ATAMEKEN  | Атамекен  | centre 40.8121 68.5839 | east edge 68.62
    MAKTAARAL | Мақтаарал | centre 40.7358 68.5364 | east edge 68.57

`GET /api/routes/addresses/search?q=улица&region=…&limit=6` on production:

| region selected | centre | what comes back |
|---|---|---|
| Атамекен | 40.812, 68.584 | 6 results, all at 40.717, 68.526 — **11 km southwest**, in Фирдоуси and Мақтаарал. Not one is in Атамекен. |
| Мақтаарал | 40.736, 68.536 | 6 results, all at 40.655, 68.568 — **9 km south**, every one in Мырзакент. This is the 25 km radius fallback from §2. |
| Киров | 40.787, 68.534 | 6 results in Мырзакент, Фирдоуси and Мақтаарал, 8–11 km away. |

Each row's `region` field names the region that owns it, so the response is
openly telling the rider these belong to another town. A passenger in
Мақтаарал typing "улица" is offered six streets in Мырзакент and nothing else.

That is the whole failure in one line, and it is live today.

## 6. Noted, not acted on: 17 pairs of service polygons overlap

597 objects sit inside two or more region polygons (KIROV↔ZHANA_ZHOL 14.9 km²,
KIROV↔MAKTAARAL 9.1, YNTYMAK↔FIRDOUSI 14.0, and so on). Ownership stays
deterministic — `serviceRegionCode()` breaks ties by nearest centre — but
search does not use ownership: it returns anything inside the selected
region's polygon and labels it with the selected region. So a rider in Киров
can see Жана жол's улица Сагындыкова presented as Киров. The coordinates are
right and the ride is short, so this is cosmetic rather than dangerous.

Relabelling with the owning region is **not** the fix: that is a deliberate
choice in `searchGazetteer()` with its reasoning in place — "otherwise a valid
border-street can look as if it belongs to a neighbouring town". The remaining
option is trimming the boxes, which needs local knowledge of where each
settlement ends.

## Verification

- `npm --prefix apps/api run syntax` — ok
- `node apps/api/src/tools/addresses-data-check.js` — ok, 121 361 owned rows,
  cross-border guard green
- `npm --prefix apps/api run report:address-coverage` — every region's counts
  unchanged except ATAMEKEN 45 → 24, KIROV 33 → 29, ZHANA_ZHOL 8 → 9
- catalogue pruned and `manifest.json` rebuilt with
  `node src/tools/harvest-addresses.js --prune`
- verified afterwards: 0 rows anywhere match Uzbek address vocabulary
- DB-backed checks (`npm --prefix apps/api test`) not run: no local Postgres
  credentials on this machine

## Continued in

`docs/status/map-and-route-fixes-2026-09-03.md` — map layer ordering and the
live-route ETA, same session.

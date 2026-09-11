// Harvests OSM addresses into repo files, for machines that can reach
// Overpass — which the production container cannot.
//
// Why this exists, and why it is separate from import-addresses.js:
//
// import-addresses.js talks to Overpass and writes straight to the database.
// That works from a developer machine and fails in production: the Railway
// container cannot open a connection to any Overpass mirror, so the
// `addresses` table there has stayed empty since the day it was created.
// The visible consequence, measured against the live API on 2026-08-06: a
// rider in Мырзакент searching "Бектасов", "Абая", "школа", "магазин" or
// "мектеп" gets exactly one result for every single query — the settlement
// itself. There is no street-level data in production at all.
//
// So the harvest is split from the load. This tool runs where Overpass is
// reachable and writes newline-delimited JSON into data/addresses/, which is
// committed to the repository. load-addresses.js then reads those files
// inside the container, where no outbound Overpass call is needed.
//
// Region bounding boxes come from a table here rather than from the
// database, so the harvest can run with no database at all.
//
// Usage:
//   node src/tools/harvest-addresses.js            # every region below
//   node src/tools/harvest-addresses.js MYRZAKENT  # one region by code
//   node src/tools/harvest-addresses.js --manifest-only

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { serviceBoundaryForCode, serviceRegionCode } from "../modules/routing/region-geo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "../../data/addresses");

// Centre + radius per region, mirroring REGION_SEARCH_CENTERS in
// routing.service.js. Kept as a literal so this tool needs no database.
const REGIONS = [
  { code: "ATAKENT", name: "Атакент", lat: 40.844435, lng: 68.509021, radiusKm: 14 },
  { code: "MYRZAKENT", name: "Мырзакент", lat: 40.665495, lng: 68.549994, radiusKm: 22 },
  { code: "ZHETYSAY", name: "Жетысай", lat: 40.777134, lng: 68.324677, radiusKm: 16 },
  // Covers the complete active service polygon from migrations.js with a
  // small margin, without querying the whole Turkistan oblast on every run.
  { code: "SHYMKENT", name: "Шымкент", lat: 42.314696, lng: 69.588328, radiusKm: 34 },
  { code: "KIROV", name: "Киров", lat: 40.7869, lng: 68.5344, radiusKm: 12 },
  { code: "ASYKATA", name: "Асыката", lat: 40.8947, lng: 68.3635, radiusKm: 12 },
  { code: "DOSTYK", name: "Достык", lat: 40.8072, lng: 68.4592, radiusKm: 12 },
  { code: "YNTYMAK", name: "Ынтымак", lat: 40.7606, lng: 68.4979, radiusKm: 12 },
  { code: "BIRLIK", name: "Бирлик", lat: 40.8225, lng: 68.4018, radiusKm: 12 },
  { code: "FIRDOUSI", name: "Фирдоуси", lat: 40.7231, lng: 68.5016, radiusKm: 12 },
  // Matches migrations.js and region-geo.js — see the note there.
  { code: "ZHANA_ZHOL", name: "Жана жол", lat: 40.7567, lng: 68.5661, radiusKm: 12 },
  { code: "MAKTAARAL", name: "Мактаарал", lat: 40.7358, lng: 68.5364, radiusKm: 12 },
  { code: "ATAMEKEN", name: "Атамекен", lat: 40.8121, lng: 68.5839, radiusKm: 12 }
];

// The public mirrors rate-limit hard and start returning 429/504 under a
// tight loop — that is what broke the first coverage probe. Requests are
// serialised, spaced, and retried with growing backoff.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const PAUSE_BETWEEN_QUERIES_MS = 4_000;
const MAX_ATTEMPTS = 4;
// A stalled mirror used to leave this process waiting forever.  Harvesting is
// deliberately a best-effort maintenance task: a timed-out class is retained
// from the previous catalogue and the next mirror gets a chance to answer.
const REQUEST_TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function overpass(body) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SmartTaxi/1.0 (address harvest)"
        },
        body: new URLSearchParams({ data: body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(8_000 * (attempt + 1));
    }
  }
  throw lastError;
}

// A degree of latitude is ~111km everywhere; a degree of longitude shrinks
// with the cosine of the latitude. At ~40.7°N that is ~84km, so ignoring it
// would make every box ~25% too narrow east-west.
function bboxOf(region) {
  const boundary = serviceBoundaryForCode(region.code);
  if (boundary) {
    const lats = boundary.map((point) => point[1]);
    const lngs = boundary.map((point) => point[0]);
    return [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)]
      .map((value) => value.toFixed(5))
      .join(",");
  }
  const latDelta = region.radiusKm / 111;
  const lngDelta = region.radiusKm / (111 * Math.cos((region.lat * Math.PI) / 180));
  return [
    region.lat - latDelta,
    region.lng - lngDelta,
    region.lat + latDelta,
    region.lng + lngDelta
  ].map((value) => value.toFixed(5)).join(",");
}

// `out center` gives ways a representative point without pulling geometry.
function queriesFor(bbox) {
  return [
    {
      kind: "housenumber",
      body: `[out:json][timeout:180];(node["addr:housenumber"](${bbox});way["addr:housenumber"](${bbox}););out center tags;`
    },
    {
      kind: "poi",
      // No ["name"] filter, and nwr rather than node+way.
      //
      // Requiring a name dropped every unnamed pharmacy, shop and cafe on the
      // map — 116 of Мырзакент's 399 shops and 15 of its 35 pharmacies,
      // counted against Overpass on 2026-08-12. An unnamed pharmacy is still
      // somewhere a rider asks to be taken; labelFor() gives those rows their
      // category word ("Аптека") instead of a name, and drops anything whose
      // category says nothing ("shop=yes"). nwr also catches the ones mapped
      // as multipolygon relations, which node+way missed entirely.
      body: `[out:json][timeout:180];(nwr["amenity"](${bbox});nwr["shop"](${bbox}););out center tags;`
    },
    {
      kind: "building",
      body: `[out:json][timeout:180];way["building"]["name"](${bbox});out center tags;`
    },
    {
      kind: "street",
      body: `[out:json][timeout:180];way["highway"]["name"](${bbox});out center tags;`
    }
  ];
}

// Street names here are written both ways in real life — "Бектасова" and
// "Бектасов көшесі" refer to the same street, and riders type either. OSM
// usually carries one of them in `name` and sometimes the other in
// `name:ru`/`name:kk`. Keeping every variant we are given means the search
// index can match whichever form the rider happens to use.
function nameVariants(tags) {
  const variants = [
    tags.name,
    tags["name:ru"],
    tags["name:kk"],
    tags["name:en"],
    tags.alt_name,
    ...categoryWords(tags)
  ];
  const seen = new Set();
  const out = [];
  for (const variant of variants) {
    const text = String(variant || "").replace(/\s+/g, " ").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
}

// What the place IS, in both languages, from its OSM tag.
//
// Names alone are not enough. A school tagged `amenity=school` is usually
// named "Средняя школа №1" — so a rider typing "мектеп" (Kazakh for school)
// matches nothing, and one typing "школа" matches only if the Russian word
// happens to be in the name. Measured against the live API on 2026-08-06:
// "мектеп" in Мырзакент returned zero.
//
// Street *names* were already handled — the harvest keeps name:ru and
// name:kk. This is the same problem one level up, for category words, and it
// needs the tag rather than the name.
const CATEGORY_WORDS = {
  school: ["школа", "мектеп"],
  kindergarten: ["детский сад", "балабақша"],
  hospital: ["больница", "аурухана"],
  clinic: ["поликлиника", "емхана"],
  doctors: ["поликлиника", "емхана"],
  pharmacy: ["аптека", "дәріхана"],
  bank: ["банк"],
  atm: ["банкомат"],
  post_office: ["почта", "пошта"],
  police: ["полиция"],
  fuel: ["заправка", "азық-түлік станциясы", "жанармай"],
  cafe: ["кафе", "дәмхана"],
  restaurant: ["ресторан", "мейрамхана"],
  bakery: ["пекарня", "наубайхана"],
  marketplace: ["базар", "рынок"],
  mosque: ["мечеть", "мешіт"],
  place_of_worship: ["мечеть", "мешіт"],
  bus_station: ["автовокзал", "автобекет"],
  townhall: ["акимат", "әкімдік"],
  supermarket: ["супермаркет", "магазин", "дүкен"],
  convenience: ["магазин", "дүкен"],
  greengrocer: ["магазин", "дүкен"],
  butcher: ["мясной", "ет дүкені"],
  clothes: ["одежда", "киім"],
  hairdresser: ["парикмахерская", "шаштараз"],
  car_repair: ["автосервис", "СТО"],
  car_wash: ["автомойка", "жуу"]
};

function categoryWords(tags) {
  const key = tags.amenity || tags.shop;
  if (!key) return [];
  // `shop=yes` and friends carry no information — a bare "магазин" alias on
  // every unnamed shop would flood a search for the word with noise.
  if (key === "yes") return tags.shop ? ["магазин", "дүкен"] : [];
  return CATEGORY_WORDS[key] || [];
}

function labelFor(kind, tags) {
  const street = tags["addr:street"];
  const housenumber = tags["addr:housenumber"];
  if (kind === "housenumber") {
    // Rural addresses here are often filed against the settlement rather than
    // a street — addr:place ("4 mavze") or addr:city ("Мырзакент") with no
    // addr:street at all. Requiring a street threw 472 such houses away in
    // Мырзакент's box alone; any of the three gives a rider something to
    // recognise next to the number.
    const where = street || tags["addr:place"] || tags["addr:city"] || tags.name;
    // A bare number really is unsearchable — "12" on its own is skipped.
    if (!where) return null;
    return housenumber ? `${where}, ${housenumber}` : where;
  }
  // An unnamed place keeps its category as the label: "Аптека" is a
  // destination a rider can say out loud, "amenity=pharmacy" is not.
  //
  // The name is read from the tags rather than from nameVariants(), which
  // deliberately mixes category words in with the real names so that a search
  // for "аптека" also finds one called "Дару". Taking the label off that list
  // titled every unnamed row in lower case.
  const realName = [tags.name, tags["name:ru"], tags["name:kk"], tags["name:en"], tags.alt_name]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .find(Boolean);
  // shop=yes says nothing; a row called "Магазин" for every one of them would
  // bury the named shops in search.
  const category = (tags.amenity || tags.shop) === "yes" ? null : categoryWords(tags)[0];
  const display = realName
    || (category ? category.charAt(0).toUpperCase() + category.slice(1) : null);
  if (!display) return null;
  // A shop is far easier to find when its address rides along with it.
  if (street && housenumber) return `${display} (${street}, ${housenumber})`;
  if (street) return `${display} (${street})`;
  return display;
}

function coordsOf(element) {
  if (element.type === "node") return [element.lat, element.lon];
  if (element.center) return [element.center.lat, element.center.lon];
  return [null, null];
}

async function harvestRegion(region) {
  const bbox = bboxOf(region);
  const rows = [];
  const seen = new Set();
  const failedKinds = new Set();
  for (const { kind, body } of queriesFor(bbox)) {
    let payload;
    try {
      payload = await overpass(body);
    } catch (error) {
      // One class failing must not cost the rest of the region — a partial
      // gazetteer still beats none. What this class already had is carried
      // over from the file on disk; see rowsOfKindFrom below.
      console.error(`  ${region.name}/${kind}: FAILED (${error.message})`);
      failedKinds.add(kind);
      continue;
    }
    const elements = payload.elements || [];
    let kept = 0;
    for (const element of elements) {
      const tags = element.tags || {};
      const label = labelFor(kind, tags);
      if (!label) continue;
      const [lat, lng] = coordsOf(element);
      if (lat == null || lng == null) continue;
      // A collection rectangle can overlap a neighbouring launch region.
      // Keep each point only in the real service area that owns it; otherwise
      // the same point can overwrite a neighbour during a later reload.
      if (serviceRegionCode(lat, lng) !== region.code) continue;
      const key = `${element.type}/${element.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        kind,
        label,
        street: tags["addr:street"] || null,
        housenumber: tags["addr:housenumber"] || null,
        name: tags.name || null,
        // Every spelling we were given, so a search for either the Russian
        // or the Kazakh form of a street finds the same place.
        variants: nameVariants(tags),
        lat,
        lng,
        osmType: element.type,
        osmId: element.id
      });
      kept += 1;
    }
    console.log(`  ${region.name}/${kind}: ${kept} of ${elements.length}`);
    await sleep(PAUSE_BETWEEN_QUERIES_MS);
  }
  return { rows, failedKinds };
}

/// Rows of the given classes from a harvest already on disk.
///
/// Overpass fails a class at a time, at random, and a different one on every
/// run — Мактаарал lost its streets to a 504 on one pass and Киров its POIs
/// on the next. Without this the run would write the region back minus that
/// class, and since the loss is only a few hundred rows out of thousands the
/// 80% guard below waves it through. Carrying the old rows over makes a
/// re-harvest incapable of making the gazetteer worse.
function rowsOfKindFrom(file, kinds) {
  if (!kinds.size || !fs.existsSync(file)) return [];
  let text;
  try {
    text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
  } catch {
    return [];
  }
  const kept = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (kinds.has(row.kind)) kept.push(row);
  }
  return kept;
}

function existingRowCount(file, regionCode) {
  if (!fs.existsSync(file)) return 0;
  try {
    const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
    let rows = 0;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (serviceRegionCode(row.lat, row.lng) === regionCode) rows += 1;
      } catch {
        // A malformed legacy line is not a reason to preserve an entire
        // polluted file; the regular data check will still report it.
      }
    }
    return rows;
  } catch {
    // An unreadable file is not worth protecting.
    return 0;
  }
}

/// Moves every row into the file of the region that owns it.
///
/// Harvest boxes overlap, so an object is usually collected several times;
/// the loader keeps it only from the file of the region whose centre is
/// nearest. When a neighbour's wider box reached an object that the owner's
/// own narrower box did not, no file ever loads it — 86 addresses were
/// sitting in the directory unreachable for exactly that reason. Copying
/// them into the owner's file costs a few kilobytes and makes "harvested"
/// and "loadable" the same set.
///
/// The other half of that equality is the pruning below. A row outside every
/// service polygon has no owner, so the loader never writes it and search
/// never returns it — dead weight that only makes the files bigger and the
/// data harder to reason about. The harvest boxes are circles drawn around
/// settlements, so most of that weight was another country: of the 21 355
/// unowned rows removed on 2026-09-03, 11 060 carried Latin-only Uzbek names
/// (`Sirdaryo tumani 10-maktab`, `Marxamat ko'chasi`). Nothing rider-visible
/// changes — see docs/status/address-region-geometry-2026-09-03.md.
///
/// It does mean widening a service polygon now needs a re-harvest rather than
/// just a reload. That is the honest trade: the files describe what the
/// product actually serves.
function redistributeOwnedRows() {
  const byFile = new Map();
  const owners = new Map();
  let pruned = 0;
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (!name.endsWith(".jsonl.gz")) continue;
    const code = name.replace(/\.jsonl\.gz$/, "");
    const text = zlib.gunzipSync(fs.readFileSync(path.join(OUT_DIR, name))).toString("utf8");
    const rows = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const owner = serviceRegionCode(row.lat, row.lng);
      if (!owner) {
        pruned += 1;
        continue;
      }
      rows.push(row);
      const key = `${row.osmType}/${row.osmId}`;
      if (!owners.has(key)) owners.set(key, { owner, row });
    }
    byFile.set(code, rows);
  }

  // Key set per file rather than a linear scan of the target array. The scan
  // made this quadratic — 106 000 Шымкент owners each walked a 114 000-row
  // array — which took long enough that the pass looked hung rather than slow.
  const keysByFile = new Map();
  for (const [code, rows] of byFile) {
    keysByFile.set(code, new Set(rows.map((row) => `${row.osmType}/${row.osmId}`)));
  }

  let moved = 0;
  for (const [key, { owner, row }] of owners) {
    const target = byFile.get(owner);
    const present = keysByFile.get(owner);
    if (!target || !present) continue;
    if (present.has(key)) continue;
    target.push(row);
    present.add(key);
    moved += 1;
  }
  if (!moved && !pruned) return { moved: 0, pruned: 0 };

  for (const [code, rows] of byFile) {
    const text = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    fs.writeFileSync(path.join(OUT_DIR, `${code}.jsonl.gz`), zlib.gzipSync(Buffer.from(text, "utf8"), { level: 9 }));
  }
  return { moved, pruned };
}

// Rebuilt from whatever files are on disk rather than from this run's
// results, so harvesting one region at a time still leaves a manifest that
// describes the whole directory.
function writeManifest() {
  const counts = {};
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (!name.endsWith(".jsonl.gz")) continue;
    const code = name.replace(/\.jsonl\.gz$/, "");
    const text = zlib.gunzipSync(fs.readFileSync(path.join(OUT_DIR, name))).toString("utf8");
    let rows = 0;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      // Count what the loader will actually keep, not what the file holds.
      // Boxes overlap, so a file carries objects belonging to neighbouring
      // settlements; the loader drops those, and if this counted them the
      // "already loaded?" check could never be satisfied and every boot
      // would re-upsert the lot.
      if (serviceRegionCode(row.lat, row.lng) !== code) continue;
      rows += 1;
    }
    counts[name] = rows;
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify({ counts }, null, 2) + "\n",
    "utf8"
  );
}

async function main() {
  // Re-files and prunes the committed catalogue against the current service
  // polygons, without re-downloading anything. This is what to run after a
  // boundary or centre changes.
  if (process.argv.includes("--prune")) {
    const { moved, pruned } = redistributeOwnedRows();
    console.log(`Moved ${moved} row(s); dropped ${pruned} row(s) outside every service area`);
    writeManifest();
    return;
  }
  if (process.argv.includes("--manifest-only")) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    writeManifest();
    console.log("Address manifest rebuilt");
    return;
  }
  const wanted = process.argv[2];
  const regions = wanted
    ? REGIONS.filter((region) => region.code === wanted.toUpperCase())
    : REGIONS;
  if (!regions.length) {
    console.error(`No region with code ${wanted}. Known: ${REGIONS.map((r) => r.code).join(", ")}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  let failures = 0;
  for (const region of regions) {
    console.log(`${region.name} (${region.code})`);
    const { rows, failedKinds } = await harvestRegion(region);
    // Gzipped, because this data lives in the repository: Мырзакент alone
    // is 5.6 MB of JSON and 0.6 MB compressed, and there are twelve
    // regions. Node reads it back with zlib — no dependency, no build step.
    const file = path.join(OUT_DIR, `${region.code}.jsonl.gz`);

    // Refuse to replace a good harvest with a crippled one. Overpass fails a
    // class at a time and the run carries on regardless — which is right,
    // a partial gazetteer beats none on a first harvest. But on a re-run it
    // means a single "fetch failed" silently overwrites committed data with
    // a fraction of it. Seen on 2026-08-06: three of Мырзакент's four
    // classes failed and the file went from 26 728 rows to 1 364. It was
    // only recoverable because it was already committed.
    const carried = rowsOfKindFrom(file, failedKinds);
    if (carried.length) {
      const seen = new Set(rows.map((row) => `${row.osmType}/${row.osmId}`));
      let added = 0;
      for (const row of carried) {
        const key = `${row.osmType}/${row.osmId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        added += 1;
      }
      console.log(
        `  ${region.name}: kept ${added} rows of [${[...failedKinds].join(", ")}] from the previous harvest`
      );
    }

    const existing = existingRowCount(file, region.code);
    if (existing && rows.length < existing * 0.8) {
      console.error(
        `  ${region.name}: REFUSING to overwrite — harvested ${rows.length} rows, ` +
        `file already holds ${existing}. Re-run this region when Overpass is healthy.`
      );
      failures += 1;
      continue;
    }

    const text = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
    fs.writeFileSync(file, zlib.gzipSync(Buffer.from(text, "utf8"), { level: 9 }));
    console.log(`  -> ${rows.length} rows to ${path.relative(process.cwd(), file)}`);
    total += rows.length;
    // Row counts alongside the data. The loader compares them against the
    // database on every boot to decide whether it has anything to do;
    // reading a 300-byte JSON beats gunzipping 1.9 MB synchronously inside
    // a process that is already serving requests.
    writeManifest();
  }
  // Only meaningful once every region has been written, so it runs after the
  // loop rather than per region.
  if (regions.length === REGIONS.length) {
    const { moved, pruned } = redistributeOwnedRows();
    if (moved || pruned) {
      if (moved) console.log(`Moved ${moved} row(s) into the file of the region that owns them`);
      if (pruned) console.log(`Dropped ${pruned} row(s) outside every service area`);
      writeManifest();
    }
  }
  console.log(`Done: ${total} rows across ${regions.length - failures} region(s)`);
  if (failures) {
    // Non-zero exit, so a scripted re-harvest cannot mistake a refused
    // overwrite for a clean run and commit stale data as if it were fresh.
    console.error(`${failures} region(s) kept their previous data — re-run them.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

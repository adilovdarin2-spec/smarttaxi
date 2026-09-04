// Reports usable local-address density for every active SmartTaxi region.
// It is intentionally non-blocking by default: catalogue density is an
// operations/data concern, not a reason to prevent a safe code deploy.  Run
// with --strict in a data-refresh pipeline to fail if a region has no house,
// street or POI coverage at all.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import { REGION_GEO, serviceRegionCode } from "../modules/routing/region-geo.js";
import { readOfficialAddressSnapshot } from "./official-addresses.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../data/addresses");
const requiredKinds = ["housenumber", "street", "poi"];
const strict = process.argv.includes("--strict");
const requireOfficial = process.argv.includes("--require-official");
let hasCriticalGap = false;

function readRows(file) {
  const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
  return text.split("\n").filter(Boolean).map(line => JSON.parse(line));
}

for (const region of REGION_GEO) {
  const file = path.join(DATA_DIR, `${region.code}.jsonl.gz`);
  if (!fs.existsSync(file)) {
    console.log(`${region.code.padEnd(12)} missing catalogue`);
    hasCriticalGap = true;
    continue;
  }
  const totals = Object.fromEntries(requiredKinds.map(kind => [kind, 0]));
  let owned = 0;
  for (const row of readRows(file)) {
    if (serviceRegionCode(row.lat, row.lng) !== region.code) continue;
    owned += 1;
    if (Object.hasOwn(totals, row.kind)) totals[row.kind] += 1;
  }
  const gaps = requiredKinds.filter(kind => totals[kind] === 0);
  if (gaps.length) hasCriticalGap = true;
  const state = gaps.length ? `MISSING ${gaps.join(",")}` : owned < 250 ? "REFRESH RECOMMENDED" : "READY";
  const officialSnapshot = readOfficialAddressSnapshot(region.code);
  const officialRows = officialSnapshot?.rows;
  const officialState = officialRows?.length
    ? `RKA ${String(officialRows.length).padStart(7)} imported ${officialSnapshot.metadata.sourceVersion} ${officialSnapshot.metadata.checksum.slice(0, 12)}`
    : "RKA IMPORT PENDING";
  if (requireOfficial && !officialRows?.length) hasCriticalGap = true;
  console.log(`${region.code.padEnd(12)} ${String(owned).padStart(6)} rows | homes ${String(totals.housenumber).padStart(5)} | streets ${String(totals.street).padStart(4)} | POI ${String(totals.poi).padStart(4)} | ${state} | ${officialState}`);
}

if (strict && hasCriticalGap) {
  console.error("Address coverage report failed: one or more active regions have a critical catalogue gap or required RKA import is missing.");
  process.exit(1);
}

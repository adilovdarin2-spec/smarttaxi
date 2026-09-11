// Retrieves one provenance-preserving page from Kazakhstan's public Address
// Register export UI. The API endpoint requires a developer key, while this
// documented export endpoint is intended for human-sized downloads and caps a
// request at 100 records. Keeping the operation explicitly page-bounded avoids
// silently scraping the country's entire register from a public web UI.
//
// Usage:
//   node src/tools/fetch-rka-portal-page.js --from=1 --count=100
//   node src/tools/fetch-rka-portal-page.js --from=3000000 --settlement=Мырзакент --out=data/official-addresses/raw/myrzakent-page.json
//
// This writes raw official records, not import-ready map points: s_buildings
// does not provide geometry. Feed reviewed, geocoded rows to
// official-addresses.js only after their coordinates are independently
// validated against the SmartTaxi service boundary.

import fs from "node:fs";
import path from "node:path";

const DATASET = "s_buildings";
const VERSION = "data";
const MAX_COUNT = 100;
const EXPORT_URL = "https://data.egov.kz/datasets/exportjson";

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function publicAddress(row) {
  return String(row.full_path_rus || row.full_path_kaz || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchRkaPortalPage({
  from = 1,
  count = MAX_COUNT,
  fetchImpl = fetch,
} = {}) {
  const safeFrom = positiveInteger(from, 1);
  const safeCount = Math.min(positiveInteger(count, MAX_COUNT), MAX_COUNT);
  const url = new URL(EXPORT_URL);
  url.searchParams.set("index", DATASET);
  url.searchParams.set("version", VERSION);
  url.searchParams.set("from", String(safeFrom));
  url.searchParams.set("count", String(safeCount));
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`RKA portal export failed: ${response.status} ${response.statusText}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("RKA portal export did not return an array");
  }
  return {
    provenance: {
      provider: "Kazakhstan Address Register / data.egov.kz",
      dataset: DATASET,
      version: VERSION,
      url: url.toString(),
      fetchedAt: new Date().toISOString(),
      range: { from: safeFrom, count: safeCount },
      geometry: "not supplied by s_buildings; do not import without reviewed coordinates",
    },
    rows,
  };
}

async function main() {
  const page = await fetchRkaPortalPage({
    from: option("from", "1"),
    count: option("count", String(MAX_COUNT)),
  });
  const settlement = option("settlement")?.trim().toLocaleLowerCase("ru-RU");
  if (settlement) {
    page.rows = page.rows.filter((row) =>
      publicAddress(row).toLocaleLowerCase("ru-RU").includes(settlement)
    );
    page.provenance.settlementFilter = settlement;
  }
  const payload = `${JSON.stringify(page, null, 2)}\n`;
  const output = option("out");
  if (!output) {
    process.stdout.write(payload);
    return;
  }
  const target = path.resolve(process.cwd(), output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, payload, "utf8");
  console.log(`Wrote ${page.rows.length} raw RKA rows to ${target}`);
}

if (process.argv[1]?.endsWith("fetch-rka-portal-page.js")) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

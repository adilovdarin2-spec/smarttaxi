import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadHarvestedAddresses } from "./load-addresses.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.resolve(HERE, "../../data/addresses/manifest.json"), "utf8")
);
const fileName = "YNTYMAK.jsonl.gz";
const expectedRows = manifest.counts[fileName];
const expectedChecksum = manifest.sha256[fileName];

function fakeExecutor({ checksum = expectedChecksum } = {}) {
  const calls = [];
  const executor = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("FROM regions WHERE code")) {
      return { rows: [{ id: "00000000-0000-0000-0000-000000000001", name: "Ынтымак" }] };
    }
    if (sql.includes("COUNT(*)::int AS count FROM addresses")) {
      return { rows: [{ count: expectedRows }] };
    }
    if (sql.includes("FROM address_catalog_snapshots")) {
      return { rows: [{ checksum, row_count: expectedRows }] };
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, executor };
}

const current = fakeExecutor();
const currentWritten = await loadHarvestedAddresses({
  wantedCode: "YNTYMAK",
  log: () => {},
  executor: current.executor
});
assert.equal(currentWritten, 0, "an already applied checksum must skip OSM row writes");
assert.equal(
  current.calls.some((call) => call.sql.includes("INSERT INTO addresses")),
  false,
  "matching count and checksum must not rewrite the catalogue"
);

const stale = fakeExecutor({ checksum: "0".repeat(64) });
const refreshed = await loadHarvestedAddresses({
  wantedCode: "YNTYMAK",
  log: () => {},
  executor: stale.executor
});
assert.equal(refreshed, expectedRows, "a changed checksum must reload an equal-sized snapshot");
assert(
  stale.calls.some((call) => call.sql.includes("INSERT INTO addresses")),
  "changed checksum must write address rows"
);
assert(
  stale.calls.some((call) => call.sql.includes("INSERT INTO address_catalog_snapshots")),
  "successful refresh must persist the new checksum"
);

console.log("Address loader checksum checks ok");

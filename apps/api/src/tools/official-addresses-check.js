import assert from "node:assert/strict";

import { normalizeOfficialAddressRows, validateOfficialSnapshotPassport } from "./official-addresses.js";

const accepted = normalizeOfficialAddressRows([
  {
    rka: "1234567890123456",
    street: "Улица Табысты",
    housenumber: "12",
    lat: 40.755628,
    lng: 68.470029,
    variants: "Табысты|Табысты көшесі"
  },
  // A repeated RKA in one delivery must not create duplicate results.
  {
    rka: "1234567890123456",
    label: "Duplicate",
    lat: 40.755628,
    lng: 68.470029
  }
], "YNTYMAK", "fixture");

assert.equal(accepted.length, 1, "an official delivery must deduplicate RKA values");
assert.equal(accepted[0].label, "Улица Табысты, 12");
assert.equal(accepted[0].kind, "housenumber");
assert.ok(accepted[0].variants.includes("Табысты көшесі"));
assert.throws(
  () => normalizeOfficialAddressRows([{ rka: "1234567890123457", label: "Outside", lat: 40.731408, lng: 68.692265 }], "YNTYMAK", "fixture"),
  /outside the YNTYMAK service area/
);
assert.throws(
  () => normalizeOfficialAddressRows([{ rka: "not-an-rka", label: "Bad", lat: 40.755628, lng: 68.470029 }], "YNTYMAK", "fixture"),
  /invalid RKA/
);
assert.throws(
  () => normalizeOfficialAddressRows([{ rka: "123456789012345", label: "Short", lat: 40.755628, lng: 68.470029 }], "YNTYMAK", "fixture"),
  /invalid RKA/
);

const checksum = "a".repeat(64);
const passport = validateOfficialSnapshotPassport({
  metadata: {
    region_code: "YNTYMAK",
    source_dataset: "s_buildings + Smart Bridge geocoding",
    source_version: "2026-09-02",
    downloaded_at: "2026-09-02T08:30:00Z",
    source_record_count: 2,
    accepted_record_count: 1,
    sha256: checksum,
  },
  regionCode: "YNTYMAK",
  sourceChecksum: checksum,
  acceptedRows: 1,
  sourceName: "fixture.meta.json",
});
assert.equal(passport.acceptedRecordCount, 1, "the passport records the accepted row count");
assert.throws(
  () => validateOfficialSnapshotPassport({
    metadata: { ...passport, region_code: "YNTYMAK", accepted_record_count: 1, sha256: checksum },
    regionCode: "YNTYMAK",
    sourceChecksum: "b".repeat(64),
    acceptedRows: 1,
    sourceName: "fixture.meta.json",
  }),
  /checksum does not match/
);

console.log("Official Address Register import checks ok");

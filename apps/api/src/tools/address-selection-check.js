// Exercises the map-pick path end to end against fixtures.
//
// Everything a rider does on the address picker ends in reverseAddress(): drop
// the pin, read the card, confirm or move it. Until now that function had no
// seam for the local-gazetteer step — it reached straight for defaultQuery —
// so the only assertions anyone could write were about labels returned when
// the database was absent. That is how a response could claim
// `title: "Адрес не определён"`, `source: "point_on_map"`, `confidence: 0`
// and `fallback: false` at the same time and nobody noticed.
//
// reverseAddress now takes an executor, so the gazetteer can be a fixture and
// the interesting cases are reachable: a road code over a real house, a bare
// street over a house, a bare street over nothing, and a good address that
// must be left alone.

import assert from "node:assert/strict";

import {
  reverseAddress,
  filterGazetteerRowsToServiceArea
} from "../modules/routing/routing.service.js";
import {
  REGION_GEO,
  REGION_SEED,
  regionRadiusKmByName
} from "../modules/routing/region-geo.js";

// A pin near Мырзакент. Rows are shaped the way load-addresses.js writes them.
const HOUSE = {
  label: "улица Абая, 14",
  lat: 40.70012,
  lng: 68.52015,
  kind: "housenumber"
};
const SHOP = {
  label: "Магазин Береке",
  lat: 40.70014,
  lng: 68.52012,
  kind: "poi"
};

/// Stands in for the addresses table. nearestGazetteerAddress() asks for one
/// row inside a bounding box, optionally house numbers only, so the fixture
/// only has to honour the `requireHouseNumber` parameter and hand back rows in
/// the order the real ORDER BY would.
function gazetteer(rows) {
  return async (_sql, params) => {
    const requireHouseNumber = params[4] === true;
    const usable = requireHouseNumber
      ? rows.filter((row) => row.kind === "housenumber")
      : rows;
    if (!usable.length) return { rows: [] };
    return { rows: [{ ...usable[0], distance_squared: 0 }] };
  };
}

const nominatim = (displayName, address) => async () => ({
  ok: true,
  async json() {
    return {
      lat: "40.7001",
      lon: "68.5201",
      display_name: displayName,
      address
    };
  }
});

const PIN = { lat: 40.7001, lng: 68.5201 };

// 1. A road code over a real house. The provider answers KZ-12; the rider gets
//    the house, because that is what they can say out loud to a driver.
const overHouse = await reverseAddress(
  PIN,
  nominatim("KZ-12, Мырзакент, Казахстан", { road: "KZ-12", village: "Мырзакент" }),
  gazetteer([HOUSE])
);
assert.equal(overHouse.label, "улица Абая, 14", "a road code resolves to the nearby house");
assert.equal(overHouse.source, "gazetteer_reverse", "the local catalogue is credited as the source");
assert.equal(overHouse.fallback, false, "a resolved house is not a fallback");
assert.doesNotMatch(overHouse.label, /KZ[- ]?12/i, "the road code never reaches the rider");

// 2. A road code over nothing but fields. The rider must be told to move the
//    pin, and `fallback` must say so — this is the flag the fallbackPoint
//    comment promises clients can gate confirmation on, and it used to be
//    stamped back to false on the way out.
const overNothing = await reverseAddress(
  PIN,
  nominatim("KZ-12, Мырзакент, Казахстан", { road: "KZ-12", village: "Мырзакент" }),
  gazetteer([])
);
assert.equal(overNothing.title, "Адрес не определён", "an unresolvable pin says so");
assert.equal(overNothing.source, "point_on_map", "and is marked as a point, not an address");
assert.equal(overNothing.fallback, true, "and carries fallback:true so the client can block confirmation");
assert.equal(overNothing.confidence, 0, "with no confidence");
assert.match(overNothing.subtitle, /передвин|Передвин/, "and tells the rider what to do about it");

// 3. A bare street over a house. Same rule as the road code: the house wins.
const bareStreetOverHouse = await reverseAddress(
  PIN,
  nominatim("улица Абая, Мырзакент", { road: "улица Абая", village: "Мырзакент" }),
  gazetteer([HOUSE])
);
assert.equal(bareStreetOverHouse.label, "улица Абая, 14", "a bare street resolves to the house on it");

// 4. A bare street with only a shop nearby. requireHouseNumber means the shop
//    is not accepted as a substitute for a house number, and the street itself
//    must not be handed back either: both clients reject a street label with no
//    digit, so returning one leaves the rider looking at an address with a dead
//    confirm button and no explanation.
const bareStreetOverShop = await reverseAddress(
  PIN,
  nominatim("улица Абая, Мырзакент", { road: "улица Абая", village: "Мырзакент" }),
  gazetteer([SHOP])
);
assert.equal(
  bareStreetOverShop.title,
  "Адрес не определён",
  "a street with no house number becomes guidance, not a label the client will refuse"
);
assert.equal(bareStreetOverShop.fallback, true, "and is flagged as unresolved");

// 5. Бульвар and шоссе are streets too. The server's own list had drifted from
//    the two client guards, so these were handed back and then refused.
for (const street of ["бульвар Абая", "шоссе Ташкентское"]) {
  const drifted = await reverseAddress(
    PIN,
    nominatim(`${street}, Мырзакент`, { road: street, village: "Мырзакент" }),
    gazetteer([])
  );
  assert.equal(drifted.title, "Адрес не определён", `${street} is treated as a bare street`);
}

// 6. A real address is left completely alone — no catalogue lookup, no
//    rewriting. The fixture would throw if it were consulted.
const good = await reverseAddress(
  PIN,
  nominatim("улица Абая, 14, Мырзакент", {
    road: "улица Абая",
    house_number: "14",
    village: "Мырзакент"
  }),
  async () => {
    throw new Error("the gazetteer must not be consulted for an address that already has a house number");
  }
);
assert.match(good.label, /Абая/, "a good provider address survives");
assert.match(good.label, /14/, "with its house number intact");
assert.equal(good.fallback, false, "and is confirmable");

// 7. The service-area filter still refuses anything outside the active
//    polygons, which is what keeps another country's streets off the picker.
const region = {
  id: "r1",
  name: "Мырзакент",
  is_active: true,
  boundary: [[68.47, 40.6], [68.6, 40.6], [68.6, 40.73], [68.47, 40.73]]
};
const filtered = filterGazetteerRowsToServiceArea(
  [
    { label: "улица Абая, 14", lat: 40.7001, lng: 68.5201 },
    { label: "Marxamat ko'chasi", lat: 40.8193, lng: 68.6073 }
  ],
  [region],
  "Мырзакент"
);
assert.equal(filtered.length, 1, "only the row inside the service area survives");
assert.equal(filtered[0].label, "улица Абая, 14", "and it is the local one");

// 8. Every seeded region must resolve its own working radius by name.
//
// This is the Мақтаарал bug as a guard. regionRadiusKmByName() matches on the
// display name, the regions table stores that name, and the two were one
// letter apart — "Мақтаарал" with қ in the database against "Мактаарал" with к
// in the code. No match meant the 25 km default instead of 12, and a rider
// there searching "улица" got six streets in Мырзакент, 9 km south, and
// nothing local. Reproduced on production before the fix.
//
// REGION_SEED now generates the SQL from REGION_GEO so the two cannot drift,
// but the lookup is still by name, so the property is worth asserting
// directly: every region finds itself.
for (const seeded of REGION_SEED) {
  const resolved = regionRadiusKmByName(seeded.name);
  const expected = REGION_GEO.find((entry) => entry.code === seeded.code).radiusKm;
  assert.equal(
    resolved,
    expected,
    `${seeded.code} ("${seeded.name}") must resolve its own ${expected} km radius, not the default`
  );
}

// A name nobody knows still has to answer with something generous rather than
// nothing, which is the behaviour the default exists for.
assert.equal(regionRadiusKmByName("Нет такого города"), 25, "an unknown region falls back to the widest radius");
assert.equal(regionRadiusKmByName(""), null, "an empty hint is not a region at all");

console.log(`Address selection checks ok: 7 map-pick cases, ${REGION_SEED.length} region radii`);

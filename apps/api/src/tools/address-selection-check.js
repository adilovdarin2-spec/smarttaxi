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
import fs from "node:fs";
import { env } from '../config/env.js';

import {
  reverseAddress,
  searchAddresses,
  filterGazetteerRowsToServiceArea,
  isBookableAddressSuggestion
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
    const requirePoi = params[5] === true;
    const usable = rows.filter((row) =>
      (!requireHouseNumber || row.kind === "housenumber") &&
      (!requirePoi || row.kind === "poi")
    );
    if (!usable.length) return { rows: [] };
    return { rows: usable.map(row => ({ ...row, distance_squared: 0 })) };
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

assert.equal(
  isBookableAddressSuggestion({ label: "Атакент" }, "Атакент"),
  false,
  "a settlement name alone is never a dispatchable address"
);
assert.equal(
  isBookableAddressSuggestion({ label: "Атакент, Атакент" }, "Атакент"),
  false,
  "a repeated settlement name is still not a dispatchable address"
);
assert.equal(
  isBookableAddressSuggestion({ label: "Акимат Атакента" }, "Атакент"),
  true,
  "a named POI stays bookable without a house number"
);

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
assert.equal(overHouse.lat, HOUSE.lat, 'the address keeps its own latitude, not the provider road coordinate');
assert.equal(overHouse.lng, HOUSE.lng, 'the address keeps its own longitude');

const roadResponse = nominatim('KZ-12, Мырзакент', { road: 'KZ-12', village: 'Мырзакент' });
const unavailable = async () => { throw new Error('provider unavailable'); };
const offlineHouse = await reverseAddress(PIN, unavailable, gazetteer([
  { ...HOUSE, lat: PIN.lat + 0.0002 }
]));
assert.equal(offlineHouse.source, 'gazetteer_reverse', 'local addresses work during provider outages');
assert.equal(offlineHouse.lat, PIN.lat + 0.0002);
assert.match(offlineHouse.subtitle, /м от метки/, 'a nearby address is not presented as an exact footprint match');

const farHouse = { ...HOUSE, lat: PIN.lat + 0.002 };
const far = await reverseAddress(PIN, roadResponse, gazetteer([farHouse]));
assert.equal(far.fallback, true, 'a house 220 metres away must not name the selected building');
const corner = await reverseAddress(PIN, roadResponse, gazetteer([
  { ...HOUSE, lat: PIN.lat + 0.0005, lng: PIN.lng + 0.00065 }
]));
assert.equal(corner.fallback, true, 'box corners outside the 60 metre radius are rejected');

const nearestInMeters = await reverseAddress(PIN, roadResponse, gazetteer([
  { ...HOUSE, label: 'улица Абая, 16', lat: PIN.lat + 0.0003, lng: PIN.lng },
  { ...HOUSE, label: 'улица Абая, 18', lat: PIN.lat, lng: PIN.lng + 0.00035 }
]));
assert.equal(nearestInMeters.label, 'улица Абая, 18', 'longitude is scaled by latitude when choosing the nearest address');

const skipUnusable = await reverseAddress(PIN, roadResponse, gazetteer([
  { ...HOUSE, label: 'KZ-12' }, { ...HOUSE, label: ' ' }, HOUSE
]));
assert.equal(skipUnusable.label, HOUSE.label, 'an unusable closest row does not hide a real house');

const distantProvider = await reverseAddress(PIN, async () => ({
  ok: true,
  async json() {
    return { lat: farHouse.lat, lon: farHouse.lng, address: {
      road: 'улица Абая', house_number: '14', village: 'Мырзакент'
    } };
  }
}), gazetteer([]));
assert.equal(distantProvider.fallback, true, 'provider house numbers do not override physical distance');
assert.equal(distantProvider.lat, PIN.lat, 'unresolved responses keep the actual pin');

const unprefixedStreet = await reverseAddress(PIN,
  nominatim('Бектасова, Мырзакент', { road: 'Бектасова', village: 'Мырзакент' }),
  gazetteer([]));
assert.equal(unprefixedStreet.fallback, true, 'street metadata blocks a bare street without the word улица');

const building = { type: 'Polygon', coordinates: [[
  [68.5200,40.7000],[68.5203,40.7000],[68.5203,40.7004],[68.5200,40.7004],[68.5200,40.7000]
]] };
const inside = { ...HOUSE, label: 'улица Абая, 20', lat: PIN.lat + 0.00025, lng: PIN.lng };
const neighbouringHouse = { ...HOUSE, label: 'улица Абая, 22', lat: PIN.lat, lng: PIN.lng - 0.0002 };
const selected = await reverseAddress({ ...PIN, building }, roadResponse, gazetteer([neighbouringHouse, inside]));
assert.equal(selected.label, inside.label, 'the selected footprint wins over a closer neighbouring house');
assert.equal(selected.lat, inside.lat);
assert.equal(selected.matchKind, 'selected-building');
assert.equal(selected.kind, 'housenumber', 'a local house does not inherit the rejected road feature kind');
assert.match(selected.subtitle, /В выбранном здании/);
const selectedPoi = await reverseAddress(
  { ...PIN, building },
  nominatim('улица Абая, Мырзакент', { road: 'улица Абая', village: 'Мырзакент' }),
  gazetteer([SHOP])
);
assert.equal(selectedPoi.label, SHOP.label, 'a real POI inside the explicitly selected footprint names the building');
assert.equal(selectedPoi.kind, 'poi');
assert.equal(selectedPoi.fallback, false);
assert.equal(selectedPoi.matchKind, 'selected-building');
const selectedHouseBeforePoi = await reverseAddress(
  { ...PIN, building },
  unavailable,
  gazetteer([SHOP, inside])
);
assert.equal(selectedHouseBeforePoi.label, inside.label, 'a house number in the selected footprint stays above its POI');
assert.equal(selectedHouseBeforePoi.kind, 'housenumber');
const missingBuildingAddress = await reverseAddress({ ...PIN, building },
  async () => ({ ok:true, async json() { return {lat:neighbouringHouse.lat,lon:neighbouringHouse.lng,address:{road:'улица Абая',house_number:'22'}}; } }),
  gazetteer([neighbouringHouse]));
assert.equal(missingBuildingAddress.fallback, true, 'a neighbour from both local and remote sources cannot name this building');
const edgeAddress = { ...HOUSE, label: 'улица Абая, 24', lat: PIN.lat, lng: 68.51996 };
const simplifiedEdge = await reverseAddress(
  { ...PIN, building },
  unavailable,
  gazetteer([edgeAddress])
);
assert.equal(simplifiedEdge.label, edgeAddress.label, 'an address node a few metres outside a simplified tile footprint still names that building');
assert.equal(simplifiedEdge.matchKind, 'selected-building');
const remoteSimplifiedEdge = await reverseAddress(
  { ...PIN, building },
  async () => ({ ok: true, async json() { return {
    lat: edgeAddress.lat,
    lon: edgeAddress.lng,
    address: { road: 'улица Абая', house_number: '24', village: 'Мырзакент' }
  }; } }),
  gazetteer([])
);
assert.match(remoteSimplifiedEdge.label, /^улица Абая, 24(?:,|$)/, 'a provider-confirmed address gets the same small edge tolerance');
assert.equal(remoteSimplifiedEdge.fallback, false);
await assert.rejects(() => reverseAddress({ ...PIN, building: '{bad JSON' }, unavailable, gazetteer([])), {code:'INVALID_SELECTED_BUILDING'});
await assert.rejects(() => reverseAddress({ ...PIN, lat: PIN.lat + 0.001, building }, unavailable, gazetteer([])), {code:'INVALID_SELECTED_BUILDING'});

// Optional MapTiler remains covered without a real key or network request.
const originalKey = env.MAPTILER_API_KEY;
try {
  env.MAPTILER_API_KEY = 'fixture-only-not-a-real-key';
  const remote = { ...HOUSE, lat: PIN.lat + 0.003 };
  const mapTilerFeature = point => ({center:[point.lng,point.lat],place_type:['address'],text:'улица Абая',properties:{street:'улица Абая',housenumber:'14',city:'Мырзакент'}});
  const fallbackAfterDistantMapTiler = await reverseAddress(PIN, async url => ({
    ok: true,
    async json() {
      return String(url).includes('maptiler') ? {features:[mapTilerFeature(remote)]}
        : {lat:HOUSE.lat,lon:HOUSE.lng,address:{road:'улица Абая',house_number:'14',village:'Мырзакент'}};
    }
  }), gazetteer([]));
  assert.equal(fallbackAfterDistantMapTiler.source, 'nominatim', 'an unresolved first provider does not stop the chain');
  const mapTilerHouse = await reverseAddress(PIN, async () => ({ok:true,async json(){return {features:[mapTilerFeature(HOUSE)]};}}), gazetteer([]));
  assert.equal(mapTilerHouse.lat, HOUSE.lat, 'MapTiler feature coordinates are not replaced by the query pin');
  assert.equal(mapTilerHouse.lng, HOUSE.lng);
} finally {
  env.MAPTILER_API_KEY = originalKey;
}

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

// ---------------------------------------------------------------------------
// Search. Same seam as the map pick: searchAddresses() reached straight for
// defaultQuery, so the region scoping and the local/remote merge could only run
// against a live database and were therefore never covered.

const MYRZAKENT = {
  id: "r-myrzakent",
  code: "MYRZAKENT",
  name: "Мырзакент",
  is_active: true,
  center_lat: 40.665495,
  center_lng: 68.549994,
  boundary: [[68.47, 40.6], [68.6, 40.6], [68.6, 40.73], [68.47, 40.73]]
};

/// Routes the two statements searchAddresses issues: the active-region list
/// and the gazetteer SELECT. Rows are returned as written — the ordering the
/// real query does is SQL's job, not this fixture's.
function searchDb(rows) {
  return async (sql) => {
    if (/FROM regions/i.test(sql)) return { rows: [MYRZAKENT] };
    if (/FROM addresses/i.test(sql)) return { rows };
    return { rows: [] };
  };
}

const noRemote = async () => ({ ok: false, async json() { return {}; } });

// 9. A local hit inside the service area is returned and credited - and it
//     survives every external provider being unreachable, which is what
//     `noRemote` simulates here. This used to throw a 503: the remote call sat
//     inside the same try as the gazetteer, so a provider outage escaped past
//     a catch that logged it as a gazetteer failure, into a second remote call
//     that threw again. A rider searching a street the catalogue *had* got an
//     error page. The catalogue is the reason the app works in villages OSM
//     barely covers; losing it to someone else's downtime defeats the point.
const localHit = await searchAddresses(
  { q: "Абая", region: "Мырзакент", limit: 5 },
  noRemote,
  searchDb([
    { label: "улица Абая, 14", lat: 40.7001, lng: 68.5201, kind: "housenumber", region_name: "Мырзакент" }
  ])
);
assert.ok(localHit.length >= 1, "a local match is returned");
assert.equal(localHit[0].label, "улица Абая, 14", "with its real label");
assert.equal(localHit[0].source, "gazetteer", "credited to the local catalogue");
assert.equal(localHit.length, 1, "and nothing is invented to pad the page out");

// 10. A row the SQL box reached but the polygon excludes must not survive, and
//     an out-of-area provider result must not slip in behind it. This is the
//     guard that keeps a neighbouring town's street - and, before the boundary
//     fix, another country's - off a rider's result page.
//
//     Note what happens when the local half comes back empty: search falls
//     through to the remote cascade rather than showing nothing, which is why
//     the provider has to be answered here rather than left dead.
const provider = async (url) => ({
  ok: true,
  async json() {
    if (url.toString().includes("/reverse")) return {};
    return [
      {
        lat: "40.7002",
        lon: "68.5202",
        display_name: "улица Абая, 16, Мырзакент, Казахстан",
        address: { road: "улица Абая", house_number: "16", village: "Мырзакент" }
      },
      {
        lat: "40.8193",
        lon: "68.6073",
        display_name: "Marxamat ko'chasi, Sirdaryo, O'zbekiston",
        address: { road: "Marxamat ko'chasi", village: "Sirdaryo" }
      }
    ];
  }
});
const outside = await searchAddresses(
  { q: "Абая", region: "Мырзакент", limit: 5 },
  provider,
  searchDb([
    { label: "Marxamat ko'chasi", lat: 40.8193, lng: 68.6073, kind: "street", region_name: "Атамекен" }
  ])
);
const labels = outside.map((item) => String(item.label));
assert.ok(
  labels.every((label) => !/ko['`‘’]chasi/i.test(label)),
  `nothing outside the service area survives, from either half — got ${JSON.stringify(labels)}`
);
assert.ok(
  labels.some((label) => label.includes("Абая")),
  "while the in-area provider result comes through"
);

// 11. A query shorter than two characters never reaches the database at all.
const tooShort = await searchAddresses(
  { q: "а", region: "Мырзакент" },
  async () => {
    throw new Error("no provider call for a one-character query");
  },
  async () => {
    throw new Error("no database call for a one-character query");
  }
);
assert.deepEqual(tooShort, [], "a one-character query short-circuits");

// 12. Both loaders must write search_text, and the query must name it plainly.
//
// searchGazetteer matches on search_text, which is covered by
// idx_addresses_search_trgm. Postgres can only use that index for a query that
// says search_text - the predicate used to read COALESCE(search_text, label),
// which no index matches, so every keystroke was a sequential scan of 121 000
// rows with both trigram indexes idle.
//
// The COALESCE was there for a reason: import-addresses.js inserted without
// the column at all, and did not refresh it on conflict either, so a
// re-imported row kept search text describing its previous label. Fixed at the
// source, which is what makes naming the column safe. This asserts the two
// halves stay together - dropping either one silently returns the sequential
// scan or the stale text.
const routingSource = fs.readFileSync(
  new URL("../modules/routing/routing.service.js", import.meta.url),
  "utf8"
);
assert.match(
  routingSource,
  /WHERE a\.search_text ILIKE \$1/,
  "the gazetteer predicate must name search_text so its trigram index applies"
);
assert.doesNotMatch(
  routingSource,
  /COALESCE\(a\.search_text/,
  "wrapping the column defeats idx_addresses_search_trgm"
);
for (const loader of ["load-addresses.js", "import-addresses.js"]) {
  const source = fs.readFileSync(new URL(loader, import.meta.url), "utf8");
  assert.match(source, /INSERT INTO addresses\([^)]*search_text/, `${loader} must write search_text`);
  assert.match(source, /search_text=EXCLUDED\.search_text/, `${loader} must refresh search_text on conflict`);
}

// 13. Both clients must refuse a bare street before it can enter a route.
// The native picker already had this final client-side guard; the web picker
// must apply the identical rule while immediate catalogue matches are visible
// before the debounced API response arrives.
const webClientSource = fs.readFileSync(
  new URL("../../../web/src/features/client/ClientApp.jsx", import.meta.url),
  "utf8"
);
assert.ok(
  webClientSource.includes("const bareStreet =") &&
    webClientSource.includes("көшесі") &&
    webClientSource.includes("даңғылы"),
  "the web address normalizer recognizes every street-only prefix the native picker rejects"
);
assert.match(
  webClientSource,
  /bareStreet && !\/\\d\/.test\(title\)/,
  "the web address normalizer rejects a street title without a house number"
);
assert.match(
  webClientSource,
  /address\.selectionKind === "region-center"/,
  "a settlement centroid cannot be confirmed as a rider address"
);
assert.match(
  webClientSource,
  /item\.region === code && Boolean\(normalizeAddress\(item\)\)/,
  "the web popular-address list excludes non-bookable catalogue points"
);

console.log(`Address selection checks ok: proximity, footprint containment, provider recovery, search, ${REGION_SEED.length} region radii, catalogue invariants`);

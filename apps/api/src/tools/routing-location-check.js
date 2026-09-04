import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ||= "postgresql://smarttaxi:smarttaxi@localhost:5434/smarttaxi";
process.env.JWT_SECRET ||= "dev_test_secret_for_routing_location_checks_123456";
process.env.ROUTING_BASE_URL ||= "http://routing.local";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const server = readFileSync(join(root, "server.js"), "utf8");
const driversRoutes = readFileSync(join(root, "modules", "drivers", "drivers.routes.js"), "utf8");
const routingRoutes = readFileSync(join(root, "modules", "routing", "routing.routes.js"), "utf8");
const routingServiceText = readFileSync(join(root, "modules", "routing", "routing.service.js"), "utf8");
const { serviceRegionCode } = await import("../modules/routing/region-geo.js");

const {
  buildActiveLegRoute,
  buildDriverToPickupRoute,
  buildRoutePreview,
  filterGazetteerRowsToServiceArea,
  resolveActiveLeg,
  reverseAddress,
  searchAddresses,
  updateDriverLocation
} = await import("../modules/routing/routing.service.js");

assert.match(schema, /CREATE TABLE IF NOT EXISTS driver_locations/i, "schema must add driver_locations table");
assert.match(schema, /idx_driver_locations_driver_id/i, "schema must index driver locations by driver");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS driver_locations/i, "migration must create driver_locations");
assert.match(routingRoutes, /router\.post\("\/preview"/, "route preview endpoint must exist");
assert.match(routingRoutes, /router\.post\("\/driver-to-pickup"/, "driver-to-pickup endpoint must exist");
assert.match(routingRoutes, /router\.get\("\/addresses\/search"/, "address search endpoint must exist");
assert.match(routingRoutes, /router\.get\("\/addresses\/reverse"/, "reverse address endpoint must exist");
assert.match(driversRoutes, /router\.get\("\/nearby"/, "anonymous nearby drivers endpoint must exist");
assert.match(driversRoutes, /anonymous:\s*true/, "nearby drivers must be explicitly anonymous");
assert.doesNotMatch(driversRoutes, /phone:\s*row\.phone|plate:\s*row\.plate|name:\s*row\.name/, "nearby drivers must not expose private driver data");
assert.match(driversRoutes, /router\.patch\("\/me\/location"/, "driver location endpoint must exist");
assert.match(server, /assertCanAccessOrderLocation/, "join_order must validate order room access");
assert.match(server, /updateDriverLocation/, "socket driver location updates must use backend location service");
assert.match(routingServiceText, /ROUTE_UNAVAILABLE/, "routing provider failure must return ROUTE_UNAVAILABLE");
assert.match(routingServiceText, /DRIVER_LOCATION_UNAVAILABLE/, "driver-to-pickup must handle missing driver location");
assert.doesNotMatch(routingServiceText, /Math\.random\(\)/, "routing/location service must not fake routes or locations");
assert.equal(serviceRegionCode(40.755628, 68.470029), "YNTYMAK", "a local Yntymak address must remain in its service region");
assert.equal(serviceRegionCode(40.731408, 68.692265), null, "foreign harvest coordinates must never become rider-visible addresses");

const myrzakentGazetteerRows = filterGazetteerRowsToServiceArea(
  [
    { label: "Школа №1, Мырзакент", lat: 40.657, lng: 68.553 },
    // The circular harvest area reaches this Uzbek result, but the booking
    // area starts north of 40.60 and it must never be offered to a rider.
    { label: "13-maktab, Uzbekistan", lat: 40.542, lng: 68.401 }
  ],
  [{
    id: "myrzakent",
    name: "Мырзакент",
    is_active: true,
    boundary: [[68.45, 40.60], [68.65, 40.60], [68.65, 40.75], [68.45, 40.75], [68.45, 40.60]]
  }],
  "Мырзакент"
);
assert.deepEqual(
  myrzakentGazetteerRows.map((row) => row.label),
  ["Школа №1, Мырзакент"],
  "gazetteer results must stay inside the selected service-area boundary"
);

function mockAddressFetch() {
  return async (url) => ({
    ok: true,
    async json() {
      const value = url.toString();
      if (value.includes("/reverse")) {
        return {
          lat: "42.316",
          lon: "69.596",
          display_name: "улица Абая, Шымкент, Казахстан",
          address: { road: "улица Абая", city: "Шымкент", state: "Туркестанская область" }
        };
      }
      return [{
        lat: "42.316",
        lon: "69.596",
        display_name: "улица Абая, Шымкент, Казахстан",
        address: { road: "улица Абая", city: "Шымкент", state: "Туркестанская область" }
      }];
    }
  });
}

/// The `addresses` table, as a fixture.
///
/// This assertion used to call searchAddresses with no executor, so the
/// gazetteer half needed a live Postgres — and the CI job has no database
/// service, so `npm test` failed here and every check after it never ran,
/// including the ones added since. Nothing else in this suite needs a
/// database; addresses-data-check.js says as much in its own header. Now that
/// searchAddresses takes an executor the case is deterministic instead of
/// environment-dependent, which is what it should have been.
/// Both statements have to be answered: filterGazetteerRowsToServiceArea drops
/// everything when the active-region list is empty, so a fixture that returns
/// addresses but no regions yields nothing at all.
const gazetteerFixture = (rows) => async (sql) => {
  if (/FROM regions/i.test(sql)) {
    return {
      rows: [{
        id: "fixture-atakent",
        code: "ATAKENT",
        name: "Атакент",
        is_active: true,
        center_lat: 40.844435,
        center_lng: 68.509021,
        boundary: [[68.475, 40.82], [68.535, 40.82], [68.535, 40.875], [68.475, 40.875]]
      }]
    };
  }
  if (/FROM addresses/i.test(sql)) return { rows };
  return { rows: [] };
};

const addressResults = await searchAddresses(
  { q: "Абая", limit: 3 },
  mockAddressFetch(),
  gazetteerFixture([
    {
      label: "улица Абая, Атакент",
      lat: 40.8444,
      lng: 68.5090,
      kind: "street",
      region_name: "Атакент"
    }
  ])
);
// A bare query with no region hint must not discard a genuine provider
// match just because it's in a different city than the local launch
// catalog (Atakent) -- doing so was the root cause of a real regression
// where "Magnum Shymkent" silently lost its real Shymkent result (see
// regionAliases/regionCenterRule above). Both the curated local hint and
// the real Nominatim result should come through when no region narrows it.
assert.ok(addressResults.length >= 2, "address search returns both local catalog and real provider results");
assert.ok(
  addressResults.some((item) => item.source === "gazetteer"),
  "a local street-level catalog result is still surfaced"
);
const providerAbai = addressResults.find((item) => item.source === "nominatim");
assert.ok(providerAbai, "genuine out-of-region provider result is not discarded");
assert.equal(providerAbai.label, "улица Абая, Шымкент", "out-of-region provider result keeps its real label");
assert.equal(providerAbai.lat, 42.316, "out-of-region provider result keeps its real latitude");

// Real providers can return the exact same street twice a few hundred
// metres apart (different providers' own coordinate for the same real
// place), and can also surface an unrelated place whose name only
// superficially resembles the query. Both were confirmed live in prod:
// searching "абая" surfaced "улица Абая" twice ~190m apart from two
// different providers, plus an unrelated village "Абай" that doesn't
// actually contain the query text anywhere.
const dedupResults = await searchAddresses({ q: "Абая", region: "Атакент", limit: 8 }, async () => ({
  ok: true,
  async json() {
    return [
      { lat: "40.8472", lon: "68.5038", display_name: "улица Абая, Казахстан", address: { road: "улица Абая" } },
      // ~190m from the entry above -- same real street, a second
      // provider's own slightly different coordinate for it.
      { lat: "40.8455", lon: "68.5040", display_name: "улица Абая, Казахстан", address: { road: "улица Абая" } },
      // An unrelated village -- shares no substring with the query "абая".
      { lat: "40.751", lon: "68.598", display_name: "Абай, Казахстан", address: { village: "Абай" } }
    ];
  }
}));
assert.equal(
  dedupResults.filter(item => item.label === "улица Абая").length,
  1,
  "two near-duplicate 'улица Абая' results ~190m apart from different providers must merge into one, not survive as separate entries"
);
assert.ok(
  !dedupResults.some(item => item.label === "Абай"),
  "an unrelated fuzzy match with no real query-text overlap must be dropped once real matches exist"
);
assert.ok(
  dedupResults.some(item => item.label === "ул. Абая, Атакент"),
  "the curated local hint for the same street is untouched by the near-duplicate merge (different label text, kept separately)"
);
const reversed = await reverseAddress({ lat: 42.316, lng: 69.596 }, mockAddressFetch());
assert.equal(reversed.city, "Шымкент", "reverse address returns city");
const roadCodeReverse = await reverseAddress(
  { lat: 40.7001, lng: 68.5201 },
  async () => ({
    ok: true,
    async json() {
      return {
        lat: "40.7001",
        lon: "68.5201",
        display_name: "KZ-12, Мырзакент, Казахстан",
        address: { road: "KZ-12", village: "Мырзакент" }
      };
    }
  })
);
assert.equal(roadCodeReverse.title, "Адрес не определён", "road codes must never be presented as passenger addresses");
assert.doesNotMatch(roadCodeReverse.label, /KZ[- ]?12/i, "technical road code is removed from reverse response");
// The label was asserted here from the start; the flag beside it was not, and
// it disagreed. reverseAddress stamped `fallback: false` onto the very object
// that says the address could not be determined, on both the MapTiler and the
// Nominatim path — so the response told a client to block confirmation and to
// allow it at the same time. See address-selection-check.js for the full path.
assert.equal(roadCodeReverse.fallback, true, "an undetermined address is flagged as a fallback");
assert.equal(roadCodeReverse.confidence, 0, "and carries no confidence");
await assert.rejects(
  () => reverseAddress({ lat: 400, lng: 69.596 }, mockAddressFetch()),
  { code: "INVALID_COORDINATES" },
  "reverse address rejects invalid coordinates"
);
const weakReverse = await reverseAddress({ lat: 40.7001, lng: 68.5201 }, async () => ({ ok: false, async json() { return {}; } }));
assert.equal(weakReverse.title, "Адрес не определён", "reverse address never turns a failed lookup into a fake address");
assert.equal(weakReverse.source, "fallback", "reverse fallback is explicitly marked");
assert.equal(weakReverse.lat, 40.7001, "reverse fallback keeps exact selected latitude");

const regionA = {
  id: "region-a",
  code: "A",
  name: "Region A",
  is_active: true,
  center_lat: 42.2,
  center_lng: 69.2,
  currency: "KZT",
  boundary: [[69, 42], [70, 42], [70, 43], [69, 43], [69, 42]]
};
const regionB = {
  id: "region-b",
  code: "B",
  name: "Region B",
  is_active: true,
  center_lat: 45.2,
  center_lng: 75.2,
  currency: "KZT",
  boundary: [[75, 45], [76, 45], [76, 46], [75, 46], [75, 45]]
};
const tariff = {
  id: "tariff-a",
  region_id: "region-a",
  name: "Economy",
  base_price: 400,
  price_per_km: 100,
  price_per_minute: 20,
  min_price: 700,
  service_commission_percent: 15,
  cashback_percent: 2,
  surge_multiplier: 1,
  is_active: true
};

function mockFetch({ ok = true, route = {} } = {}) {
  return async () => ({
    ok,
    async json() {
      return {
        code: "Ok",
        routes: [{
          distance: 4200,
          duration: 720,
          geometry: { type: "LineString", coordinates: [[69.1, 42.1], [69.2, 42.2]] },
          ...route
        }]
      };
    }
  });
}

function createExecutor(overrides = {}) {
  const state = {
    regions: overrides.regions || [regionA, regionB],
    drivers: overrides.drivers || [
      { id: "driver-a", user_id: "driver-user", current_region_id: "region-a", is_blocked: false, status: "FREE" },
      { id: "driver-offline", user_id: "offline-user", current_region_id: "region-a", is_blocked: false, status: "OFFLINE" },
      { id: "driver-unapproved", user_id: "unapproved-user", current_region_id: "region-a", is_blocked: false, status: "FREE" }
    ],
    approvals: overrides.approvals || [{ driver_id: "driver-a", region_id: "region-a", status: "APPROVED" }],
    intercityRoutes: overrides.intercityRoutes || [],
    locations: overrides.locations || [],
    orders: overrides.orders || [
      { id: "order-new", client_id: "client-a", driver_id: null, pickup_lat: 42.12, pickup_lng: 69.12, status: "NEW" },
      { id: "order-accepted", client_id: "client-a", driver_id: "driver-a", pickup_lat: 42.12, pickup_lng: 69.12, status: "DRIVER_ASSIGNED" },
      { id: "order-in-trip", client_id: "client-a", driver_id: "driver-a", pickup_lat: 42.12, pickup_lng: 69.12, dropoff_lat: 42.3, dropoff_lng: 69.3, status: "TRIP_STARTED" }
    ],
    clients: overrides.clients || [{ id: "client-a", user_id: "client-user" }]
  };

  return {
    state,
    async query(sql, params = []) {
      if (/FROM regions\s+WHERE is_active=true/i.test(sql)) return { rows: state.regions.filter(region => region.is_active) };
      if (/FROM intercity_routes ir/i.test(sql)) {
        return {
          rows: state.intercityRoutes.filter(route =>
            route.origin_region_id === params[0] &&
            route.destination_region_id === params[1] &&
            route.is_active
          )
        };
      }
      if (/SELECT \* FROM regions WHERE id=\$1/i.test(sql)) return { rows: state.regions.filter(region => region.id === params[0]) };
      if (/SELECT \* FROM tariffs WHERE id=\$1/i.test(sql)) return { rows: params[0] === tariff.id ? [tariff] : [] };
      if (/SELECT \* FROM drivers WHERE user_id=\$1/i.test(sql)) return { rows: state.drivers.filter(driver => driver.user_id === params[0]) };
      if (/FROM driver_region_approvals\s+WHERE driver_id=\$1 AND region_id=\$2/i.test(sql)) {
        return { rows: state.approvals.filter(approval => approval.driver_id === params[0] && approval.region_id === params[1]) };
      }
      if (/INSERT INTO driver_locations/i.test(sql)) {
        const row = {
          driver_id: params[0],
          region_id: params[1],
          lat: params[2],
          lng: params[3],
          heading: params[4],
          speed: params[5],
          accuracy: params[6],
          source: params[7],
          updated_at: "2026-05-21T00:00:00.000Z"
        };
        state.locations = state.locations.filter(location => location.driver_id !== row.driver_id).concat(row);
        return { rows: [row] };
      }
      if (/UPDATE drivers SET lat=\$1, lng=\$2/i.test(sql)) return { rows: [] };
      if (/SELECT id, status, distance_traveled_m(?:, is_intercity)?\s+FROM orders\s+WHERE driver_id=\$1 AND status = ANY/i.test(sql)) {
        return {
          rows: state.orders
            .filter(order => order.driver_id === params[0] && params[1].includes(order.status))
            .map(order => ({ id: order.id, status: order.status, distance_traveled_m: order.distance_traveled_m || 0 }))
            .slice(0, 1)
        };
      }
      if (/UPDATE orders SET distance_traveled_m=\$1 WHERE id=\$2/i.test(sql)) {
        const order = state.orders.find(candidate => candidate.id === params[1]);
        if (order) order.distance_traveled_m = params[0];
        return { rows: [] };
      }
      if (/SELECT \* FROM orders WHERE id=\$1/i.test(sql)) return { rows: state.orders.filter(order => order.id === params[0]) };
      if (/SELECT id FROM clients WHERE user_id=\$1/i.test(sql)) return { rows: state.clients.filter(client => client.user_id === params[0]).map(client => ({ id: client.id })) };
      if (/SELECT id FROM drivers WHERE user_id=\$1/i.test(sql)) return { rows: state.drivers.filter(driver => driver.user_id === params[0]).map(driver => ({ id: driver.id })) };
      if (/SELECT \* FROM driver_locations WHERE driver_id=\$1/i.test(sql)) return { rows: state.locations.filter(location => location.driver_id === params[0]).slice(0, 1) };
      if (/SELECT DISTINCT ON \(type\) type, status\s+FROM driver_documents/i.test(sql)) {
        // This file's fixtures aren't about document review — every driver
        // here is treated as fully document-approved (see
        // driver-approval-check.js for the dedicated document-gate tests).
        return { rows: ["DRIVER_LICENSE_FRONT", "DRIVER_LICENSE_BACK", "ID_CARD_FRONT", "ID_CARD_BACK", "VEHICLE_REGISTRATION"].map(type => ({ type, status: "APPROVED" })) };
      }
      throw new Error(`Unexpected SQL in routing location check: ${sql}`);
    }
  };
}

const preview = await buildRoutePreview({
  pickupLat: 42.1,
  pickupLng: 69.1,
  dropoffLat: 42.2,
  dropoffLng: 69.2,
  tariffId: tariff.id
}, createExecutor(), mockFetch());
assert.equal(preview.regionId, "region-a", "route preview inside active region succeeds");
assert.equal(preview.distanceMeters, 4200, "route preview returns provider distance");
assert.equal(preview.durationSeconds, 720, "route preview returns provider duration");
assert.equal(preview.geometry.type, "LineString", "route preview returns provider geometry");
assert.equal(preview.estimate.pricing.distanceKm, 4.2, "tariff estimate uses provider distance");

await assert.rejects(
  () => buildRoutePreview({ pickupLat: 44, pickupLng: 69.1, dropoffLat: 42.2, dropoffLng: 69.2 }, createExecutor(), mockFetch()),
  { code: "PICKUP_REGION_INACTIVE" },
  "pickup outside active region fails"
);
await assert.rejects(
  () => buildRoutePreview({ pickupLat: 42.1, pickupLng: 69.1, dropoffLat: 44, dropoffLng: 69.2 }, createExecutor(), mockFetch()),
  { code: "DROPOFF_REGION_INACTIVE" },
  "dropoff outside active region fails"
);
await assert.rejects(
  () => buildRoutePreview({ pickupLat: 42.1, pickupLng: 69.1, dropoffLat: 45.2, dropoffLng: 75.2 }, createExecutor(), mockFetch()),
  { code: "INTERCITY_ROUTE_UNAVAILABLE" },
  "intercity route preview rejects only when its direction is not enabled"
);
await assert.rejects(
  () => buildRoutePreview({ pickupLat: 42.1, pickupLng: 69.1, dropoffLat: 42.2, dropoffLng: 69.2 }, createExecutor(), mockFetch({ ok: false })),
  { code: "ROUTE_UNAVAILABLE" },
  "routing provider failure returns ROUTE_UNAVAILABLE"
);
await assert.rejects(
  () => buildRoutePreview(
    { pickupLat: 42.1, pickupLng: 69.1, dropoffLat: 42.2, dropoffLng: 69.2 },
    createExecutor(),
    mockFetch({ route: { geometry: { type: "Point", coordinates: [69.1, 42.1] } } })
  ),
  { code: "ROUTE_UNAVAILABLE" },
  "malformed routing geometry cannot be priced or shown as a route"
);

await assert.rejects(
  () => updateDriverLocation({ userId: "offline-user", location: { lat: 42.1, lng: 69.1 }, executor: createExecutor() }),
  { code: "DRIVER_OFFLINE" },
  "driver location cannot update when driver is not online"
);
await assert.rejects(
  () => updateDriverLocation({ userId: "unapproved-user", location: { lat: 42.1, lng: 69.1 }, executor: createExecutor() }),
  { code: "DRIVER_REGION_NOT_APPROVED" },
  "driver location cannot update without region approval"
);
await assert.rejects(
  () => updateDriverLocation({ userId: "driver-user", location: { lat: 44, lng: 69.1 }, executor: createExecutor() }),
  { code: "DRIVER_LOCATION_OUTSIDE_REGION" },
  "driver location updates only inside active selected region"
);

const locationExecutor = createExecutor();
const updatedLocation = await updateDriverLocation({ userId: "driver-user", location: { lat: 42.1, lng: 69.1, heading: 90, accuracy: 8 }, executor: locationExecutor });
assert.equal(updatedLocation.location.regionId, "region-a", "approved online driver can update location inside region");

await assert.rejects(
  () => buildDriverToPickupRoute({ orderId: "order-new", user: { id: "client-user", role: "CLIENT" }, executor: locationExecutor, fetchImpl: mockFetch() }),
  { code: "DRIVER_NOT_ASSIGNED" },
  "passenger cannot see driver route before order accepted"
);
await assert.rejects(
  () => buildDriverToPickupRoute({ orderId: "order-accepted", user: { id: "client-user", role: "CLIENT" }, executor: createExecutor({ locations: [] }), fetchImpl: mockFetch() }),
  { code: "DRIVER_LOCATION_UNAVAILABLE" },
  "driver-to-pickup route requires real driver location"
);

const driverRoute = await buildDriverToPickupRoute({
  orderId: "order-accepted",
  user: { id: "client-user", role: "CLIENT" },
  executor: locationExecutor,
  fetchImpl: mockFetch()
});
assert.equal(driverRoute.distanceMeters, 4200, "driver-to-pickup route returns provider distance");
assert.equal(driverRoute.driverLat, 42.1, "driver-to-pickup route returns latest real driver latitude");
assert.equal(driverRoute.phase, "to_pickup", "route before trip start targets the pickup leg");
assert.equal(driverRoute.targetLat, 42.12, "to_pickup phase targets pickup coordinates");

const tripRoute = await buildDriverToPickupRoute({
  orderId: "order-in-trip",
  user: { id: "client-user", role: "CLIENT" },
  executor: locationExecutor,
  fetchImpl: mockFetch()
});
assert.equal(tripRoute.phase, "to_dropoff", "route after trip start targets the dropoff leg, not pickup");
assert.equal(tripRoute.targetLat, 42.3, "to_dropoff phase targets dropoff coordinates");
assert.equal(tripRoute.targetLng, 69.3, "to_dropoff phase targets dropoff coordinates");

await assert.rejects(
  () => buildDriverToPickupRoute({
    orderId: "order-new",
    user: { id: "driver-user", role: "DRIVER" },
    executor: createExecutor({
      orders: [{ id: "order-new", client_id: "client-a", driver_id: "driver-a", pickup_lat: 42.12, pickup_lng: 69.12, status: "RATED" }]
    }),
    fetchImpl: mockFetch()
  }),
  { code: "ORDER_NOT_ACTIVE" },
  "a finished order has no active driving leg to route"
);

// Live map/ETA routes (driver-to-pickup, and the public trip-tracking route
// built the same way) must keep working — degraded but live — when the
// routing provider is unreachable, unlike buildRoutePreview/pricing above
// which must keep failing hard.
const unreachableFetch = () => { throw new Error("OSRM unreachable"); };
const fallbackRoute = await buildDriverToPickupRoute({
  orderId: "order-accepted",
  user: { id: "client-user", role: "CLIENT" },
  executor: locationExecutor,
  fetchImpl: unreachableFetch
});
assert.equal(fallbackRoute.phase, "to_pickup", "fallback route still resolves the correct leg");
assert.equal(fallbackRoute.fallback, true, "fallback route is explicitly marked when the provider is unreachable");
assert.equal(fallbackRoute.providerStatus, "Fallback", "fallback route reports a distinct provider status");
assert.ok(fallbackRoute.distanceMeters > 0, "fallback route still estimates a positive distance");
assert.ok(fallbackRoute.durationSeconds > 0, "fallback route still estimates a positive duration");

const directLeg = await buildActiveLegRoute({
  order: { status: "TRIP_STARTED", dropoff_lat: 42.3, dropoff_lng: 69.3 },
  driverLat: 42.1,
  driverLng: 69.1,
  fetchImpl: mockFetch()
});
assert.equal(directLeg.phase, "to_dropoff", "buildActiveLegRoute (shared with the public tracking route) resolves the dropoff leg directly");
assert.equal(directLeg.distanceMeters, 4200, "buildActiveLegRoute uses the provider route when available");
assert.equal(directLeg.fallback, false, "buildActiveLegRoute only marks fallback when the provider actually failed");

assert.throws(
  () => resolveActiveLeg({ status: "RATED" }),
  { code: "ORDER_NOT_ACTIVE" },
  "resolveActiveLeg rejects orders with no active driving leg"
);

console.log("Routing and driver location checks ok");

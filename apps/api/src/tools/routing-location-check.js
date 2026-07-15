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

const {
  buildActiveLegRoute,
  buildDriverToPickupRoute,
  buildRoutePreview,
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

const addressResults = await searchAddresses({ q: "Абая", limit: 3 }, mockAddressFetch());
assert.equal(addressResults.length, 1, "address search returns real provider results");
assert.equal(addressResults[0].label, "ул. Абая, Атакент", "address search prioritizes local launch catalog");
assert.equal(addressResults[0].lat, 40.84803, "address search returns local launch latitude before provider fallback");
const reversed = await reverseAddress({ lat: 42.316, lng: 69.596 }, mockAddressFetch());
assert.equal(reversed.city, "Шымкент", "reverse address returns city");
await assert.rejects(
  () => reverseAddress({ lat: 400, lng: 69.596 }, mockAddressFetch()),
  { code: "INVALID_COORDINATES" },
  "reverse address rejects invalid coordinates"
);
const weakReverse = await reverseAddress({ lat: 40.7001, lng: 68.5201 }, async () => ({ ok: false, async json() { return {}; } }));
assert.equal(weakReverse.title, "Точка на карте", "reverse address falls back to map point when provider fails");
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

function mockFetch({ ok = true } = {}) {
  return async () => ({
    ok,
    async json() {
      return {
        code: "Ok",
        routes: [{
          distance: 4200,
          duration: 720,
          geometry: { type: "LineString", coordinates: [[69.1, 42.1], [69.2, 42.2]] }
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
      if (/SELECT id\s+FROM orders\s+WHERE driver_id=\$1 AND status = ANY/i.test(sql)) {
        return { rows: state.orders.filter(order => order.driver_id === params[0] && params[1].includes(order.status)).map(order => ({ id: order.id })).slice(0, 1) };
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
  { code: "INTERCITY_NOT_SUPPORTED" },
  "intercity route preview fails"
);
await assert.rejects(
  () => buildRoutePreview({ pickupLat: 42.1, pickupLng: 69.1, dropoffLat: 42.2, dropoffLng: 69.2 }, createExecutor(), mockFetch({ ok: false })),
  { code: "ROUTE_UNAVAILABLE" },
  "routing provider failure returns ROUTE_UNAVAILABLE"
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculatePricingComponents,
  calculateOrderPrice,
  prepareOrderPricing
} from "../modules/orders/order-pricing.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const ordersRoutes = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const tariffsRoutes = readFileSync(join(root, "modules", "tariffs", "tariffs.routes.js"), "utf8");

assert.match(schema, /region_id UUID REFERENCES regions\(id\) ON DELETE CASCADE/i, "tariffs must belong to regions");
assert.match(schema, /is_active BOOLEAN NOT NULL DEFAULT true/i, "tariffs must keep active state");
assert.match(schema, /surge_multiplier NUMERIC\(6,2\) NOT NULL DEFAULT 1/i, "tariffs must store surge multiplier");
assert.match(schema, /included_km NUMERIC\(8,2\) NOT NULL DEFAULT 0/i, "tariffs must store included km");
assert.match(schema, /included_minutes INTEGER NOT NULL DEFAULT 0/i, "tariffs must store included minutes");
assert.match(schema, /display_name TEXT/i, "tariffs must store display name");
assert.match(schema, /description TEXT/i, "tariffs must store description");
assert.match(schema, /free_waiting_minutes INTEGER NOT NULL DEFAULT 0/i, "tariffs must store free waiting minutes");
assert.match(schema, /waiting_price_per_minute INTEGER NOT NULL DEFAULT 0/i, "tariffs must store waiting price");
assert.match(schema, /cancellation_fee INTEGER NOT NULL DEFAULT 0/i, "tariffs may store cancellation fee");
assert.match(schema, /no_show_fee INTEGER NOT NULL DEFAULT 0/i, "tariffs must store no-show fee");
assert.match(schema, /zone_surcharge INTEGER NOT NULL DEFAULT 0/i, "tariffs must store zone surcharge");
assert.match(schema, /night_coefficient NUMERIC\(6,2\) NOT NULL DEFAULT 1/i, "tariffs must store night coefficient");
assert.match(schema, /demand_coefficient NUMERIC\(6,2\) NOT NULL DEFAULT 1/i, "tariffs must store demand coefficient");
assert.match(schema, /sort_order INTEGER NOT NULL DEFAULT 0/i, "tariffs must support admin ordering");
assert.doesNotMatch(schema, /name TEXT UNIQUE NOT NULL/i, "tariff names must not be globally unique");
assert.match(schema, /UNIQUE\(region_id, name\)/i, "tariffs must be unique per region and name");
assert.match(schema, /region_id UUID REFERENCES regions\(id\) ON DELETE RESTRICT/i, "orders must store immutable region id");
assert.match(schema, /pricing_snapshot JSONB NOT NULL DEFAULT '\{\}'::jsonb/i, "orders must store pricing snapshot");
assert.match(schema, /status TEXT NOT NULL DEFAULT 'SEARCHING_DRIVER'/i, "new orders must default to canonical SEARCHING_DRIVER status");
assert.match(schema, /waiting_started_at TIMESTAMPTZ/i, "orders must store waiting start timestamp");
assert.match(schema, /free_waiting_until TIMESTAMPTZ/i, "orders must store free waiting deadline");
assert.match(schema, /CREATE TABLE IF NOT EXISTS payments/i, "schema must include payments foundation");
assert.match(schema, /method TEXT NOT NULL CHECK \(method IN \('CASH','KASPI','CARD','CASHBACK'\)\)/i, "payments must support cash, Kaspi, card, and cashback");
assert.doesNotMatch(schema, /reject_reason/i, "Milestone 3 must not persist rejected order attempts");
assert.match(schema, /idx_tariffs_region_id/i, "tariff region index must exist");
assert.match(schema, /idx_tariffs_region_active/i, "tariff region active index must exist");
assert.match(schema, /idx_orders_region_id/i, "order region index must exist");
assert.match(schema, /CREATE TABLE IF NOT EXISTS intercity_routes/i, "schema must define explicit intercity routes");
assert.match(schema, /dropoff_region_id UUID REFERENCES regions\(id\) ON DELETE RESTRICT/i, "orders must retain destination region");
assert.match(schema, /is_intercity BOOLEAN NOT NULL DEFAULT false/i, "orders must retain intercity flag");

assert.match(migrations, /ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions\(id\) ON DELETE CASCADE/i, "migration must add tariff region id");
assert.match(migrations, /DROP CONSTRAINT IF EXISTS tariffs_name_key/i, "migration must remove global tariff name uniqueness");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS surge_multiplier/i, "migration must add tariff surge multiplier");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS included_km/i, "migration must add included km");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS included_minutes/i, "migration must add included minutes");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS free_waiting_minutes/i, "migration must add free waiting minutes");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS waiting_price_per_minute/i, "migration must add waiting price");
assert.match(migrations, /DROP CONSTRAINT IF EXISTS orders_status_check/i, "migration must replace legacy order status check");
assert.match(migrations, /TRIP_STARTED/i, "migration must allow canonical order lifecycle statuses");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions\(id\) ON DELETE RESTRICT/i, "migration must add order region id");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB/i, "migration must add order pricing snapshot");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS payments/i, "migration must include payments foundation");
assert.match(migrations, /UPDATE tariffs SET region_id=\(SELECT id FROM regions WHERE code='ATAKENT'\) WHERE region_id IS NULL/i, "migration must attach existing dev tariffs to Atakent");
assert.match(migrations, /ON CONFLICT \(region_id, name\)/i, "seed tariffs must upsert by region and name");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS intercity_routes/i, "migration must add intercity routes");
assert.match(migrations, /idx_intercity_routes_origin_active/i, "migration must index active intercity routes");

assert.match(ordersRoutes, /router\.post\("\/estimate"/, "estimate endpoint must exist");
assert.match(tariffsRoutes, /router\.post\("\/estimate"/, "tariff estimate endpoint must exist");
assert.match(ordersRoutes, /router\.post\("\/", requireAuth, requireRole\("CLIENT"\)/, "order creation endpoint must require client auth");
// Pricing must be computed from a server-verified route, never trust the
// client-submitted distanceKm/durationMin directly -- a modified client
// could submit the real pickup/dropoff pair with a tiny fake distance to
// get billed near the tariff minimum for a real, long trip. Both the
// public /estimate endpoint and order creation must call requestRoute
// (via the shared verifiedRouteForPricing helper) before pricing.
assert.match(ordersRoutes, /async function verifiedRouteForPricing\(body\)/, "orders.routes.js must recompute the route server-side before pricing, not trust client-submitted distance/duration");
assert.match(ordersRoutes, /requestRoute\(\{\s*from: \{ lat: body\.pickupLat, lng: body\.pickupLng \},\s*to: \{ lat: body\.dropoffLat, lng: body\.dropoffLng \}\s*\}\)/, "verifiedRouteForPricing must call the real routing engine with the submitted pickup/dropoff coordinates");
assert.match(ordersRoutes, /prepareOrderPricing\(\{ \.\.\.body, \.\.\.verifiedRoute \}, client\)/, "order creation must price off the server-verified route, not the raw client body");
assert.match(ordersRoutes, /prepareOrderPricing\(\{ \.\.\.body, \.\.\.verifiedRoute \}, query\)/, "the public /estimate endpoint must also price off the server-verified route, not the raw client body");
assert.match(ordersRoutes, /INSERT INTO orders\(short_id, status, region_id,[\s\S]*pricing_snapshot/i, "order insert must store canonical status, region id and pricing snapshot");
assert.match(ordersRoutes, /INSERT INTO payments\(order_id, method, status, amount, currency\)/i, "order creation must create payment row");
assert.match(ordersRoutes, /CLIENT_ACTIVE_ORDER_STATUSES/, "order creation must define client active order states");
assert.match(ordersRoutes, /CLIENT_HAS_ACTIVE_ORDER/, "order creation must prevent duplicate active client orders");
const createRouteSource = ordersRoutes.slice(
  ordersRoutes.indexOf('router.post("/",'),
  ordersRoutes.indexOf('router.post("/:id/cancel-public"')
);
assert.doesNotMatch(createRouteSource, /\.emit\(/, "Milestone 3 order creation must not emit realtime matching events");
assert.match(createRouteSource, /SELECT id, short_id, status[\s\S]*FROM orders[\s\S]*client_id=\$1[\s\S]*CLIENT_ACTIVE_ORDER_STATUSES/i, "duplicate client order check must happen inside create transaction");
assert.match(tariffsRoutes, /regionId/, "tariff listing must support region scoping");

const formulaTariff = {
  id: "tariff-formula",
  region_id: "region-a",
  name: "Formula",
  base_price: 400,
  price_per_km: 100,
  price_per_minute: 20,
  min_price: 700,
  service_commission_percent: 15,
  surge_multiplier: 1,
  is_active: true
};
assert.equal(calculateOrderPrice(formulaTariff, 3, 10), 900, "price formula must apply distance and duration");
assert.equal(calculateOrderPrice({ ...formulaTariff, min_price: 1000 }, 1, 1), 1000, "minimum price must apply");
assert.equal(calculateOrderPrice({ ...formulaTariff, surge_multiplier: 1.5 }, 3, 10), 1350, "surge multiplier must apply");
assert.equal(calculateOrderPrice({ ...formulaTariff, included_km: 1, included_minutes: 5 }, 3, 10), 700, "included distance/minutes must reduce billable metrics");
assert.equal(calculateOrderPrice({ ...formulaTariff, zone_surcharge: 100, night_coefficient: 1.2, demand_coefficient: 1.1 }, 3, 10), 1320, "zone/night/demand coefficients must apply");
const fixedLaunchTariff = {
  ...formulaTariff,
  id: "tariff-fixed",
  name: "Economy",
  base_price: 700,
  price_per_km: 0,
  price_per_minute: 0,
  min_price: 700
};
assert.equal(calculateOrderPrice(fixedLaunchTariff, 1, 3), 700, "fixed launch tariff must return its configured price for a short route");
assert.equal(calculateOrderPrice(fixedLaunchTariff, 20, 45), 700, "fixed launch tariff must not change with distance or duration");
const previewComponents = calculatePricingComponents({
  ...formulaTariff,
  free_waiting_minutes: 2,
  waiting_price_per_minute: 50
}, { distanceKm: 3, durationMin: 10, waitingMinutes: 5 });
assert.equal(previewComponents.waitingPrice, 150, "waiting price must apply after free minutes");
assert.equal(previewComponents.finalPrice, 1050, "final price must include waiting");
assert.equal(previewComponents.serviceCommission, 158, "service commission must be calculated from final price");
assert.equal(previewComponents.driverEarning, 892, "driver earning must subtract service commission");

function createExecutor() {
  const state = {
    regions: [
      {
        id: "region-a",
        code: "A",
        name: "Region A",
        is_active: true,
        center_lat: 0.5,
        center_lng: 0.5,
        currency: "KZT",
        boundary: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
      },
      {
        id: "region-b",
        code: "B",
        name: "Region B",
        is_active: true,
        center_lat: 2.5,
        center_lng: 2.5,
        currency: "KZT",
        boundary: [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]
      },
      {
        id: "region-inactive",
        code: "OLD",
        name: "Inactive Region",
        is_active: false,
        center_lat: 4.5,
        center_lng: 4.5,
        currency: "KZT",
        boundary: [[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]]
      }
    ],
    tariffs: [
      { ...formulaTariff, id: "tariff-a", name: "Economy" },
      { ...formulaTariff, id: "tariff-a-inactive", name: "Inactive", is_active: false },
      { ...formulaTariff, id: "tariff-b", region_id: "region-b", name: "Economy" }
    ],
    orders: [],
    intercityRoutes: []
  };

  return {
    state,
    async query(sql, params = []) {
      if (/FROM regions\s+WHERE is_active=true/i.test(sql)) {
        return { rows: state.regions.filter(region => region.is_active).sort((a, b) => a.name.localeCompare(b.name)) };
      }
      if (/FROM intercity_routes ir/i.test(sql)) {
        return {
          rows: state.intercityRoutes.filter(route =>
            route.origin_region_id === params[0] &&
            route.destination_region_id === params[1] &&
            route.is_active
          )
        };
      }
      if (/SELECT \* FROM tariffs WHERE id=\$1/i.test(sql)) {
        return { rows: state.tariffs.filter(tariff => tariff.id === params[0]) };
      }
      if (/FROM tariffs WHERE region_id=\$1 AND lower\(name\)=lower\(\$2\)/i.test(sql)) {
        return { rows: state.tariffs.filter(tariff => tariff.region_id === params[0] && tariff.name.toLowerCase() === String(params[1]).toLowerCase()) };
      }
      if (/FROM tariffs WHERE lower\(name\)=lower\(\$1\) LIMIT 1/i.test(sql)) {
        return { rows: state.tariffs.filter(tariff => tariff.name.toLowerCase() === String(params[0]).toLowerCase()).slice(0, 1) };
      }
      throw new Error(`Unexpected SQL in tariff/order check: ${sql}`);
    }
  };
}

const baseInput = {
  pickupLat: 0.5,
  pickupLng: 0.5,
  dropoffLat: 0.8,
  dropoffLng: 0.8,
  tariffId: "tariff-a",
  tariff: "Economy",
  distanceKm: 3,
  durationMin: 10,
  price: 1,
  serviceCommission: 1,
  pricingSnapshot: { estimatedPrice: 1 }
};

const executor = createExecutor();
const pricing = await prepareOrderPricing(baseInput, executor);
assert.equal(pricing.regionId, "region-a", "order inside one active region succeeds");
assert.equal(pricing.estimatedPrice, 900, "frontend-supplied price must be ignored");
assert.equal(pricing.pricingSnapshot.serviceCommissionPercent, 15, "service commission percent must be included in pricing snapshot");
assert.equal(pricing.pricingSnapshot.serviceCommission, 135, "pricing snapshot must include service commission");
assert.equal(pricing.pricingSnapshot.driverEarning, 765, "pricing snapshot must include driver earning");
assert.equal(pricing.pricingSnapshot.freeWaitingMinutes, 0, "pricing snapshot must include free waiting minutes");
assert.equal(pricing.pricingSnapshot.waitingPricePerMinute, 0, "pricing snapshot must include waiting price");
assert.equal(pricing.pricingSnapshot.regionId, "region-a", "pricing snapshot must include region id");
assert.equal(pricing.pricingSnapshot.tariffId, "tariff-a", "pricing snapshot must include tariff id");

async function simulateOrderCreate(input, stateExecutor) {
  const nextPricing = await prepareOrderPricing(input, stateExecutor);
  const order = {
    region_id: nextPricing.regionId,
    price: nextPricing.estimatedPrice,
    pricing_snapshot: nextPricing.pricingSnapshot
  };
  stateExecutor.state.orders.push(order);
  return order;
}

const created = await simulateOrderCreate(baseInput, executor);
assert.equal(created.region_id, "region-a", "created order stores region_id");
assert.equal(created.pricing_snapshot.estimatedPrice, 900, "created order stores pricing_snapshot");

await assert.rejects(
  () => simulateOrderCreate({ ...baseInput, pickupLat: 9, pickupLng: 9 }, executor),
  { code: "PICKUP_REGION_INACTIVE" },
  "pickup outside active region rejects PICKUP_REGION_INACTIVE"
);
assert.equal(executor.state.orders.length, 1, "rejected pickup attempt must not insert order row");

await assert.rejects(
  () => prepareOrderPricing({ ...baseInput, dropoffLat: 9, dropoffLng: 9 }, executor),
  { code: "DROPOFF_REGION_INACTIVE" },
  "dropoff outside active region rejects DROPOFF_REGION_INACTIVE"
);

await assert.rejects(
  () => prepareOrderPricing({ ...baseInput, dropoffLat: 2.5, dropoffLng: 2.5 }, executor),
  { code: "INTERCITY_ROUTE_UNAVAILABLE" },
  "pickup/dropoff in different active regions rejects unless that direction is explicitly enabled"
);

executor.state.intercityRoutes.push({
  id: "route-a-to-b",
  origin_region_id: "region-a",
  destination_region_id: "region-b",
  is_active: true,
  max_distance_km: 350,
  max_duration_min: 720,
  base_surcharge_kzt: 0,
  price_per_km_override: 140,
  min_price_override: 1800,
  requires_destination_approval: true
});
const intercityPricing = await prepareOrderPricing({
  ...baseInput,
  dropoffLat: 2.5,
  dropoffLng: 2.5,
  distanceKm: 20,
  durationMin: 30
}, executor);
assert.equal(intercityPricing.isIntercity, true, "enabled directional route creates an intercity estimate");
assert.equal(intercityPricing.destinationRegionId, "region-b", "intercity estimate retains destination region");
assert.equal(intercityPricing.estimatedPrice, 3800, "intercity estimate uses route kilometre pricing, not flat city fare");
assert.equal(intercityPricing.pricingSnapshot.isIntercity, true, "order snapshot retains intercity state");

executor.state.intercityRoutes[0].price_per_km_override = null;
const withoutDistanceOverride = await prepareOrderPricing({
  ...baseInput, dropoffLat: 2.5, dropoffLng: 2.5,
  distanceKm: 20, durationMin: 30
}, executor);
assert.equal(withoutDistanceOverride.pricingSnapshot.pricePerKm, 100,
  "SQL NULL means no route override, not a zero-tenge kilometre rate");
assert.equal(withoutDistanceOverride.estimatedPrice, 3000,
  "a 20 km journey without an override retains real kilometre pricing");
for (const absent of [null, undefined]) {
  const flatExecutor = createExecutor();
  flatExecutor.state.tariffs[0].price_per_km = 0;
  flatExecutor.state.tariffs[0].price_per_minute = 0;
  flatExecutor.state.intercityRoutes.push({ ...executor.state.intercityRoutes[0], price_per_km_override: absent });
  const inherited = await prepareOrderPricing({
    ...baseInput, dropoffLat: 2.5, dropoffLng: 2.5, distanceKm: 20, durationMin: 30
  }, flatExecutor);
  assert.equal(inherited.pricingSnapshot.pricePerKm, 140,
    "a flat city tariff retains the existing intercity fallback when no override is configured");
}
executor.state.intercityRoutes[0].price_per_km_override = 0;
const explicitZero = await prepareOrderPricing({
  ...baseInput, dropoffLat: 2.5, dropoffLng: 2.5, distanceKm: 20, durationMin: 30
}, executor);
assert.equal(explicitZero.pricingSnapshot.pricePerKm, 0,
  "an explicitly configured zero is not changed by the missing-override fix");
executor.state.intercityRoutes[0].price_per_km_override = 140;
for (const metrics of [{ distanceKm: 351, durationMin: 30 }, { distanceKm: 20, durationMin: 721 }]) {
  await assert.rejects(() => prepareOrderPricing({
    ...baseInput, dropoffLat: 2.5, dropoffLng: 2.5, ...metrics
  }, executor), { code: "INVALID_ROUTE_METRICS" }, "configured intercity caps remain enforced");
}
await assert.rejects(() => prepareOrderPricing({
  ...baseInput, pickupLat: 2.5, pickupLng: 2.5, dropoffLat: 0.5, dropoffLng: 0.5,
  distanceKm: 20, durationMin: 30
}, executor), { code: "INTERCITY_ROUTE_UNAVAILABLE" }, "enabling one direction does not enable its reverse");

const overlapExecutor = createExecutor();
// A second region whose boundary also covers baseInput's pickup/dropoff
// (0.5,0.5)/(0.8,0.8) but whose own center sits farther away than region-a's
// -- confirms overlapping regions resolve to whichever is actually closer
// instead of erroring out (real bug found live: 18 overlapping boundary
// pairs among Мақтаарал-district towns used to hard-reject every booking
// whose pickup/dropoff fell in the overlap with REGION_AMBIGUOUS).
overlapExecutor.state.regions.push({
  id: "region-overlap",
  code: "OVERLAP",
  name: "Overlap",
  is_active: true,
  center_lat: 0.1,
  center_lng: 0.1,
  currency: "KZT",
  // Covers the pickup point (0.5,0.5, also inside region-a) but stops short
  // of the dropoff point (0.8,0.8) -- isolates the tie-break to the pickup
  // side so this only tests overlap resolution, not intercity rejection.
  boundary: [[0, 0], [0.6, 0], [0.6, 0.6], [0, 0.6], [0, 0]]
});
const overlapPricing = await prepareOrderPricing(baseInput, overlapExecutor);
assert.equal(overlapPricing.regionId, "region-a", "overlapping regions resolve to the nearer one instead of rejecting");

await assert.rejects(
  () => prepareOrderPricing({ ...baseInput, tariffId: "tariff-a-inactive", tariff: "Inactive" }, executor),
  { code: "TARIFF_INACTIVE" },
  "inactive tariff rejects TARIFF_INACTIVE"
);

await assert.rejects(
  () => prepareOrderPricing({ ...baseInput, tariffId: "tariff-b" }, executor),
  { code: "TARIFF_REGION_MISMATCH" },
  "tariff from another region rejects TARIFF_REGION_MISMATCH"
);

console.log("Tariffs and order creation checks ok");

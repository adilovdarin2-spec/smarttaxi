import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { serviceRegionCode } from "../modules/routing/region-geo.js";

// Read-only local integration QA. No accounts, orders, settings, migrations,
// official registry imports or external SMS. Public OSRM is not load-tested:
// requests are serial, spaced, capped, and the two fares share one route cache.
const api = (process.env.QA_API_URL || "http://127.0.0.1:4001").replace(/\/$/, "");
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(api).hostname), "Regional QA is local-only");
const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const dataDir = fileURLToPath(new URL("../../data/addresses/", import.meta.url));
const output = process.env.QA_OUTPUT_DIR || path.join(repository, "tmp-regional-routing-qa");
const results = [];
const failures = [];
let requests = 0;
let completed = false;

async function request(endpoint, body) {
  assert(++requests <= 50, "Stop before a regression becomes an unbounded provider probe");
  const response = await fetch(`${api}${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  assert(response.ok, `${endpoint}: HTTP ${response.status}, ${data.error || "unknown error"}`);
  return data;
}

function distanceMeters(a, b) {
  const rad = value => value * Math.PI / 180;
  const value = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
}

async function regionPair(region) {
  assert(/^[A-Z_]+$/.test(region.code));
  const content = gunzipSync(await fs.readFile(path.join(dataDir, `${region.code}.jsonl.gz`))).toString("utf8");
  const rows = content.split("\n").filter(Boolean).map(line => JSON.parse(line))
    .filter(row => (row.kind === "poi" || (row.kind === "housenumber" && row.street && row.housenumber)) &&
      Number.isFinite(row.lat) && Number.isFinite(row.lng) && serviceRegionCode(row.lat, row.lng) === region.code)
    .sort((a, b) => distanceMeters(a, { lat: region.centerLat, lng: region.centerLng }) -
      distanceMeters(b, { lat: region.centerLat, lng: region.centerLng }));
  const pickup = rows[0];
  assert(pickup, `${region.code}: no owned existing house/POI available for QA`);
  const dropoff = rows.find(row => distanceMeters(pickup, row) >= 250 && distanceMeters(pickup, row) <= 8000);
  assert(dropoff, `${region.code}: no separate owned destination for QA`);
  return { pickup, dropoff };
}

function publicPoint(point) {
  return { label: point.label, lat: point.lat, lng: point.lng,
    source: "committed_osm_catalogue", osmType: point.osmType, osmId: point.osmId };
}

async function checkPair(origin, destination, pickup, dropoff) {
  // A few seconds between unique pairs, not concurrent regional fan-out.
  await delay(3000);
  let reference;
  for (const tariff of ["Economy", "Delivery"]) {
    const route = (await request("/api/maps/route", {
      pickupLat: pickup.lat, pickupLng: pickup.lng,
      dropoffLat: dropoff.lat, dropoffLng: dropoff.lng, tariff
    })).route;
    assert.equal(route.providerStatus, "Ok");
    assert.equal(route.regionId, origin.id);
    assert.equal(route.destinationRegionId, destination.id);
    assert.equal(route.isIntercity, origin.id !== destination.id);
    assert(Number.isFinite(route.distanceMeters) && route.distanceMeters > 0);
    assert(Number.isFinite(route.durationSeconds) && route.durationSeconds > 0);
    assert.equal(route.geometry?.type, "LineString");
    assert(route.geometry.coordinates.length >= 2);
    for (const [lng, lat] of route.geometry.coordinates) {
      assert(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180);
    }
    assert.equal(route.region.currency, "KZT");
    assert.equal(route.estimate.tariff.name, tariff);
    assert(Number.isInteger(route.estimate.estimatedPrice) && route.estimate.estimatedPrice > 0);
    assert.equal(route.estimate.pricing.distanceKm, Math.max(0.1, route.distanceMeters / 1000));
    assert.equal(route.estimate.pricing.durationMin, Math.max(1, Math.ceil(route.durationSeconds / 60)));
    if (reference) {
      assert.equal(route.distanceMeters, reference.distanceMeters, "Both tariffs must use the same route");
      assert.equal(route.durationSeconds, reference.durationSeconds);
      assert.deepEqual(route.geometry, reference.geometry);
    }
    reference = route;
    const coordinates = route.geometry.coordinates;
    const first = coordinates[0], last = coordinates.at(-1);
    const maxEndpointSnapMeters = Math.round(Math.max(
      distanceMeters(pickup, { lng: first[0], lat: first[1] }),
      distanceMeters(dropoff, { lng: last[0], lat: last[1] })
    ));
    const result = {
      origin: origin.code, destination: destination.code, tariff,
      pickup: publicPoint(pickup), dropoff: publicPoint(dropoff),
      distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds,
      priceKzt: route.estimate.estimatedPrice, pricePerKm: route.estimate.pricing.pricePerKm,
      isIntercity: route.isIntercity, maxEndpointSnapMeters,
      detourRatio: Number((route.distanceMeters / distanceMeters(pickup, dropoff)).toFixed(2)),
      needsAccessReview: maxEndpointSnapMeters > 250,
      geometry: route.geometry
    };
    results.push(result);
    console.log(JSON.stringify({ origin: result.origin, destination: result.destination,
      tariff, meters: result.distanceMeters, seconds: result.durationSeconds,
      priceKzt: result.priceKzt, maxEndpointSnapMeters }));
  }
}

await fs.mkdir(output, { recursive: true });
try {
  const health = await request("/api/health/ready");
  assert.equal(health.env, "development");
  assert.equal(health.status, "ok");
  const { regions } = await request("/api/regions/active");
  assert(regions.length > 0 && regions.length <= 13, "Review scope if the regional catalogue grows");
  const pairs = new Map();
  for (const region of regions) {
    try {
      const pair = await regionPair(region);
      pairs.set(region.code, pair);
      await checkPair(region, region, pair.pickup, pair.dropoff);
    } catch (error) {
      failures.push({ region: region.code, message: error.message });
      console.error(`${region.code}: ${error.message}`);
    }
  }
  const { routes } = await request("/api/regions/intercity");
  for (const [from, to] of [["ATAKENT", "MYRZAKENT"], ["MYRZAKENT", "ATAKENT"],
    ["ZHETYSAY", "SHYMKENT"], ["SHYMKENT", "ZHETYSAY"]]) {
    try {
      const origin = regions.find(region => region.code === from);
      const destination = regions.find(region => region.code === to);
      assert(origin && destination && pairs.has(from) && pairs.has(to));
      assert(routes.some(route => route.originRegionId === origin.id && route.destinationRegionId === destination.id),
        "This direction is not enabled; do not change configuration to obtain a pass");
      await checkPair(origin, destination, pairs.get(from).pickup, pairs.get(to).pickup);
    } catch (error) {
      failures.push({ direction: `${from}->${to}`, message: error.message });
      console.error(`${from}->${to}: ${error.message}`);
    }
  }
  assert.equal(failures.length, 0, "Regional routing/pricing acceptance has failures; inspect the report");
  completed = true;
} catch (error) {
  if (!failures.length) failures.push({ phase: "preflight", message: error.message });
  throw error;
} finally {
  await fs.writeFile(path.join(output, "regional-routing.json"), JSON.stringify({
    time: new Date().toISOString(), api, passed: completed, requestCount: requests,
    scope: "Local estimate/geometry QA only; not official addresses, device navigation, live traffic or provider capacity",
    reviewItems: results.filter(result => result.tariff === "Economy" &&
      (result.maxEndpointSnapMeters > 250 || result.detourRatio > 5))
      .map(({ origin, destination, maxEndpointSnapMeters, detourRatio }) =>
        ({ origin, destination, maxEndpointSnapMeters, detourRatio,
          reason: "Unusual road access/detour needs map or on-road verification; not proof of an incorrect route" })),
    results, failures
  }, null, 2));
}
console.log(`Regional routing/pricing QA passed (${results.length} tariff previews). Report: ${output}`);

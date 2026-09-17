import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { buildActiveLegRoute } from "../modules/routing/routing.service.js";

// Read-only local QA with real OSRM responses. No accounts, orders, GPS
// writes, seeds or production requests. Driving fixes below are explicit
// test inputs on a real mapped road, NOT evidence of a physical road test.
const api = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
assert.equal(env.NODE_ENV, "development", "route QA requires development mode");
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(api).hostname), "route QA API must be local");
const ROUTE_QA_ATTEMPTS = 3;
const pause = (milliseconds = 1200) => new Promise(resolve => setTimeout(resolve, milliseconds));
async function json(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= ROUTE_QA_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (response.ok) return response.json();
      const retryable = response.status === 429 || response.status >= 500;
      const error = new Error(`QA request failed (${response.status}): ${new URL(url).pathname}`);
      error.retryable = retryable;
      if (!retryable || attempt === ROUTE_QA_ATTEMPTS) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === ROUTE_QA_ATTEMPTS) throw error;
    }
    await pause(1000 * attempt);
  }
  throw lastError;
}

let health;
for (let attempt = 1; attempt <= ROUTE_QA_ATTEMPTS; attempt += 1) {
  health = await json(`${api}/api/health/ready`);
  if (health.checks?.osrm === "ok") break;
  if (attempt < ROUTE_QA_ATTEMPTS) await pause(1500 * attempt);
}
assert.equal(health.env, "development");
assert.equal(health.checks?.db, "ok");
assert.equal(health.checks?.osrm, "ok");
assert.equal(health.maps.osrm.baseUrl.replace(/\/$/, ""), env.ROUTING_BASE_URL.replace(/\/$/, ""), "QA and API must use the same provider");

const cases = [
  { name: "Atakent", from: [68.509144, 40.8443546], to: [68.5105, 40.8505] },
  { name: "Zhetysay", from: [68.324677, 40.777134], to: [68.33, 40.785] },
  { name: "Myrzakent", from: [68.549994, 40.665495], to: [68.56, 40.675] }
];
const evidence = { time: new Date().toISOString(), provider: health.maps.osrm.baseUrl, previews: [], directional: [] };
const fastest = data => {
  assert.equal(data.code, "Ok");
  assert(data.routes?.length > 0);
  return [...data.routes].sort((a, b) => a.duration - b.duration || a.distance - b.distance)[0];
};
for (const test of cases) {
  await pause();
  const raw = await json(`${env.ROUTING_BASE_URL.replace(/\/$/, "")}/route/v1/driving/${test.from.join(",")};${test.to.join(",")}?overview=full&geometries=geojson&steps=true&alternatives=true&radiuses=250;250`);
  const expected = fastest(raw);
  await pause();
  const actual = await json(`${api}/api/maps/route`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pickupLng: test.from[0], pickupLat: test.from[1], dropoffLng: test.to[0], dropoffLat: test.to[1] })
  });
  assert.equal(actual.providerStatus, "Ok");
  assert.equal(actual.durationSeconds, Math.round(expected.duration));
  assert.equal(actual.distanceMeters, Math.round(expected.distance));
  assert.deepEqual(actual.geometry, expected.geometry, "API displays the same fastest route it measures");
  assert(raw.waypoints.every(point => point.distance <= 251));
  evidence.previews.push({ ...test, candidates: raw.routes.length, distanceMeters: actual.distanceMeters, durationSeconds: actual.durationSeconds, snapMeters: raw.waypoints.map(point => point.distance) });
}

for (const heading of [3, 183]) {
  await pause();
  let requestedUrl;
  let providerData;
  const route = await buildActiveLegRoute({
    order: { status: "TRIP_STARTED", dropoff_lat: 40.8505, dropoff_lng: 68.5105 },
    driverLocation: { lat: 40.844343, lng: 68.509497, heading, speed: 10, accuracy: 8, updated_at: new Date() },
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      providerData = await response.clone().json();
      return response;
    }
  });
  assert.equal(route.fallback, false);
  assert.equal(requestedUrl.searchParams.get("bearings"), `${heading},45;`);
  assert.equal(requestedUrl.searchParams.get("radiuses"), "60;250");
  const selected = fastest(providerData);
  assert.equal(route.durationSeconds, Math.round(selected.duration));
  assert.deepEqual(route.geometry, selected.geometry);
  const departure = selected.legs[0].steps[0].maneuver.bearing_after;
  const angle = Math.abs(((departure - heading + 540) % 360) - 180);
  assert(angle <= 45, "route must not start against the test car's direction");
  evidence.directional.push({ inputHeading: heading, departureHeading: departure, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });
}
console.log(JSON.stringify(evidence, null, 2));
console.log("Read-only route selection QA passed (estimated duration; no live traffic or physical road test).");

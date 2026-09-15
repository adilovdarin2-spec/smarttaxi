import assert from "node:assert/strict";

const API_URL = (process.env.API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const pickup = { lat: 40.844435, lng: 68.509021 };
const dropoff = { lat: 40.84655, lng: 68.51725 };

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const health = await request("/api/health/ready");
assert.equal(health.checks?.db, "ok", "database must be ready for maps smoke");

const diagnostics = await request("/api/maps/diagnostics");
assert.ok(diagnostics.providers?.search, "diagnostics must report search provider");
assert.ok(diagnostics.providers?.reverse, "diagnostics must report reverse provider");

const regionsPayload = await request("/api/regions");
const activeRegions = Array.isArray(regionsPayload.regions)
  ? regionsPayload.regions.filter((region) => region?.isActive !== false)
  : [];
assert.ok(activeRegions.length > 0, "at least one active region must be available for address search");

// A settlement name is useful for framing the map, but must never be offered
// as a selectable pickup or destination: a driver cannot stop at a town
// centroid. Check every active region against the public endpoint so a
// provider or local-catalogue regression cannot reintroduce that invalid
// suggestion. Address completeness itself is verified by the separate
// official-registry import audit, because this smoke run must not pretend a
// town name is a house/POI-level address.
for (const region of activeRegions) {
  const query = region.name;
  const results = await request(`/api/maps/search?q=${encodeURIComponent(query)}&region=${encodeURIComponent(query)}&limit=5`);
  assert.ok(Array.isArray(results), `search ${query} must return an array`);
  const normalizedRegion = query.toLocaleLowerCase("ru-RU").trim();
  for (const result of results) {
    const label = String(result.label || result.title || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("ru-RU");
    assert.notEqual(label, normalizedRegion, `search ${query} must not offer a bare settlement as an address`);
  }
}

const reversed = await request(`/api/maps/reverse?lat=${pickup.lat}&lng=${pickup.lng}`);
assert.ok(reversed.title || reversed.label, "reverse geocode must return a readable title");

const route = await request("/api/maps/route", {
  method: "POST",
  body: {
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng
  }
});
assert.ok(route.distanceMeters > 0, "route must return distance");
assert.ok(route.durationSeconds > 0, "route must return duration");

const estimate = await request("/api/maps/estimate-v2", {
  method: "POST",
  body: {
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng,
    tariffName: "Economy"
  }
});
assert.ok(estimate.priceKzt > 0, "estimate must return backend price");

console.log("Smoke maps ok", {
  api: API_URL,
  osrm: diagnostics.osrm?.status,
  addressRegionsChecked: activeRegions.length,
  routeMeters: route.distanceMeters,
  priceKzt: estimate.priceKzt
});

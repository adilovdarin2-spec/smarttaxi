import test from "node:test";
import assert from "node:assert/strict";
import { circlePolygon } from "../src/features/admin/standGeometry.mjs";

// The circle the owner drags on the map is the geofence the driver's phone is
// actually checked against, so it has to be a real radius in metres — not a
// MapLibre circle layer, which would grow and shrink with zoom and show a
// boundary that does not exist.

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

test("every drawn point sits at the requested radius from the centre", () => {
  const centre = { lat: 40.6655, lng: 68.55 };
  const radiusM = 150;
  const ring = circlePolygon({ ...centre, radiusM }).geometry.coordinates[0];

  const distances = ring.map(([lng, lat]) => haversineMeters(centre.lat, centre.lng, lat, lng));
  for (const distance of distances) {
    // One metre of slack over a 150 m radius: the flat-earth approximation is
    // exact enough at this scale, and a stand is a place, not a survey.
    assert.ok(
      Math.abs(distance - radiusM) < 1,
      `point drifted to ${distance.toFixed(2)} m from the ${radiusM} m radius`
    );
  }
});

test("the ring closes, so MapLibre renders a filled circle and not an arc", () => {
  const ring = circlePolygon({ lat: 40.6655, lng: 68.55, radiusM: 120 }).geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.ok(ring.length >= 60, "too few points would show the owner a visible polygon, not a circle");
});

test("the radius holds at the latitudes this service actually runs at", () => {
  for (const lat of [40.66, 42.32, 51.13]) {
    const ring = circlePolygon({ lat, lng: 68.55, radiusM: 300 }).geometry.coordinates[0];
    const east = haversineMeters(lat, 68.55, ring[0][1], ring[0][0]);
    const north = haversineMeters(lat, 68.55, ring[18][1], ring[18][0]);
    assert.ok(Math.abs(east - 300) < 2, `east radius ${east.toFixed(1)} m at lat ${lat}`);
    assert.ok(Math.abs(north - 300) < 2, `north radius ${north.toFixed(1)} m at lat ${lat}`);
  }
});

test("a stand drawn on the equator does not collapse or explode", () => {
  const ring = circlePolygon({ lat: 0, lng: 0, radiusM: 200 }).geometry.coordinates[0];
  const east = haversineMeters(0, 0, ring[0][1], ring[0][0]);
  assert.ok(Math.abs(east - 200) < 2, `east radius ${east.toFixed(1)} m at the equator`);
});

// The circle the owner drags on the map is the geofence the driver's phone is
// actually checked against, so it is drawn as a real polygon in metres. A
// MapLibre circle layer takes its radius in pixels and would grow and shrink
// with zoom, showing a boundary that does not exist.
const CIRCLE_POINTS = 72;

export function circlePolygon({ lat, lng, radiusM }) {
  const coordinates = [];
  const latRadius = radiusM / 111_320;
  // Metres of longitude shrink towards the poles; without this the circle
  // would render as an ellipse everywhere but the equator.
  const lngRadius = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
  for (let index = 0; index <= CIRCLE_POINTS; index += 1) {
    const angle = (index / CIRCLE_POINTS) * 2 * Math.PI;
    coordinates.push([lng + lngRadius * Math.cos(angle), lat + latRadius * Math.sin(angle)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] }
  };
}

export function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

// Source-backed footprints only. Never synthesize a rectangle from an address
// point: a bounding box would incorrectly include courtyards and adjacent homes.
export function normalizeBuildingGeometry(value) {
  if (!value || !['Polygon', 'MultiPolygon'].includes(value.type)) return null;
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  let count = 0;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 16) return null;
  const normalized = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 16) return null;
    const rings = [];
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || (count += ring.length) > 512) return null;
      if (!ring.every(p => Array.isArray(p) && p.length >= 2 &&
        typeof p[0] === 'number' && typeof p[1] === 'number' &&
        Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return null;
      const points = ring.map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
      if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) return null;
      rings.push(points);
    }
    normalized.push(rings);
  }
  const result = { type: value.type, coordinates: value.type === 'Polygon' ? normalized[0] : normalized };
  // Keep the optional GET argument under normal proxy request-line limits.
  return JSON.stringify(result).length <= 2500 ? result : null;
}

function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i];
    const [xj, yj] = ring[j];
    const dx = xj - x, dy = yj - y;
    const cross = (point.lng - x) * dy - (point.lat - y) * dx;
    if (Math.abs(cross) < 1e-12 &&
      point.lng >= Math.min(x, xj) - 1e-10 && point.lng <= Math.max(x, xj) + 1e-10 &&
      point.lat >= Math.min(y, yj) - 1e-10 && point.lat <= Math.max(y, yj) + 1e-10) return true;
    if ((y > point.lat) !== (yj > point.lat) &&
      point.lng < dx * (point.lat - y) / dy + x) inside = !inside;
  }
  return inside;
}

export function pointInBuilding(point, geometry) {
  if (!geometry || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
}

// Address nodes and entrances can sit a few metres outside a vector-tile
// footprint after tile simplification. Measure the real gap to the polygon
// edge so the backend can tolerate that small cartographic mismatch without
// borrowing an address from a neighbouring building.
export function distanceToBuildingMeters(point, geometry) {
  if (!geometry || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return Infinity;
  if (pointInBuilding(point, geometry)) return 0;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons)) return Infinity;
  const metersPerLatDegree = 111_132;
  const metersPerLngDegree = 111_320 * Math.cos((point.lat * Math.PI) / 180);
  let nearest = Infinity;
  for (const rings of polygons) {
    if (!Array.isArray(rings)) continue;
    for (const ring of rings) {
      if (!Array.isArray(ring)) continue;
      for (let index = 1; index < ring.length; index += 1) {
        const start = ring[index - 1];
        const end = ring[index];
        if (!Array.isArray(start) || !Array.isArray(end)) continue;
        const ax = (start[0] - point.lng) * metersPerLngDegree;
        const ay = (start[1] - point.lat) * metersPerLatDegree;
        const bx = (end[0] - point.lng) * metersPerLngDegree;
        const by = (end[1] - point.lat) * metersPerLatDegree;
        const dx = bx - ax;
        const dy = by - ay;
        const denominator = dx * dx + dy * dy;
        const t = denominator > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator)) : 0;
        nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
      }
    }
  }
  return nearest;
}

export function buildingAtPoint(features, point) {
  for (const feature of features) {
    // Vector tiles merge many separate houses into one MultiPolygon. The
    // selected building is its containing component, not that whole tile.
    const raw = feature.geometry;
    const parts = raw?.type === 'MultiPolygon' && Array.isArray(raw.coordinates)
      ? raw.coordinates.map(coordinates => ({type:'Polygon', coordinates})) : [raw];
    for (const part of parts) {
      const geometry = normalizeBuildingGeometry(part);
      if (geometry && pointInBuilding(point, geometry)) return geometry;
    }
  }
  return null;
}

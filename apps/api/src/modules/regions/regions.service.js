import { AppError } from "../../common/errors.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizePoint({ lat, lng }) {
  const point = { lat: toNumber(lat), lng: toNumber(lng) };
  if (point.lat === null || point.lng === null) {
    throw new AppError("Point coordinates are required", 400, "COORDINATES_REQUIRED");
  }
  if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
    throw new AppError("Coordinates are outside valid bounds", 400, "INVALID_COORDINATES");
  }
  return point;
}

function normalizeBoundary(boundary) {
  const polygon = boundary?.type === "Polygon" ? boundary.coordinates?.[0] : boundary;
  if (!Array.isArray(polygon)) return [];
  return polygon
    .map((point) => {
      if (Array.isArray(point)) return { lng: Number(point[0]), lat: Number(point[1]) };
      return { lng: Number(point.lng), lat: Number(point.lat) };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

export function pointInPolygon(point, boundary) {
  const polygon = normalizeBoundary(boundary);
  if (polygon.length < 3) return false;

  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }

  return inside;
}

export function publicRegion(region) {
  if (!region) return null;
  return {
    id: region.id,
    code: region.code,
    name: region.name,
    isActive: region.is_active,
    centerLat: Number(region.center_lat),
    centerLng: Number(region.center_lng),
    currency: region.currency,
    supportPhone: region.support_phone,
    boundary: region.boundary,
    createdAt: region.created_at,
    updatedAt: region.updated_at
  };
}

export async function listActiveRegions(executor = defaultQuery) {
  const result = await run(executor, `
    SELECT *
    FROM regions
    WHERE is_active=true
    ORDER BY name ASC
  `);
  return result.rows;
}

export async function listRegions(executor = defaultQuery) {
  const result = await run(executor, "SELECT * FROM regions ORDER BY name ASC");
  return result.rows;
}

export async function createRegion(data, executor = defaultQuery) {
  const result = await run(executor, `
    INSERT INTO regions(code, name, boundary, center_lat, center_lng, currency, is_active)
    VALUES($1,$2,$3::jsonb,$4,$5,$6,$7)
    RETURNING *
  `, [
    data.code,
    data.name,
    JSON.stringify(data.boundary),
    data.centerLat,
    data.centerLng,
    data.currency || "KZT",
    data.isActive ?? true
  ]);
  return result.rows[0];
}

function regionUpdateAssignments(data) {
  const columns = {
    code: "code",
    name: "name",
    boundary: "boundary",
    centerLat: "center_lat",
    centerLng: "center_lng",
    currency: "currency",
    isActive: "is_active"
  };
  const entries = Object.entries(data);
  const values = entries.map(([key, value]) => key === "boundary" ? JSON.stringify(value) : value);
  const assignments = entries.map(([key], index) => {
    const cast = key === "boundary" ? "::jsonb" : "";
    return `${columns[key]}=$${index + 1}${cast}`;
  });
  return { assignments, values };
}

export async function updateRegion(regionId, data, executor = defaultQuery) {
  const before = (await run(executor, "SELECT * FROM regions WHERE id=$1 FOR UPDATE", [regionId])).rows[0];
  if (!before) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");

  const { assignments, values } = regionUpdateAssignments(data);
  if (!assignments.length) throw new AppError("No region fields to update", 400, "REGION_UPDATE_EMPTY");

  values.push(regionId);
  const updated = (await run(executor, `
    UPDATE regions
    SET ${assignments.join(", ")}, updated_at=NOW()
    WHERE id=$${values.length}
    RETURNING *
  `, values)).rows[0];
  return { before, region: updated };
}

export async function setRegionActive(regionId, isActive, executor = defaultQuery) {
  return updateRegion(regionId, { isActive }, executor);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function findActiveRegionForPoint(point, executor = defaultQuery) {
  const regions = await listActiveRegions(executor);
  const matches = regions.filter((region) => pointInPolygon(point, region.boundary));
  if (matches.length <= 1) return matches[0] || null;
  // Several of these regions' boundary boxes genuinely overlap (confirmed:
  // 18 overlapping pairs across the 13 towns clustered in Мақтаарал
  // district) -- picking whichever match happened to sort first
  // alphabetically by name meant a point near a town border could resolve
  // to an unrelated neighbouring town's region instead of the one it's
  // actually in/closest to. Break ties by nearest region center instead.
  let best = matches[0];
  let bestDistance = haversineMeters(point.lat, point.lng, Number(best.center_lat), Number(best.center_lng));
  for (let i = 1; i < matches.length; i++) {
    const candidate = matches[i];
    const distance = haversineMeters(point.lat, point.lng, Number(candidate.center_lat), Number(candidate.center_lng));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export async function resolveActiveRegionForPoint({ lat, lng }, executor = defaultQuery) {
  const point = normalizePoint({ lat, lng });
  const region = await findActiveRegionForPoint(point, executor);
  if (!region) throw new AppError("Point is outside active service regions", 403, "REGION_INACTIVE");
  return region;
}

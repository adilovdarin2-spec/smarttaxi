import { AppError } from "../../common/errors.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function publicIntercityRoute(route) {
  if (!route) return null;
  return {
    id: route.id,
    originRegionId: route.origin_region_id,
    originRegionCode: route.origin_region_code || null,
    originRegionName: route.origin_region_name || null,
    destinationRegionId: route.destination_region_id,
    destinationRegionCode: route.destination_region_code || null,
    destinationRegionName: route.destination_region_name || null,
    isActive: Boolean(route.is_active),
    maxDistanceKm: Number(route.max_distance_km),
    maxDurationMin: Number(route.max_duration_min),
    baseSurchargeKzt: Number(route.base_surcharge_kzt || 0),
    pricePerKmOverride: numberOrNull(route.price_per_km_override),
    minPriceOverride: numberOrNull(route.min_price_override),
    requiresDestinationApproval: Boolean(route.requires_destination_approval)
  };
}

const ROUTE_SELECT = `
  ir.*,
  origin.code AS origin_region_code,
  origin.name AS origin_region_name,
  destination.code AS destination_region_code,
  destination.name AS destination_region_name
  FROM intercity_routes ir
  JOIN regions origin ON origin.id=ir.origin_region_id
  JOIN regions destination ON destination.id=ir.destination_region_id
`;

export async function listActiveIntercityRoutes({ originRegionId } = {}, executor = defaultQuery) {
  const params = [];
  const where = ["ir.is_active=true", "origin.is_active=true", "destination.is_active=true"];
  if (originRegionId) {
    params.push(originRegionId);
    where.push(`ir.origin_region_id=$${params.length}`);
  }
  const result = await run(executor, `
    SELECT ${ROUTE_SELECT}
    WHERE ${where.join(" AND ")}
    ORDER BY origin.name ASC, destination.name ASC
  `, params);
  return result.rows;
}

export async function listIntercityRoutes(executor = defaultQuery) {
  const result = await run(executor, `
    SELECT ${ROUTE_SELECT}
    ORDER BY origin.name ASC, destination.name ASC
  `);
  return result.rows;
}

export async function createIntercityRoute(input, executor = defaultQuery) {
  const result = await run(executor, `
    INSERT INTO intercity_routes(
      origin_region_id, destination_region_id, is_active, max_distance_km,
      max_duration_min, base_surcharge_kzt, price_per_km_override,
      min_price_override, requires_destination_approval
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `, [
    input.originRegionId,
    input.destinationRegionId,
    input.isActive ?? true,
    input.maxDistanceKm,
    input.maxDurationMin,
    input.baseSurchargeKzt ?? 0,
    input.pricePerKmOverride ?? null,
    input.minPriceOverride ?? null,
    input.requiresDestinationApproval ?? true
  ]);
  return result.rows[0];
}

export async function updateIntercityRoute(routeId, input, executor = defaultQuery) {
  const columns = {
    isActive: "is_active",
    maxDistanceKm: "max_distance_km",
    maxDurationMin: "max_duration_min",
    baseSurchargeKzt: "base_surcharge_kzt",
    pricePerKmOverride: "price_per_km_override",
    minPriceOverride: "min_price_override",
    requiresDestinationApproval: "requires_destination_approval"
  };
  const entries = Object.entries(input).filter(([key]) => columns[key]);
  if (!entries.length) throw new AppError("No intercity route fields provided", 400, "INTERCITY_ROUTE_UPDATE_EMPTY");
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${columns[key]}=$${index + 1}`);
  values.push(routeId);
  const result = await run(executor, `
    UPDATE intercity_routes
    SET ${assignments.join(", ")}, updated_at=NOW()
    WHERE id=$${values.length}
    RETURNING *
  `, values);
  if (!result.rows[0]) throw new AppError("Intercity route not found", 404, "INTERCITY_ROUTE_NOT_FOUND");
  return result.rows[0];
}

// A cross-region trip is an explicit product route, not merely two points
// that happen to lie in different polygons.  This lets operations close one
// direction, cap a route during bad weather, or set a sustainable fare before
// riders are allowed to request it.
export async function resolveIntercityRoute({ originRegionId, destinationRegionId }, executor = defaultQuery) {
  if (originRegionId === destinationRegionId) return null;
  const result = await run(executor, `
    SELECT ${ROUTE_SELECT}
    WHERE ir.origin_region_id=$1
      AND ir.destination_region_id=$2
      AND ir.is_active=true
      AND origin.is_active=true
      AND destination.is_active=true
    LIMIT 1
  `, [originRegionId, destinationRegionId]);
  const route = result.rows[0];
  if (!route) {
    throw new AppError("Intercity route is not available", 409, "INTERCITY_ROUTE_UNAVAILABLE");
  }
  return route;
}

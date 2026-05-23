import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import { query as defaultQuery } from "../../db/pool.js";
import { orderRoom, dispatchRegionRoom, ACTIVE_ORDER_STATUSES } from "../orders/order-dispatch.service.js";
import { prepareOrderPricing } from "../orders/order-pricing.service.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";
import { listActiveRegions, normalizePoint, pointInPolygon, publicRegion } from "../regions/regions.service.js";

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

function toNullableNumber(value, min, max, code) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new AppError("Invalid location metric", 400, code);
  return parsed;
}

function routeUnavailable(message = "Routing provider is unavailable") {
  return new AppError(message, 503, "ROUTE_UNAVAILABLE");
}

async function resolveActiveRegionForPoint(pointInput, failureCode, executor) {
  const point = normalizePoint(pointInput);
  const matches = (await listActiveRegions(executor)).filter(region => pointInPolygon(point, region.boundary));
  if (matches.length === 0) throw new AppError("Point is outside active service regions", 403, failureCode);
  if (matches.length > 1) throw new AppError("Point matches multiple active service regions", 409, "REGION_AMBIGUOUS");
  return matches[0];
}

export async function resolveTripRegion(input, executor = defaultQuery) {
  const pickup = normalizePoint({ lat: input.pickupLat, lng: input.pickupLng });
  const dropoff = normalizePoint({ lat: input.dropoffLat, lng: input.dropoffLng });
  const pickupRegion = await resolveActiveRegionForPoint(pickup, "PICKUP_REGION_INACTIVE", executor);
  const dropoffRegion = await resolveActiveRegionForPoint(dropoff, "DROPOFF_REGION_INACTIVE", executor);
  if (pickupRegion.id !== dropoffRegion.id) throw new AppError("Intercity trips are not supported", 409, "INTERCITY_NOT_SUPPORTED");
  return { region: pickupRegion, pickup, dropoff };
}

export async function requestRoute({ from, to, fetchImpl = fetch }) {
  if (!env.ROUTING_BASE_URL) throw routeUnavailable("ROUTING_BASE_URL is not configured");
  const base = env.ROUTING_BASE_URL.replace(/\/$/, "");
  const url = `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
  let response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw routeUnavailable();
  }
  if (!response.ok) throw routeUnavailable();
  const data = await response.json().catch(() => null);
  const route = data?.routes?.[0];
  if (!route || !Number.isFinite(Number(route.distance)) || !Number.isFinite(Number(route.duration)) || !route.geometry) {
    throw routeUnavailable();
  }
  return {
    distanceMeters: Math.round(Number(route.distance)),
    durationSeconds: Math.round(Number(route.duration)),
    geometry: route.geometry,
    providerStatus: data.code || "Ok"
  };
}

export async function buildRoutePreview(input, executor = defaultQuery, fetchImpl = fetch) {
  const { region, pickup, dropoff } = await resolveTripRegion(input, executor);
  const route = await requestRoute({ from: pickup, to: dropoff, fetchImpl });
  let estimate = null;
  if (input.tariffId) {
    const pricing = await prepareOrderPricing({
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      tariffId: input.tariffId,
      distanceKm: Math.max(0.1, route.distanceMeters / 1000),
      durationMin: Math.max(1, Math.ceil(route.durationSeconds / 60))
    }, executor);
    estimate = pricing.publicEstimate;
  }
  return {
    regionId: region.id,
    region: publicRegion(region),
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
    estimate,
    providerStatus: route.providerStatus
  };
}

export async function updateDriverLocation({ userId, location, io = null, executor = defaultQuery }) {
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const point = normalizePoint({ lat, lng });
  const heading = toNullableNumber(location.heading, 0, 360, "INVALID_HEADING");
  const speed = toNullableNumber(location.speed, 0, 120, "INVALID_SPEED");
  const accuracy = toNullableNumber(location.accuracy, 0, 5000, "INVALID_ACCURACY");
  const source = String(location.source || "mobile").slice(0, 40);

  const driver = (await run(executor, "SELECT * FROM drivers WHERE user_id=$1", [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  if (!["FREE", "BUSY"].includes(driver.status)) throw new AppError("Driver must be online", 409, "DRIVER_OFFLINE");
  await assertDriverDispatchReady(driver, executor);

  const region = (await run(executor, "SELECT * FROM regions WHERE id=$1", [driver.current_region_id])).rows[0];
  if (!region?.is_active) throw new AppError("Region is inactive", 403, "DRIVER_REGION_INACTIVE");
  if (!pointInPolygon(point, region.boundary)) throw new AppError("Driver location is outside selected region", 403, "DRIVER_LOCATION_OUTSIDE_REGION");

  const result = await run(executor, `
    INSERT INTO driver_locations(driver_id, region_id, lat, lng, heading, speed, accuracy, source)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (driver_id) DO UPDATE
    SET region_id=EXCLUDED.region_id,
        lat=EXCLUDED.lat,
        lng=EXCLUDED.lng,
        heading=EXCLUDED.heading,
        speed=EXCLUDED.speed,
        accuracy=EXCLUDED.accuracy,
        source=EXCLUDED.source,
        updated_at=NOW()
    RETURNING *
  `, [driver.id, driver.current_region_id, point.lat, point.lng, heading, speed, accuracy, source]);
  await run(executor, "UPDATE drivers SET lat=$1, lng=$2, last_seen_at=NOW() WHERE id=$3", [point.lat, point.lng, driver.id]);

  const activeOrder = (await run(executor, `
    SELECT id
    FROM orders
    WHERE driver_id=$1 AND status = ANY($2::text[])
    ORDER BY created_at DESC
    LIMIT 1
  `, [driver.id, ACTIVE_ORDER_STATUSES])).rows[0] || null;

  const publicLocation = {
    orderId: activeOrder?.id || null,
    driverId: driver.id,
    regionId: driver.current_region_id,
    lat: Number(result.rows[0].lat),
    lng: Number(result.rows[0].lng),
    heading: result.rows[0].heading === null ? null : Number(result.rows[0].heading),
    speed: result.rows[0].speed === null ? null : Number(result.rows[0].speed),
    accuracy: result.rows[0].accuracy === null ? null : Number(result.rows[0].accuracy),
    updatedAt: result.rows[0].updated_at
  };

  if (io) {
    io.to(dispatchRegionRoom(driver.current_region_id)).emit("driver_location_updated", publicLocation);
    if (activeOrder?.id) io.to(orderRoom(activeOrder.id)).emit("driver_location_updated", publicLocation);
  }

  return { driver, location: publicLocation };
}

export async function assertCanAccessOrderLocation({ user, order, executor = defaultQuery }) {
  if (["OWNER", "OPERATOR"].includes(user.role)) return true;
  if (user.role === "DRIVER") {
    const driver = (await run(executor, "SELECT id FROM drivers WHERE user_id=$1", [user.id])).rows[0];
    if (driver?.id === order.driver_id) return true;
  }
  if (user.role === "CLIENT") {
    const client = (await run(executor, "SELECT id FROM clients WHERE user_id=$1", [user.id])).rows[0];
    if (client?.id === order.client_id) return true;
  }
  throw new AppError("Forbidden order", 403, "FORBIDDEN_ORDER");
}

export async function buildDriverToPickupRoute({ orderId, user, executor = defaultQuery, fetchImpl = fetch }) {
  const order = (await run(executor, "SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  await assertCanAccessOrderLocation({ user, order, executor });
  if (!order.driver_id) throw new AppError("Driver is not assigned", 409, "DRIVER_NOT_ASSIGNED");
  const location = (await run(executor, "SELECT * FROM driver_locations WHERE driver_id=$1 ORDER BY updated_at DESC LIMIT 1", [order.driver_id])).rows[0];
  if (!location) throw new AppError("Driver location is unavailable", 409, "DRIVER_LOCATION_UNAVAILABLE");
  const route = await requestRoute({
    from: { lat: Number(location.lat), lng: Number(location.lng) },
    to: { lat: Number(order.pickup_lat), lng: Number(order.pickup_lng) },
    fetchImpl
  });
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
    providerStatus: route.providerStatus,
    driverLat: Number(location.lat),
    driverLng: Number(location.lng),
    pickupLat: Number(order.pickup_lat),
    pickupLng: Number(order.pickup_lng)
  };
}

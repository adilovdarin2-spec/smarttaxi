import https from "node:https";
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

function addressSearchUnavailable(message = "Address search provider is unavailable") {
  return new AppError(message, 503, "ADDRESS_SEARCH_UNAVAILABLE");
}

function nominatimHeaders() {
  return {
    "User-Agent": "SmartTaxi/1.0 support@smarttaxi.local",
    "Accept": "application/json"
  };
}

function compactText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizedText(value) {
  return compactText(value).toLocaleLowerCase("ru-KZ");
}

function buildAddressSearchQuery(query, region) {
  const cleanQuery = compactText(query);
  const cleanRegion = compactText(region || env.CITY);
  const lowerQuery = normalizedText(cleanQuery);
  const parts = [cleanQuery];
  if (cleanRegion && !lowerQuery.includes(normalizedText(cleanRegion))) {
    parts.push(cleanRegion);
  }
  if (!lowerQuery.includes("kazakhstan") && !lowerQuery.includes("казахстан")) {
    parts.push("Kazakhstan");
  }
  return parts.join(" ");
}

function sortAddressSuggestions(addresses, regionHint) {
  const hint = normalizedText(regionHint || env.CITY);
  if (!hint) return addresses;
  return [...addresses].sort((left, right) => {
    const leftText = normalizedText(
      [left.label, left.subtitle, left.city, left.region].filter(Boolean).join(" ")
    );
    const rightText = normalizedText(
      [right.label, right.subtitle, right.city, right.region].filter(Boolean).join(" ")
    );
    const leftLocal = leftText.includes(hint) ? 0 : 1;
    const rightLocal = rightText.includes(hint) ? 0 : 1;
    return leftLocal - rightLocal;
  });
}

function shouldUseDevCertificateFallback(error) {
  if (env.NODE_ENV === "production") return false;
  const code = error?.cause?.code || error?.code || "";
  const message = `${error?.cause?.message || ""} ${error?.message || ""}`;
  return /CERT|VERIFY|TLS|UNABLE_TO_VERIFY|SELF_SIGNED|LEAF_SIGNATURE/i.test(`${code} ${message}`);
}

function getJsonViaHttps(url, { headers = {}, rejectUnauthorized = true } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers,
      rejectUnauthorized,
      timeout: 20_000
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          resolve({ ok: false, status: response.statusCode, data: null });
          return;
        }
        try {
          resolve({ ok: true, status: response.statusCode, data: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("HTTPS request timeout"));
    });
    request.on("error", reject);
  });
}

async function getJson(url, { headers = {}, fetchImpl = fetch } = {}) {
  if (fetchImpl !== fetch) {
    const response = await fetchImpl(url, { headers });
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? await response.json().catch(() => null) : null
    };
  }
  try {
    const response = await fetchImpl(url, { headers });
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? await response.json().catch(() => null) : null
    };
  } catch (error) {
    if (!shouldUseDevCertificateFallback(error)) throw error;
    return getJsonViaHttps(url, { headers, rejectUnauthorized: false });
  }
}

function publicAddressSuggestion(item) {
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = item.address || {};
  const city = address.city || address.town || address.village || address.county || "";
  const region = address.state || address.region || "";
  const shortParts = [
    address.road || address.pedestrian || address.neighbourhood || address.suburb,
    address.house_number,
    city
  ].filter(Boolean);
  const label = shortParts.length
    ? shortParts.join(address.house_number ? ", " : " ")
    : String(item.display_name || "Точка на карте").split(",").slice(0, 3).join(",").trim();
  return {
    label,
    subtitle: String(item.display_name || "").split(",").slice(1, 5).join(",").trim(),
    city,
    region,
    lat,
    lng
  };
}

function publicPhotonAddressSuggestion(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const properties = feature.properties || {};
  if (properties.countrycode && String(properties.countrycode).toUpperCase() !== "KZ") return null;
  const city = properties.city || properties.town || properties.village || properties.district || properties.county || "";
  const region = properties.state || "";
  const name = properties.name || properties.street || properties.osm_value || "Точка на карте";
  const house = properties.housenumber || properties.house_number || "";
  const label = [name, house].filter(Boolean).join(", ");
  const subtitle = [
    properties.district,
    city,
    region,
    properties.country
  ].filter(Boolean).join(", ");
  return {
    label,
    subtitle,
    city,
    region,
    lat,
    lng
  };
}

async function searchAddressesWithPhoton({ q, region, limit = 8 }, fetchImpl = fetch) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", buildAddressSearchQuery(query, region));
  url.searchParams.set("limit", String(Math.min(Math.max(Number(limit) || 8, 1), 12)));
  const response = await getJson(url, { fetchImpl });
  if (!response.ok) return [];
  const features = response.data?.features;
  if (!Array.isArray(features)) return [];
  return sortAddressSuggestions(
    features.map(publicPhotonAddressSuggestion).filter(Boolean),
    region
  );
}

async function reverseAddressWithPhoton({ lat, lng }, fetchImpl = fetch) {
  const point = normalizePoint({ lat, lng });
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  const response = await getJson(url, { fetchImpl });
  if (!response.ok) return null;
  const features = response.data?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  return publicPhotonAddressSuggestion(features[0]);
}

export async function searchAddresses({ q, region, limit = 8, countrycodes = "kz" }, fetchImpl = fetch) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const photonFirst = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
  if (photonFirst.length > 0) return photonFirst;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(Math.min(Math.max(Number(limit) || 8, 1), 12)));
  url.searchParams.set("q", buildAddressSearchQuery(query, region));
  if (countrycodes) url.searchParams.set("countrycodes", countrycodes);
  let response;
  try {
    response = await getJson(url, { headers: nominatimHeaders(), fetchImpl });
  } catch {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0) return fallback;
    throw addressSearchUnavailable();
  }
  if (!response.ok) {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0) return fallback;
    throw addressSearchUnavailable();
  }
  const data = response.data;
  if (!Array.isArray(data)) {
    const fallback = await searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl).catch(() => []);
    if (fallback.length > 0) return fallback;
    throw addressSearchUnavailable();
  }
  const addresses = sortAddressSuggestions(
    data.map(publicAddressSuggestion).filter(Boolean),
    region
  );
  if (addresses.length > 0) return addresses;
  return searchAddressesWithPhoton({ q: query, region, limit }, fetchImpl);
}

export async function reverseAddress({ lat, lng }, fetchImpl = fetch) {
  const point = normalizePoint({ lat, lng });
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  let response;
  try {
    response = await getJson(url, { headers: nominatimHeaders(), fetchImpl });
  } catch {
    const fallback = await reverseAddressWithPhoton(point, fetchImpl).catch(() => null);
    if (fallback) return fallback;
    throw addressSearchUnavailable();
  }
  if (!response.ok) {
    const fallback = await reverseAddressWithPhoton(point, fetchImpl).catch(() => null);
    if (fallback) return fallback;
    throw addressSearchUnavailable();
  }
  const data = response.data;
  const suggestion = publicAddressSuggestion(data);
  if (!suggestion) {
    const fallback = await reverseAddressWithPhoton(point, fetchImpl).catch(() => null);
    if (fallback) return fallback;
    throw addressSearchUnavailable("Address is unavailable for selected point");
  }
  return suggestion;
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
    response = await getJson(url, { fetchImpl });
  } catch {
    throw routeUnavailable();
  }
  if (!response.ok) throw routeUnavailable();
  const data = response.data;
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

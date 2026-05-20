import { AppError } from "../../common/errors.js";
import { listActiveRegions, normalizePoint, pointInPolygon, publicRegion } from "../regions/regions.service.js";
import { getTariffForRegion, publicTariff } from "../tariffs/tariffs.service.js";

async function resolveActiveRegionForPoint(pointInput, failureCode, executor) {
  const point = normalizePoint(pointInput);
  const matches = (await listActiveRegions(executor)).filter((region) => pointInPolygon(point, region.boundary));
  if (matches.length === 0) throw new AppError("Point is outside active service regions", 403, failureCode);
  if (matches.length > 1) throw new AppError("Point matches multiple active service regions", 409, "REGION_AMBIGUOUS");
  return matches[0];
}

function positiveFinite(value, name, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new AppError(`${name} is outside allowed bounds`, 400, "INVALID_ROUTE_METRICS");
  }
  return parsed;
}

export function calculateOrderPrice(tariff, distanceKm, durationMin) {
  const basePrice = Number(tariff.base_price);
  const pricePerKm = Number(tariff.price_per_km);
  const pricePerMinute = Number(tariff.price_per_minute);
  const minimumPrice = Number(tariff.min_price);
  const surgeMultiplier = Number(tariff.surge_multiplier ?? 1);
  const raw = basePrice + distanceKm * pricePerKm + durationMin * pricePerMinute;
  const surged = raw * surgeMultiplier;
  return Math.round(Math.max(minimumPrice, surged));
}

export function buildPricingSnapshot({ region, tariff, distanceKm, durationMin, estimatedPrice }) {
  return {
    regionId: region.id,
    tariffId: tariff.id,
    tariffName: tariff.name,
    basePrice: Number(tariff.base_price),
    pricePerKm: Number(tariff.price_per_km),
    pricePerMinute: Number(tariff.price_per_minute),
    minimumPrice: Number(tariff.min_price),
    surgeMultiplier: Number(tariff.surge_multiplier ?? 1),
    distanceKm,
    durationMin,
    serviceCommissionPercent: Number(tariff.service_commission_percent),
    estimatedPrice
  };
}

export async function prepareOrderPricing(input, executor) {
  const pickupRegion = await resolveActiveRegionForPoint({
    lat: input.pickupLat,
    lng: input.pickupLng
  }, "PICKUP_REGION_INACTIVE", executor);

  const dropoffRegion = await resolveActiveRegionForPoint({
    lat: input.dropoffLat,
    lng: input.dropoffLng
  }, "DROPOFF_REGION_INACTIVE", executor);

  if (pickupRegion.id !== dropoffRegion.id) {
    throw new AppError("Intercity trips are not supported", 409, "INTERCITY_NOT_SUPPORTED");
  }

  const distanceKm = positiveFinite(input.distanceKm, "distance_km", 300);
  const durationMin = positiveFinite(input.durationMin, "duration_min", 600);
  const tariff = await getTariffForRegion({
    regionId: pickupRegion.id,
    tariffId: input.tariffId,
    tariffName: input.tariff || input.tariffName
  }, executor);
  const estimatedPrice = calculateOrderPrice(tariff, distanceKm, durationMin);
  const pricingSnapshot = buildPricingSnapshot({
    region: pickupRegion,
    tariff,
    distanceKm,
    durationMin,
    estimatedPrice
  });
  const serviceCommission = Math.round(estimatedPrice * Number(tariff.service_commission_percent) / 100);

  return {
    region: pickupRegion,
    regionId: pickupRegion.id,
    tariff,
    estimatedPrice,
    serviceCommission,
    pricingSnapshot,
    publicEstimate: {
      regionId: pickupRegion.id,
      region: publicRegion(pickupRegion),
      tariff: publicTariff(tariff),
      estimatedPrice,
      pricing: pricingSnapshot
    }
  };
}

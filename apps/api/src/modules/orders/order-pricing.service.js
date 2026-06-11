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

function nonNegativeFinite(value, name, max) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new AppError(`${name} is outside allowed bounds`, 400, "INVALID_ROUTE_METRICS");
  }
  return parsed;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0));
}

export function calculatePricingComponents(tariff, { distanceKm, durationMin, waitingMinutes = 0, includeCancellationFee = false }) {
  const basePrice = Number(tariff.base_price);
  const pricePerKm = Number(tariff.price_per_km);
  const pricePerMinute = Number(tariff.price_per_minute);
  const minimumPrice = Number(tariff.min_price);
  const surgeMultiplier = Number(tariff.surge_multiplier ?? 1);
  const includedKm = Number(tariff.included_km ?? 0);
  const includedMinutes = Number(tariff.included_minutes ?? 0);
  const freeWaitingMinutes = Number(tariff.free_waiting_minutes ?? 0);
  const waitingPricePerMinute = Number(tariff.waiting_price_per_minute ?? 0);
  const cancellationFee = includeCancellationFee ? Number(tariff.cancellation_fee ?? 0) : 0;
  const zoneSurcharge = Number(tariff.zone_surcharge ?? 0);
  const nightCoefficient = Number(tariff.night_coefficient ?? 1);
  const demandCoefficient = Number(tariff.demand_coefficient ?? 1);
  const serviceCommissionPercent = Number(tariff.service_commission_percent ?? 0);
  const billableDistanceKm = Math.max(0, distanceKm - includedKm);
  const billableDurationMin = Math.max(0, durationMin - includedMinutes);
  const raw = basePrice + billableDistanceKm * pricePerKm + billableDurationMin * pricePerMinute + zoneSurcharge;
  const surged = raw * surgeMultiplier * nightCoefficient * demandCoefficient;
  const withMinimum = Math.max(minimumPrice, surged);
  const billableWaitingMinutes = Math.max(0, waitingMinutes - freeWaitingMinutes);
  const waitingPrice = billableWaitingMinutes * waitingPricePerMinute;
  const finalPrice = roundCurrency(withMinimum + waitingPrice + cancellationFee);
  const serviceCommission = roundCurrency(finalPrice * serviceCommissionPercent / 100);

  return {
    rawPrice: roundCurrency(raw),
    surgePrice: roundCurrency(surged),
    withMinimumPrice: roundCurrency(withMinimum),
    waitingPrice: roundCurrency(waitingPrice),
    finalPrice,
    serviceCommission,
    driverEarning: roundCurrency(finalPrice - serviceCommission),
    formulaParts: {
      basePrice,
      pricePerKm,
      pricePerMinute,
      minimumPrice,
      surgeMultiplier,
      nightCoefficient,
      demandCoefficient,
      includedKm,
      includedMinutes,
      billableDistanceKm,
      billableDurationMin,
      zoneSurcharge,
      distanceKm,
      durationMin,
      freeWaitingMinutes,
      waitingMinutes,
      billableWaitingMinutes,
      waitingPricePerMinute,
      cancellationFee,
      serviceCommissionPercent
    }
  };
}

export function calculateOrderPrice(tariff, distanceKm, durationMin) {
  return calculatePricingComponents(tariff, { distanceKm, durationMin }).finalPrice;
}

export function buildPricingSnapshot({ region, tariff, distanceKm, durationMin, waitingMinutes = 0, components }) {
  return {
    regionId: region.id,
    tariffId: tariff.id,
    tariffName: tariff.name,
    tariffDisplayName: tariff.display_name || tariff.name,
    basePrice: Number(tariff.base_price),
    pricePerKm: Number(tariff.price_per_km),
    pricePerMinute: Number(tariff.price_per_minute),
    minimumPrice: Number(tariff.min_price),
    surgeMultiplier: Number(tariff.surge_multiplier ?? 1),
    includedKm: Number(tariff.included_km ?? 0),
    includedMinutes: Number(tariff.included_minutes ?? 0),
    zoneSurcharge: Number(tariff.zone_surcharge ?? 0),
    intercityOverride: tariff.intercity_override === null || tariff.intercity_override === undefined ? null : Number(tariff.intercity_override),
    nightCoefficient: Number(tariff.night_coefficient ?? 1),
    demandCoefficient: Number(tariff.demand_coefficient ?? 1),
    noShowFee: Number(tariff.no_show_fee ?? 0),
    freeWaitingMinutes: Number(tariff.free_waiting_minutes ?? 0),
    waitingPricePerMinute: Number(tariff.waiting_price_per_minute ?? 0),
    distanceKm,
    durationMin,
    waitingMinutes,
    serviceCommissionPercent: Number(tariff.service_commission_percent),
    estimatedPrice: components.finalPrice,
    finalPrice: components.finalPrice,
    serviceCommission: components.serviceCommission,
    driverEarning: components.driverEarning
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
  const waitingMinutes = nonNegativeFinite(input.waitingMinutes, "waiting_minutes", 1440);
  const tariff = await getTariffForRegion({
    regionId: pickupRegion.id,
    tariffId: input.tariffId,
    tariffName: input.tariff || input.tariffName
  }, executor);
  const components = calculatePricingComponents(tariff, { distanceKm, durationMin, waitingMinutes });
  const estimatedPrice = components.finalPrice;
  const pricingSnapshot = buildPricingSnapshot({
    region: pickupRegion,
    tariff,
    distanceKm,
    durationMin,
    waitingMinutes,
    components
  });

  return {
    region: pickupRegion,
    regionId: pickupRegion.id,
    tariff,
    estimatedPrice,
    serviceCommission: components.serviceCommission,
    driverEarning: components.driverEarning,
    pricingSnapshot,
    publicEstimate: {
      regionId: pickupRegion.id,
      region: publicRegion(pickupRegion),
      tariff: publicTariff(tariff),
      estimatedPrice,
      finalPrice: estimatedPrice,
      pricing: pricingSnapshot
    }
  };
}

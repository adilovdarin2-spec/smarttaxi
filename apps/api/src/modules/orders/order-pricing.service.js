import { AppError } from "../../common/errors.js";
import { findActiveRegionForPoint, normalizePoint, publicRegion } from "../regions/regions.service.js";
import { getTariffForRegion, publicTariff } from "../tariffs/tariffs.service.js";
import { publicIntercityRoute, resolveIntercityRoute } from "../intercity/intercity-routes.service.js";

async function resolveActiveRegionForPoint(pointInput, failureCode, executor) {
  const point = normalizePoint(pointInput);
  // Delegates to regions.service.js's findActiveRegionForPoint, which
  // resolves overlapping region boundaries by nearest center. This function
  // used to be a third independent copy that hard-failed with
  // REGION_AMBIGUOUS whenever a point matched more than one region -- and
  // since this is what actually prices every real order (prepareOrderPricing
  // below), that meant real bookings with a pickup/dropoff in one of the many
  // overlap zones among the Мақтаарал-district towns could never be created
  // at all, not just get a wrong region assigned.
  const region = await findActiveRegionForPoint(point, executor);
  if (!region) throw new AppError("Point is outside active service regions", 403, failureCode);
  return region;
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

// City tariffs are often deliberately flat for a short ride.  Reusing such
// a tariff unchanged for a 70 km journey would quote a clearly wrong 700 ₸.
// The intercity route owns the distance/minimum policy; the regular tariff
// still supplies its service commission, cashback and waiting rules.
export function intercityTariff(tariff, intercityRoute) {
  if (!intercityRoute) return tariff;
  const routeRate = Number(intercityRoute.price_per_km_override);
  const tariffRate = Number(tariff.price_per_km);
  const routeMinimum = Number(intercityRoute.min_price_override);
  const tariffIntercityMinimum = Number(tariff.intercity_override);
  const regularMinimum = Number(tariff.min_price);
  return {
    ...tariff,
    base_price: Number(tariff.base_price || 0) + Number(intercityRoute.base_surcharge_kzt || 0),
    // A route must always be able to quote a distance-based price, even if
    // its city tariff is flat.  The migration supplies 140 ₸/km as the safe
    // default and an owner can tune each route later.
    price_per_km: Number.isFinite(routeRate) && routeRate >= 0
      ? routeRate
      : (Number.isFinite(tariffRate) && tariffRate > 0 ? tariffRate : 140),
    min_price: Number.isFinite(tariffIntercityMinimum) && tariffIntercityMinimum > 0
      ? tariffIntercityMinimum
      : (Number.isFinite(routeMinimum) && routeMinimum > 0 ? routeMinimum : Math.max(1800, regularMinimum || 0))
  };
}

// Mirrors the mobile app's "своя цена" price-adjuster stepper bounds so the
// server rejects anything the UI shouldn't have let the rider reach in the
// first place. Pure function (no DB import) so it can be unit-tested
// directly instead of only through orders.routes.js.
//
// Negotiation remains useful without letting a long trip be officially
// recorded for a token amount.  The bounds move with the server-computed
// estimate: up to 30% down and 50% up, rounded to a rider-friendly 50 ₸.
// A small absolute floor still keeps short, low-price trips usable.
export function offeredPriceBounds(estimatedPrice) {
  const estimate = Math.max(0, Math.round(Number(estimatedPrice) || 0));
  const roundUpToStep = (value) => Math.ceil(value / 50) * 50;
  const roundDownToStep = (value) => Math.floor(value / 50) * 50;
  const minAllowed = Math.max(200, roundUpToStep(estimate * 0.7));
  const maxAllowed = Math.max(
    minAllowed,
    Math.min(1_000_000, roundDownToStep(estimate * 1.5)),
  );
  return { minAllowed, maxAllowed };
}

export function buildPricingSnapshot({ region, destinationRegion = region, tariff, distanceKm, durationMin, waitingMinutes = 0, components, intercityRoute = null }) {
  const basePrice = Number(tariff.base_price);
  const pricePerKm = Number(tariff.price_per_km);
  const pricePerMinute = Number(tariff.price_per_minute);
  const minimumPrice = Number(tariff.min_price);
  const fixedPriceKzt = pricePerKm === 0 && pricePerMinute === 0
    ? Math.max(basePrice, minimumPrice)
    : null;
  return {
    regionId: region.id,
    destinationRegionId: destinationRegion.id,
    isIntercity: Boolean(intercityRoute),
    intercityRouteId: intercityRoute?.id || null,
    intercity: publicIntercityRoute(intercityRoute),
    tariffId: tariff.id,
    tariffName: tariff.name,
    tariffDisplayName: tariff.display_name || tariff.name,
    basePrice,
    pricePerKm,
    pricePerMinute,
    minimumPrice,
    fixedPriceKzt,
    pricingType: fixedPriceKzt ? "fixed" : "formula",
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

  const intercityRoute = await resolveIntercityRoute({
    originRegionId: pickupRegion.id,
    destinationRegionId: dropoffRegion.id
  }, executor);

  const distanceKm = positiveFinite(input.distanceKm, "distance_km", intercityRoute ? Number(intercityRoute.max_distance_km) : 300);
  const durationMin = positiveFinite(input.durationMin, "duration_min", intercityRoute ? Number(intercityRoute.max_duration_min) : 600);
  const waitingMinutes = nonNegativeFinite(input.waitingMinutes, "waiting_minutes", 1440);
  const tariff = await getTariffForRegion({
    regionId: pickupRegion.id,
    tariffId: input.tariffId,
    tariffName: input.tariff || input.tariffName
  }, executor);
  const pricedTariff = intercityTariff(tariff, intercityRoute);
  const components = calculatePricingComponents(pricedTariff, { distanceKm, durationMin, waitingMinutes });
  const estimatedPrice = components.finalPrice;
  const pricingSnapshot = buildPricingSnapshot({
    region: pickupRegion,
    destinationRegion: dropoffRegion,
    tariff: pricedTariff,
    distanceKm,
    durationMin,
    waitingMinutes,
    components,
    intercityRoute
  });

  return {
    region: pickupRegion,
    regionId: pickupRegion.id,
    destinationRegion: dropoffRegion,
    destinationRegionId: dropoffRegion.id,
    isIntercity: Boolean(intercityRoute),
    intercityRoute,
    tariff: pricedTariff,
    estimatedPrice,
    serviceCommission: components.serviceCommission,
    driverEarning: components.driverEarning,
    pricingSnapshot,
    publicEstimate: {
      regionId: pickupRegion.id,
      region: publicRegion(pickupRegion),
      destinationRegion: publicRegion(dropoffRegion),
      isIntercity: Boolean(intercityRoute),
      intercity: publicIntercityRoute(intercityRoute),
      tariff: publicTariff(pricedTariff),
      estimatedPrice,
      finalPrice: estimatedPrice,
      pricing: pricingSnapshot
    }
  };
}

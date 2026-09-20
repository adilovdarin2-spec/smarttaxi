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

// What a trip costs.
//
// One number per fare: what a trip inside this town costs, or what the road
// between these two towns costs. Not a meter. The price is known before
// anyone gets in, and if the trip is unusual the rider raises or lowers it
// themselves (offeredPriceBounds below) and the driver can answer with a
// price of their own — that is how a fare is actually agreed here, and it is
// a conversation between two people rather than an argument with a formula.
//
// Distance and duration are still measured and still shown, because a rider
// wants to know how far it is. They no longer decide what it costs.
// Ожидание не может стоить дороже самой поездки.
//
// Раньше счётчик ожидания шёл рядом с километрами, и 50 ₸ за минуту терялись
// в общей сумме. Теперь поездка по району стоит 700 ₸ — и двадцать минут
// ожидания без потолка добавили бы 850 ₸, то есть дороже самой дороги, при
// том что пассажиру назвали цену заранее. Если человек не выходит так долго,
// у водителя есть NO_SHOW, а не растущий счётчик.
export function capWaitingPrice(averagePriceKzt, waitingPrice) {
  const cap = Number(averagePriceKzt);
  const charged = Number(waitingPrice || 0);
  if (!Number.isFinite(cap) || cap <= 0) return roundCurrency(Math.max(0, charged));
  return roundCurrency(Math.min(Math.max(0, charged), cap));
}

export function calculatePricingComponents(tariff, { waitingMinutes = 0, includeCancellationFee = false } = {}) {
  const averagePrice = Number(tariff.average_price_kzt);
  if (!Number.isFinite(averagePrice) || averagePrice <= 0) {
    // Better to refuse than to invent a number: a fare nobody set is not a
    // fare, and quoting a made-up one is how a driver ends up arguing with a
    // rider about money neither of them agreed to.
    throw new AppError(
      "Price is not set for this route yet",
      409,
      "PRICE_NOT_CONFIGURED",
      { tariffId: tariff.id ?? null, tariffName: tariff.name ?? null }
    );
  }
  const freeWaitingMinutes = Number(tariff.free_waiting_minutes ?? 0);
  const waitingPricePerMinute = Number(tariff.waiting_price_per_minute ?? 0);
  const cancellationFee = includeCancellationFee ? Number(tariff.cancellation_fee ?? 0) : 0;
  const serviceCommissionPercent = Number(tariff.service_commission_percent ?? 0);

  // Waiting is not part of the road. It is the rider keeping a driver parked,
  // and it is still charged by the minute after the free window.
  const billableWaitingMinutes = Math.max(0, Number(waitingMinutes || 0) - freeWaitingMinutes);
  const waitingPrice = capWaitingPrice(averagePrice, billableWaitingMinutes * waitingPricePerMinute);

  const finalPrice = roundCurrency(averagePrice + waitingPrice + cancellationFee);
  const serviceCommission = roundCurrency(finalPrice * serviceCommissionPercent / 100);

  return {
    averagePrice: roundCurrency(averagePrice),
    // Kept under their old names so nothing downstream has to be rewritten to
    // read a price: with no meter, all three are the same number.
    rawPrice: roundCurrency(averagePrice),
    surgePrice: roundCurrency(averagePrice),
    withMinimumPrice: roundCurrency(averagePrice),
    waitingPrice: roundCurrency(waitingPrice),
    finalPrice,
    serviceCommission,
    driverEarning: roundCurrency(finalPrice - serviceCommission),
    formulaParts: {
      averagePriceKzt: roundCurrency(averagePrice),
      freeWaitingMinutes,
      waitingMinutes: Number(waitingMinutes || 0),
      billableWaitingMinutes,
      waitingPricePerMinute,
      maxWaitingPrice: roundCurrency(averagePrice),
      cancellationFee,
      serviceCommissionPercent
    }
  };
}

// Distance and duration are accepted and ignored: callers still measure the
// route, and this keeps their call sites honest about that rather than
// pretending the numbers were never there.
export function calculateOrderPrice(tariff) {
  return calculatePricingComponents(tariff).finalPrice;
}

// A trip between two towns is priced by the road, not by the town it starts
// in: Атакент's in-town fare says nothing about what Шымкент costs. The route
// carries its own average, and the town's tariff still supplies the service
// commission, the cashback and the waiting rules.
export function intercityTariff(tariff, intercityRoute) {
  if (!intercityRoute) return tariff;
  const routeAverage = Number(intercityRoute.average_price_kzt);
  if (!Number.isFinite(routeAverage) || routeAverage <= 0) {
    throw new AppError(
      "Price is not set for this intercity route yet",
      409,
      "PRICE_NOT_CONFIGURED",
      { intercityRouteId: intercityRoute.id ?? null }
    );
  }
  return { ...tariff, average_price_kzt: routeAverage };
}

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
  const averagePriceKzt = Number(tariff.average_price_kzt);
  // The old per-kilometre fields are still written down so an order created
  // before the change and one created after can be read side by side. Nothing
  // computes a price from them any more — calculatePricingComponents reads
  // average_price_kzt and nothing else.
  const basePrice = Number(tariff.base_price);
  const pricePerKm = Number(tariff.price_per_km);
  const pricePerMinute = Number(tariff.price_per_minute);
  const minimumPrice = Number(tariff.min_price);
  return {
    averagePriceKzt,
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
    // Kept for older clients that look for it; same number, older name.
    fixedPriceKzt: averagePriceKzt,
    pricingType: "average",
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
    maxWaitingPriceKzt: averagePriceKzt,
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

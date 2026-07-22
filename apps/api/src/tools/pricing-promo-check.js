import assert from "node:assert/strict";
import { calculateOrderPrice, calculatePricingComponents, offeredPriceBounds } from "../modules/orders/order-pricing.service.js";
import { calculatePromoDiscount } from "../modules/orders/promo.service.js";

// --- Tariff pricing: fixed-price tariffs (price_per_km/minute = 0) ---
const fixedTariff = {
  base_price: 700,
  price_per_km: 0,
  price_per_minute: 0,
  min_price: 700,
  surge_multiplier: 1,
  service_commission_percent: 15
};
assert.equal(calculateOrderPrice(fixedTariff, 5.2, 12), 700, "fixed-price tariff must ignore distance/duration");

// --- Tariff pricing: formula-based tariffs ---
const formulaTariff = {
  base_price: 300,
  price_per_km: 100,
  price_per_minute: 20,
  min_price: 500,
  surge_multiplier: 1,
  service_commission_percent: 15
};
// 300 + 5km*100 + 10min*20 = 300 + 500 + 200 = 1000
assert.equal(calculateOrderPrice(formulaTariff, 5, 10), 1000, "formula tariff must sum base + distance + duration");

const belowMinimum = calculateOrderPrice(formulaTariff, 0.5, 1);
assert.equal(belowMinimum, 500, "formula tariff must floor at min_price for very short trips");

const surged = calculatePricingComponents(
  { ...formulaTariff, surge_multiplier: 2 },
  { distanceKm: 5, durationMin: 10 }
);
assert.equal(surged.finalPrice, 2000, "surge multiplier must apply to the whole formula price");

// --- "Своя цена" bidding bounds ---
// Flat floor/ceiling regardless of the estimated price — a rider can always
// drop to 200 KZT or raise with no ceiling of the stepper's own.
const bounds700 = offeredPriceBounds(700);
assert.deepEqual(bounds700, { minAllowed: 200, maxAllowed: 1_000_000 }, "bounds are a flat [200, 1_000_000] regardless of estimated price");

const boundsNearFloor = offeredPriceBounds(150);
assert.deepEqual(boundsNearFloor, { minAllowed: 200, maxAllowed: 1_000_000 }, "bounds do not shift for a low estimated price either");

// --- Promo code discounts ---
const percentPromo = { discount_type: "PERCENT", discount_value: 20, max_discount_kzt: null };
assert.equal(calculatePromoDiscount(percentPromo, 1000), 200, "20% of 1000 must discount 200");

const cappedPromo = { discount_type: "PERCENT", discount_value: 50, max_discount_kzt: 300 };
assert.equal(calculatePromoDiscount(cappedPromo, 1000), 300, "percent discount must be capped by max_discount_kzt");

const fixedPromo = { discount_type: "FIXED", discount_value: 500, max_discount_kzt: null };
assert.equal(calculatePromoDiscount(fixedPromo, 1000), 500, "fixed discount must apply as-is when below order price");

const oversizedFixedPromo = { discount_type: "FIXED", discount_value: 5000, max_discount_kzt: null };
assert.equal(
  calculatePromoDiscount(oversizedFixedPromo, 1000),
  999,
  "a discount must never make the ride free — at most orderPrice - 1"
);

console.log("Pricing/bidding/promo checks ok");

import assert from "node:assert/strict";
import { calculateOrderPrice, calculatePricingComponents, offeredPriceBounds } from "../modules/orders/order-pricing.service.js";
import { calculatePromoDiscount } from "../modules/orders/promo.service.js";

// --- One average fare, not a meter ---
//
// A trip inside a town costs what a trip inside that town costs. The rider
// raises or lowers it themselves if the trip is unusual, and the driver can
// answer with a price of their own — the bidding band below is that
// conversation, and it is now the only thing that moves a fare.
const townTariff = {
  average_price_kzt: 700,
  service_commission_percent: 15
};
assert.equal(calculateOrderPrice(townTariff), 700, "the fare is the town's fare");

// Old per-kilometre fields on the same row must not come back into it.
assert.equal(
  calculateOrderPrice({
    ...townTariff,
    base_price: 300, price_per_km: 100, price_per_minute: 20,
    min_price: 500, surge_multiplier: 2, night_coefficient: 1.5
  }),
  700,
  "no leftover kilometre rate, minimum or multiplier may move the fare"
);

const components = calculatePricingComponents(townTariff);
assert.equal(components.finalPrice, 700);
assert.equal(components.serviceCommission, 105, "commission is a share of the fare");
assert.equal(components.driverEarning, 595, "and the rest is the driver's");
assert.equal(components.formulaParts.averagePriceKzt, 700, "the fare is written down as what it is");

// --- "Своя цена" bidding bounds ---
// Flat floor/ceiling regardless of the estimated price — a rider can always
// drop to 200 KZT or raise with no ceiling of the stepper's own.
const bounds700 = offeredPriceBounds(700);
assert.deepEqual(bounds700, { minAllowed: 500, maxAllowed: 1050 }, "a 700 KZT estimate gets a 70–150% negotiation band");

const boundsNearFloor = offeredPriceBounds(150);
assert.deepEqual(boundsNearFloor, { minAllowed: 200, maxAllowed: 200 }, "a low estimate never drops below the absolute 200 KZT floor");

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

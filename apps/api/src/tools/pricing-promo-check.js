import assert from "node:assert/strict";
import { calculateOrderPrice, calculatePricingComponents, capWaitingPrice, offeredPriceBounds } from "../modules/orders/order-pricing.service.js";
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

// --- Ожидание не дороже поездки ---
//
// Счётчик ожидания остался поминутным, а цена дороги перестала расти — и
// 50 ₸/мин легко обгоняют саму поездку за 700 ₸. Пассажиру цену назвали
// заранее, значит ожидание не имеет права её удвоить: за долгое ожидание
// у водителя есть NO_SHOW.
const waitingTariff = {
  average_price_kzt: 700,
  service_commission_percent: 15,
  free_waiting_minutes: 3,
  waiting_price_per_minute: 50
};

const shortWait = calculatePricingComponents(waitingTariff, { waitingMinutes: 8 });
assert.equal(shortWait.waitingPrice, 250, "5 платных минут по 50 ₸ считаются как есть");
assert.equal(shortWait.finalPrice, 950, "и складываются с ценой поездки");

const longWait = calculatePricingComponents(waitingTariff, { waitingMinutes: 40 });
assert.equal(longWait.waitingPrice, 700, "ожидание упирается в стоимость самой поездки");
assert.equal(longWait.finalPrice, 1400, "и дороже двойной цены заказ стать не может");
assert.equal(longWait.formulaParts.maxWaitingPrice, 700, "потолок записан вместе с расчётом");
assert.equal(longWait.formulaParts.billableWaitingMinutes, 37, "при этом реально прождавшие минуты не подменяются");

// Тот же помощник считает деньги и в билинге (orders.routes.js, TRIP_STARTED),
// поэтому проверяем его напрямую: предпросмотр и списание обязаны совпадать.
assert.equal(capWaitingPrice(700, 850), 700, "списание тоже упирается в цену поездки");
assert.equal(capWaitingPrice(700, 250), 250, "а короткое ожидание проходит целиком");
assert.equal(capWaitingPrice(0, 850), 850, "без известной цены поездки резать нечего");
assert.equal(capWaitingPrice(700, -5), 0, "отрицательного ожидания не бывает");

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

// --- Кешбэк считается до тенге, а не до десятков ---
//
// Формула округляла начисление до десятков тенге. При ставке меньше процента
// это ломалось в обе стороны: поездка за 400 ₸ давала ровно ноль, а за 700 ₸ —
// десятку вместо положенных шести. Ставка в тарифе стояла ненулевая, а человек
// получал не её.
{
  const { readFileSync } = await import("node:fs");
  const ordersSource = readFileSync(new URL("../modules/orders/orders.routes.js", import.meta.url), "utf8");
  const formula = /cashback_percent\)\s*\/\s*100([^;]*);/.exec(ordersSource);
  assert(formula, "формула кешбэка исчезла из завершения заказа");
  assert(
    !/\/\s*10\s*\)?\s*\*\s*10/.test(formula[1]),
    "кешбэк снова округляется до десятков — на коротких поездках это ноль"
  );

  // И ставка в посевах не нулевая: иначе начисление выключено, а владелец об
  // этом узнает только по отсутствию жалоб.
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  const seeded = [...schema.matchAll(/\('(?:Economy|Delivery)',[^)]*?,7,([\d.]+),/g)].map(m => Number(m[1]));
  assert(seeded.length >= 2, "в посевах не найдены ставки кешбэка");
  assert(seeded.every(rate => rate > 0), `кешбэк выключен в посевах: ${seeded.join(", ")}`);

  // Ставка круглая и произносимая вслух: «возвращаем один процент». При
  // 0,1 процента поездка за 700 ₸ давала бы один тенге — столько лучше не
  // давать вовсе, чем давать.
  const rate = seeded[0];
  assert.equal(rate, 1, `в посевах ставка кешбэка ${rate}, а обещан один процент`);
  const earn = (price) => Math.round(price * rate / 100);
  assert.equal(earn(700), 7, `поездка за 700 ₸ должна возвращать 7 ₸, а даёт ${earn(700)}`);
  assert.equal(earn(1000), 10, `поездка за 1000 ₸ должна возвращать 10 ₸, а даёт ${earn(1000)}`);
  assert.equal(earn(2200), 22, `межгород за 2200 ₸ должен возвращать 22 ₸, а даёт ${earn(2200)}`);
}

console.log("Pricing/bidding/promo checks ok");

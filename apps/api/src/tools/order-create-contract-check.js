import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";
import { spendOrderCashback, trySpendOrderCashback } from "../modules/orders/cashback-payment.service.js";

const clientPayload = {
  riderName: "Клиент SmartTaxi",
  riderPhone: "+77000000000",
  pickupText: "Центр Атакента",
  dropoffText: "Рынок",
  pickupLat: 40.84719,
  pickupLng: 68.503834,
  dropoffLat: 40.841873,
  dropoffLng: 68.504185,
  tariff: "Economy",
  paymentMethod: "CASH",
  distanceKm: 2.4,
  durationMin: 6,
  notes: ""
};

const root = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const ordersSource = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const cashbackSource = readFileSync(join(root, "modules", "orders", "cashback-payment.service.js"), "utf8");
const webSourceFiles = [
  join(repoRoot, "apps", "web", "src", "main.jsx"),
  join(repoRoot, "apps", "web", "src", "features", "client", "ClientApp.jsx"),
  join(repoRoot, "apps", "web", "src", "core", "data.js")
];
const hasWebSource = webSourceFiles.every(existsSync);
const webSource = hasWebSource
  ? webSourceFiles.map(file => readFileSync(file, "utf8")).join("\n")
  : "";

// Keep the hand-written INSERT contract mechanically honest.  A new order
// column previously got added without removing the old trailing value
// placeholder, which only surfaced as a 500 in the live lifecycle smoke.
// This small source-level check catches the mismatch before Docker is even
// involved, while the lifecycle smoke continues to validate the real query.
const orderInsert = ordersSource.match(
  /INSERT INTO orders\(([^]+?)\)\s*VALUES\(([^]+?)\)\s*RETURNING \*/m
);
assert.ok(orderInsert, "orders INSERT statement must be present");
const orderInsertColumns = orderInsert[1].split(",").map(value => value.trim()).filter(Boolean);
const orderInsertValues = orderInsert[2].split(",").map(value => value.trim()).filter(Boolean);
assert.equal(
  orderInsertValues.length,
  orderInsertColumns.length,
  "orders INSERT has one value expression for every target column"
);

const requiredKeys = [
  "riderName",
  "riderPhone",
  "pickupText",
  "dropoffText",
  "pickupLat",
  "pickupLng",
  "dropoffLat",
  "dropoffLng",
  "tariff",
  "paymentMethod",
  "distanceKm",
  "durationMin",
  "notes"
];

for (const key of requiredKeys) {
  if (!(key in clientPayload)) throw new Error(`Order create smoke payload missing field: ${key}`);
  if (!ordersSource.includes(`${key}:`)) throw new Error(`Backend CreateOrder schema missing field: ${key}`);
}

if (hasWebSource) {
  for (const key of requiredKeys) {
    if (!webSource.includes(key)) throw new Error(`Frontend order payload missing field: ${key}`);
  }
} else {
  console.log("Order-create web contract check skipped: apps/web is not present in this runtime image");
}

if (!/paymentMethod:\s*z\.enum\(\["CASH", "KASPI", "CARD", "CASHBACK"/.test(ordersSource)) {
  throw new Error("Backend CreateOrder payment methods do not include expected V1 methods");
}

if (!ordersSource.includes("cashback_used")) throw new Error("Cashback order amount is not persisted");
if (!cashbackSource.includes("ORDER_PAYMENT")) throw new Error("Cashback spend ledger entry is missing");
if (!cashbackSource.includes("INSUFFICIENT_CASHBACK")) throw new Error("Cashback balance guard is missing");

const cashbackCalls = [];
const remainingKzt = await spendOrderCashback({
  clientId: "client-1",
  orderId: "order-1",
  amountKzt: 1250,
  executor: {
    async query(sql, params) {
      cashbackCalls.push({ sql, params });
      if (/UPDATE clients/i.test(sql)) return { rows: [{ cashback_balance: 750 }] };
      return { rows: [] };
    }
  }
});
assert.equal(remainingKzt, 750);
assert.deepEqual(cashbackCalls[0].params, [1250, "client-1"]);
assert.deepEqual(cashbackCalls[1].params, ["client-1", "order-1", -1250, 750]);

await assert.rejects(
  spendOrderCashback({
    clientId: "client-2",
    orderId: "order-2",
    amountKzt: 2000,
    executor: { async query() { return { rows: [] }; } }
  }),
  error => error?.code === "INSUFFICIENT_CASHBACK" && error?.status === 409
);

assert.equal(await trySpendOrderCashback({
  clientId: "client-3",
  orderId: "order-3",
  amountKzt: 100,
  executor: { async query() { return { rows: [] }; } }
}), null);
assert.match(ordersSource, /payment_method='MIXED'/, "Waiting surcharge fallback is not wired");

if (hasWebSource && /paymentMethod:\s*z\.enum/.test(ordersSource) && !/paymentMethod:\s*(key|payment\.id)/.test(webSource)) {
  throw new Error("Frontend payment selector is not wired to order payload");
}

if (clientPayload.paymentMethod !== "CASH") throw new Error("Order create smoke payment method mismatch");
if (clientPayload.tariff !== "Economy") throw new Error("Order create smoke tariff mismatch");
if (clientPayload.pickupText === clientPayload.dropoffText) throw new Error("Order create smoke should use different pickup/dropoff");

function calcPrice(tariff, distanceKm, durationMin) {
  const raw = Number(tariff.base_price) + Number(tariff.price_per_km) * distanceKm + Number(tariff.price_per_minute) * durationMin;
  return Math.max(Number(tariff.min_price), Math.round(raw / 10) * 10);
}

const price = calcPrice({
  base_price: 700,
  price_per_km: 120,
  price_per_minute: 25,
  min_price: 1200
}, clientPayload.distanceKm, clientPayload.durationMin);

if (!Number.isFinite(price) || price < 1200) throw new Error("Order create contract price calculation failed");

console.log("Order create contract check ok");

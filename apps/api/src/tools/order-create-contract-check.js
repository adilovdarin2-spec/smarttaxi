import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const clientPayload = {
  riderName: "Клиент SmartTaxi",
  riderPhone: "+77000000000",
  pickupText: "Центр Атакента",
  dropoffText: "Рынок",
  pickupLat: 42.3167,
  pickupLng: 69.5958,
  dropoffLat: 42.3139,
  dropoffLng: 69.5916,
  tariff: "Economy",
  paymentMethod: "CASH",
  distanceKm: 2.4,
  durationMin: 6,
  notes: ""
};

const root = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const ordersSource = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const webSource = readFileSync(join(repoRoot, "apps", "web", "src", "main.jsx"), "utf8");

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

for (const key of requiredKeys) {
  if (!webSource.includes(key)) throw new Error(`Frontend order payload missing field: ${key}`);
}

if (!/paymentMethod:\s*z\.enum\(\["CASH", "KASPI", "CARD"/.test(ordersSource)) {
  throw new Error("Backend CreateOrder payment methods do not include expected V1 methods");
}

if (!/const sameRoute =/.test(webSource) || !/sameRoute \|\| loading/.test(webSource)) {
  throw new Error("Frontend must block same pickup/dropoff before order create");
}

if (/paymentMethod:\s*z\.enum/.test(ordersSource) && !/paymentMethod:\s*key/.test(webSource)) {
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

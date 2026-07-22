import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const adminRoutes = readFileSync(join(root, "modules", "admin", "admin.routes.js"), "utf8");
const tariffsService = readFileSync(join(root, "modules", "tariffs", "tariffs.service.js"), "utf8");
const pricingService = readFileSync(join(root, "modules", "orders", "order-pricing.service.js"), "utf8");
const adminAppPath = join(root, "..", "..", "web", "src", "features", "admin", "AdminApp.jsx");
const adminApiPath = join(root, "..", "..", "web", "src", "lib", "mvpApi.js");
const hasWebSource = existsSync(adminAppPath) && existsSync(adminApiPath);
const adminApp = hasWebSource ? readFileSync(adminAppPath, "utf8") : "";
const adminApi = hasWebSource ? readFileSync(adminApiPath, "utf8") : "";

assert.match(schema, /UNIQUE\(region_id, name\)/i, "tariffs must keep region-scoped identity");
assert.doesNotMatch(schema, /name TEXT UNIQUE NOT NULL/i, "tariff name must not be globally unique");
[
  "display_name",
  "description",
  "free_waiting_minutes",
  "waiting_price_per_minute",
  "cancellation_fee",
  "included_km",
  "included_minutes",
  "no_show_fee",
  "zone_surcharge",
  "night_coefficient",
  "demand_coefficient",
  "sort_order"
].forEach(column => assert.match(schema, new RegExp(column, "i"), `tariff schema missing ${column}`));

assert.match(migrations, /DROP CONSTRAINT IF EXISTS tariffs_name_key/i, "migration must drop global tariff name constraint");
assert.match(migrations, /ON CONFLICT \(region_id, name\)/i, "seed tariffs must upsert per region");

[
  'router.get("/tariffs"',
  'router.get("/tariffs/analytics"',
  'router.get("/tariffs/:id/analytics"',
  'router.post("/tariffs/preview-price"',
  'router.post("/tariffs"',
  'router.patch("/tariffs/:id"',
  'router.patch("/tariffs/:id/status"'
].forEach(route => assert.match(adminRoutes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `admin tariff route missing ${route}`));

[
  "listAdminTariffAnalytics",
  "pricing_snapshot",
  "TRIP_COMPLETED",
  "CANCELLED_BY_CLIENT",
  "average_final_price",
  "service_commission_total",
  "driver_earning_total",
  "dateFrom",
  "dateTo"
].forEach(token => assert(
  adminRoutes.includes(token) || tariffsService.includes(token),
  `tariff analytics implementation missing ${token}`
));

[
  "billableDistanceKm",
  "billableDurationMin",
  "nightCoefficient",
  "demandCoefficient",
  "waitingPrice",
  "serviceCommission",
  "driverEarning",
  "freeWaitingMinutes",
  "waitingPricePerMinute"
].forEach(token => assert(pricingService.includes(token), `pricing service missing ${token}`));

if (hasWebSource) {
[
  "getAdminTariffs",
  "createAdminTariff",
  "updateAdminTariff",
  "setAdminTariffStatus",
  "getAdminTariffAnalytics",
  "previewAdminTariffPrice"
].forEach(fn => assert(adminApi.includes(`function ${fn}`), `Admin tariff API wrapper missing ${fn}`));

[
  "Добавить тариф",
  "Аналитика тарифов",
  "Сегодня",
  "7 дней",
  "30 дней",
  "Средняя цена",
  "Комиссия сервиса",
  "По этому тарифу пока нет завершённых заказов",
  "Не удалось загрузить аналитику тарифов",
  "Предпросмотр цены",
  "Итоговая стоимость",
  "Комиссия сервиса",
  "Доход водителя",
  "Тарифы пока не настроены"
].forEach(copy => assert(adminApp.includes(copy), `Admin tariff UI missing ${copy}`));

[
  "DRIVER_ORDERS",
  "OPERATOR_TICKETS",
  "Lorem ipsum",
  "TODO",
  "╨",
  "╤",
  "тЖТ"
].forEach(token => assert(!adminApp.includes(token), `Admin tariff UI contains forbidden token ${token}`));
} else {
  console.warn("Admin tariff web-source checks skipped: apps/web is not present in this runtime image");
}

console.log("Admin tariff management checks ok");

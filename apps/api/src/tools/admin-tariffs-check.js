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

// What the fare is made of now: one average, plus waiting, minus the
// service's share. No kilometres, no minutes of driving, no multipliers.
[
  "averagePriceKzt",
  "waitingPrice",
  "serviceCommission",
  "driverEarning",
  "freeWaitingMinutes",
  "waitingPricePerMinute"
].forEach(token => assert(pricingService.includes(token), `pricing service missing ${token}`));

// And what must never come back into it. A leftover kilometre rate in the
// formula is the whole problem this change removed: a price nobody could
// predict before getting in.
{
  const start = pricingService.indexOf("export function calculatePricingComponents(");
  const body = pricingService.slice(start, pricingService.indexOf("\nexport ", start + 1));
  // Prefixed with `tariff.` on purpose: waiting_price_per_minute is a real
  // charge that stays, and a bare "price_per_minute" would match inside it.
  [
    "tariff.price_per_km",
    "tariff.price_per_minute",
    "tariff.surge_multiplier",
    "tariff.night_coefficient",
    "tariff.demand_coefficient",
    "tariff.included_km",
    "tariff.included_minutes",
    "tariff.zone_surcharge",
    "tariff.min_price",
    "tariff.base_price",
    "distanceKm",
    "durationMin"
  ].forEach(token => assert(
    !body.includes(token),
    `the fare must not read ${token} — it is one number the owner sets, not a meter`
  ));
}

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

// --- Комиссия: одно число, и оно совпадает с офертой ---
//
// В legal-content.json водителю обещаны 7 процентов с заказа. Пока в тарифах
// стояло 15, подписанное и списываемое расходились — а увидел бы это водитель
// уже после поездки.
const legalPath = join(root, "..", "..", "web", "src", "legal", "legal-content.json");
if (hasWebSource && existsSync(legalPath)) {
  const legal = readFileSync(legalPath, "utf8");
  const promised = [...legal.matchAll(/комиссия Платформы составляет (\d+) процент/g)]
    .map(match => Number(match[1]))
    .filter(percent => percent > 0);
  assert(promised.length > 0, "оферта должна называть размер комиссии");
  const offerPercent = promised[0];
  assert(
    promised.every(percent => percent === offerPercent),
    `оферта называет разные ставки комиссии: ${[...new Set(promised)].join(", ")}`
  );
  [schema, migrations].forEach((source, index) => {
    const where = index === 0 ? "schema.sql" : "migrations.js";
    const rows = [...source.matchAll(/\('(Economy|Comfort|Business|Delivery)',[^)]*?,(\d+),\d+,\d+,\d+,\d+,\d+,\d+,(?:true|false)\)/g)];
    assert(rows.length === 4, `${where}: ожидались 4 посеянных тарифа, найдено ${rows.length}`);
    rows.forEach(([, name, percent]) => assert.equal(
      Number(percent),
      offerPercent,
      `${where}: тариф ${name} сеется с комиссией ${percent}%, а оферта обещает ${offerPercent}%`
    ));
  });
}

// Посев не имеет права переписывать комиссию у существующего тарифа: иначе
// владелец меняет её в панели, а следующий деплой молча возвращает посеянную.
[schema, migrations].forEach((source, index) => {
  const where = index === 0 ? "schema.sql" : "migrations.js";
  assert(
    !/service_commission_percent=EXCLUDED\.service_commission_percent/.test(source),
    `${where}: посев перезаписывает комиссию — правка владельца не переживёт деплой`
  );
});

// Разовая правка должна остаться разовой.
assert.match(
  migrations,
  /CREATE TABLE IF NOT EXISTS schema_one_time_changes/,
  "нужна отметка о выполненных однократных правках"
);
["service_commission_7_percent", "default_commission_7_percent"].forEach(claim => {
  assert(migrations.includes(claim), `однократная правка ${claim} потерялась`);
  const statement = migrations.slice(
    migrations.indexOf(claim) - 400,
    migrations.indexOf(claim) + 600
  );
  assert.match(
    statement,
    /INSERT INTO schema_one_time_changes[\s\S]*ON CONFLICT \(name\) DO NOTHING/,
    `${claim} должна выполняться под отметкой, иначе она повторится при каждом запуске`
  );
});

// The road between two towns has its own price, set in its own place. Without
// this screen the 156 seeded fares would be whatever the migration guessed,
// with nowhere for the owner to correct them.
[
  "getAdminIntercityRoutes",
  "updateAdminIntercityRoute"
].forEach(fn => assert(adminApi.includes(`function ${fn}`), `Admin intercity API wrapper missing ${fn}`));

[
  "function IntercityPage(",
  "Межгород",
  "averagePriceKzt",
  "Цена поездки, ₸",
  "Направлений пока нет",
  "Цена направления обновлена"
].forEach(copy => assert(adminApp.includes(copy), `Admin intercity UI missing ${copy}`));

// The tariff editor must stay a single price. A kilometre field here is how
// the meter comes back: the form writes straight into the tariff row.
[
  "pricePerKm",
  "pricePerMinute",
  "surgeMultiplier",
  "pricePerKmOverride",
  "minPriceOverride",
  "baseSurchargeKzt"
].forEach(token => assert(
  !adminApp.includes(token),
  `Admin UI still edits ${token} — the fare is one number, not a meter`
));

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

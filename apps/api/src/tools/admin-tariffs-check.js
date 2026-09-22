import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
    // Ставки — не обязательно целые: кешбэк 0,8 процента тоже число.
    const rows = [...source.matchAll(/\('(Economy|Comfort|Business|Delivery)',[^)]*?,([\d.]+),[\d.]+,[\d.]+,[\d.]+,[\d.]+,[\d.]+,[\d.]+,(?:true|false)\)/g)];
    // Два тарифа: поездка и посылка. Комфорта и Бизнеса в сервисе нет.
    assert.deepEqual(
      rows.map(([, name]) => name).sort(),
      ["Delivery", "Economy"],
      `${where}: сеяться должны только Эконом и Доставка`
    );
    rows.forEach(([, name, percent]) => assert.equal(
      Number(percent),
      offerPercent,
      `${where}: тариф ${name} сеется с комиссией ${percent}%, а оферта обещает ${offerPercent}%`
    ));
  });
}

// Посев следит только за тем, что нужные строки существуют. Всё остальное в
// тарифе — цена, комиссия, ожидание, включён он или нет — принадлежит
// владельцу: иначе он правит тариф в панели, а следующий деплой молча
// возвращает посеянное.
[schema, migrations].forEach((source, index) => {
  const where = index === 0 ? "schema.sql" : "migrations.js";
  const seedStart = source.indexOf("INSERT INTO tariffs(");
  assert(seedStart > -1, `${where}: посев тарифов потерялся`);
  const seedEnd = index === 0
    ? source.indexOf(";", seedStart)
    : source.indexOf("`,", seedStart);
  const seed = source.slice(seedStart, seedEnd);
  assert.match(
    seed,
    /ON CONFLICT \(region_id, name\) DO NOTHING/,
    `${where}: посев переписывает существующий тариф — правка владельца не переживёт деплой`
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

// Денежные рычаги, которые сервер умеет, а панель должна давать крутить.
//
// Кешбэк и бонус за приглашение работали на сервере, но полей для них в
// панели не было: кешбэк стоял на нуле везде, хотя приложение обещает
// «кешбэк за ваши поездки», а каждое приглашение стоило 500 ₸ без способа это
// увидеть или выключить иначе как через базу.
[
  "cashbackPercent",
  "Кешбэк за поездку, %",
  "referralBonusKzt",
  "Бонус за приглашение, ₸"
].forEach(field => assert(
  adminApp.includes(field),
  `владелец не может настроить ${field} из панели`
));

// Новый тариф предлагает ту же комиссию, что названа в оферте. Здесь оставалось 15
// от старой комиссии — тариф, созданный из панели, тихо уходил бы с комиссией
// втрое больше подписанной.
{
  const legal = readFileSync(join(root, "..", "..", "web", "src", "legal", "legal-content.json"), "utf8");
  const offerPercent = Number(
    /комиссия Платформы составляет (\d+) процент/.exec(legal.replace(/составляет 0 процент/g, ""))?.[1]
  );
  assert(offerPercent > 0, "в оферте не найдена комиссия");
  assert(
    adminApp.includes(`service_commission_percent ?? ${offerPercent})`),
    `форма нового тарифа должна предлагать ${offerPercent}% — столько названо в оферте`
  );
}

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

// --- Удалённый тариф не должен вернуться через клиентский код ---
//
// В сервисе два тарифа: Эконом и Доставка. Комфорт и Бизнес убраны вместе с
// их ценами. В apps/web оставался файл-сирота, который никто не подключал, а
// внутри лежал готовый прайс на оба удалённых тарифа — такое однажды
// импортируют обратно, и пассажир увидит тариф, которого нет, по ценам,
// которых никто не назначал.
//
// Подписи вроде `Comfort: "Комфорт"` — не прайс: если сервер вдруг вернёт
// старую строку, её лучше показать по-человечески. Ловим именно цены.
if (hasWebSource) {
  const webSrc = join(root, "..", "..", "web", "src");
  const priced = [];
  const walkWeb = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walkWeb(full); continue; }
      if (!/\.(js|jsx)$/.test(full)) continue;
      const src = readFileSync(full, "utf8");
      for (const line of src.split("\n")) {
        if (!/(Comfort|Business|Комфорт|Бизнес)/.test(line)) continue;
        if (!/(price_per_km|pricePerKm|min_price|minPrice|base_price|basePrice)/.test(line)) continue;
        priced.push(`${full.replace(webSrc, "apps/web/src")}: ${line.trim().slice(0, 80)}`);
      }
    }
  };
  walkWeb(webSrc);
  assert.deepEqual(
    priced,
    [],
    `в вебе снова заведены цены удалённых тарифов:
  ${priced.join("\n  ")}`
  );
}

console.log("Admin tariff management checks ok");

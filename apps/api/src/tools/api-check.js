import "./syntax-check.js";
import "./auth-seed-check.js";
import "./regions-check.js";
import "./driver-approval-check.js";
import "./tariffs-orders-check.js";
import "./dispatch-realtime-check.js";
import "./routing-location-check.js";
import "./admin-tariffs-check.js";
import "./finance-ledger-check.js";
import "./road-alerts-check.js";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const adminAppUrl = new URL("../../../web/src/features/admin/AdminApp.jsx", import.meta.url);
const adminApiUrl = new URL("../../../web/src/lib/mvpApi.js", import.meta.url);
const hasWebSource = fs.existsSync(adminAppUrl) && fs.existsSync(adminApiUrl);
const adminApp = hasWebSource ? fs.readFileSync(adminAppUrl, "utf8") : "";
const adminApi = hasWebSource ? fs.readFileSync(adminApiUrl, "utf8") : "";

if (hasWebSource) {
[
  "Главная",
  "Регионы",
  "Водители",
  "Заявки",
  "Заказы",
  "Тарифы",
  "Финансы",
  "Настройки",
  "Журнал",
  "Поддержка"
].forEach(section => assert(adminApp.includes(section), `Admin shell missing ${section}`));

[
  "getAdminDashboard",
  "getAdminRegions",
  "createAdminRegion",
  "updateAdminRegion",
  "toggleAdminRegion",
  "getAdminDrivers",
  "getAdminDriverDetail",
  "blockAdminDriver",
  "unblockAdminDriver",
  "getAdminDriverRegions",
  "updateAdminDriverRegion",
  "getAdminDriverApplications",
  "updateAdminDriverApplication",
  "getAdminTariffs",
  "createAdminTariff",
  "updateAdminTariff",
  "setAdminTariffStatus",
  "getAdminTariffAnalytics",
  "previewAdminTariffPrice",
  "getAdminFinanceSummary",
  "getAdminFinanceDriverDebts",
  "getAdminFinanceReports",
  "getAdminFinanceTransactions",
  "adjustAdminDriverDebt",
  "exportAdminFinanceTransactionsCsv",
  "getAdminOrders",
  "getAdminAudit",
  "getAdminSettings"
].forEach(fn => assert(adminApi.includes(`function ${fn}`), `Admin API wrapper missing ${fn}`));

[
  "DRIVER_ORDERS",
  "OPERATOR_TICKETS",
  "Lorem ipsum",
  "╨",
  "╤",
  "тЖТ"
].forEach(token => assert(!adminApp.includes(token), `Admin shell contains forbidden token ${token}`));

[
  "Когда клиент или водитель отправит обращение, оно появится здесь для обработки.",
  "Нет данных для отображения",
  "Не удалось загрузить данные",
  "Текущий аккаунт не имеет доступа к этой панели"
].forEach(copy => assert(adminApp.includes(copy), `Admin shell missing honest state copy: ${copy}`));

[
  "Добавить регион",
  "Граница региона, координаты полигона",
  "Быстрый шаблон региона",
  "Редактировать",
  "Активировать",
  "Отключить",
  "Карточка водителя",
  "Региональный доступ",
  "Причина блокировки",
  "Доступ к региону одобрен",
  "Заявка водителя",
  "Отклонить"
].forEach(copy => assert(adminApp.includes(copy), `Admin operations UI missing ${copy}`));
} else {
  console.warn("Admin shell web-source checks skipped: apps/web is not present in this runtime image");
}

const adminRoutes = read("../modules/admin/admin.routes.js");
[
  'router.get("/drivers/:id"',
  'router.patch("/drivers/:id/block"',
  'router.get("/drivers/:id/regions"',
  'router.patch("/drivers/:id/regions"',
  'router.patch("/driver-applications/:id"'
].forEach(route => assert(adminRoutes.includes(route), `Admin route missing ${route}`));

const redisDb = read("../db/redis.js");
assert(redisDb.includes('env.NODE_ENV === "production"'), "Redis connect should stay strict in production");
assert(redisDb.includes("API will run in degraded mode"), "Redis connect should allow degraded local API startup");

const rateLimiter = read("../common/rateLimit.js");
assert(rateLimiter.includes("Redis fallback"), "Rate limiter should document Redis fallback behavior");
assert(!rateLimiter.includes("next(error);"), "Rate limiter must not turn Redis fallback into API 500 responses");

console.log("Milestone 1, 2, 3, 4, auth/seed, routing/location and admin control checks ok");

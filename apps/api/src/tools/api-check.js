import "./syntax-check.js";
import "./auth-seed-check.js";
import "./regions-check.js";
import "./driver-approval-check.js";
import "./tariffs-orders-check.js";
import "./dispatch-realtime-check.js";
import "./routing-location-check.js";
import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const adminApp = read("../../../web/src/features/admin/AdminApp.jsx");
const adminApi = read("../../../web/src/lib/mvpApi.js");

[
  "Dashboard",
  "Regions",
  "Drivers",
  "Driver Applications",
  "Orders",
  "Tariffs",
  "Finance",
  "Settings",
  "Audit",
  "Support"
].forEach(section => assert(adminApp.includes(section), `Admin shell missing ${section}`));

[
  "getAdminDashboard",
  "getAdminRegions",
  "getAdminDrivers",
  "getAdminDriverApplications",
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
  "Раздел будет подключён на следующем этапе",
  "Нет данных для отображения",
  "Не удалось загрузить данные",
  "Нет доступа к панели управления"
].forEach(copy => assert(adminApp.includes(copy), `Admin shell missing honest state copy: ${copy}`));

console.log("Milestone 1, 2, 3, 4, auth/seed, routing/location and admin shell checks ok");

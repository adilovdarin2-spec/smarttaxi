import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TRANSITION_RULES } from "../modules/orders/order-dispatch.service.js";

// Блокировка закрывает новую работу, а не бросает пассажира в едущей машине.
//
// Водителя блокируют мгновенно: владелец из панели или автоматика по рейтингу —
// пятый низкий отзыв роняет среднюю ниже трёх, и это может случиться, пока он
// везёт человека.
//
// Раньше после этого заказ не мог закрыть никто. Водитель получал DRIVER_BLOCKED
// на каждую попытку завершить. Пассажир не мог отменить: отмена клиентом из
// TRIP_STARTED не разрешена. Владелец не мог тоже: CANCELLED_BY_OPERATOR из
// TRIP_STARTED недостижим. Заказ висел вечно, человек больше не мог заказать
// машину вообще, а водитель не получал за поездку ничего.
//
// Проверка держит две вещи: ход уже начатой поездки не зависит от того, можно
// ли водителю брать новую работу, и при этом новую работу заблокированному
// по-прежнему не дают.

const root = fileURLToPath(new URL("../", import.meta.url));
const routes = readFileSync(`${root}modules/orders/orders.routes.js`, "utf8");

// --- Та самая ловушка, из-за которой заказ становился вечным ---
//
// Если однажды отмену из TRIP_STARTED разрешат, это перестанет быть ловушкой —
// но пока она есть, довести поездку до конца обязан мочь водитель.
const operatorCanCancelMidTrip = TRANSITION_RULES.CANCELLED_BY_OPERATOR.includes("TRIP_STARTED");

// --- Готовность к линии спрашивают только перед новой работой ---
const statusHandler = routes.slice(
  routes.indexOf("async function updateStatus"),
  routes.indexOf("async function updateStatus") + 3000
);
assert(
  !/assertDriverDispatchReady/.test(statusHandler),
  operatorCanCancelMidTrip
    ? "готовность к линии снова спрашивают на ходу поездки"
    : "готовность к линии снова спрашивают на ходу поездки — заблокированный водитель не сможет её закончить, а закрыть заказ будет некому"
);

// Но заказ всё так же обязан принадлежать этому водителю.
assert.match(
  statusHandler,
  /existing\.driver_id !== driver\.id\) throw new AppError\("Forbidden order"/,
  "водитель не должен двигать чужой заказ"
);

// --- Новую работу заблокированному по-прежнему не дают ---
const assignHandler = routes.slice(
  routes.indexOf('router.post("/:id/assign-driver"'),
  routes.indexOf('router.post("/:id/assign-driver"') + 1200
);
assert.match(
  assignHandler,
  /assertDriverDispatchReady\(driver, client\)/,
  "владелец не должен назначать заказ заблокированному водителю"
);

const dispatch = readFileSync(`${root}modules/orders/order-dispatch.service.js`, "utf8");
assert.match(
  dispatch,
  /if \(driver\.is_blocked\) throw new AppError\("Driver is blocked", 403, "DRIVER_BLOCKED"\)/,
  "заблокированный водитель не должен принимать новые заказы сам"
);

console.log(
  "Blocked driver checks ok: a trip already under way can be finished, new work still refused"
);

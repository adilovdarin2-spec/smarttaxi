import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ORDER_SEARCH_TIMEOUT_MINUTES, expireSearchingOrders } from "../modules/orders/order-search.scheduler.js";
import { CLIENT_ACTIVE_ORDER_STATUSES, OPEN_ORDER_STATUSES } from "../modules/orders/order-dispatch.service.js";
import { NOTIFICATION_KEYS } from "../modules/notifications/notification-messages.js";

// Заказ, который никто не взял, закрывается сам.
//
// Раньше не закрывался ничем. Человек заказывал машину ночью в районе, где в
// тот час никого не было на линии, и экран крутился до утра. Хуже другое: пока
// заказ числится активным, создать новый нельзя — утром человек получал «у вас
// уже есть активный заказ» про заказ, которого никогда не будет. Сервис для
// него на этом заканчивался.
//
// Проверка держит три вещи: поиск действительно ограничен по времени, заказ с
// водителем при этом не трогают, и человеку говорят словами, что машины не
// нашлось.

const root = fileURLToPath(new URL("../", import.meta.url));

// --- Срок разумен ---
assert(
  ORDER_SEARCH_TIMEOUT_MINUTES >= 5 && ORDER_SEARCH_TIMEOUT_MINUTES <= 60,
  `${ORDER_SEARCH_TIMEOUT_MINUTES} мин: слишком мало, чтобы водитель успел выйти, или слишком много, чтобы человек ждал`
);

// --- Именно эти статусы и блокируют новый заказ ---
for (const status of OPEN_ORDER_STATUSES) {
  assert(
    CLIENT_ACTIVE_ORDER_STATUSES.includes(status),
    `${status} не блокирует новый заказ — значит и истекать ему незачем, проверьте замысел`
  );
}

// --- Человеку есть что сказать, на всех языках ---
assert(
  NOTIFICATION_KEYS.includes("searchExpired"),
  "нет уведомления о том, что машину не нашли: экран просто погаснет без объяснений"
);

// --- Заказ, который уже взял водитель, не трогаем ---
//
// Между выборкой и отменой проходит время, и за это время водитель может
// принять заказ. Отменить его тогда — значит высадить человека, который уже
// едет.
{
  const source = readFileSync(`${root}modules/orders/order-search.scheduler.js`, "utf8");
  assert.match(
    source,
    /AND driver_id IS NULL/,
    "выборка обязана исключать заказы с водителем"
  );
  assert.match(
    source,
    /SELECT \* FROM orders WHERE id=\$1 FOR UPDATE/,
    "заказ должен перечитываться под блокировкой: между выборкой и отменой его мог взять водитель"
  );
  assert.match(
    source,
    /if \(!OPEN_ORDER_STATUSES\.includes\(existing\.status\) \|\| existing\.driver_id\) return null;/,
    "занятый заказ отменять нельзя — пассажир уже едет"
  );
}

// --- Деньги возвращаются тем же путём, что и при обычной отмене ---
{
  const source = readFileSync(`${root}modules/orders/order-search.scheduler.js`, "utf8");
  assert.match(
    source,
    /createOrderCancelledTransaction\(updated, null, client\)/,
    "без общего пути отмены кешбэк, которым оплатили заказ, не вернётся человеку"
  );
  assert.match(source, /notifyOrderClient\(/, "человеку не сообщают, что машину не нашли");
  assert.match(source, /key: "searchExpired"/, "уведомление должно идти ключом, а не русским литералом");
}

// --- Уборщик действительно запущен ---
{
  const server = readFileSync(`${root}server.js`, "utf8");
  assert.match(server, /startOrderSearchSweeper\(io\)/, "уборщик не запускается — код есть, а работать некому");
  assert.match(server, /stopOrderSearchSweeper\(\)/, "уборщик не останавливается при выключении");
}

assert.equal(typeof expireSearchingOrders, "function", "выметание заказов должно быть вызываемым и из теста");

console.log(
  `Order search expiry checks ok: ${ORDER_SEARCH_TIMEOUT_MINUTES} min limit, claimed orders untouched, rider told in their own language`
);

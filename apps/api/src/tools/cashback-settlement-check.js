import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Бонусами платят вперёд — значит, сдачу тоже надо отдавать.
//
// Оплата кэшбэком списывает названную при заказе сумму целиком и сразу.
// Дальше цена может измениться в обе стороны: ожидание её поднимает, а торг
// опускает — водитель вправе предложить вплоть до 70 процентов от оценки, и
// пассажир вправе согласиться.
//
// Доплата была написана с самого начала, возврат — нет. Заказ за 700,
// сторгованный до 500, оставлял 200 ₸ бонусов списанными ни за что: ветка
// смотрела только «цена выросла», и второй половины у неё не было.

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const orders = read("modules", "orders", "orders.routes.js");

const at = orders.indexOf("A ride paid entirely with previously-earned bonuses");
assert(at > 0, "пропал расчёт кэшбэка при завершении поездки");
const settlement = orders.slice(Math.max(0, at - 4000), at);

// --- Обе стороны на месте ---------------------------------------------------
assert(
  settlement.includes("Number(updated.price) > Number(updated.cashback_used)"),
  "пропала доплата с бонусов, когда цена выросла"
);
assert(
  settlement.includes("Number(updated.cashback_used) > Number(updated.price)"),
  "нет возврата, когда согласованная цена оказалась ниже уже оплаченной бонусами"
);

// --- Возврат действительно возвращает ---------------------------------------
const refundAt = settlement.indexOf("Number(updated.cashback_used) > Number(updated.price)");
const refund = settlement.slice(refundAt, refundAt + 1400);
assert(
  refund.includes("cashback_balance=cashback_balance+$1"),
  "переплату надо вернуть на баланс, а не просто списать со счёта заказа"
);
assert(
  refund.includes("'ORDER_PAYMENT_REFUND'"),
  "возврат должен оставлять след в истории бонусов"
);
assert(
  refund.includes("SET cashback_used=price"),
  "после возврата в заказе должно остаться ровно столько, сколько поездка стоила"
);
assert(
  refund.includes("UPDATE payments SET amount=$1"),
  "строка оплаты должна показывать ту же сумму, что и заказ"
);
assert(
  refund.includes("updated.client_id"),
  "возврат без пассажира невозможен -- на чей баланс"
);

// --- Порядок: сначала расчёты, потом начисление нового кэшбэка ---------------
// Новый кэшбэк не начисляется за поездку, оплаченную бонусами, и решает это
// cashback_used. Значит, править cashback_used надо до этой проверки.
const earnAt = orders.indexOf("Number(updated.cashback_used) > 0");
assert(earnAt > 0, "пропало правило «за поездку с бонусов новые бонусы не начисляются»");
assert(
  orders.indexOf("'ORDER_PAYMENT_REFUND'") < earnAt,
  "возврат должен случиться до решения о начислении нового кэшбэка"
);

console.log("Cashback settlement checks ok: bonuses paid up front are topped up and given back, both ways");

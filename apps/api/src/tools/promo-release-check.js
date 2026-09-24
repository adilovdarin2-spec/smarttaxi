import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { releasePromoRedemption } from "../modules/orders/promo.service.js";

// Промокод не должен сгорать на поездке, которой не было.
//
// Строка о применении писалась при создании заказа и не снималась никогда.
// Водитель не нашёлся, водитель отказался, оператор закрыл заказ, истёк
// поиск — заказ отменён, денег никто не платил, а промокод «уже использован»
// и второй раз не даётся. Человек лишался скидки за поездку, которой не было.
//
// Хуже всего это стало после автоматического закрытия зависшего поиска:
// пассажир вообще ничего не делал, а промокод сгорал сам.

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8").replace(/\r\n/g, "\n");
const promoSource = read("modules", "orders", "promo.service.js");
const financeSource = read("modules", "finance", "finance.service.js");
const adminSource = read("modules", "admin", "admin.routes.js");
const migrations = read("db", "migrations.js");

// --- Снятие работает и не срабатывает дважды -------------------------------
const calls = [];
const executor = {
  async query(sql, params) {
    calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    return { rowCount: sql.includes("released_at IS NULL") ? 1 : 0, rows: [] };
  }
};
assert.equal(await releasePromoRedemption({ orderId: "order-1", executor }), 1);
assert.equal(calls.length, 1);
assert(calls[0].sql.includes("SET released_at=NOW()"), "снятие должно проставлять released_at");
assert(
  calls[0].sql.includes("released_at IS NULL"),
  "повторная отмена не должна переписывать дату снятия"
);
assert.deepEqual(calls[0].params, ["order-1"]);

// Заказ без промокода не должен трогать базу вообще.
const idle = [];
assert.equal(await releasePromoRedemption({
  orderId: null,
  executor: { async query(sql) { idle.push(sql); return { rowCount: 0 }; } }
}), 0);
assert.deepEqual(idle, []);

// --- Счёт использований ведётся по неснятым строкам ------------------------
const counting = promoSource
  .split("\n")
  .filter(line => line.includes("FROM promo_code_redemptions"));
assert.equal(counting.length, 2, `ожидалось два счётчика использований, нашлось ${counting.length}`);
for (const line of counting) {
  assert(
    line.includes("released_at IS NULL"),
    `счётчик использований считает снятые строки: ${line.trim()}`
  );
}

// --- Снятие висит на общей воронке отмены ----------------------------------
const funnel = financeSource.slice(
  financeSource.indexOf("export async function createOrderCancelledTransaction")
);
const body = funnel.slice(0, funnel.indexOf("\nexport "));
assert(
  body.includes("releasePromoRedemption"),
  "отмена заказа должна возвращать промокод: все три пути отмены и истёкший поиск идут через createOrderCancelledTransaction"
);

// --- Удаление промокода в админке смотрит на то же -------------------------
const deleteAt = adminSource.indexOf('"SELECT id FROM promo_code_redemptions');
assert(deleteAt >= 0, "пропала проверка перед удалением промокода");
assert(
  adminSource.slice(deleteAt, deleteAt + 160).includes("released_at IS NULL"),
  "«уже использован» не должно говориться про снятую строку"
);

// --- Колонка заведена ------------------------------------------------------
assert(
  migrations.includes("ALTER TABLE promo_code_redemptions ADD COLUMN IF NOT EXISTS released_at"),
  "нет миграции, заводящей released_at"
);

console.log("Promo release checks ok: a cancelled ride gives the promo code back, once, and history is kept");

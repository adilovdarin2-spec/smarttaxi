import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Заказ принадлежит тому, кто его создал.
//
// Вызвать машину другу — обычное дело: в форме стоит его имя и его номер,
// потому что водитель звонит ему. Но профиль плательщика искался по этому же
// введённому номеру, и заказ целиком вставал на чужой аккаунт: с чужого
// баланса уходили бонусы при оплате кэшбэком, чужой промокод помечался
// использованным, чужое имя переписывалось на введённое, а чужой аккаунт
// занимал свой единственный активный заказ — человек не мог вызвать себе
// машину, пока незнакомец этого не отменит. Свой же заказ заказчик не видел
// и не мог отменить: списки идут по client_id.
//
// Проверка держит границу: плательщик определяется по токену, введённый
// номер живёт только в полях самого заказа.

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8")
  .replace(/\r\n/g, "\n");

const start = source.indexOf('router.post("/", requireAuth, requireRole("CLIENT")');
assert(start >= 0, "не нашёлся обработчик создания заказа — проверка ослепла");
const rest = source.slice(start + 1);
const next = rest.indexOf("\nrouter.");
const handler = rest.slice(0, next < 0 ? rest.length : next);

assert(
  handler.includes("SELECT * FROM clients WHERE user_id=$1"),
  "плательщик заказа должен находиться по владельцу токена, а не по введённому номеру"
);

// Введённый номер не должен стоять рядом ни с одним обращением к таблице
// профилей: ни выбирать профиль, ни создавать его, ни переписывать.
const nearClients = [];
for (let at = handler.indexOf("clients"); at >= 0; at = handler.indexOf("clients", at + 1)) {
  const window = handler.slice(Math.max(0, at - 240), at + 480);
  if (window.includes("body.riderPhone") || window.includes("body.riderName")) {
    nearClients.push(handler.slice(Math.max(0, at - 60), at + 60).replace(/\n/g, " "));
  }
}
assert.deepEqual(
  nearClients,
  [],
  "введённый номер или имя не должны выбирать, создавать или переписывать профиль: " +
    nearClients.join(" | ")
);

// Деньги и лимиты считаются по найденному плательщику, а не по чему-то ещё.
for (const call of ["spendOrderCashback", "recordPromoRedemption"]) {
  const at = handler.indexOf(call);
  assert(at >= 0, `в создании заказа пропал вызов ${call}`);
  assert(
    handler.slice(at, at + 260).includes("clientId: rider.id"),
    `${call} должен списывать с плательщика заказа`
  );
}

const activeOrderAt = handler.indexOf("CLIENT_HAS_ACTIVE_ORDER");
assert(activeOrderAt >= 0, "пропала проверка активного заказа клиента");
assert(
  handler.slice(Math.max(0, activeOrderAt - 700), activeOrderAt).includes("[rider.id, CLIENT_ACTIVE_ORDER_STATUSES]"),
  "единственный активный заказ считается у плательщика, а не у того, чей номер ввели"
);

console.log("Order rider ownership checks ok");

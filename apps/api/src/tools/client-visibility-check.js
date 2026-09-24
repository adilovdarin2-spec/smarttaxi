import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicAdminClient, setClientBlocked } from "../modules/clients/client-admin.service.js";

// Оценка, которую никто не видит, — не оценка.
//
// Водители ставят пассажирам оценки с тегами и комментарием: это пишется в
// client_reviews, средняя ложится в clients.rating. Дальше не происходило
// ничего. Раздела «Пассажиры» в панели не было вовсе, отзывов не было видно
// нигде, и водитель тратил касание впустую.
//
// Рядом лежал столбец clients.is_blocked. Его читали ровно в одном месте — при
// бронировании места на стоянке, — а выставить не мог никто и никак. Флаг,
// который нельзя поднять, и проверка, которая поэтому никогда не срабатывала.
// Вдобавок заблокированный пассажир спокойно заказывал машину: заказ эту
// блокировку не смотрел.

const root = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (...parts) => readFileSync(join(...parts), "utf8").replace(/\r\n/g, "\n");

const adminRoutes = read(root, "modules", "admin", "admin.routes.js");
const orders = read(root, "modules", "orders", "orders.routes.js");
const stands = read(root, "modules", "stands", "stands.routes.js");
const migrations = read(root, "db", "migrations.js");

// --- Панель наконец их показывает ------------------------------------------
for (const route of [
  'router.get("/clients"',
  'router.get("/clients/:id"',
  'router.patch("/clients/:id/block"'
]) {
  assert(adminRoutes.includes(route), `в панели нет ${route}`);
}
assert(
  adminRoutes.includes('requireRole("OWNER")') &&
    adminRoutes.indexOf('router.patch("/clients/:id/block"') > 0,
  "блокировать пассажира может только владелец"
);

// --- Блокировка что-то значит ----------------------------------------------
assert(
  stands.includes('"CLIENT_BLOCKED"'),
  "стоянка перестала смотреть на блокировку пассажира"
);
{
  const at = orders.indexOf('router.post("/", requireAuth, requireRole("CLIENT")');
  assert(at >= 0, "не нашёлся обработчик создания заказа");
  const rest = orders.slice(at + 1);
  const next = rest.indexOf("\nrouter.");
  const handler = rest.slice(0, next < 0 ? rest.length : next);
  assert(
    handler.includes('"CLIENT_BLOCKED"'),
    "заблокированный пассажир не должен заказывать машину: иначе блокировка почти ничего не значит"
  );
  // Проверять надо сам флаг: отказ, до которого нельзя дойти, -- это не отказ.
  assert(
    /if \(rider\.is_blocked\)/.test(handler),
    "отказ должен читать rider.is_blocked, а не стоять за условием, которое никогда не выполняется"
  );
  // Сама вставка живёт в insertOrderWithShortId выше по файлу; здесь важно,
  // что отказ случается до её вызова.
  const insertCall = handler.indexOf("insertOrderWithShortId(");
  assert(insertCall > 0, "не нашёлся вызов вставки заказа");
  assert(
    handler.indexOf('"CLIENT_BLOCKED"') < insertCall,
    "проверку блокировки надо делать до создания заказа"
  );
}

// --- Блокировка не бросает человека посреди поездки -------------------------
{
  const calls = [];
  await assert.rejects(
    () => setClientBlocked({
      clientId: "client-1",
      blocked: true,
      reason: "жалобы водителей",
      actorUserId: "owner-1",
      executor: null
    }, {
      async query(sql, params) {
        calls.push(sql.replace(/\s+/g, " ").trim());
        if (/SELECT \* FROM clients/i.test(sql)) return { rows: [{ id: "client-1", is_blocked: false }] };
        if (/FROM orders/i.test(sql)) return { rows: [{ id: "order-9", short_id: "AB12", status: "TRIP_STARTED" }] };
        return { rows: [] };
      }
    }),
    error => error?.code === "CLIENT_HAS_ACTIVE_ORDER" && error?.status === 409,
    "пассажира с идущей поездкой блокировать нельзя, пока её не закрыли"
  );
  assert(
    !calls.some(sql => sql.startsWith("UPDATE clients")),
    "отказ должен случиться до записи, а не после неё"
  );
}

// Причина обязательна: «заблокирован» без причины через месяц не объяснит
// никто, включая того, кто нажал.
await assert.rejects(
  () => setClientBlocked({ clientId: "client-1", blocked: true, reason: "  ", actorUserId: "owner-1" }, {
    async query(sql) {
      if (/SELECT \* FROM clients/i.test(sql)) return { rows: [{ id: "client-1" }] };
      return { rows: [] };
    }
  }),
  error => error?.code === "BLOCK_REASON_REQUIRED"
);

// Разблокировка не спрашивает ни причину, ни отсутствие поездки.
{
  let updated = null;
  const result = await setClientBlocked({ clientId: "client-1", blocked: false, actorUserId: "owner-1" }, {
    async query(sql, params) {
      if (/SELECT \* FROM clients/i.test(sql)) return { rows: [{ id: "client-1", is_blocked: true }] };
      updated = params;
      return { rows: [{ id: "client-1", name: "A", phone: "+7", is_blocked: false }] };
    }
  });
  assert.equal(result.isBlocked, false);
  assert.equal(updated[2], null, "снятие блокировки чистит причину");
}

// --- Оценка без числа отзывов ничего не значит ------------------------------
// У всех новых пассажиров rating по умолчанию 5.00, поэтому «пятёрка» у
// человека без единой поездки -- это не пятёрка, а отсутствие данных.
{
  const shown = publicAdminClient({
    id: "c", name: "A", phone: "+7", rating: "5.00", review_count: 0,
    trip_count: 0, cancelled_count: 0, cashback_balance: 0, is_blocked: false
  });
  assert.equal(shown.reviewCount, 0, "число отзывов должно доезжать до панели рядом с оценкой");
}

// --- Столбцы заведены -------------------------------------------------------
for (const column of ["block_reason", "blocked_at", "blocked_by_user_id"]) {
  assert(
    migrations.includes(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ${column}`),
    `нет миграции для clients.${column}`
  );
}

// --- В панели это видно человеку -------------------------------------------
const adminApp = join(repoRoot, "apps", "web", "src", "features", "admin", "AdminApp.jsx");
if (existsSync(adminApp)) {
  const panel = read(adminApp);
  assert(panel.includes('key: "clients"'), "в меню панели нет раздела «Пассажиры»");
  assert(panel.includes("ClientDetailPanel"), "отзывы водителей о пассажире должно быть где посмотреть");
  assert(panel.includes("ClientBlockPanel"), "блокировку должно быть чем поставить");
  assert(
    panel.includes("reviewCount > 0"),
    "оценку нельзя показывать без числа отзывов: у всех новых стоит 5.00 по умолчанию"
  );
} else {
  console.warn("Client panel check skipped: apps/web is not present in this runtime image");
}

console.log("Client visibility checks ok: driver ratings of passengers reach the owner, and a block both exists and bites");

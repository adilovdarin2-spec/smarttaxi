import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// A driver who owes the service too much stops being given work. That is one
// money rule, and it used to be written as a bare 15000 in two places which
// both have to agree: the driver accepting an order in the app, and the owner
// assigning one to them by hand. Two copies of a limit are two limits — raise
// one and a driver is refused in the app while the owner can still hand them a
// trip, a disagreement nobody notices until a driver is on the phone about it.
const { DRIVER_DEBT_CEILING_KZT, DRIVER_DEBT_WARNING_KZT, isOverDebtCeiling } =
  await import("../modules/drivers/driver-debt.js");

assert.equal(isOverDebtCeiling(DRIVER_DEBT_CEILING_KZT), false, "owing exactly the limit is still allowed");
assert.equal(isOverDebtCeiling(DRIVER_DEBT_CEILING_KZT + 1), true);
assert.equal(isOverDebtCeiling("0"), false, "debt arrives from pg as a string");
assert.equal(isOverDebtCeiling(`${DRIVER_DEBT_CEILING_KZT + 1}`), true);
assert.equal(isOverDebtCeiling(null), false, "a driver with no debt row owes nothing");

// Лимит совпадает с офертой, которую водитель принимает.
//
// В коде стояло 15000, в оферте — 5 000: втрое больше обещанного, и узнать
// настоящее число водителю было неоткуда — в приложении лимит нигде не показан.
// Проверка читает число из самой оферты, поэтому разойтись они больше не могут:
// меняете одно — придётся поменять и второе.
{
  const legalPath = new URL("../../../web/src/legal/legal-content.json", import.meta.url);
  if (existsSync(legalPath)) {
    const legal = readFileSync(legalPath, "utf8");
    const promised = [...legal.matchAll(/задолженности[^.]{0,120}?(\d[\d\s]{2,8})\s*тенге/g)]
      .map(match => Number(match[1].replace(/\s/g, "")))
      .filter(value => value > 0);
    assert.ok(promised.length > 0, "в оферте не найден лимит задолженности");
    const limit = Math.max(...promised);
    assert.equal(
      DRIVER_DEBT_CEILING_KZT,
      limit,
      `оферта обещает лимит ${limit} ₸, а код останавливает на ${DRIVER_DEBT_CEILING_KZT} ₸`
    );
  }
}

// The warning has to come before the cut-off, or the dashboard is telling the
// owner about drivers who have already been stopped.
assert.ok(
  DRIVER_DEBT_WARNING_KZT < DRIVER_DEBT_CEILING_KZT,
  "the early warning must be below the ceiling it warns about"
);

// Neither enforcement site may go back to stating the number itself.
for (const path of [
  "../modules/orders/order-dispatch.service.js",
  "../modules/orders/orders.routes.js",
  "../modules/admin/admin.routes.js"
]) {
  const source = read(path);
  assert.ok(
    source.includes('from "../drivers/driver-debt.js"'),
    `${path} must take the debt rule from one place`
  );
  assert.doesNotMatch(
    source,
    /debt[^\n]*>\s*\d{4,}/,
    `${path} must not restate the debt limit as a literal`
  );
}

// Both paths that can put a driver on an order enforce it.
const dispatch = read("../modules/orders/order-dispatch.service.js");
const routes = read("../modules/orders/orders.routes.js");
for (const [name, source] of [["driver accepting", dispatch], ["owner assigning", routes]]) {
  assert.match(
    source,
    /isOverDebtCeiling\(driver\.debt\)\) throw new AppError\("Debt limit exceeded", 403, "DRIVER_DEBT_LIMIT"\)/,
    `${name} an order must refuse a driver over the ceiling`
  );
}

// --- Панель владельца называет те же числа, что применяет сервер ---
//
// В карточке «Долги водителей» стояли свои 10 000 и 15 000: счёт приходил с
// сервера, посчитанный по настоящему порогу, а подпись под ним называла два
// числа, которых нет ни в коде, ни в оферте. Владелец читал про лимит
// 15 000, пока водителя отключало на 5 000.
//
// Теперь оба порога едут в ответе /admin/dashboard вместе со счётом, и
// панель их просто показывает.
{
  const adminRoutes = read("../modules/admin/admin.routes.js");
  assert.match(adminRoutes, /debtWarningKzt: DRIVER_DEBT_WARNING_KZT/, "панели не с чем показать порог предупреждения");
  assert.match(adminRoutes, /debtCeilingKzt: DRIVER_DEBT_CEILING_KZT/, "панели не с чем показать потолок долга");

  const adminAppPath = new URL("../../../web/src/features/admin/AdminApp.jsx", import.meta.url);
  if (existsSync(adminAppPath)) {
    const adminApp = readFileSync(adminAppPath, "utf8");
    const offenders = [];
    adminApp.split("\n").forEach((line, index) => {
      if (!/долг/i.test(line)) return;
      // Число с разрядом тысяч рядом со словом «долг» — почти наверняка
      // вписанный руками порог.
      const numbers = [...line.matchAll(/[0-9]{1,3}[\s ][0-9]{3}|[0-9]{4,}/g)].map(m => m[0]);
      if (!numbers.length) return;
      offenders.push(`AdminApp.jsx:${index + 1} ${numbers.join(", ")}`);
    });
    assert.deepEqual(
      offenders,
      [],
      `в панели снова вписаны свои числа долга вместо серверных:
  ${offenders.join("\n  ")}`
    );
  }
}

console.log("Driver debt ceiling checks ok: one limit, both assignment paths, warning below it, panel quotes the server");

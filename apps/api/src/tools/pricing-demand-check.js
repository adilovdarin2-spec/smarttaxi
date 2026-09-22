import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getPricingDemand, resolveDemandDateRange } from "../modules/admin/pricing-demand.service.js";
import { isOnLine, recordShiftForStatus, STALE_SHIFT_MINUTES } from "../modules/drivers/driver-shift.service.js";

// Цена, которую можно двигать осознанно.
//
// Владелец спрашивал: как сделать так, чтобы не ушли ни пассажиры, ни
// водители. Ответа в виде числа не существует — он зависит от спроса, которого
// никто не измерял. Эта страница показывает несколько величин, по которым
// решение можно принять, и проверка следит за тем, чтобы они не врали.
//
// Врать они могут двумя способами, и оба дороже, чем отсутствие страницы:
// показать ноль там, где ничего не измеряли, и посчитать провалом заказ,
// который ищет машину прямо сейчас.

const root = fileURLToPath(new URL("../", import.meta.url));

// --- Что считается временем на линии ---
assert.equal(isOnLine("FREE"), true, "свободный водитель на линии");
assert.equal(isOnLine("BUSY"), true, "водитель на заказе тоже на линии");
assert.equal(isOnLine("OFFLINE"), false, "оффлайн — не линия");
assert.equal(isOnLine("BREAK"), false, "перерыв не линия: заказы в это время не берут");
assert.equal(isOnLine(null), false, "пустой статус — не линия");
assert(STALE_SHIFT_MINUTES > 0 && STALE_SHIFT_MINUTES <= 120, `окно зависшей смены ${STALE_SHIFT_MINUTES} мин выглядит неразумно`);

// --- Смена открывается и закрывается только на смене состояния ---
{
  const calls = [];
  const executor = {
    query: async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      return { rows: [{ id: "shift-1" }], rowCount: 1 };
    }
  };

  await recordShiftForStatus("driver-1", "OFFLINE", "FREE", executor);
  assert.equal(calls.length, 1, "выход на линию должен открыть смену");
  assert.match(calls[0].sql, /INSERT INTO driver_shifts/, "смена открывается вставкой");
  assert.match(calls[0].sql, /ON CONFLICT .*DO NOTHING/, "две одновременные попытки не должны открыть две смены");

  calls.length = 0;
  await recordShiftForStatus("driver-1", "FREE", "BUSY", executor);
  assert.equal(calls.length, 0, "переход на заказ смену не трогает — это всё та же линия");

  calls.length = 0;
  await recordShiftForStatus("driver-1", "BUSY", "OFFLINE", executor);
  assert.equal(calls.length, 1, "уход с линии должен закрыть смену");
  assert.match(calls[0].sql, /UPDATE driver_shifts SET ended_at = NOW\(\)/, "смена закрывается временем окончания");

  calls.length = 0;
  await recordShiftForStatus("driver-1", "FREE", "BREAK", executor);
  assert.equal(calls.length, 1, "перерыв закрывает смену: заказы в это время не берут");
}

// --- Одна открытая смена на водителя ---
{
  const migrations = readFileSync(`${root}db/migrations.js`, "utf8");
  assert.match(
    migrations,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_shifts_one_open ON driver_shifts\(driver_id\) WHERE ended_at IS NULL/,
    "без уникального индекса часы одного водителя посчитаются дважды"
  );
}

// --- Ноль и «не измеряли» — разные вещи ---
{
  const empty = {
    created: 0, assigned: 0, completed: 0, still_searching: 0, never_assigned: 0,
    cancelled_by_client: 0, cancelled_by_driver: 0, average_price: 0, gross: 0, commission: 0
  };
  const executor = {
    query: async (sql) => {
      if (/FROM driver_shifts/.test(sql)) return { rows: [{ seconds: 0, drivers: 0 }] };
      if (/PERCENTILE_CONT/.test(sql)) return { rows: [{ median_seconds: 0, p90_seconds: 0 }] };
      if (/order_price_offer_queue/.test(sql)) return { rows: [{ made: 0, accepted: 0, refused: 0, average_price: 0 }] };
      if (/driver_offer_status/.test(sql)) return { rows: [{ made: 0, accepted: 0, refused: 0, average_price: 0 }] };
      if (/offered_price_kzt IS NOT NULL/.test(sql)) return { rows: [{ percent: 0, orders: 0 }] };
      if (/last_cancel_reason_code AS code/.test(sql)) return { rows: [] };
      return { rows: [empty] };
    }
  };
  const demand = await getPricingDemand({}, executor);
  assert.equal(demand.line.earningsPerHourKzt, null, "без часов на линии заработок за час — не ноль, а «не измеряли»");
  assert.equal(demand.orders.fillRatePercent, null, "без заказов доля найденных машин — не ноль, а «нечего считать»");
  assert.equal(demand.offers.offeredVsFixedPercent, null, "без торга процент от названной цены — не ноль");
  assert.equal(demand.offers.fromRider.refusedPercent, null, "без предложений доля отказов — не ноль");
}

// --- Заказ, который ищет машину прямо сейчас, ещё не провал ---
{
  const totals = {
    created: 10, assigned: 6, completed: 6, still_searching: 2, never_assigned: 2,
    cancelled_by_client: 2, cancelled_by_driver: 0, average_price: 700, gross: 4200, commission: 294
  };
  const executor = {
    query: async (sql) => {
      if (/FROM driver_shifts/.test(sql)) return { rows: [{ seconds: 7200, drivers: 1 }] };
      if (/PERCENTILE_CONT/.test(sql)) return { rows: [{ median_seconds: 42, p90_seconds: 180 }] };
      if (/order_price_offer_queue/.test(sql)) return { rows: [{ made: 4, accepted: 3, refused: 1, average_price: 650 }] };
      if (/driver_offer_status/.test(sql)) return { rows: [{ made: 2, accepted: 2, refused: 0, average_price: 750 }] };
      if (/offered_price_kzt IS NOT NULL/.test(sql)) return { rows: [{ percent: 92, orders: 4 }] };
      if (/last_cancel_reason_code AS code/.test(sql)) return { rows: [{ code: "WAITED_TOO_LONG", side: "client", count: 1 }] };
      return { rows: [totals] };
    }
  };
  const demand = await getPricingDemand({}, executor);
  // Шесть машин из восьми решённых, а не из десяти созданных.
  assert.equal(demand.orders.fillRatePercent, 75, `доля найденных машин ${demand.orders.fillRatePercent} вместо 75`);
  assert.equal(demand.line.hours, 2, "два часа на линии");
  assert.equal(demand.line.earningsPerHourKzt, Math.round((4200 - 294) / 2), "заработок за час считается от того, что осталось водителям");
  assert.equal(demand.offers.fromRider.refusedPercent, 25, "один отказ из четырёх — это 25 процентов");
}

// --- Владельцу показывают вывод, а не только числа ---
{
  const adminApp = `${root}../../web/src/features/admin/AdminApp.jsx`;
  if (existsSync(adminApp)) {
    const source = readFileSync(adminApp, "utf8");
    assert.match(source, /key: "pricingDemand"/, "страницы «Цена и спрос» нет в меню панели");
    assert.match(source, /Похоже, водителю дёшево/, "панель должна называть вывод, а не оставлять владельца с таблицей");
    assert.match(source, /Похоже, пассажиру дорого/, "второй вывод потерян");
    assert.match(
      source,
      /function demandPercent/,
      "проценты спроса должны считаться отдельно: общий formatPercent превращает «не измеряли» в «0%»"
    );
  }
}

console.log(
  `Pricing demand checks ok: fill rate ignores live orders, unmeasured stays null, shifts open once, stale window ${STALE_SHIFT_MINUTES} min`
);

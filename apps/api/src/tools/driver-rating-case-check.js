import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  RATING_CASE_MIN_REVIEWS,
  RATING_CASE_RATING_THRESHOLD,
  needsRatingReview,
  openRatingCaseIfNeeded,
  resolveRatingCase
} from "../modules/drivers/driver-rating-case.service.js";

// Решение лишить человека заработка принимает человек.
//
// Раньше это делала автоматика: пятый отзыв, уронивший среднюю ниже трёх,
// отключал водителя мгновенно. Пять поездок — первая неделя нового водителя:
// две единицы и три четвёрки дают 2,8. Ровно столько же нужно, чтобы свести с
// кем-то счёты — в райцентре пассажиры ездят с одними и теми же водителями.
//
// Числа остались те же, изменилось последствие: поднимается карточка.

const root = fileURLToPath(new URL("../", import.meta.url));

// --- Порог срабатывания ---
assert.equal(needsRatingReview(2.8, RATING_CASE_MIN_REVIEWS), true, "низкая средняя после порога поездок поднимает карточку");
assert.equal(needsRatingReview(2.8, RATING_CASE_MIN_REVIEWS - 1), false, "до порога поездок одна-две оценки ничего не решают");
assert.equal(needsRatingReview(RATING_CASE_RATING_THRESHOLD, 50), false, "ровно на пороге карточку не поднимают");
assert.equal(needsRatingReview(4.5, 100), false, "хороший рейтинг разбирать незачем");

// --- Автоматика больше никого не отключает ---
{
  const orders = readFileSync(`${root}modules/orders/orders.routes.js`, "utf8");
  assert(
    !/is_blocked=true/.test(orders),
    "оценка снова блокирует водителя сама — это должно быть решением человека"
  );
  assert.match(orders, /openRatingCaseIfNeeded\(/, "низкий рейтинг должен поднимать карточку");
}

// --- Карточка не заводится там, где не нужно ---
{
  const calls = [];
  const executor = {
    query: async (sql, params) => {
      calls.push(sql.replace(/\s+/g, " ").trim());
      if (/SELECT id, is_blocked FROM drivers/.test(sql)) {
        return { rows: [{ id: params[0], is_blocked: params[0] === "blocked-driver" }] };
      }
      return { rows: [{ id: "case-1" }], rowCount: 1 };
    }
  };

  assert.equal(
    await openRatingCaseIfNeeded({ driverId: "d1", averageRating: 4.8, reviewCount: 40 }, executor),
    null,
    "хороший рейтинг не заводит карточку"
  );
  assert.equal(
    await openRatingCaseIfNeeded({ driverId: "blocked-driver", averageRating: 1.2, reviewCount: 9 }, executor),
    null,
    "по уже заблокированному разбирать нечего: решение принято"
  );

  calls.length = 0;
  const opened = await openRatingCaseIfNeeded({ driverId: "d1", averageRating: 1.2, reviewCount: 9 }, executor);
  assert.ok(opened, "низкий рейтинг обязан поднять карточку");
  const insert = calls.find(sql => sql.includes("INSERT INTO driver_rating_cases"));
  assert.ok(insert, "карточка заводится вставкой");
  assert.match(
    insert,
    /ON CONFLICT \(driver_id\) WHERE status = 'PENDING' DO NOTHING/,
    "каждый следующий низкий отзыв не должен плодить копии одной жалобы"
  );
}

// --- Оба решения закрывают карточку, и «оставить» тоже решение ---
{
  const state = { status: "PENDING", driver_id: "d1", average_rating: 2.1, review_count: 7 };
  const seen = [];
  // Водитель свободен: активных заказов у него нет.
  let activeTrip = null;
  const executor = {
    query: async (sql, params) => {
      seen.push(sql.replace(/\s+/g, " ").trim());
      if (/SELECT \* FROM driver_rating_cases/.test(sql)) return { rows: [{ id: params[0], ...state }] };
      if (/UPDATE driver_rating_cases/.test(sql)) return { rows: [{ id: params[0], ...state, status: params[1] }] };
      if (/FROM orders WHERE driver_id/.test(sql)) return { rows: activeTrip ? [activeTrip] : [] };
      return { rows: [{ id: "d1" }], rowCount: 1 };
    }
  };

  const dismissed = await resolveRatingCase({ caseId: "c1", decision: "DISMISS", actorUserId: "u1" }, executor);
  assert.equal(dismissed.ratingCase.status, "DISMISSED", "«оставить работать» закрывает карточку");
  assert.equal(dismissed.blockedDriver, null, "«оставить работать» не трогает водителя");
  assert(
    !seen.some(sql => /UPDATE drivers SET is_blocked=true/.test(sql)),
    "при решении оставить водителя блокировать нельзя"
  );

  seen.length = 0;
  const blocked = await resolveRatingCase({ caseId: "c1", decision: "BLOCK", actorUserId: "u1" }, executor);
  assert.equal(blocked.ratingCase.status, "BLOCKED", "«отключить» закрывает карточку");
  assert(
    seen.some(sql => /UPDATE drivers SET is_blocked=true, status='OFFLINE'/.test(sql)),
    "решение отключить должно действительно снимать водителя с линии"
  );

  await assert.rejects(
    () => resolveRatingCase({ caseId: "c1", decision: "SOMETHING", actorUserId: "u1" }, executor),
    (error) => error.code === "INVALID_RATING_CASE_DECISION",
    "решение бывает только двух видов"
  );

  // Пока водитель кого-то везёт, отключать его нельзя: пассажир в машине об
  // этом не просил, а закрывать заказ после блокировки будет некому, кроме
  // владельца. Сначала закройте поездку.
  activeTrip = { id: "o1", short_id: "AB12", status: "TRIP_STARTED" };
  seen.length = 0;
  await assert.rejects(
    () => resolveRatingCase({ caseId: "c1", decision: "BLOCK", actorUserId: "u1" }, executor),
    (error) => error.code === "DRIVER_HAS_ACTIVE_ORDER" && error.details?.shortId === "AB12",
    "отключать водителя посреди поездки нельзя, и отказ должен назвать саму поездку"
  );
  assert(
    !seen.some(sql => /UPDATE drivers SET is_blocked=true/.test(sql)),
    "отказ обязан сработать до записи, а не после"
  );
  activeTrip = null;
}

// --- Владелец видит карточку и обе кнопки ---
{
  const adminApp = `${root}../../web/src/features/admin/AdminApp.jsx`;
  if (existsSync(adminApp)) {
    const source = readFileSync(adminApp, "utf8");
    assert.match(source, /Разбор по рейтингу/, "раздела разбора нет в панели");
    assert.match(source, /Оставить работать/, "кнопки «оставить работать» нет");
    assert.match(source, /Отключить водителя/, "кнопки «отключить» нет");
  }
}

console.log(
  `Driver rating case checks ok: ${RATING_CASE_MIN_REVIEWS} reviews under ${RATING_CASE_RATING_THRESHOLD} raise a card, nobody is blocked without a person deciding`
);

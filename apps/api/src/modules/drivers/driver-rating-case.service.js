import { query as defaultQuery } from "../../db/pool.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { ACTIVE_ORDER_STATUSES } from "../orders/order-dispatch.service.js";

// Низкий рейтинг поднимает карточку на разбор, а не отключает водителя сам.
//
// Раньше это работало автоматически: пятый отзыв, уронивший среднюю ниже трёх,
// блокировал водителя мгновенно. Пять поездок — это первая неделя нового
// водителя: две единицы и три четвёрки дают 2,8, и человек лишался заработка
// без единого живого взгляда. Столько же поездок хватает и на то, чтобы свести
// с кем-то счёты — в райцентре пассажиры ездят с одними и теми же водителями.
//
// Числа остаются те же, меняется последствие: сервис показывает владельцу
// карточку, а решение принимает человек.
export const RATING_CASE_MIN_REVIEWS = 5;
export const RATING_CASE_RATING_THRESHOLD = 3.0;

function run(executor, sql, params = []) {
  const target = executor || defaultQuery;
  return target.query ? target.query(sql, params) : target(sql, params);
}

export function needsRatingReview(averageRating, reviewCount) {
  return Number(reviewCount) >= RATING_CASE_MIN_REVIEWS
    && Number(averageRating) < RATING_CASE_RATING_THRESHOLD;
}

// Возвращает созданную карточку либо null, если поднимать нечего: рейтинг в
// норме, водитель уже заблокирован, или карточка по нему уже открыта.
export async function openRatingCaseIfNeeded({ driverId, averageRating, reviewCount, orderId = null, req = null }, executor) {
  if (!driverId || !needsRatingReview(averageRating, reviewCount)) return null;

  const driver = (await run(executor, "SELECT id, is_blocked FROM drivers WHERE id=$1 FOR UPDATE", [driverId])).rows[0];
  // Заблокированному разбор не нужен: решение по нему уже принято.
  if (!driver || driver.is_blocked) return null;

  // Уникальный частичный индекс делает повтор невозможным даже при двух
  // одновременных оценках; здесь он же гасит вторую попытку без ошибки.
  const created = (await run(executor, `
    INSERT INTO driver_rating_cases(driver_id, order_id, average_rating, review_count)
    VALUES($1,$2,$3,$4)
    ON CONFLICT (driver_id) WHERE status = 'PENDING' DO NOTHING
    RETURNING *
  `, [driverId, orderId, averageRating, reviewCount])).rows[0];
  if (!created) return null;

  await writeAudit(executor, {
    action: "driver_rating_case_opened",
    entityType: "driver",
    entityId: driverId,
    metadata: { averageRating: Number(averageRating), reviewCount: Number(reviewCount), caseId: created.id },
    req
  });
  return created;
}

export function publicRatingCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name ?? undefined,
    driverPhone: row.driver_phone ?? undefined,
    regionName: row.region_name ?? undefined,
    orderId: row.order_id,
    averageRating: Number(row.average_rating),
    reviewCount: Number(row.review_count),
    status: row.status,
    resolutionNote: row.resolution_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at
  };
}

export async function listRatingCases({ status = "PENDING" } = {}, executor) {
  const rows = (await run(executor, `
    SELECT c.*, d.name AS driver_name, d.phone AS driver_phone, r.name AS region_name
    FROM driver_rating_cases c
    JOIN drivers d ON d.id = c.driver_id
    LEFT JOIN regions r ON r.id = d.current_region_id
    WHERE ($1 = 'ALL' OR c.status = $1)
    ORDER BY c.created_at DESC
    LIMIT 200
  `, [status])).rows;
  return rows.map(publicRatingCase);
}

// Владелец решает: отключить водителя или оставить работать. Оба решения
// закрывают карточку — «оставить» это тоже решение, и оно должно быть видно.
export async function resolveRatingCase({ caseId, decision, note = "", actorUserId, req = null }, executor) {
  if (!["BLOCK", "DISMISS"].includes(decision)) {
    throw new AppError("Unknown rating case decision", 400, "INVALID_RATING_CASE_DECISION");
  }
  const existing = (await run(executor, "SELECT * FROM driver_rating_cases WHERE id=$1 FOR UPDATE", [caseId])).rows[0];
  if (!existing) throw new AppError("Rating case not found", 404, "RATING_CASE_NOT_FOUND");
  if (existing.status !== "PENDING") {
    throw new AppError("Rating case is already resolved", 409, "RATING_CASE_ALREADY_RESOLVED", {
      status: existing.status
    });
  }

  // Отказ до записи, а не после: пока человек кого-то везёт, отключать его
  // нельзя. Пассажир в машине об этом не просил, а закрывать заказ после
  // блокировки будет некому, кроме владельца. Сначала закройте поездку — потом
  // отключайте. Тот же отказ стоит и на блокировке из карточки водителя.
  if (decision === "BLOCK") {
    const active = (await run(executor,
      "SELECT id, short_id, status FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1",
      [existing.driver_id, ACTIVE_ORDER_STATUSES]
    )).rows[0];
    if (active) {
      throw new AppError(
        "This driver is on a trip right now — close that trip first",
        409,
        "DRIVER_HAS_ACTIVE_ORDER",
        { orderId: active.id, shortId: active.short_id, orderStatus: active.status }
      );
    }
  }

  const status = decision === "BLOCK" ? "BLOCKED" : "DISMISSED";
  const updated = (await run(executor, `
    UPDATE driver_rating_cases
    SET status=$2, resolution_note=$3, reviewed_by_user_id=$4, reviewed_at=NOW(), updated_at=NOW()
    WHERE id=$1
    RETURNING *
  `, [caseId, status, note || null, actorUserId || null])).rows[0];

  let blockedDriver = null;
  if (decision === "BLOCK") {
    blockedDriver = (await run(executor, `
      UPDATE drivers SET is_blocked=true, status='OFFLINE' WHERE id=$1 RETURNING *
    `, [existing.driver_id])).rows[0];
  }

  await writeAudit(executor, {
    action: decision === "BLOCK" ? "driver_blocked_after_rating_review" : "driver_rating_case_dismissed",
    actorUserId,
    entityType: "driver",
    entityId: existing.driver_id,
    metadata: { caseId, averageRating: Number(existing.average_rating), reviewCount: existing.review_count, note: note || null },
    req
  });

  return { ratingCase: publicRatingCase(updated), blockedDriver };
}

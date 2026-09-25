import { AppError } from "../../common/errors.js";
import { CLIENT_ACTIVE_ORDER_STATUSES } from "../orders/order-dispatch.service.js";

// Пассажир с той стороны, где на него смотрит владелец.
//
// Водители ставят пассажирам оценки с тегами и комментарием — это пишется в
// client_reviews, средняя ложится в clients.rating. Дальше не происходило
// ничего: ни списка пассажиров в панели, ни оценок, ни отзывов. Водитель
// тратил касание, а результат не мог увидеть никто.
//
// Рядом лежал столбец clients.is_blocked. Его проверяли ровно в одном месте —
// при бронировании места на стоянке, — а выставить не мог никто и никак.
// Флаг, который нельзя поднять, и проверка, которая поэтому никогда не
// срабатывает.

async function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export function publicAdminClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    rating: row.rating == null ? null : Number(row.rating),
    reviewCount: row.review_count == null ? 0 : Number(row.review_count),
    tripCount: row.trip_count == null ? 0 : Number(row.trip_count),
    cancelledCount: row.cancelled_count == null ? 0 : Number(row.cancelled_count),
    cashbackBalanceKzt: Number(row.cashback_balance || 0),
    isBlocked: Boolean(row.is_blocked),
    blockReason: row.block_reason || null,
    blockedAt: row.blocked_at || null,
    createdAt: row.created_at
  };
}

export async function listClients({ search = "", blocked = null, limit = 50, offset = 0 }, executor) {
  const values = [];
  const conditions = [];
  const term = String(search || "").trim();
  if (term) {
    values.push(`%${term.toLowerCase()}%`);
    conditions.push(`(LOWER(c.name) LIKE $${values.length} OR c.phone LIKE $${values.length})`);
  }
  if (blocked === true || blocked === false) {
    values.push(blocked);
    conditions.push(`c.is_blocked = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit, offset);

  const rows = (await run(executor, `
    SELECT c.*,
           (SELECT COUNT(*)::int FROM client_reviews r WHERE r.client_id = c.id) review_count,
           (SELECT COUNT(*)::int FROM orders o WHERE o.client_id = c.id AND o.status IN ('TRIP_COMPLETED','PAID','RATED')) trip_count,
           (SELECT COUNT(*)::int FROM orders o WHERE o.client_id = c.id AND o.status LIKE 'CANCELLED%') cancelled_count
    FROM clients c
    ${where}
    ORDER BY c.is_blocked DESC, c.rating ASC NULLS LAST, c.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `, values)).rows;

  const total = (await run(executor, `SELECT COUNT(*)::int total FROM clients c ${where}`, values.slice(0, values.length - 2))).rows[0].total;
  return { clients: rows.map(publicAdminClient), total };
}

// Сами отзывы, а не только средняя. Средняя говорит "3.2" и ничего не
// объясняет; решение принимают по тому, что водители написали.
export async function getClientDetail(clientId, executor) {
  const row = (await run(executor, `
    SELECT c.*,
           (SELECT COUNT(*)::int FROM client_reviews r WHERE r.client_id = c.id) review_count,
           (SELECT COUNT(*)::int FROM orders o WHERE o.client_id = c.id AND o.status IN ('TRIP_COMPLETED','PAID','RATED')) trip_count,
           (SELECT COUNT(*)::int FROM orders o WHERE o.client_id = c.id AND o.status LIKE 'CANCELLED%') cancelled_count
    FROM clients c WHERE c.id = $1
  `, [clientId])).rows[0];
  if (!row) throw new AppError("Client not found", 404, "CLIENT_NOT_FOUND");

  const reviews = (await run(executor, `
    SELECT r.id, r.rating, r.tags, r.comment, r.created_at,
           d.name driver_name, o.short_id order_short_id
    FROM client_reviews r
    LEFT JOIN drivers d ON d.id = r.driver_id
    LEFT JOIN orders o ON o.id = r.order_id
    WHERE r.client_id = $1
    ORDER BY r.created_at DESC
    LIMIT 50
  `, [clientId])).rows;

  return {
    client: publicAdminClient(row),
    reviews: reviews.map(review => ({
      id: review.id,
      rating: Number(review.rating),
      tags: review.tags || [],
      comment: review.comment || null,
      driverName: review.driver_name || null,
      orderShortId: review.order_short_id || null,
      createdAt: review.created_at
    }))
  };
}

// Блокировка пассажира, у которого идёт поездка, оставила бы его посреди
// дороги: заказ бы продолжался, а отменить и оплатить его стало бы нечем.
// Та же беда, что при блокировке водителя на рейсе, и тот же ответ — назвать
// поездку и дать сначала закрыть её.
export async function setClientBlocked({ clientId, blocked, reason = "", actorUserId }, executor) {
  const client = (await run(executor, "SELECT * FROM clients WHERE id=$1 FOR UPDATE", [clientId])).rows[0];
  if (!client) throw new AppError("Client not found", 404, "CLIENT_NOT_FOUND");

  if (blocked) {
    const running = (await run(
      executor,
      "SELECT id, short_id, status FROM orders WHERE client_id=$1 AND status = ANY($2::text[]) LIMIT 1",
      [clientId, CLIENT_ACTIVE_ORDER_STATUSES]
    )).rows[0];
    if (running) {
      throw new AppError(
        "This passenger is on a trip right now — close that trip first",
        409,
        "CLIENT_HAS_ACTIVE_ORDER",
        { orderId: running.id, shortId: running.short_id, orderStatus: running.status }
      );
    }
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) {
      throw new AppError("A block needs a reason", 400, "BLOCK_REASON_REQUIRED");
    }
  }

  const updated = (await run(executor, `
    UPDATE clients
       SET is_blocked=$2,
           block_reason=$3,
           blocked_at=CASE WHEN $2 THEN NOW() ELSE NULL END,
           blocked_by_user_id=CASE WHEN $2 THEN $4::uuid ELSE NULL END
     WHERE id=$1
     RETURNING *
  `, [clientId, blocked, blocked ? String(reason || "").trim() : null, actorUserId || null])).rows[0];

  return publicAdminClient(updated);
}

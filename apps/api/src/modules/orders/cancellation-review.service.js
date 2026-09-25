import { query as defaultQuery } from "../../db/pool.js";
import { haversineMeters } from "../stands/stands.service.js";
import { isDriverFixFreshEnoughForRoute } from "../routing/routing.service.js";

// The problem this exists for: a driver accepts an order through the app,
// drives to the rider, and then the trip is cancelled — by the driver, or by
// the rider at the driver's request — so the ride happens off the books and
// no commission is ever charged. Nothing here moves money. It records what
// the server already knows about each cancellation, scores how much it looks
// like that pattern, and puts it in front of the owner to decide.

// Below this, a cancellation is filed as CLEARED straight away: a rider
// changing their mind thirty seconds after ordering is the overwhelming
// majority of cancellations and must not bury the real cases.
export const REVIEW_THRESHOLD = 25;

// How far from the pickup point still counts as "the car was there".
const AT_PICKUP_METERS = 120;
// A follow-up observation only means something once the car has actually
// gone somewhere.
const MOVED_AWAY_METERS = 400;
const REPEAT_WINDOW_DAYS = 14;

function run(executor, sql, params = []) {
  if (!executor) return defaultQuery(sql, params);
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

const seconds = (from, to) => {
  if (!from || !to) return null;
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
};

const num = (value) => (value == null ? null : Number(value));

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Each signal carries its own weight and the plain sentence an owner reads in
// review, so the score is never a number nobody can explain.
export function scoreCancellation({
  cancelledBy,
  fromStatus,
  reasonCode,
  paymentMethod,
  secondsSinceAccept,
  secondsSinceArrival,
  driverDistanceToPickupM,
  waitingStarted,
  driverRepeatCount,
  pairRepeatCount
}) {
  const signals = [];
  const arrived = ["DRIVER_ARRIVED", "WAITING"].includes(fromStatus) || secondsSinceArrival != null;

  if (arrived) {
    signals.push({
      code: "CANCELLED_AFTER_ARRIVAL",
      weight: cancelledBy === "DRIVER" ? 30 : 25,
      label: "Отмена уже после подачи машины"
    });
  }
  if (waitingStarted) {
    signals.push({
      code: "WAITING_HAD_STARTED",
      weight: 15,
      label: "Ожидание пассажира уже начиналось — пассажир был на месте"
    });
  }
  if (driverDistanceToPickupM != null && driverDistanceToPickupM <= AT_PICKUP_METERS) {
    signals.push({
      code: "CAR_AT_PICKUP",
      weight: 20,
      label: `Машина стояла в точке подачи (${driverDistanceToPickupM} м)`
    });
  }
  if (cancelledBy === "DRIVER" && !reasonCode) {
    signals.push({
      code: "NO_REASON_GIVEN",
      weight: 10,
      label: "Водитель не указал причину отмены"
    });
  }
  // The whole scheme this review exists for, named by the person it was done
  // to: the driver takes the rider, then asks them to cancel so no commission
  // is charged. A rider has nothing to gain by saying it — they lose their car
  // either way — which is what makes it worth more than the generic signals
  // that would otherwise be all the owner sees.
  if (cancelledBy === "CLIENT" && reasonCode === "DRIVER_ASKED_TO_CANCEL") {
    signals.push({
      code: "CLIENT_SAYS_DRIVER_ASKED",
      weight: 35,
      label: "Пассажир говорит, что отменить попросил сам водитель"
    });
  }
  if (reasonCode === "CLIENT_NO_SHOW") {
    signals.push({
      code: "CLAIMED_NO_SHOW",
      weight: -15,
      label: "Водитель указал, что пассажир не вышел"
    });
  }
  if (reasonCode === "CAR_PROBLEM") {
    signals.push({
      code: "CLAIMED_CAR_PROBLEM",
      weight: -10,
      label: "Водитель указал поломку"
    });
  }
  if (paymentMethod === "CASH") {
    signals.push({
      code: "CASH_ORDER",
      weight: 5,
      label: "Оплата наличными — поездку можно увезти мимо кассы"
    });
  }
  if (secondsSinceAccept != null && secondsSinceAccept >= 300 && arrived) {
    signals.push({
      code: "LONG_COMMITMENT",
      weight: 10,
      label: "Водитель ехал к пассажиру больше 5 минут и всё равно отменил"
    });
  }
  if (driverRepeatCount >= 3) {
    signals.push({
      code: "DRIVER_REPEAT",
      weight: Math.min(20, 5 * driverRepeatCount),
      label: `У водителя ${driverRepeatCount} похожих отмен за ${REPEAT_WINDOW_DAYS} дней`
    });
  }
  if (pairRepeatCount >= 1) {
    signals.push({
      code: "SAME_PAIR_REPEAT",
      weight: Math.min(25, 12 * (pairRepeatCount + 1)),
      label: `Та же пара водитель/пассажир отменяла заказ ещё ${pairRepeatCount} раз(а)`
    });
  }

  const riskScore = clampScore(signals.reduce((sum, signal) => sum + signal.weight, 0));
  return { riskScore, signals };
}

async function countRecentAudits({ driverId, clientId }, executor) {
  const driverRepeat = driverId
    ? Number((await run(executor, `
        SELECT COUNT(*) c FROM order_cancellation_audits
        WHERE driver_id=$1
          AND created_at > NOW() - INTERVAL '${REPEAT_WINDOW_DAYS} days'
          AND risk_score >= ${REVIEW_THRESHOLD}
      `, [driverId])).rows[0].c)
    : 0;
  const pairRepeat = driverId && clientId
    ? Number((await run(executor, `
        SELECT COUNT(*) c FROM order_cancellation_audits
        WHERE driver_id=$1 AND client_id=$2
          AND created_at > NOW() - INTERVAL '${REPEAT_WINDOW_DAYS} days'
      `, [driverId, clientId])).rows[0].c)
    : 0;
  return { driverRepeatCount: driverRepeat, pairRepeatCount: pairRepeat };
}

// Called from every cancellation path. Deliberately never throws into the
// caller: a failure to file the audit must not roll back or block the
// cancellation itself, which is a rider-facing action.
export async function recordCancellationAudit({
  order,
  cancelledBy,
  actorUserId = null,
  fromStatus,
  reasonCode = null,
  reasonNote = null,
  driverId = null,
  executor = defaultQuery
}) {
  try {
    const effectiveDriverId = driverId || order.driver_id || null;
    const now = new Date();
    const arrivedAt = order.driver_arrived_at || order.arrived_at || null;
    const secondsSinceAccept = seconds(order.accepted_at, now);
    const secondsSinceArrival = seconds(arrivedAt, now);

    let driverLat = null;
    let driverLng = null;
    let driverDistanceToPickupM = null;
    if (effectiveDriverId) {
      const location = (await run(
        executor,
        "SELECT lat, lng FROM driver_locations WHERE driver_id=$1",
        [effectiveDriverId]
      )).rows[0];
      driverLat = num(location?.lat);
      driverLng = num(location?.lng);
      if (driverLat != null && driverLng != null && order.pickup_lat != null && order.pickup_lng != null) {
        driverDistanceToPickupM = Math.round(haversineMeters(
          Number(order.pickup_lat),
          Number(order.pickup_lng),
          driverLat,
          driverLng
        ));
      }
    }

    const { driverRepeatCount, pairRepeatCount } = await countRecentAudits({
      driverId: effectiveDriverId,
      clientId: order.client_id
    }, executor);

    const { riskScore, signals } = scoreCancellation({
      cancelledBy,
      fromStatus,
      reasonCode,
      paymentMethod: order.payment_method,
      secondsSinceAccept,
      secondsSinceArrival,
      driverDistanceToPickupM,
      waitingStarted: Boolean(order.waiting_started_at),
      driverRepeatCount,
      pairRepeatCount
    });

    const needsReview = riskScore >= REVIEW_THRESHOLD;
    const inserted = (await run(executor, `
      INSERT INTO order_cancellation_audits(
        order_id, driver_id, client_id, region_id, cancelled_by, actor_user_id,
        from_status, reason_code, reason_note, risk_score, signals,
        order_price, service_commission, seconds_since_accept, seconds_since_arrival,
        driver_distance_to_pickup_m, driver_lat, driver_lng,
        follow_up_status, review_status, review_note
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *
    `, [
      order.id,
      effectiveDriverId,
      order.client_id || null,
      order.region_id || null,
      cancelledBy,
      actorUserId,
      fromStatus,
      reasonCode,
      reasonNote,
      riskScore,
      JSON.stringify(signals),
      order.price == null ? null : Math.round(Number(order.price)),
      order.service_commission == null ? null : Math.round(Number(order.service_commission)),
      secondsSinceAccept,
      secondsSinceArrival,
      driverDistanceToPickupM,
      driverLat,
      driverLng,
      // Only a cancellation that already looks wrong is worth watching
      // afterwards; anything else is filed and closed.
      needsReview && effectiveDriverId ? "PENDING" : "SKIPPED",
      needsReview ? "PENDING" : "CLEARED",
      needsReview ? null : "Автоматически: низкий риск"
    ])).rows[0];
    return inserted;
  } catch (error) {
    console.error("[cancellation-review] failed to record audit", { orderId: order?.id, error });
    return null;
  }
}

// The second half of the evidence: where the car actually went after the
// cancellation. A driver who genuinely lost the trip drives away or takes
// another order; a driver who cancelled and then drove the rider anyway ends
// up moving from the pickup point towards that order's destination.
export async function runFollowUpObservation({ audit, executor = defaultQuery }) {
  const order = (await run(
    executor,
    "SELECT id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status FROM orders WHERE id=$1",
    [audit.order_id]
  )).rows[0];
  const location = (await run(
    executor,
    "SELECT lat, lng, updated_at FROM driver_locations WHERE driver_id=$1",
    [audit.driver_id]
  )).rows[0];

  const signals = Array.isArray(audit.signals) ? [...audit.signals] : [];
  let fromPickupM = null;
  let toDropoffM = null;

  // По этой цифре решают, был ли водитель у подачи, и из неё вырастает разбор
  // отмены. Считать её от точки, которой пять дней, — значит судить человека
  // по тому, где он был на прошлой неделе. Старая точка тут не «примерно», а
  // «неизвестно».
  const fixIsUsable = location && isDriverFixFreshEnoughForRoute(location.updated_at);
  if (order && fixIsUsable && location.lat != null && location.lng != null) {
    if (order.pickup_lat != null && order.pickup_lng != null) {
      fromPickupM = Math.round(haversineMeters(
        Number(order.pickup_lat), Number(order.pickup_lng),
        Number(location.lat), Number(location.lng)
      ));
    }
    if (order.dropoff_lat != null && order.dropoff_lng != null) {
      toDropoffM = Math.round(haversineMeters(
        Number(order.dropoff_lat), Number(order.dropoff_lng),
        Number(location.lat), Number(location.lng)
      ));
    }
    const originalTripM = (order.pickup_lat != null && order.dropoff_lat != null)
      ? haversineMeters(
          Number(order.pickup_lat), Number(order.pickup_lng),
          Number(order.dropoff_lat), Number(order.dropoff_lng)
        )
      : null;
    if (
      fromPickupM != null && toDropoffM != null && originalTripM != null &&
      fromPickupM >= MOVED_AWAY_METERS && toDropoffM < originalTripM * 0.6
    ) {
      signals.push({
        code: "DROVE_THE_CANCELLED_ROUTE",
        weight: 25,
        label: `После отмены машина ушла на ${fromPickupM} м от подачи в сторону адреса заказа (осталось ${toDropoffM} м)`
      });
    }
  }

  const riskScore = clampScore(signals.reduce((sum, signal) => sum + Number(signal.weight || 0), 0));
  const updated = (await run(executor, `
    UPDATE order_cancellation_audits
    SET follow_up_status='OBSERVED',
        follow_up_checked_at=NOW(),
        follow_up_distance_from_pickup_m=$2,
        follow_up_distance_to_dropoff_m=$3,
        signals=$4::jsonb,
        risk_score=$5,
        review_status=CASE WHEN review_status='CLEARED' AND $5 >= ${REVIEW_THRESHOLD} THEN 'PENDING' ELSE review_status END,
        updated_at=NOW()
    WHERE id=$1
    RETURNING *
  `, [audit.id, fromPickupM, toDropoffM, JSON.stringify(signals), riskScore])).rows[0];
  return updated;
}

export function publicCancellationAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    orderShortId: row.order_short_id ?? null,
    driverId: row.driver_id,
    driverName: row.driver_name ?? null,
    driverPhone: row.driver_phone ?? null,
    clientId: row.client_id,
    clientName: row.client_name ?? null,
    clientPhone: row.client_phone ?? null,
    regionId: row.region_id,
    regionName: row.region_name ?? null,
    cancelledBy: row.cancelled_by,
    fromStatus: row.from_status,
    reasonCode: row.reason_code,
    reasonNote: row.reason_note,
    riskScore: Number(row.risk_score),
    signals: Array.isArray(row.signals) ? row.signals : [],
    orderPrice: num(row.order_price),
    serviceCommission: num(row.service_commission),
    secondsSinceAccept: num(row.seconds_since_accept),
    secondsSinceArrival: num(row.seconds_since_arrival),
    driverDistanceToPickupM: num(row.driver_distance_to_pickup_m),
    followUpStatus: row.follow_up_status,
    followUpDistanceFromPickupM: num(row.follow_up_distance_from_pickup_m),
    followUpDistanceToDropoffM: num(row.follow_up_distance_to_dropoff_m),
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at
  };
}

const AUDIT_SELECT = `
  a.*, o.short_id order_short_id,
  d.name driver_name, d.phone driver_phone,
  c.name client_name, c.phone client_phone,
  r.name region_name
`;

export async function listCancellationAudits({
  reviewStatus,
  regionId,
  driverId,
  minRiskScore,
  limit = 50,
  offset = 0
} = {}, executor = defaultQuery) {
  const params = [];
  const where = [];
  if (reviewStatus) {
    params.push(reviewStatus);
    where.push(`a.review_status=$${params.length}`);
  }
  if (regionId) {
    params.push(regionId);
    where.push(`a.region_id=$${params.length}`);
  }
  if (driverId) {
    params.push(driverId);
    where.push(`a.driver_id=$${params.length}`);
  }
  if (minRiskScore != null) {
    params.push(minRiskScore);
    where.push(`a.risk_score >= $${params.length}`);
  }
  params.push(limit);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;
  const result = await run(executor, `
    SELECT ${AUDIT_SELECT}
    FROM order_cancellation_audits a
    LEFT JOIN orders o ON o.id=a.order_id
    LEFT JOIN drivers d ON d.id=a.driver_id
    LEFT JOIN clients c ON c.id=a.client_id
    LEFT JOIN regions r ON r.id=a.region_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY a.risk_score DESC, a.created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `, params);
  return result.rows.map(publicCancellationAudit);
}

export async function getCancellationReviewSummary(executor = defaultQuery) {
  const row = (await run(executor, `
    SELECT
      COUNT(*) FILTER (WHERE review_status='PENDING') pending,
      COUNT(*) FILTER (WHERE review_status='PENDING' AND risk_score >= 60) high_risk,
      COUNT(*) FILTER (WHERE review_status='CONFIRMED_FRAUD') confirmed,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') last_week
    FROM order_cancellation_audits
  `)).rows[0];
  return {
    pending: Number(row.pending),
    highRisk: Number(row.high_risk),
    confirmed: Number(row.confirmed),
    lastWeek: Number(row.last_week)
  };
}

export async function reviewCancellationAudit({ auditId, reviewStatus, reviewNote, reviewerUserId }, executor = defaultQuery) {
  const updated = (await run(executor, `
    UPDATE order_cancellation_audits
    SET review_status=$2,
        review_note=$3,
        reviewed_by_user_id=$4,
        reviewed_at=NOW(),
        updated_at=NOW()
    WHERE id=$1
    RETURNING *
  `, [auditId, reviewStatus, reviewNote || null, reviewerUserId])).rows[0];
  return updated;
}

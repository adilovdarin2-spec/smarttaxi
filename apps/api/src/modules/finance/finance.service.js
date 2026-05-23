async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round(number(value));
}

function snapshot(order) {
  const raw = order?.pricing_snapshot;
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

function snapshotNumber(data, key, fallback) {
  if (data[key] === null || data[key] === undefined || data[key] === "") return fallback;
  return number(data[key], fallback);
}

function uuidOrNull(value) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function normalizePaymentMethod(value) {
  if (value === "CASH") return "CASH";
  if (value === "KASPI" || value === "KASPI_TRANSFER") return "KASPI_TRANSFER";
  return "UNKNOWN";
}

function orderAmounts(order) {
  const data = snapshot(order);
  const finalPrice = roundMoney(snapshotNumber(data, "finalPrice", snapshotNumber(data, "estimatedPrice", order.price)));
  const serviceCommission = roundMoney(snapshotNumber(data, "serviceCommission", order.service_commission));
  const driverEarning = roundMoney(snapshotNumber(data, "driverEarning", finalPrice - serviceCommission));
  return {
    finalPrice,
    serviceCommission,
    driverEarning,
    tariffId: uuidOrNull(data.tariffId),
    tariffName: data.tariffName || order.tariff || null,
    distanceKm: snapshotNumber(data, "distanceKm", order.distance_km ?? null),
    durationMin: snapshotNumber(data, "durationMin", order.duration_min ?? null),
    pricingSource: data.finalPrice || data.estimatedPrice ? "pricing_snapshot" : "order_columns"
  };
}

function transactionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    orderShortId: row.order_short_id || null,
    driverId: row.driver_id,
    driverName: row.driver_name || null,
    driverPhone: row.driver_phone || null,
    driverCar: [row.car_model, row.car_color, row.plate].filter(Boolean).join(" ") || null,
    clientUserId: row.client_user_id,
    regionId: row.region_id,
    regionName: row.region_name || null,
    tariffId: row.tariff_id,
    tariffName: row.tariff_name || row.metadata?.tariffName || null,
    type: row.type,
    paymentMethod: row.payment_method,
    grossAmount: roundMoney(row.gross_amount),
    serviceCommission: roundMoney(row.service_commission),
    driverEarning: roundMoney(row.driver_earning),
    driverDebtDelta: roundMoney(row.driver_debt_delta),
    currency: row.currency || "KZT",
    status: row.status,
    metadata: row.metadata || {},
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getPostedTransaction(orderId, type, executor) {
  const result = await run(executor, `
    SELECT ft.*, o.short_id order_short_id, d.name driver_name, d.phone driver_phone,
           d.car_model, d.car_color, d.plate, r.name region_name, t.name tariff_name
    FROM financial_transactions ft
    LEFT JOIN orders o ON o.id=ft.order_id
    LEFT JOIN drivers d ON d.id=ft.driver_id
    LEFT JOIN regions r ON r.id=ft.region_id
    LEFT JOIN tariffs t ON t.id=ft.tariff_id
    WHERE ft.order_id=$1 AND ft.type=$2 AND ft.status='POSTED'
    ORDER BY ft.created_at DESC
    LIMIT 1
  `, [orderId, type]);
  return transactionRow(result.rows[0]);
}

export async function createOrderCompletedTransaction(order, actorUserId = null, executor = defaultQuery) {
  const amounts = orderAmounts(order);
  const paymentMethod = normalizePaymentMethod(order.payment_method);
  const paymentNeedsReview = paymentMethod === "UNKNOWN";
  const metadata = {
    orderStatus: order.status,
    tariffName: amounts.tariffName,
    distanceKm: amounts.distanceKm,
    durationMin: amounts.durationMin,
    pricingSource: amounts.pricingSource,
    paymentNeedsReview
  };

  const result = await run(executor, `
    INSERT INTO financial_transactions(
      order_id, driver_id, client_user_id, region_id, tariff_id, type, payment_method,
      gross_amount, service_commission, driver_earning, driver_debt_delta,
      currency, status, metadata, created_by_user_id
    )
    VALUES(
      $1,$2,(SELECT user_id FROM clients WHERE id=$3),$4,$5,'ORDER_COMPLETED',$6,
      $7,$8,$9,$10,'KZT','POSTED',$11::jsonb,$12
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `, [
    order.id,
    order.driver_id || null,
    order.client_id || null,
    order.region_id || null,
    amounts.tariffId,
    paymentMethod,
    amounts.finalPrice,
    amounts.serviceCommission,
    amounts.driverEarning,
    amounts.serviceCommission,
    JSON.stringify(metadata),
    actorUserId
  ]);

  if (result.rows[0]) return transactionRow(result.rows[0]);
  return getPostedTransaction(order.id, "ORDER_COMPLETED", executor);
}

export async function createOrderCancelledTransaction(order, actorUserId = null, executor = defaultQuery) {
  const existing = await getPostedTransaction(order.id, "ORDER_CANCELLED", executor);
  if (existing) return existing;

  const amounts = orderAmounts(order);
  const result = await run(executor, `
    INSERT INTO financial_transactions(
      order_id, driver_id, client_user_id, region_id, tariff_id, type, payment_method,
      gross_amount, service_commission, driver_earning, driver_debt_delta,
      currency, status, metadata, created_by_user_id
    )
    VALUES(
      $1,$2,(SELECT user_id FROM clients WHERE id=$3),$4,$5,'ORDER_CANCELLED',$6,
      0,0,0,0,'KZT','POSTED',$7::jsonb,$8
    )
    RETURNING *
  `, [
    order.id,
    order.driver_id || null,
    order.client_id || null,
    order.region_id || null,
    amounts.tariffId,
    normalizePaymentMethod(order.payment_method),
    JSON.stringify({
      orderStatus: order.status,
      tariffName: amounts.tariffName,
      pricingSource: amounts.pricingSource
    }),
    actorUserId
  ]);
  return transactionRow(result.rows[0]);
}

function financeFilters({ regionId, driverId, dateFrom, dateTo, type } = {}) {
  const params = [];
  const where = ["ft.status='POSTED'"];
  if (regionId) {
    params.push(regionId);
    where.push(`ft.region_id=$${params.length}`);
  }
  if (driverId) {
    params.push(driverId);
    where.push(`ft.driver_id=$${params.length}`);
  }
  if (type) {
    params.push(type);
    where.push(`ft.type=$${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`ft.created_at >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`ft.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  return { params, where: where.join(" AND ") };
}

export async function getFinanceSummary(filters = {}, executor = defaultQuery) {
  const { params, where } = financeFilters(filters);
  const result = await run(executor, `
    SELECT
      COALESCE(SUM(gross_amount) FILTER (WHERE type='ORDER_COMPLETED'), 0) gross_total,
      COALESCE(SUM(service_commission) FILTER (WHERE type='ORDER_COMPLETED'), 0) service_commission_total,
      COALESCE(SUM(driver_earning) FILTER (WHERE type='ORDER_COMPLETED'), 0) driver_earning_total,
      COALESCE(SUM(driver_debt_delta), 0) driver_debt_total,
      COUNT(*) FILTER (WHERE type='ORDER_COMPLETED')::int completed_order_count,
      COUNT(*) FILTER (WHERE type='ORDER_CANCELLED')::int cancelled_order_count,
      COUNT(*)::int transaction_count,
      COALESCE(MAX(currency), 'KZT') currency
    FROM financial_transactions ft
    WHERE ${where}
  `, params);
  const row = result.rows[0] || {};
  return {
    grossTotal: roundMoney(row.gross_total),
    serviceCommissionTotal: roundMoney(row.service_commission_total),
    driverEarningTotal: roundMoney(row.driver_earning_total),
    driverDebtTotal: roundMoney(row.driver_debt_total),
    completedOrderCount: Number(row.completed_order_count || 0),
    cancelledOrderCount: Number(row.cancelled_order_count || 0),
    transactionCount: Number(row.transaction_count || 0),
    currency: row.currency || "KZT"
  };
}

export async function getDriverDebts(filters = {}, executor = defaultQuery) {
  const scoped = { ...filters };
  delete scoped.driverId;
  delete scoped.type;
  const { params, where } = financeFilters(scoped);
  const result = await run(executor, `
    SELECT
      d.id driver_id,
      d.name driver_name,
      d.phone,
      d.car_model,
      d.car_color,
      d.plate,
      COALESCE(SUM(ft.driver_debt_delta), 0) debt_total,
      COUNT(*) FILTER (WHERE ft.type='ORDER_COMPLETED')::int completed_orders,
      MAX(ft.created_at) last_transaction_at,
      COALESCE(MAX(ft.currency), 'KZT') currency
    FROM financial_transactions ft
    JOIN drivers d ON d.id=ft.driver_id
    WHERE ${where}
    GROUP BY d.id
    HAVING COALESCE(SUM(ft.driver_debt_delta), 0) <> 0 OR COUNT(*) FILTER (WHERE ft.type='ORDER_COMPLETED') > 0
    ORDER BY debt_total DESC, last_transaction_at DESC NULLS LAST
  `, params);
  return result.rows.map(row => ({
    driverId: row.driver_id,
    driverName: row.driver_name,
    phone: row.phone,
    car: [row.car_model, row.car_color, row.plate].filter(Boolean).join(" "),
    debtTotal: roundMoney(row.debt_total),
    completedOrders: Number(row.completed_orders || 0),
    lastTransactionAt: row.last_transaction_at,
    currency: row.currency || "KZT"
  }));
}

export async function getTransactions(filters = {}, executor = defaultQuery) {
  const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 200);
  const { params, where } = financeFilters(filters);
  params.push(limit);
  const result = await run(executor, `
    SELECT ft.*, o.short_id order_short_id, d.name driver_name, d.phone driver_phone,
           d.car_model, d.car_color, d.plate, r.name region_name, t.name tariff_name
    FROM financial_transactions ft
    LEFT JOIN orders o ON o.id=ft.order_id
    LEFT JOIN drivers d ON d.id=ft.driver_id
    LEFT JOIN regions r ON r.id=ft.region_id
    LEFT JOIN tariffs t ON t.id=ft.tariff_id
    WHERE ${where}
    ORDER BY ft.created_at DESC
    LIMIT $${params.length}
  `, params);
  return result.rows.map(transactionRow);
}

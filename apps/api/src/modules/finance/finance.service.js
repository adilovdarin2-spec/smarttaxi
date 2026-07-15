import { refundKaspiPayment } from "../payments/payment-provider.js";

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

export function validateFinanceDateRange({ dateFrom, dateTo } = {}) {
  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    throw new Error("dateFrom must be before dateTo");
  }
  return { dateFrom, dateTo };
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

  // A trip normally can't be cancelled once its payment is PAID —
  // assertStatusTransition treats PAID as terminal, cancellation is only
  // reachable from pre-trip statuses today. This stays defensive anyway:
  // money handling code shouldn't rely on every caller upstream getting the
  // state machine right forever. If a cancellation ever does land on an
  // already-paid order (a future dispute/admin path, a bug elsewhere), the
  // client doesn't just lose that money — it goes back onto their spendable
  // cashback balance, the same balance orders.cashback_used already draws
  // down on the next ride, instead of a zero-amount transaction that quietly
  // pretends nothing was ever charged.
  let refundedKzt = 0;
  let refundedViaGateway = false;
  if (order.payment_status === "PAID" && order.client_id) {
    const paidPayment = await run(
      executor,
      "SELECT * FROM payments WHERE order_id=$1 AND status='PAID' ORDER BY updated_at DESC LIMIT 1",
      [order.id]
    );
    const payment = paidPayment.rows[0];
    refundedKzt = roundMoney(payment?.amount ?? order.price ?? 0);
    if (refundedKzt > 0) {
      // A real Kaspi Pay charge gets refunded at the source first — the
      // client gets their actual money back on their card/Kaspi account,
      // not just store credit. Only falls back to crediting cashback_balance
      // if the payment wasn't a real gateway charge (mock/manual) or the
      // live refund call itself fails, so the client is never left with
      // neither a real refund nor store credit.
      if (payment?.provider === "KASPI_PAY") {
        try {
          await refundKaspiPayment({ payment, amountKzt: refundedKzt });
          await run(executor, "UPDATE payments SET status='CANCELLED', updated_at=NOW() WHERE id=$1", [payment.id]);
          refundedViaGateway = true;
        } catch (error) {
          console.error("[finance] Kaspi Pay refund failed, falling back to cashback credit", error);
        }
      }
      if (!refundedViaGateway) {
        const updatedClient = await run(
          executor,
          "UPDATE clients SET cashback_balance=cashback_balance+$1 WHERE id=$2 RETURNING cashback_balance",
          [refundedKzt, order.client_id]
        );
        await run(executor, `
          INSERT INTO cashback_transactions(client_id,order_id,type,amount,balance_after)
          VALUES($1,$2,'ORDER_CANCEL_REFUND',$3,$4)
        `, [order.client_id, order.id, refundedKzt, updatedClient.rows[0].cashback_balance]);
      }
    } else {
      refundedKzt = 0;
    }
  }

  // Cancellation/no-show fee: compensates the driver for a trip they were
  // already committed to (accepted_at set) when the rider backed out, or
  // for showing up and waiting when the rider never appeared. Driver
  // cancelling (CANCELLED_BY_DRIVER) or an operator cancelling never charges
  // the rider — this is only for the rider's own no-show/late cancel.
  // Charged out of clients.cashback_balance, the same balance the refund
  // above credits back into — capped at whatever's actually there, since
  // there's no client debt/credit concept in this codebase to fall back on.
  // The driver is only ever credited what was actually collected, never the
  // full nominal fee if the client's balance couldn't cover it.
  let feeKzt = 0;
  let feeType = null;
  if (order.status === "NO_SHOW") {
    feeType = "NO_SHOW_FEE";
  } else if (order.status === "CANCELLED_BY_CLIENT" && order.accepted_at) {
    feeType = "CANCELLATION_FEE";
  }
  if (feeType && order.driver_id && order.client_id) {
    const tariffFees = (await run(
      executor,
      "SELECT cancellation_fee, no_show_fee FROM tariffs WHERE region_id=$1 AND name=$2",
      [order.region_id, order.tariff]
    )).rows[0];
    const nominalFee = roundMoney(feeType === "NO_SHOW_FEE" ? tariffFees?.no_show_fee : tariffFees?.cancellation_fee);
    if (nominalFee > 0) {
      const client = (await run(executor, "SELECT cashback_balance FROM clients WHERE id=$1 FOR UPDATE", [order.client_id])).rows[0];
      const chargeable = Math.max(0, Math.min(nominalFee, number(client?.cashback_balance)));
      if (chargeable > 0) {
        const updatedClient = await run(
          executor,
          "UPDATE clients SET cashback_balance=cashback_balance-$1 WHERE id=$2 RETURNING cashback_balance",
          [chargeable, order.client_id]
        );
        await run(executor, `
          INSERT INTO cashback_transactions(client_id,order_id,type,amount,balance_after)
          VALUES($1,$2,$3,$4,$5)
        `, [order.client_id, order.id, feeType, -chargeable, updatedClient.rows[0].cashback_balance]);
        await run(executor, "UPDATE drivers SET balance=balance+$1 WHERE id=$2", [chargeable, order.driver_id]);
        feeKzt = chargeable;
      }
    }
  }

  const result = await run(executor, `
    INSERT INTO financial_transactions(
      order_id, driver_id, client_user_id, region_id, tariff_id, type, payment_method,
      gross_amount, service_commission, driver_earning, driver_debt_delta,
      currency, status, metadata, created_by_user_id
    )
    VALUES(
      $1,$2,(SELECT user_id FROM clients WHERE id=$3),$4,$5,'ORDER_CANCELLED',$6,
      $7,0,$7,0,'KZT','POSTED',$8::jsonb,$9
    )
    RETURNING *
  `, [
    order.id,
    order.driver_id || null,
    order.client_id || null,
    order.region_id || null,
    amounts.tariffId,
    normalizePaymentMethod(order.payment_method),
    feeKzt,
    JSON.stringify({
      orderStatus: order.status,
      tariffName: amounts.tariffName,
      pricingSource: amounts.pricingSource,
      refundedKzt,
      refundedViaGateway,
      feeType,
      feeKzt
    }),
    actorUserId
  ]);
  return transactionRow(result.rows[0]);
}

function financeFilters({
  regionId,
  driverId,
  tariffId,
  dateFrom,
  dateTo,
  type,
  paymentMethod,
  status
} = {}, { defaultPosted = true } = {}) {
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`ft.status=$${params.length}`);
  } else if (defaultPosted) {
    where.push("ft.status='POSTED'");
  }
  if (regionId) {
    params.push(regionId);
    where.push(`ft.region_id=$${params.length}`);
  }
  if (driverId) {
    params.push(driverId);
    where.push(`ft.driver_id=$${params.length}`);
  }
  if (tariffId) {
    params.push(tariffId);
    where.push(`ft.tariff_id=$${params.length}`);
  }
  if (type) {
    params.push(type);
    where.push(`ft.type=$${params.length}`);
  }
  if (paymentMethod) {
    params.push(paymentMethod);
    where.push(`ft.payment_method=$${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`ft.created_at >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`ft.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  return { params, where: where.length ? where.join(" AND ") : "true" };
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
  delete scoped.type;
  delete scoped.paymentMethod;
  delete scoped.status;
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
  const offset = Math.max(Number(filters.offset || 0), 0);
  const { params, where } = financeFilters(filters);
  const total = await run(executor, `
    SELECT COUNT(*)::int total
    FROM financial_transactions ft
    WHERE ${where}
  `, params);
  params.push(limit, offset);
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
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `, params);
  return {
    items: result.rows.map(transactionRow),
    total: Number(total.rows[0]?.total || 0),
    limit,
    offset
  };
}

export async function adjustDriverDebt({
  driverId,
  amount,
  reason,
  regionId = null,
  metadata = {},
  actorUserId = null
}, executor = defaultQuery) {
  const numericAmount = roundMoney(amount);
  const cleanReason = String(reason || "").trim();
  const driver = (await run(executor, "SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [driverId])).rows[0];
  if (!driver) throw new Error("DRIVER_NOT_FOUND");

  const result = await run(executor, `
    INSERT INTO financial_transactions(
      driver_id, region_id, type, payment_method, gross_amount, service_commission,
      driver_earning, driver_debt_delta, currency, status, metadata, created_by_user_id
    )
    VALUES($1,$2,'DRIVER_DEBT_ADJUSTED','UNKNOWN',0,0,0,$3,'KZT','POSTED',$4::jsonb,$5)
    RETURNING *
  `, [
    driverId,
    regionId || driver.current_region_id || null,
    numericAmount,
    JSON.stringify({
      ...metadata,
      reason: cleanReason,
      source: "ADMIN_MANUAL_ADJUSTMENT"
    }),
    actorUserId
  ]);

  await run(executor, "UPDATE drivers SET debt=GREATEST(0, debt+$1) WHERE id=$2", [numericAmount, driverId]);
  return transactionRow(result.rows[0]);
}

// Nets any outstanding CASH/KASPI commission debt against available
// balance the moment there's balance to take it from — right after a
// non-cash trip credits balance (orders.routes.js), and again defensively
// right before a payout request is created (wallet.service.js), so debt
// doesn't just sit on the books forever next to a growing balance waiting
// for an operator to notice and run adjustDriverDebt by hand.
export async function settleDriverDebtFromBalance(driverId, executor = defaultQuery) {
  const driver = (await run(executor, "SELECT balance, debt FROM drivers WHERE id=$1 FOR UPDATE", [driverId])).rows[0];
  if (!driver) return { settledKzt: 0 };
  const balance = number(driver.balance);
  const debt = number(driver.debt);
  const settleAmount = roundMoney(Math.min(balance, debt));
  if (settleAmount <= 0) return { settledKzt: 0 };

  await run(executor, "UPDATE drivers SET balance=balance-$1, debt=debt-$1 WHERE id=$2", [settleAmount, driverId]);
  await run(executor, `
    INSERT INTO financial_transactions(
      driver_id, type, payment_method, gross_amount, service_commission,
      driver_earning, driver_debt_delta, currency, status, metadata
    )
    VALUES($1,'DRIVER_DEBT_ADJUSTED','UNKNOWN',0,0,0,$2,'KZT','POSTED',$3::jsonb)
  `, [driverId, -settleAmount, JSON.stringify({ reason: "Debt settled from available balance", source: "AUTO_SETTLEMENT" })]);

  return { settledKzt: settleAmount };
}

function reportGroupExpression(groupBy) {
  return {
    day: {
      key: "to_char(date_trunc('day', ft.created_at), 'YYYY-MM-DD')",
      label: "to_char(date_trunc('day', ft.created_at), 'YYYY-MM-DD')",
      order: "key ASC"
    },
    region: {
      key: "COALESCE(ft.region_id::text, 'none')",
      label: "COALESCE(r.name, 'Регион не указан')",
      order: "label ASC"
    },
    driver: {
      key: "COALESCE(ft.driver_id::text, 'none')",
      label: "COALESCE(d.name, 'Водитель не указан')",
      order: "label ASC"
    },
    tariff: {
      key: "COALESCE(ft.tariff_id::text, 'none')",
      label: "COALESCE(t.display_name, t.name, ft.metadata->>'tariffName', 'Тариф не указан')",
      order: "label ASC"
    },
    paymentMethod: {
      key: "ft.payment_method",
      label: "ft.payment_method",
      order: "key ASC"
    }
  }[groupBy];
}

function reportRow(row) {
  return {
    key: row.key,
    label: row.label,
    grossTotal: roundMoney(row.gross_total),
    serviceCommissionTotal: roundMoney(row.service_commission_total),
    driverEarningTotal: roundMoney(row.driver_earning_total),
    driverDebtDeltaTotal: roundMoney(row.driver_debt_delta_total),
    completedOrderCount: Number(row.completed_order_count || 0),
    cancelledOrderCount: Number(row.cancelled_order_count || 0),
    transactionCount: Number(row.transaction_count || 0),
    currency: row.currency || "KZT"
  };
}

export async function getFinanceReports(filters = {}, executor = defaultQuery) {
  const groupBy = filters.groupBy || "day";
  const group = reportGroupExpression(groupBy);
  if (!group) throw new Error("INVALID_GROUP_BY");
  const { params, where } = financeFilters(filters);
  const result = await run(executor, `
    SELECT
      ${group.key} key,
      ${group.label} label,
      COALESCE(SUM(ft.gross_amount) FILTER (WHERE ft.type='ORDER_COMPLETED'), 0) gross_total,
      COALESCE(SUM(ft.service_commission) FILTER (WHERE ft.type='ORDER_COMPLETED'), 0) service_commission_total,
      COALESCE(SUM(ft.driver_earning) FILTER (WHERE ft.type='ORDER_COMPLETED'), 0) driver_earning_total,
      COALESCE(SUM(ft.driver_debt_delta), 0) driver_debt_delta_total,
      COUNT(*) FILTER (WHERE ft.type='ORDER_COMPLETED')::int completed_order_count,
      COUNT(*) FILTER (WHERE ft.type='ORDER_CANCELLED')::int cancelled_order_count,
      COUNT(*)::int transaction_count,
      COALESCE(MAX(ft.currency), 'KZT') currency
    FROM financial_transactions ft
    LEFT JOIN drivers d ON d.id=ft.driver_id
    LEFT JOIN regions r ON r.id=ft.region_id
    LEFT JOIN tariffs t ON t.id=ft.tariff_id
    WHERE ${where}
    GROUP BY ${group.key}, ${group.label}
    ORDER BY ${group.order}
  `, params);
  const rows = result.rows.map(reportRow);
  const totals = rows.reduce((acc, row) => ({
    grossTotal: acc.grossTotal + row.grossTotal,
    serviceCommissionTotal: acc.serviceCommissionTotal + row.serviceCommissionTotal,
    driverEarningTotal: acc.driverEarningTotal + row.driverEarningTotal,
    driverDebtDeltaTotal: acc.driverDebtDeltaTotal + row.driverDebtDeltaTotal,
    completedOrderCount: acc.completedOrderCount + row.completedOrderCount,
    cancelledOrderCount: acc.cancelledOrderCount + row.cancelledOrderCount,
    transactionCount: acc.transactionCount + row.transactionCount,
    currency: row.currency || acc.currency
  }), {
    grossTotal: 0,
    serviceCommissionTotal: 0,
    driverEarningTotal: 0,
    driverDebtDeltaTotal: 0,
    completedOrderCount: 0,
    cancelledOrderCount: 0,
    transactionCount: 0,
    currency: "KZT"
  });
  return { rows, totals };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportFinanceTransactionsCsv(filters = {}, executor = defaultQuery) {
  const result = await getTransactions({ ...filters, limit: filters.limit || 200, offset: filters.offset || 0 }, executor);
  const header = [
    "date",
    "type",
    "order",
    "driver",
    "region",
    "tariff",
    "payment_method",
    "gross_amount",
    "service_commission",
    "driver_earning",
    "driver_debt_delta",
    "status",
    "reason"
  ];
  const rows = result.items.map(item => [
    item.createdAt,
    item.type,
    item.orderShortId,
    item.driverName,
    item.regionName,
    item.tariffName,
    item.paymentMethod,
    item.grossAmount,
    item.serviceCommission,
    item.driverEarning,
    item.driverDebtDelta,
    item.status,
    item.metadata?.reason || ""
  ]);
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
}

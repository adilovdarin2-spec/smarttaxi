import { AppError } from "../../common/errors.js";
import { settleDriverDebtFromBalance } from "../finance/finance.service.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export const MIN_PAYOUT_KZT = 3000;

// Standard mod-10 checksum every real card PAN satisfies — catches typos
// (transposed/missing digits) before they end up as a "send money to this
// number" instruction an admin manually keys into their own banking app.
// Not a substitute for real card verification (there isn't one without a
// PCI-scoped processor), just a cheap first line of defense against a
// pure fat-finger entry.
function passesLuhnCheck(digits) {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Card numbers are stored so an admin/finance user can manually transfer a
// driver's payout to it — same trust model this codebase already applies to
// the Kaspi transfer phone number stored right next to it (see
// driver_payout_requests.payout_details), not a PCI-scoped "charge this
// card" flow. No CVV/expiry is ever collected — only the number a human
// needs to send a bank transfer to.
export function normalizeCardNumber(raw) {
  const digits = String(raw || "").replace(/[\s-]/g, "");
  if (!/^\d{12,19}$/.test(digits)) {
    throw new AppError("Invalid card number", 400, "INVALID_CARD_NUMBER");
  }
  if (!passesLuhnCheck(digits)) {
    throw new AppError("Invalid card number", 400, "INVALID_CARD_NUMBER");
  }
  return digits;
}

export function maskCardNumber(digits) {
  const value = String(digits || "");
  if (value.length < 4) return value;
  return `•• •• •• ${value.slice(-4)}`;
}

// financial_transactions is written per completed order regardless of payment
// method (see finance.service.js createOrderCompletedTransaction); which
// driver column it actually moved depends on payment_method — KASPI trips
// credit balance by driver_earning, CASH trips only add service_commission
// to debt (the driver already holds the cash). Mirror that split here so the
// wallet screen shows real, not-misleading movements per trip.
function walletTransactionKind(row) {
  if (row.type === "ORDER_COMPLETED") {
    return row.payment_method === "CASH" ? "CASH_TRIP_COMMISSION" : "EARNING";
  }
  if (row.type === "DRIVER_DEBT_CREATED") return "CASH_TRIP_COMMISSION";
  if (row.type === "DRIVER_DEBT_ADJUSTED" || row.type === "MANUAL_ADJUSTMENT") return "ADJUSTMENT";
  return "OTHER";
}

function walletTransactionAmount(row, kind) {
  if (kind === "EARNING") return Number(row.driver_earning || 0);
  if (kind === "CASH_TRIP_COMMISSION") return Number(row.service_commission || 0);
  if (kind === "ADJUSTMENT") return Number(row.driver_debt_delta || 0);
  return Number(row.driver_earning || 0);
}

export function publicWalletTransaction(row) {
  if (!row) return null;
  const kind = walletTransactionKind(row);
  return {
    id: row.id,
    kind,
    amountKzt: walletTransactionAmount(row, kind),
    paymentMethod: row.payment_method,
    orderId: row.order_id,
    orderShortId: row.order_short_id || null,
    currency: row.currency || "KZT",
    createdAt: row.created_at
  };
}

export function publicPayoutRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driver_id,
    amountKzt: row.amount_kzt,
    method: row.method,
    payoutDetails: row.payout_details || {},
    status: row.status,
    rejectionReason: row.rejection_reason || null,
    providerReference: row.provider_reference || null,
    reviewedAt: row.reviewed_at || null,
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getWalletSummary(driverId, executor = defaultQuery) {
  const driver = (await run(executor, "SELECT balance, debt FROM drivers WHERE id=$1", [driverId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  const pending = (await run(executor, `
    SELECT COALESCE(SUM(amount_kzt),0)::int pending
    FROM driver_payout_requests
    WHERE driver_id=$1 AND status IN ('PENDING','APPROVED')
  `, [driverId])).rows[0];
  return {
    balanceKzt: Number(driver.balance || 0),
    debtKzt: Number(driver.debt || 0),
    pendingPayoutKzt: Number(pending.pending || 0),
    minPayoutKzt: MIN_PAYOUT_KZT,
    currency: "KZT"
  };
}

export async function listWalletTransactions({ driverId, limit = 30, offset = 0 }, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT ft.*, o.short_id order_short_id
    FROM financial_transactions ft
    LEFT JOIN orders o ON o.id = ft.order_id
    WHERE ft.driver_id=$1 AND ft.status='POSTED'
    ORDER BY ft.created_at DESC
    LIMIT $2 OFFSET $3
  `, [driverId, limit, offset]);
  const total = (await run(executor, `
    SELECT COUNT(*)::int total FROM financial_transactions WHERE driver_id=$1 AND status='POSTED'
  `, [driverId])).rows[0].total;
  return { items: result.rows.map(publicWalletTransaction), total, limit, offset };
}

export async function listPayoutRequests({ driverId = null, status = null, limit = 50 }, executor = defaultQuery) {
  const conditions = [];
  const params = [];
  if (driverId) { params.push(driverId); conditions.push(`driver_id=$${params.length}`); }
  if (status) { params.push(status); conditions.push(`status=$${params.length}`); }
  params.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await run(executor, `
    SELECT * FROM driver_payout_requests ${where} ORDER BY created_at DESC LIMIT $${params.length}
  `, params);
  return result.rows.map(publicPayoutRequest);
}

// The driver's explicitly-saved payout destination (Settings), or — for a
// driver who saved one before this existed — whatever their most recent
// payout request happened to carry. Two different sources, same shape,
// checked in that priority order everywhere "does this driver have payout
// details" matters.
export async function resolveDriverPayoutDetails(driverId, executor = defaultQuery) {
  const driver = (await run(executor, "SELECT payout_method, payout_details FROM drivers WHERE id=$1", [driverId])).rows[0];
  if (driver?.payout_details && Object.keys(driver.payout_details).length > 0) {
    return { method: driver.payout_method || "KASPI_TRANSFER", details: driver.payout_details, source: "saved" };
  }
  const last = (await run(executor, `
    SELECT method, payout_details FROM driver_payout_requests
    WHERE driver_id=$1 AND payout_details IS NOT NULL AND payout_details <> '{}'::jsonb
    ORDER BY created_at DESC
    LIMIT 1
  `, [driverId])).rows[0];
  if (last) return { method: last.method, details: last.payout_details, source: "history" };
  return null;
}

export async function saveDriverPayoutDetails({ driverId, method, details }, executor = defaultQuery) {
  if (!["KASPI_TRANSFER", "CASH"].includes(method)) {
    throw new AppError("Invalid payout method", 400, "INVALID_PAYOUT_METHOD");
  }
  const cleanDetails = { ...details };
  if (cleanDetails.cardNumber) {
    cleanDetails.cardNumber = normalizeCardNumber(cleanDetails.cardNumber);
  }
  if (cleanDetails.phone) {
    cleanDetails.phone = String(cleanDetails.phone).trim();
  }
  const updated = (await run(executor, `
    UPDATE drivers SET payout_method=$1, payout_details=$2::jsonb WHERE id=$3 RETURNING payout_method, payout_details
  `, [method, JSON.stringify(cleanDetails), driverId])).rows[0];
  if (!updated) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  return { method: updated.payout_method, details: updated.payout_details };
}

export async function createPayoutRequest({ driverId, amountKzt, method, details = {} }, executor) {
  const driver = (await run(executor, "SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [driverId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
  if (amountKzt < MIN_PAYOUT_KZT) {
    throw new AppError(`Minimum payout is ${MIN_PAYOUT_KZT} KZT`, 400, "PAYOUT_BELOW_MINIMUM");
  }

  // Defensive: balance/debt should already be net of each other by the time
  // a driver gets here (settleDriverDebtFromBalance runs right after every
  // non-cash trip), but a payout request is the last checkpoint before real
  // money leaves — worth re-settling here too in case debt appeared some
  // other way (an admin adjustment, a correction) since the last trip. Runs
  // after the cheap validations above so a doomed-anyway request (below
  // minimum, blocked driver) doesn't touch the ledger first.
  await settleDriverDebtFromBalance(driverId, executor);
  const refreshedDriver = (await run(executor, "SELECT balance FROM drivers WHERE id=$1", [driverId])).rows[0];

  if (amountKzt > Number(refreshedDriver.balance || 0)) {
    throw new AppError("Payout amount exceeds available balance", 409, "PAYOUT_EXCEEDS_BALANCE");
  }

  const request = (await run(executor, `
    INSERT INTO driver_payout_requests(driver_id, amount_kzt, method, payout_details)
    VALUES($1,$2,$3,$4::jsonb)
    RETURNING *
  `, [driverId, amountKzt, method, JSON.stringify(details)])).rows[0];

  const updatedDriver = (await run(executor, `
    UPDATE drivers SET balance=balance-$1 WHERE id=$2 RETURNING *
  `, [amountKzt, driverId])).rows[0];

  return { payoutRequest: publicPayoutRequest(request), driver: updatedDriver };
}

export async function cancelPayoutRequest({ driverId, id }, executor) {
  const request = (await run(executor, "SELECT * FROM driver_payout_requests WHERE id=$1 AND driver_id=$2 FOR UPDATE", [id, driverId])).rows[0];
  if (!request) throw new AppError("Payout request not found", 404, "PAYOUT_REQUEST_NOT_FOUND");
  if (request.status !== "PENDING") {
    throw new AppError("Only pending payout requests can be cancelled", 409, "PAYOUT_REQUEST_NOT_PENDING");
  }

  const updated = (await run(executor, `
    UPDATE driver_payout_requests SET status='CANCELLED', updated_at=NOW() WHERE id=$1 RETURNING *
  `, [id])).rows[0];
  const driver = (await run(executor, `
    UPDATE drivers SET balance=balance+$1 WHERE id=$2 RETURNING *
  `, [request.amount_kzt, driverId])).rows[0];

  return { payoutRequest: publicPayoutRequest(updated), driver };
}

export async function reviewPayoutRequest({ id, status, reason = "", providerReference = null, actorUserId }, executor) {
  if (!["APPROVED", "PAID", "REJECTED"].includes(status)) {
    throw new AppError("Invalid payout request status", 400, "INVALID_PAYOUT_STATUS");
  }
  const request = (await run(executor, "SELECT * FROM driver_payout_requests WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!request) throw new AppError("Payout request not found", 404, "PAYOUT_REQUEST_NOT_FOUND");
  if (status === "APPROVED" && request.status !== "PENDING") {
    throw new AppError("Only pending payout requests can be approved", 409, "PAYOUT_REQUEST_NOT_PENDING");
  }
  if (status === "PAID" && request.status !== "APPROVED") {
    throw new AppError("Only approved payout requests can be marked paid", 409, "PAYOUT_REQUEST_NOT_APPROVED");
  }
  if (status === "REJECTED" && !["PENDING", "APPROVED"].includes(request.status)) {
    throw new AppError("Payout request already finalized", 409, "PAYOUT_REQUEST_FINALIZED");
  }

  const updated = (await run(executor, `
    UPDATE driver_payout_requests
    SET status=$1,
        rejection_reason=CASE WHEN $1='REJECTED' THEN $2 ELSE rejection_reason END,
        provider_reference=COALESCE($3, provider_reference),
        reviewed_by_user_id=$4,
        reviewed_at=NOW(),
        paid_at=CASE WHEN $1='PAID' THEN NOW() ELSE paid_at END,
        updated_at=NOW()
    WHERE id=$5
    RETURNING *
  `, [status, reason, providerReference, actorUserId, id])).rows[0];

  let driver = null;
  if (status === "REJECTED") {
    driver = (await run(executor, `
      UPDATE drivers SET balance=balance+$1 WHERE id=$2 RETURNING *
    `, [request.amount_kzt, request.driver_id])).rows[0];
  }

  return { payoutRequest: publicPayoutRequest(updated), driver };
}

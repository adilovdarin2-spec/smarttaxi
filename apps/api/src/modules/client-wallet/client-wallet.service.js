import { AppError } from "../../common/errors.js";
import { normalizeCardNumber, maskCardNumber } from "../wallet/wallet.service.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export const MIN_TOPUP_KZT = 500;

// This is a scaffold: cashback_balance is the only real spendable balance a
// client has today (earned trip rebate, drawn down on cancellation/no-show
// fees — see finance.service.js). There is no separate prepaid wallet yet.
// Exposing it through a wallet-shaped summary (mirroring GET
// /drivers/me/wallet) gives the mobile app one stable "balance" concept to
// build a wallet screen against now, and a real top-up-funded balance can be
// merged into this same shape later without changing the response contract.
export async function getClientWalletSummary(clientId, executor = defaultQuery) {
  const client = (await run(executor, "SELECT cashback_balance FROM clients WHERE id=$1", [clientId])).rows[0];
  if (!client) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
  return {
    balanceKzt: Number(client.cashback_balance || 0),
    currency: "KZT"
  };
}

export function publicClientCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    holderName: row.holder_name || null,
    maskedCardNumber: maskCardNumber(row.card_number),
    isDefault: row.is_default,
    createdAt: row.created_at
  };
}

export async function listClientCards(clientId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT * FROM client_cards WHERE client_id=$1 ORDER BY is_default DESC, created_at DESC
  `, [clientId]);
  return result.rows.map(publicClientCard);
}

// Card numbers are stored so a saved card can be reused/prefilled once real
// Kaspi Pay top-ups are wired in — same store-only trust model this codebase
// already applies to driver payout cards (wallet.service.js): Luhn-checked to
// catch fat-finger typos, but never tokenized or charged automatically, and
// never returned to the client unmasked after entry.
export async function addClientCard({ clientId, cardNumber, holderName }, executor = defaultQuery) {
  const normalized = normalizeCardNumber(cardNumber);
  const existingCount = (await run(executor, "SELECT COUNT(*)::int count FROM client_cards WHERE client_id=$1", [clientId])).rows[0].count;
  const created = (await run(executor, `
    INSERT INTO client_cards(client_id, card_number, holder_name, is_default)
    VALUES($1,$2,$3,$4)
    RETURNING *
  `, [clientId, normalized, holderName || null, existingCount === 0])).rows[0];
  return publicClientCard(created);
}

export async function removeClientCard({ clientId, id }, executor = defaultQuery) {
  const deleted = (await run(executor, `
    DELETE FROM client_cards WHERE id=$1 AND client_id=$2 RETURNING *
  `, [id, clientId])).rows[0];
  if (!deleted) throw new AppError("Card not found", 404, "CLIENT_CARD_NOT_FOUND");

  if (deleted.is_default) {
    // Promote whichever card is left so the client isn't silently left
    // without a default the next time they need one selected automatically.
    const next = (await run(executor, `
      SELECT id FROM client_cards WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1
    `, [clientId])).rows[0];
    if (next) {
      await run(executor, "UPDATE client_cards SET is_default=true WHERE id=$1", [next.id]);
    }
  }
  return { removed: true };
}

export async function setDefaultClientCard({ clientId, id }, executor = defaultQuery) {
  const card = (await run(executor, "SELECT id FROM client_cards WHERE id=$1 AND client_id=$2", [id, clientId])).rows[0];
  if (!card) throw new AppError("Card not found", 404, "CLIENT_CARD_NOT_FOUND");
  await run(executor, "UPDATE client_cards SET is_default=(id=$1) WHERE client_id=$2", [id, clientId]);
  return listClientCards(clientId, executor);
}

function publicTopupRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    amountKzt: row.amount_kzt,
    method: row.method,
    status: row.status,
    providerReference: row.provider_reference || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Deliberately just records intent: there is no real payment gateway wired
// to wallet top-ups yet (Kaspi Pay integration is coming separately — see
// payments/payment-provider.js for the order-payment equivalent, which this
// mirrors the shape of so a real gateway call can replace this stub without
// changing the request/response contract). The request is created PENDING
// and stays there until that integration exists to move it to
// COMPLETED/FAILED and credit the balance.
export async function createTopupRequest({ clientId, amountKzt }, executor = defaultQuery) {
  if (!Number.isInteger(amountKzt) || amountKzt < MIN_TOPUP_KZT) {
    throw new AppError(`Minimum top-up is ${MIN_TOPUP_KZT} KZT`, 400, "TOPUP_BELOW_MINIMUM");
  }
  const created = (await run(executor, `
    INSERT INTO client_topup_requests(client_id, amount_kzt, method, status)
    VALUES($1,$2,'KASPI_PAY','PENDING')
    RETURNING *
  `, [clientId, amountKzt])).rows[0];
  return publicTopupRequest(created);
}

export async function listTopupRequests(clientId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT * FROM client_topup_requests WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50
  `, [clientId]);
  return result.rows.map(publicTopupRequest);
}

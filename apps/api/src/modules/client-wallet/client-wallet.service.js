import { AppError } from "../../common/errors.js";
import { maskCardNumber } from "../wallet/wallet.service.js";
import { CLIENT_WALLET_CAPABILITIES, requireClientWalletIntegration } from "./client-wallet-policy.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export const MIN_TOPUP_KZT = 500;

// This is the actual cashback balance used by cashback-payment.service.js
// and finance.service.js, not a prepaid wallet or a pending top-up total.
// Expose unavailable provider capabilities explicitly for both clients.
export async function getClientWalletSummary(clientId, executor = defaultQuery) {
  const client = (await run(executor, "SELECT cashback_balance FROM clients WHERE id=$1", [clientId])).rows[0];
  if (!client) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
  return {
    balanceKzt: Number(client.cashback_balance || 0),
    currency: "KZT",
    capabilities: CLIENT_WALLET_CAPABILITIES
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

// Preserve the callable contract for old clients, but never persist a new PAN.
// Existing records remain readable (masked) and removable by their owner.
export async function addClientCard() {
  requireClientWalletIntegration("cardBinding");
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

// No gateway credits these requests. Do not accumulate new permanent PENDING
// intents or promise that a future integration will replay them automatically.
export async function createTopupRequest() {
  requireClientWalletIntegration("topUp");
}

export async function listTopupRequests(clientId, executor = defaultQuery) {
  const result = await run(executor, `
    SELECT * FROM client_topup_requests WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50
  `, [clientId]);
  return result.rows.map(publicTopupRequest);
}

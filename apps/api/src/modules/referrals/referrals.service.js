import { query } from "../../db/pool.js";
import { randomInt } from "node:crypto";

// No 0/O/1/I — short codes get read aloud and typed by hand, so ambiguous
// characters cause real support tickets.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

function runner(executor) {
  return executor?.query ? executor.query.bind(executor) : query;
}

export async function ensureReferralCode(clientId, executor) {
  const run = runner(executor);
  const existing = (await run("SELECT referral_code FROM clients WHERE id=$1", [clientId])).rows[0];
  if (existing?.referral_code) return existing.referral_code;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    try {
      await run("UPDATE clients SET referral_code=$1 WHERE id=$2", [code, clientId]);
      return code;
    } catch (error) {
      if (error.code !== "23505") throw error;
    }
  }
  throw new Error("Could not allocate a unique referral code");
}

// Best-effort, not a hard failure: an invalid/unknown code shouldn't block
// registration, it should just mean no referral link gets recorded.
export async function applyReferralCode(clientId, referralCode, executor) {
  if (!referralCode) return null;
  const run = runner(executor);
  const code = String(referralCode).trim().toUpperCase();
  if (!code) return null;
  const referrer = (await run("SELECT id FROM clients WHERE referral_code=$1", [code])).rows[0];
  if (!referrer || referrer.id === clientId) return null;
  await run(
    "UPDATE clients SET referred_by_client_id=$1 WHERE id=$2 AND referred_by_client_id IS NULL",
    [referrer.id, clientId]
  );
  return referrer.id;
}

// Called from the TRIP_COMPLETED transition. Fires once per referred
// client, on whichever order happens to be the first one that reaches
// completed_at — checked by counting completed orders for the client
// rather than a separate flag, so it's naturally idempotent even if this
// gets called twice for the same order.
export async function awardReferralBonusOnFirstCompletedOrder({ clientId, orderId, executor }) {
  const run = runner(executor);
  const client = (await run("SELECT id, referred_by_client_id, cashback_balance FROM clients WHERE id=$1", [clientId])).rows[0];
  if (!client?.referred_by_client_id) return null;

  const completedCount = (await run(
    "SELECT COUNT(*)::int AS count FROM orders WHERE client_id=$1 AND completed_at IS NOT NULL",
    [clientId]
  )).rows[0];
  if (completedCount.count !== 1) return null;

  const settings = (await run("SELECT referral_bonus_kzt FROM service_settings WHERE id=1")).rows[0];
  const bonus = Number(settings?.referral_bonus_kzt ?? 500);
  if (bonus <= 0) return null;

  const referred = (await run(
    "UPDATE clients SET cashback_balance=cashback_balance+$1 WHERE id=$2 RETURNING cashback_balance, user_id",
    [bonus, clientId]
  )).rows[0];
  await run(
    "INSERT INTO cashback_transactions(client_id,order_id,type,amount,balance_after) VALUES($1,$2,'REFERRAL_BONUS',$3,$4)",
    [clientId, orderId, bonus, referred.cashback_balance]
  );

  const referrer = (await run(
    "UPDATE clients SET cashback_balance=cashback_balance+$1 WHERE id=$2 RETURNING cashback_balance, user_id",
    [bonus, client.referred_by_client_id]
  )).rows[0];
  await run(
    "INSERT INTO cashback_transactions(client_id,order_id,type,amount,balance_after) VALUES($1,$2,'REFERRAL_BONUS',$3,$4)",
    [client.referred_by_client_id, orderId, bonus, referrer.cashback_balance]
  );

  // No notifyUser call here on purpose -- this runs inside the caller's
  // DB transaction (executor: client), and notifyUser writes through the
  // plain pool connection, not the transaction client. Return the ids so
  // orders.routes.js can fire both notifications after the transaction
  // commits, the same way it already does for every other order event.
  return {
    bonus,
    referrerId: client.referred_by_client_id,
    referredUserId: referred.user_id,
    referrerUserId: referrer.user_id
  };
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureReferralCode,
  applyReferralCode,
  awardReferralBonusOnFirstCompletedOrder
} from "../modules/referrals/referrals.service.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const server = readFileSync(join(root, "server.js"), "utf8");
const referralsRoutes = readFileSync(join(root, "modules", "referrals", "referrals.routes.js"), "utf8");
const authRoutes = readFileSync(join(root, "modules", "auth", "auth.routes.js"), "utf8");
const adminRoutes = readFileSync(join(root, "modules", "admin", "admin.routes.js"), "utf8");

assert.match(migrations, /ADD COLUMN IF NOT EXISTS referral_code TEXT/i, "migration must add clients.referral_code");
assert.match(migrations, /ADD CONSTRAINT clients_referral_code_key UNIQUE \(referral_code\)/i, "referral_code must be unique");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS referred_by_client_id UUID REFERENCES clients\(id\)/i, "migration must add clients.referred_by_client_id");

assert.match(server, /app\.use\("\/api\/referrals", referralsRoutes\)/, "referrals routes must be mounted at /api/referrals");
assert.match(referralsRoutes, /router\.get\("\/mine", requireAuth, requireRole\("CLIENT"\), referralSummary\)/, "GET /referrals/mine must require CLIENT role");
assert.match(referralsRoutes, /router\.get\("\/me", requireAuth, requireRole\("CLIENT"\), referralSummary\)/, "GET /referrals/me alias must exist for the web client and use the same handler as /mine");
assert.match(authRoutes, /referralCode/, "registration must accept an optional referralCode field");
assert.match(adminRoutes, /router\.get\("\/referrals", requireAuth, requireRole\("OWNER", "OPERATOR", "FINANCE"\)/, "admin referrals overview must require OWNER/OPERATOR/FINANCE");

// Known, deliberately-not-fixed risk (see SECURITY_CHECKLIST.md "New risk
// areas" / referral self-referral): applyReferralCode only blocks a client
// from referring their *own* client_id. Nothing here checks phone number
// similarity or device identity, so registering several accounts is enough
// to farm the bonus. This test pins that current behavior rather than
// silently allowing it to become stricter or looser without the checklist
// being updated to match.
function createExecutor(clients = []) {
  const state = { clients: clients.map(c => ({ ...c })) };
  return {
    state,
    async query(sql, params = []) {
      if (/SELECT referral_code FROM clients WHERE id=\$1/i.test(sql)) {
        return { rows: state.clients.filter(c => c.id === params[0]).map(c => ({ referral_code: c.referral_code || null })) };
      }
      if (/UPDATE clients SET referral_code=\$1 WHERE id=\$2/i.test(sql)) {
        const client = state.clients.find(c => c.id === params[1]);
        if (state.clients.some(c => c.referral_code === params[0])) {
          const error = new Error("duplicate code");
          error.code = "23505";
          throw error;
        }
        client.referral_code = params[0];
        return { rows: [] };
      }
      if (/SELECT id FROM clients WHERE referral_code=\$1/i.test(sql)) {
        return { rows: state.clients.filter(c => c.referral_code === params[0]).map(c => ({ id: c.id })) };
      }
      if (/UPDATE clients SET referred_by_client_id=\$1 WHERE id=\$2 AND referred_by_client_id IS NULL/i.test(sql)) {
        const client = state.clients.find(c => c.id === params[1]);
        if (client.referred_by_client_id == null) client.referred_by_client_id = params[0];
        return { rows: [] };
      }
      if (/SELECT id, referred_by_client_id, cashback_balance FROM clients WHERE id=\$1/i.test(sql)) {
        return { rows: state.clients.filter(c => c.id === params[0]) };
      }
      if (/SELECT COUNT\(\*\)::int AS count FROM orders WHERE client_id=\$1 AND completed_at IS NOT NULL/i.test(sql)) {
        return { rows: [{ count: state.completedOrderCounts?.[params[0]] ?? 0 }] };
      }
      if (/SELECT referral_bonus_kzt FROM service_settings WHERE id=1/i.test(sql)) {
        return { rows: [{ referral_bonus_kzt: state.bonus ?? 500 }] };
      }
      if (/UPDATE clients SET cashback_balance=cashback_balance\+\$1 WHERE id=\$2 RETURNING cashback_balance/i.test(sql)) {
        const client = state.clients.find(c => c.id === params[1]);
        client.cashback_balance = (client.cashback_balance || 0) + params[0];
        return { rows: [{ cashback_balance: client.cashback_balance }] };
      }
      if (/INSERT INTO cashback_transactions/i.test(sql)) {
        state.transactions = state.transactions || [];
        state.transactions.push({ clientId: params[0], orderId: params[1], type: params[2] ?? "REFERRAL_BONUS", amount: params[2], balanceAfter: params[3] });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in referrals check: ${sql}`);
    }
  };
}

// A client without a code gets one generated (unambiguous alphabet: no 0/O/1/I).
{
  const executor = createExecutor([{ id: "client-1", cashback_balance: 0 }]);
  const code = await ensureReferralCode("client-1", executor);
  assert.equal(code.length, 6, "generated referral code must be 6 characters");
  assert.doesNotMatch(code, /[01OI]/, "referral code must avoid ambiguous characters 0/O/1/I");
  const again = await ensureReferralCode("client-1", executor);
  assert.equal(again, code, "ensureReferralCode must be idempotent for a client that already has a code");
}

// Applying a valid code links the two clients.
{
  const executor = createExecutor([
    { id: "referrer-1", referral_code: "ABCDEF", referred_by_client_id: null },
    { id: "referee-1", referral_code: null, referred_by_client_id: null }
  ]);
  const referrerId = await applyReferralCode("referee-1", "abcdef", executor);
  assert.equal(referrerId, "referrer-1", "applying a valid code (case-insensitive) links the referee to the referrer");
  assert.equal(executor.state.clients.find(c => c.id === "referee-1").referred_by_client_id, "referrer-1");
}

// An unknown code is silently ignored, not rejected.
{
  const executor = createExecutor([{ id: "referee-1", referred_by_client_id: null }]);
  const result = await applyReferralCode("referee-1", "NOPE99", executor);
  assert.equal(result, null, "an unknown referral code must not throw and must not link anyone");
}

// A client cannot refer themselves with their own code.
{
  const executor = createExecutor([{ id: "client-1", referral_code: "SELF01", referred_by_client_id: null }]);
  const result = await applyReferralCode("client-1", "SELF01", executor);
  assert.equal(result, null, "a client must not be able to apply their own referral code to themselves");
  assert.equal(executor.state.clients[0].referred_by_client_id, null);
}

// Known risk, NOT a bug: two distinct client accounts (e.g. one real person
// registered twice on different phone numbers) can freely refer each other.
// Nothing in applyReferralCode checks phone/device similarity.
{
  const executorA = createExecutor([
    { id: "person-account-1", referral_code: "ACCT01", referred_by_client_id: null },
    { id: "person-account-2", referral_code: "ACCT02", referred_by_client_id: null }
  ]);
  const linked = await applyReferralCode("person-account-2", "ACCT01", executorA);
  assert.equal(linked, "person-account-1", "KNOWN RISK: nothing prevents the same person's second account from being referred by their first account — see SECURITY_CHECKLIST.md self-referral entry");
}

// Bonus is awarded once, on the referred client's first completed order, to both sides.
{
  const executor = createExecutor([
    { id: "referrer-1", cashback_balance: 0 },
    { id: "referee-1", referred_by_client_id: "referrer-1", cashback_balance: 0 }
  ]);
  executor.state.completedOrderCounts = { "referee-1": 1 };
  executor.state.bonus = 500;
  const result = await awardReferralBonusOnFirstCompletedOrder({ clientId: "referee-1", orderId: "order-1", executor });
  assert.equal(result.bonus, 500, "bonus amount must come from service_settings.referral_bonus_kzt");
  assert.equal(result.referrerId, "referrer-1");
  assert.equal(executor.state.clients.find(c => c.id === "referee-1").cashback_balance, 500, "referee is credited the bonus");
  assert.equal(executor.state.clients.find(c => c.id === "referrer-1").cashback_balance, 500, "referrer is credited the same bonus");
}

// Bonus must NOT fire again on a client's second completed order (idempotent by count, not a flag).
{
  const executor = createExecutor([
    { id: "referrer-1", cashback_balance: 0 },
    { id: "referee-1", referred_by_client_id: "referrer-1", cashback_balance: 0 }
  ]);
  executor.state.completedOrderCounts = { "referee-1": 2 };
  const result = await awardReferralBonusOnFirstCompletedOrder({ clientId: "referee-1", orderId: "order-2", executor });
  assert.equal(result, null, "bonus must not be re-awarded on a referred client's second+ completed order");
}

// A client with no referrer never triggers a bonus.
{
  const executor = createExecutor([{ id: "solo-1", referred_by_client_id: null, cashback_balance: 0 }]);
  executor.state.completedOrderCounts = { "solo-1": 1 };
  const result = await awardReferralBonusOnFirstCompletedOrder({ clientId: "solo-1", orderId: "order-3", executor });
  assert.equal(result, null, "a client who wasn't referred by anyone must not trigger a bonus payout");
}

console.log("Referral program checks ok");

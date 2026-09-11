import assert from "node:assert/strict";
import fs from "node:fs";
import { runClientWalletReadinessSmoke } from "./client-wallet-readiness-smoke.js";

const {
  MIN_TOPUP_KZT,
  addClientCard,
  createTopupRequest,
  getClientWalletSummary,
  listClientCards,
  listTopupRequests,
  removeClientCard,
  setDefaultClientCard
} = await import("../modules/client-wallet/client-wallet.service.js");
const { CLIENT_WALLET_CAPABILITIES, walletIntegrationGate } = await import("../modules/client-wallet/client-wallet-policy.js");

// A tiny in-memory stand-in for the `executor` param (run() calls
// executor.query(sql, params)) — enough to exercise the service without a
// live Postgres connection, same approach as driver-payout-card-check.js.
function fakeExecutor(state) {
  return {
    state,
    query: async (sql, params = []) => {
      if (sql.includes("SELECT cashback_balance FROM clients WHERE id=$1")) {
        const client = state.clients.find(c => c.id === params[0]);
        return { rows: client ? [client] : [] };
      }
      if (sql.includes("SELECT COUNT(*)::int count FROM client_cards WHERE client_id=$1")) {
        return { rows: [{ count: state.cards.filter(c => c.client_id === params[0]).length }] };
      }
      if (sql.includes("INSERT INTO client_cards")) {
        const row = {
          id: `card-${state.cards.length + 1}`,
          client_id: params[0],
          card_number: params[1],
          holder_name: params[2],
          is_default: params[3],
          created_at: new Date().toISOString()
        };
        state.cards.push(row);
        return { rows: [row] };
      }
      if (sql.includes("DELETE FROM client_cards WHERE id=$1 AND client_id=$2")) {
        const index = state.cards.findIndex(c => c.id === params[0] && c.client_id === params[1]);
        if (index === -1) return { rows: [] };
        const [removed] = state.cards.splice(index, 1);
        return { rows: [removed] };
      }
      if (sql.includes("SELECT id FROM client_cards WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1")) {
        const remaining = state.cards.filter(c => c.client_id === params[0]);
        return { rows: remaining.length ? [remaining[remaining.length - 1]] : [] };
      }
      if (sql.includes("UPDATE client_cards SET is_default=true WHERE id=$1")) {
        const card = state.cards.find(c => c.id === params[0]);
        if (card) card.is_default = true;
        return { rows: [] };
      }
      if (sql.includes("SELECT id FROM client_cards WHERE id=$1 AND client_id=$2")) {
        const card = state.cards.find(c => c.id === params[0] && c.client_id === params[1]);
        return { rows: card ? [card] : [] };
      }
      if (sql.includes("UPDATE client_cards SET is_default=(id=$1) WHERE client_id=$2")) {
        state.cards.filter(c => c.client_id === params[1]).forEach(c => { c.is_default = c.id === params[0]; });
        return { rows: [] };
      }
      if (sql.includes("SELECT * FROM client_cards WHERE client_id=$1")) {
        const rows = state.cards
          .filter(c => c.client_id === params[0])
          .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
        return { rows };
      }
      if (sql.includes("INSERT INTO client_topup_requests")) {
        const row = {
          id: `topup-${state.topupRequests.length + 1}`,
          client_id: params[0],
          amount_kzt: params[1],
          method: "KASPI_PAY",
          status: "PENDING",
          provider_reference: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        state.topupRequests.push(row);
        return { rows: [row] };
      }
      if (sql.includes("SELECT * FROM client_topup_requests WHERE client_id=$1")) {
        return { rows: state.topupRequests.filter(row => row.client_id === params[0]) };
      }
      throw new Error(`fakeExecutor: unexpected query: ${sql}`);
    }
  };
}

// --- getClientWalletSummary: mirrors GET /drivers/me/wallet's shape ---
{
  const executor = fakeExecutor({ clients: [{ id: "client-1", cashback_balance: 1500 }], cards: [], topupRequests: [] });
  const summary = await getClientWalletSummary("client-1", executor);
  assert.deepEqual(summary, { balanceKzt: 1500, currency: "KZT", capabilities: { cardBinding: false, topUp: false } });

  await assert.rejects(
    () => getClientWalletSummary("client-missing", executor),
    { code: "CLIENT_NOT_FOUND" }
  );
}

// --- Existing records stay masked, owner-scoped and removable. No new PANs. ---
{
  const first = { id: 'old-1', client_id: 'client-1', card_number: '4111111111111111', is_default: true };
  const second = { id: 'old-2', client_id: 'client-1', card_number: '5500000000000004', is_default: false };
  const executor = fakeExecutor({ clients: [], cards: [first, second], topupRequests: [] });

  await assert.rejects(
    () => addClientCard({ clientId: "client-1", cardNumber: "4111111111111112" }, executor),
    { code: "CLIENT_WALLET_NOT_READY" },
    "new card writes are unavailable, not a substitute for processor tokenization"
  );

  let cards = await listClientCards("client-1", executor);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].maskedCardNumber, "•• •• •• 1111");
  assert.ok(!JSON.stringify(cards).includes(first.card_number));
  assert.deepEqual(await listClientCards('another-client', executor), []);

  await setDefaultClientCard({ clientId: "client-1", id: second.id }, executor);
  cards = await listClientCards("client-1", executor);
  assert.equal(cards.find(c => c.id === second.id).isDefault, true);
  assert.equal(cards.find(c => c.id === first.id).isDefault, false, "setting a new default unsets the old one");

  await removeClientCard({ clientId: "client-1", id: second.id }, executor);
  cards = await listClientCards("client-1", executor);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].isDefault, true, "removing the default promotes the remaining card instead of leaving none");

  await assert.rejects(
    () => removeClientCard({ clientId: "client-1", id: "card-does-not-exist" }, executor),
    { code: "CLIENT_CARD_NOT_FOUND" }
  );
}

// --- Disabled operations reject before ANY executor access, including old apps. ---
{
  let calls = 0;
  const executor = { query: async () => { calls++; throw Error('must not query'); } };
  for (const amountKzt of [MIN_TOPUP_KZT - 1, 5000]) {
    await assert.rejects(() => createTopupRequest({clientId:'client-1',amountKzt}, executor), {code:'CLIENT_WALLET_NOT_READY'});
  }
  await assert.rejects(() => addClientCard({clientId:'client-1',cardNumber:'4111111111111111'}, executor), {code:'CLIENT_WALLET_NOT_READY'});
  assert.equal(calls, 0);
  assert.ok(Object.isFrozen(CLIENT_WALLET_CAPABILITIES));
  for (const feature of ['cardBinding', 'topUp']) {
    let failure;
    walletIntegrationGate(feature)({body:{get cardNumber(){ throw Error('must not inspect PAN'); }}}, {}, error => { failure = error; });
    assert.equal(failure.code, 'CLIENT_WALLET_NOT_READY');
    assert.equal(failure.status, 503);
  }
  const history = fakeExecutor({ clients: [], cards: [], topupRequests: [{id:'legacy-intent',client_id:'client-1',amount_kzt:5000,method:'KASPI_PAY',status:'PENDING'}] });
  const rows = await listTopupRequests('client-1', history);
  assert.equal(rows[0].status, 'PENDING');
  assert.equal(rows[0].amountKzt, 5000);
  assert.deepEqual(await listTopupRequests('another-client', history), []);
}

// --- structural checks: route/migration/server wiring exists ---
{
  const root = new URL("../", import.meta.url);
  const migrationsSource = fs.readFileSync(new URL("db/migrations.js", root), "utf8");
  const schemaSource = fs.readFileSync(new URL("db/schema.sql", root), "utf8");
  const routesSource = fs.readFileSync(new URL("modules/client-wallet/client-wallet.routes.js", root), "utf8");
  const serverSource = fs.readFileSync(new URL("server.js", root), "utf8");

  assert.ok(migrationsSource.includes("CREATE TABLE IF NOT EXISTS client_cards"), "client_cards migration exists");
  assert.ok(migrationsSource.includes("CREATE TABLE IF NOT EXISTS client_topup_requests"), "client_topup_requests migration exists");
  assert.ok(schemaSource.includes("CREATE TABLE IF NOT EXISTS client_cards"), "client_cards is in the fresh-DB schema too");
  assert.ok(schemaSource.includes("CREATE TABLE IF NOT EXISTS client_topup_requests"), "client_topup_requests is in the fresh-DB schema too");

  assert.ok(routesSource.includes('requireRole("CLIENT")'), "client-wallet routes are gated to the CLIENT role");
  assert.ok(routesSource.includes('router.post("/cards"'), "POST /cards route is registered");
  assert.ok(routesSource.includes('router.delete("/cards/:id"'), "DELETE /cards/:id route is registered");
  assert.ok(routesSource.includes('router.put("/cards/:id/default"'), "PUT /cards/:id/default route is registered");
  assert.ok(routesSource.includes('router.post("/topup-requests"'), "POST /topup-requests route is registered");
  assert.match(routesSource, /router\.post\("\/cards", requireAuth, requireRole\("CLIENT"\), walletIntegrationGate\("cardBinding"\)\)/);
  assert.match(routesSource, /router\.post\("\/topup-requests", requireAuth, requireRole\("CLIENT"\), walletIntegrationGate\("topUp"\)\)/);

  assert.ok(serverSource.includes('app.use("/api/clients/me/wallet", clientWalletRoutes)'), "client-wallet router must actually be mounted");
}

// The live helper cannot log in to a remote or non-development API. Guard
// tests use a recording transport only; no seed session is created here.
{
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return { status: 200, json: async () => ({ env: 'production', status: 'ok' }) };
  };
  for (const apiUrl of ['https://example.com', 'http://127.0.0.1.evil.test',
    'http://localhost/api', 'http://user:password@localhost',
    'http://127.0.0.1?target=remote', 'file:///localhost']) {
    await assert.rejects(() => runClientWalletReadinessSmoke({ apiUrl, fetchImpl }));
  }
  assert.equal(requests.length, 0, 'invalid origins never reach the transport');
  await assert.rejects(() => runClientWalletReadinessSmoke({ apiUrl: 'http://127.0.0.1:4001', fetchImpl }));
  assert.equal(requests.length, 1, 'non-development health prevents login');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.redirect, 'error', 'never forward QA login through a redirect');
  assert.equal(requests[0].options.headers.Authorization, undefined);
}

console.log("Client wallet readiness gate and historical-data checks ok");

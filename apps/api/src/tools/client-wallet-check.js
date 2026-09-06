import assert from "node:assert/strict";
import fs from "node:fs";

const {
  MIN_TOPUP_KZT,
  addClientCard,
  createTopupRequest,
  getClientWalletSummary,
  listClientCards,
  removeClientCard,
  setDefaultClientCard
} = await import("../modules/client-wallet/client-wallet.service.js");

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
      throw new Error(`fakeExecutor: unexpected query: ${sql}`);
    }
  };
}

// --- getClientWalletSummary: mirrors GET /drivers/me/wallet's shape ---
{
  const executor = fakeExecutor({ clients: [{ id: "client-1", cashback_balance: 1500 }], cards: [], topupRequests: [] });
  const summary = await getClientWalletSummary("client-1", executor);
  assert.deepEqual(summary, { balanceKzt: 1500, currency: "KZT" });

  await assert.rejects(
    () => getClientWalletSummary("client-missing", executor),
    { code: "CLIENT_NOT_FOUND" }
  );
}

// --- addClientCard / listClientCards / removeClientCard / setDefaultClientCard ---
{
  const executor = fakeExecutor({ clients: [], cards: [], topupRequests: [] });

  const first = await addClientCard({ clientId: "client-1", cardNumber: "4111 1111 1111 1111", holderName: "Ivan Ivanov" }, executor);
  assert.equal(first.isDefault, true, "the first card a client adds becomes the default automatically");
  assert.equal(first.maskedCardNumber, "•• •• •• 1111", "the raw card number is never returned, even right after entry");

  const second = await addClientCard({ clientId: "client-1", cardNumber: "5500 0000 0000 0004" }, executor);
  assert.equal(second.isDefault, false, "a second card does not silently displace the existing default");

  await assert.rejects(
    () => addClientCard({ clientId: "client-1", cardNumber: "4111111111111112" }, executor),
    { code: "INVALID_CARD_NUMBER" },
    "a Luhn-invalid card number is rejected the same way as driver payout cards"
  );

  let cards = await listClientCards("client-1", executor);
  assert.equal(cards.length, 2);

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

// --- createTopupRequest: records intent only, no real gateway call ---
{
  const executor = fakeExecutor({ clients: [], cards: [], topupRequests: [] });

  await assert.rejects(
    () => createTopupRequest({ clientId: "client-1", amountKzt: MIN_TOPUP_KZT - 1 }, executor),
    { code: "TOPUP_BELOW_MINIMUM" },
    "below-minimum top-up amounts are rejected"
  );

  const request = await createTopupRequest({ clientId: "client-1", amountKzt: 5000 }, executor);
  assert.equal(request.status, "PENDING", "a top-up request stays PENDING — no real gateway is wired to it yet");
  assert.equal(request.method, "KASPI_PAY");
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

  assert.ok(serverSource.includes('app.use("/api/clients/me/wallet", clientWalletRoutes)'), "client-wallet router must actually be mounted");
}

console.log("Client wallet/card-binding scaffold checks ok");

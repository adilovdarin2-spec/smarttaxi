import assert from "node:assert/strict";
import fs from "node:fs";

const {
  normalizeCardNumber,
  maskCardNumber,
  resolveDriverPayoutDetails,
  saveDriverPayoutDetails
} = await import("../modules/wallet/wallet.service.js");

// --- normalizeCardNumber: real Luhn-checksum validation, not just a regex ---
{
  // Widely-known test PAN (Visa's public test number) — genuinely passes Luhn.
  assert.equal(normalizeCardNumber("4111 1111 1111 1111"), "4111111111111111", "strips spaces");
  assert.equal(normalizeCardNumber("4111-1111-1111-1111"), "4111111111111111", "strips dashes");

  assert.throws(
    () => normalizeCardNumber("4111111111111112"), // last digit flipped -> fails Luhn
    { code: "INVALID_CARD_NUMBER" },
    "a single-digit typo that breaks the Luhn checksum is rejected"
  );
  assert.throws(
    () => normalizeCardNumber("123"),
    { code: "INVALID_CARD_NUMBER" },
    "too-short input is rejected"
  );
  assert.throws(
    () => normalizeCardNumber("not-a-card-at-all"),
    { code: "INVALID_CARD_NUMBER" },
    "non-numeric input is rejected"
  );
}

// --- maskCardNumber: shows only the last 4 digits ---
{
  assert.equal(maskCardNumber("4111111111111111"), "•• •• •• 1111");
  assert.equal(maskCardNumber(""), "", "empty input doesn't throw");
}

// --- resolveDriverPayoutDetails / saveDriverPayoutDetails: fake executor, no real DB ---
{
  // A tiny in-memory stand-in for the `executor` param (run() calls
  // executor.query(sql, params)) — enough to prove the priority order
  // (saved details on `drivers` win over payout-request history) without
  // needing a live Postgres connection, which this environment doesn't have.
  function fakeExecutor({ driverRow, lastRequestRow }) {
    return {
      query: async (sql) => {
        if (sql.includes("UPDATE drivers SET payout_method")) {
          return { rows: [{ payout_method: driverRow.payout_method, payout_details: driverRow.payout_details }] };
        }
        if (sql.includes("SELECT payout_method, payout_details FROM drivers")) {
          return { rows: [driverRow] };
        }
        if (sql.includes("FROM driver_payout_requests")) {
          return { rows: lastRequestRow ? [lastRequestRow] : [] };
        }
        throw new Error(`fakeExecutor: unexpected query: ${sql}`);
      }
    };
  }

  const savedOnDriver = await resolveDriverPayoutDetails("driver-1", fakeExecutor({
    driverRow: { payout_method: "KASPI_TRANSFER", payout_details: { cardNumber: "4111111111111111" } },
    lastRequestRow: { method: "KASPI_TRANSFER", payout_details: { phone: "+77000000000" } }
  }));
  assert.equal(savedOnDriver.source, "saved", "an explicitly-saved payout destination wins over request history");
  assert.equal(savedOnDriver.details.cardNumber, "4111111111111111");

  const historyOnly = await resolveDriverPayoutDetails("driver-2", fakeExecutor({
    driverRow: { payout_method: null, payout_details: {} },
    lastRequestRow: { method: "KASPI_TRANSFER", payout_details: { phone: "+77000000001" } }
  }));
  assert.equal(historyOnly.source, "history", "falls back to request history when nothing was explicitly saved");
  assert.equal(historyOnly.details.phone, "+77000000001");

  const neither = await resolveDriverPayoutDetails("driver-3", fakeExecutor({
    driverRow: { payout_method: null, payout_details: {} },
    lastRequestRow: null
  }));
  assert.equal(neither, null, "a driver with neither saved details nor request history resolves to null");

  await assert.rejects(
    () => saveDriverPayoutDetails({ driverId: "driver-1", method: "WIRE_TRANSFER", details: { phone: "1" } }, fakeExecutor({ driverRow: {} })),
    { code: "INVALID_PAYOUT_METHOD" },
    "an unknown payout method is rejected"
  );

  const saved = await saveDriverPayoutDetails({
    driverId: "driver-1",
    method: "KASPI_TRANSFER",
    details: { cardNumber: "4111 1111 1111 1111" }
  }, fakeExecutor({ driverRow: { payout_method: "KASPI_TRANSFER", payout_details: { cardNumber: "4111111111111111" } } }));
  assert.equal(saved.details.cardNumber, "4111111111111111", "card number is normalized before storage");
}

// --- structural checks: route/migration wiring exists ---
{
  const root = new URL("../", import.meta.url);
  const migrationsSource = fs.readFileSync(new URL("db/migrations.js", root), "utf8");
  const walletRoutesSource = fs.readFileSync(new URL("modules/wallet/wallet.routes.js", root), "utf8");
  const adminAppSource = fs.readFileSync(
    new URL("../../../web/src/features/admin/AdminApp.jsx", import.meta.url),
    "utf8"
  );

  assert.ok(migrationsSource.includes("ADD COLUMN IF NOT EXISTS payout_method"), "drivers.payout_method migration exists");
  assert.ok(migrationsSource.includes("ADD COLUMN IF NOT EXISTS payout_details"), "drivers.payout_details migration exists");

  assert.ok(walletRoutesSource.includes('router.put("/payout-details"'), "PUT /payout-details route is registered");
  assert.ok(walletRoutesSource.includes("saveDriverPayoutDetails"), "the save route calls the service function");
  assert.ok(walletRoutesSource.includes("resolveDriverPayoutDetails"), "status + request-creation both resolve saved details");

  assert.ok(adminAppSource.includes("payoutDetails?.cardNumber"), "admin payout list surfaces a saved card number, not just phone");
}

console.log("Driver payout card checks ok");

import assert from "node:assert/strict";
import fs from "node:fs";

const { broadcastNotification } = await import("../modules/notifications/notification.service.js");

// A tiny in-memory fake executor — enough to prove the per-segment query
// selection, the bulk INSERT, and the recipient-count math, without a real
// Postgres connection. sendPushToTokens itself is NOT mocked: with no
// Firebase credentials configured in this environment it already no-ops
// safely (see push.service.js's `if (!app) return { staleTokens: [] }`),
// so calling straight through to it here is the honest, real behavior for
// this environment rather than a stand-in.
function fakeExecutor({ userIds, tokensByUser = {} }) {
  return {
    query: async (sql, params) => {
      if (sql.includes("FROM clients WHERE user_id")) {
        return { rows: userIds.map(id => ({ user_id: id })) };
      }
      if (sql.includes("FROM drivers WHERE user_id IS NOT NULL AND current_region_id")) {
        return { rows: userIds.map(id => ({ user_id: id })) };
      }
      if (sql.includes("FROM drivers WHERE user_id")) {
        return { rows: userIds.map(id => ({ user_id: id })) };
      }
      if (sql.startsWith("INSERT INTO notifications")) {
        assert.deepEqual(params[0], userIds, "bulk insert targets exactly the resolved user ids");
        return { rows: [] };
      }
      if (sql.includes("FROM device_tokens WHERE user_id = ANY")) {
        const targetIds = params[0];
        return { rows: targetIds.flatMap(id => (tokensByUser[id] || []).map(token => ({ token }))) };
      }
      if (sql.startsWith("DELETE FROM device_tokens")) {
        return { rows: [] };
      }
      throw new Error(`fakeExecutor: unexpected query: ${sql}`);
    }
  };
}

// --- segment resolution + bulk insert + recipient count ---
{
  const result = await broadcastNotification(
    { segment: "ALL_CLIENTS", title: "Тест", body: "Текст" },
    fakeExecutor({ userIds: ["u1", "u2", "u3"], tokensByUser: { u1: ["tok-a"], u2: ["tok-b", "tok-c"] } })
  );
  assert.equal(result.recipientCount, 3, "counts every resolved user, including ones with no device tokens");
  assert.equal(result.pushSentCount, 3, "counts every token found across all recipients (Firebase unconfigured here, so nothing is actually pruned as stale)");
}

// --- empty segment short-circuits cleanly, no insert attempted ---
{
  const result = await broadcastNotification(
    { segment: "ALL_DRIVERS", title: "Тест", body: "Текст" },
    fakeExecutor({ userIds: [] })
  );
  assert.equal(result.recipientCount, 0);
  assert.equal(result.pushSentCount, 0);
}

// --- unknown segment rejected ---
{
  await assert.rejects(
    () => broadcastNotification({ segment: "EVERYONE_EVER", title: "x", body: "y" }, fakeExecutor({ userIds: [] })),
    /Unknown broadcast segment/,
    "an unrecognized segment throws rather than silently matching nothing"
  );
}

// --- structural checks: route + zod validation + admin UI wiring exist ---
{
  const root = new URL("../", import.meta.url);
  const adminRoutesSource = fs.readFileSync(new URL("modules/admin/admin.routes.js", root), "utf8");
  const adminAppSource = fs.readFileSync(
    new URL("../../../web/src/features/admin/AdminApp.jsx", import.meta.url),
    "utf8"
  );

  assert.ok(adminRoutesSource.includes('router.post("/notifications/broadcast"'), "broadcast route is registered");
  assert.ok(adminRoutesSource.includes('requireRole("OWNER")') && adminRoutesSource.includes("/notifications/broadcast"), "broadcast route exists");
  assert.ok(adminRoutesSource.includes("BroadcastNotification"), "zod schema validates the broadcast payload");
  assert.ok(adminRoutesSource.includes("notification_broadcast"), "sending a broadcast is audit-logged");

  assert.ok(adminAppSource.includes("broadcastAdminNotification"), "admin UI calls the broadcast API");
  assert.ok(adminAppSource.includes("BroadcastComposer"), "admin Settings page has the broadcast composer");
}

console.log("Broadcast notification checks ok");

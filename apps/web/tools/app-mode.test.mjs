import assert from "node:assert/strict";
import test from "node:test";
import { switchAppMode } from "../src/lib/appMode.js";
function fixture(mode = "passenger") {
  const state = { token: "original", paths: [], writes: [], navigation: [] };
  const payloads = {
    "/api/driver/profile": { driver: { status: "OFFLINE" }, activeOrder: null },
    "/api/orders/me/driver-history?limit=50": { orders: [] },
    "/api/orders/me/active": { order: null },
  };
  const args = {
    mode,
    readToken: () => state.token,
    writeToken: (token) => {
      state.writes.push(token);
      state.token = token;
    },
    navigate: (path) => state.navigation.push(path),
    request: async (path, options) => {
      state.paths.push({ path, options });
      return (
        payloads[path] || {
          token: "issued",
          user: { role: mode === "driver" ? "DRIVER" : "CLIENT" },
        }
      );
    },
  };
  return { state, payloads, args };
}
test("mode switch uses server-issued role and full navigation in either direction", async () => {
  for (const mode of ["passenger", "driver"]) {
    const { state, args } = fixture(mode);
    assert.equal(await switchAppMode(args), true);
    assert.deepEqual(state.writes, ["issued"]);
    assert.deepEqual(state.navigation, [
      mode === "driver" ? "/driver" : "/order",
    ]);
    assert.equal(state.paths.at(-1).options.method, "POST");
  }
});
test("online/active/unpaid driver cannot abandon the shift through passenger mode", async () => {
  for (const kind of ["online", "active", "unpaid"]) {
    const { state, payloads, args } = fixture();
    if (kind === "online")
      payloads["/api/driver/profile"].driver.status = "FREE";
    if (kind === "active")
      payloads["/api/driver/profile"].activeOrder = { id: "active" };
    if (kind === "unpaid")
      payloads["/api/orders/me/driver-history?limit=50"].orders = [
        { status: "PAYMENT_PENDING", payment_status: "PENDING" },
      ];
    await assert.rejects(switchAppMode(args), /Сначала завершите/);
    assert.equal(
      state.paths.some(({ options }) => options?.method === "POST"),
      false,
    );
    assert.deepEqual(state.writes, []);
  }
});
test("rider must finish their active or unpaid trip before switching to driver", async () => {
  const { state, payloads, args } = fixture("driver");
  payloads["/api/orders/me/active"] = { order: { id: "active" } };
  await assert.rejects(switchAppMode(args), /пассажирскую поездку/);
  assert.deepEqual(state.writes, []);
});
test("late mode response, wrong role, read failure and logout do not replace the session", async () => {
  for (const kind of ["replacement", "wrong-role", "failure", "logout"]) {
    const { state, args } = fixture();
    const request = args.request;
    args.request = async (path, options) => {
      if (path.startsWith("/api/auth/mode")) {
        if (kind === "replacement") state.token = "new-login";
        if (kind === "logout") state.token = "";
        if (kind === "wrong-role")
          return { token: "bad", user: { role: "OWNER" } };
        if (kind === "failure") throw new Error("network failure");
      }
      return request(path, options);
    };
    if (["wrong-role", "failure"].includes(kind))
      await assert.rejects(switchAppMode(args));
    else assert.equal(await switchAppMode(args), false);
    assert.deepEqual(state.writes, []);
    assert.deepEqual(state.navigation, []);
  }
});

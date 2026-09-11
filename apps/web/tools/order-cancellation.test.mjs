import assert from "node:assert/strict";
import test from "node:test";
import { cancelOrderWithRecovery } from "../src/lib/orderCancellation.js";

const cancelled = {
  order: { id: "order-1", status: "CANCELLED_BY_CLIENT" },
};
const active = { order: { id: "order-1", status: "SEARCHING_DRIVER" } };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const httpError = (status, code = "ERROR") =>
  Object.assign(Error(code), { status, code });

function fixture({ send = async () => cancelled, read = async () => cancelled } = {}) {
  let token = "session-a";
  let alive = true;
  const calls = [];
  return {
    calls,
    cancel: () =>
      cancelOrderWithRecovery(
        { orderId: "order-1", riderPhone: "+77000000001" },
        {
          request: async (...args) => {
            calls.push(["POST", ...args]);
            return send(...args);
          },
          readBack: async (...args) => {
            calls.push(["GET", ...args]);
            return read(...args);
          },
          readToken: () => token,
          isAlive: () => alive,
        },
      ),
    replace: () => {
      token = "session-b";
    },
    dispose: () => {
      alive = false;
    },
  };
}

test("confirmed cancellation uses one POST and validates the exact order", async () => {
  const f = fixture();
  assert.deepEqual(await f.cancel(), cancelled);
  assert.deepEqual(f.calls, [["POST", "order-1", "+77000000001"]]);
  for (const response of [active, {}, { order: { id: "other", status: "CANCELLED_BY_CLIENT" } }]) {
    await assert.rejects(
      fixture({ send: async () => response, read: async () => active }).cancel(),
    );
  }
});

test("a missing cancellation acknowledgement reconciles instead of replaying", async () => {
  const f = fixture({ send: async () => ({}) });
  assert.deepEqual(await f.cancel(), cancelled);
  assert.deepEqual(f.calls.map(([method]) => method), ["POST", "GET"]);
});

test("network, 5xx and legacy transition conflict reconcile once without replay", async () => {
  for (const failure of [
    new TypeError("network"),
    httpError(500),
    httpError(503),
    httpError(409, "INVALID_STATUS_TRANSITION"),
  ]) {
    const f = fixture({ send: async () => { throw failure; } });
    assert.deepEqual(await f.cancel(), cancelled);
    assert.deepEqual(f.calls.map(([method]) => method), ["POST", "GET"]);
  }
});

test("unconfirmed or failed reconciliation preserves the original failure", async () => {
  const original = new TypeError("lost response");
  for (const read of [async () => active, async () => { throw httpError(503); }]) {
    const f = fixture({ send: async () => { throw original; }, read });
    await assert.rejects(f.cancel(), (error) => error === original);
    assert.deepEqual(f.calls.map(([method]) => method), ["POST", "GET"]);
  }
});

test("validation/auth/rate limits never trigger reconciliation", async () => {
  for (const failure of [httpError(400), httpError(401), httpError(403), httpError(429)]) {
    const f = fixture({ send: async () => { throw failure; } });
    await assert.rejects(f.cancel(), (error) => error === failure);
    assert.equal(f.calls.length, 1);
  }
});

test("late cancellation cannot update or read through a replacement session", async () => {
  for (const end of ["replace", "dispose"]) {
    const pending = deferred();
    const f = fixture({ send: () => pending.promise });
    const task = f.cancel();
    end === "replace" ? f.replace() : f.dispose();
    pending.reject(new TypeError("network"));
    await assert.rejects(task);
    assert.equal(f.calls.length, 1);
  }
});

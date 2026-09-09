import assert from "node:assert/strict";
import test from "node:test";
import { createDriverAccountAction } from "../src/features/driver/driverAccountAction.js";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function fixture() {
  const state = { token: "session-a", alive: true, updates: [] };
  return {
    state,
    run: createDriverAccountAction({
      readToken: () => state.token,
      isAlive: () => state.alive,
      onChange: (next) => state.updates.push(next),
    }),
  };
}
test("account writes are single-flight, without replay after double click", async () => {
  const { state, run } = fixture();
  const pending = deferred();
  let writes = 0,
    success = 0;
  const operation = () => {
    writes++;
    return pending.promise;
  };
  const first = run(operation, () => success++);
  await run(operation);
  assert.equal(writes, 1);
  pending.resolve({ ok: true });
  await first;
  assert.equal(success, 1);
  assert.equal(state.updates.at(-1).busy, false);
});
test("uncertain account writes require read-back before a new submission", async () => {
  for (const error of [
    new TypeError("lost response"),
    { status: 503 },
    { name: "AbortError" },
  ]) {
    const { state, run } = fixture();
    let writes = 0;
    const operation = async () => {
      writes++;
      throw error;
    };
    await run(operation);
    await run(operation);
    assert.equal(writes, 1);
    assert.equal(state.updates.at(-1).uncertain, true);
    assert.equal(state.updates.at(-1).busy, true);
    assert.match(state.updates.at(-1).error, /проверьте результат/);
  }
});
test("a definitive rejected write can be corrected without inventing success", async () => {
  const { state, run } = fixture();
  let success = 0;
  await run(
    async () => {
      throw { status: 409, code: "PAYOUT_EXCEEDS_BALANCE" };
    },
    () => success++,
  );
  assert.equal(success, 0);
  assert.equal(state.updates.at(-1).busy, false);
  await run(
    async () => ({ ok: true }),
    () => success++,
  );
  assert.equal(success, 1);
});
test("late account success/error never changes a closed page or replacement session", async () => {
  for (const change of ["token", "alive"])
    for (const failure of [true, false]) {
      const { state, run } = fixture();
      const pending = deferred();
      let success = 0;
      const action = run(
        () => pending.promise,
        () => success++,
      );
      if (change === "token") state.token = "session-b";
      else state.alive = false;
      if (failure) pending.reject(new Error("late"));
      else pending.resolve({ ok: true });
      await action;
      assert.equal(success, 0);
      assert.equal(state.updates.length, 1);
    }
});
test("anonymous or disposed accounts cannot send a write", async () => {
  for (const change of ["token", "alive"]) {
    const { state, run } = fixture();
    let writes = 0;
    if (change === "token") state.token = "";
    else state.alive = false;
    await run(async () => writes++);
    assert.equal(writes, 0);
    assert.deepEqual(state.updates, []);
  }
});

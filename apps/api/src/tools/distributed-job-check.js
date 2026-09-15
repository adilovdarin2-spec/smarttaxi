import assert from "node:assert/strict";
import { runDistributedJob } from "../common/distributedJob.js";

function fakeExecutor({ acquired = true } = {}) {
  const calls = [];
  let released = false;

  return {
    calls,
    get released() {
      return released;
    },
    async connect() {
      return {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql.includes("pg_try_advisory_lock")) {
            return { rows: [{ acquired }] };
          }
          return { rows: [{}] };
        },
        release() {
          released = true;
        }
      };
    }
  };
}

const owner = fakeExecutor();
let runs = 0;
const completed = await runDistributedJob("job:test", async () => ++runs, owner);
assert.deepEqual(completed, { acquired: true, value: 1 });
assert.equal(runs, 1);
assert.equal(owner.released, true, "the checked-out lock connection is always released");
assert.equal(owner.calls.length, 2, "an acquired lock is released after the task");
assert.deepEqual(owner.calls[0].params, ["job:test"], "the stable job name owns the advisory lock");

const follower = fakeExecutor({ acquired: false });
const skipped = await runDistributedJob("job:test", async () => ++runs, follower);
assert.deepEqual(skipped, { acquired: false, value: undefined });
assert.equal(runs, 1, "a second replica skips a tick while another owns the lock");
assert.equal(follower.calls.length, 1, "a replica that did not acquire never unlocks another session");
assert.equal(follower.released, true);

const failing = fakeExecutor();
await assert.rejects(
  runDistributedJob(
    "job:failing",
    async () => {
      throw new Error("task failed");
    },
    failing
  ),
  /task failed/
);
assert.equal(failing.calls.length, 2, "a failed task still releases its advisory lock");
assert.equal(failing.released, true);

console.log("Distributed scheduler job checks ok");

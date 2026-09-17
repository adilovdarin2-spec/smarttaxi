import assert from "node:assert/strict";
import { runMigrations } from "../db/migrations.js";

function fakeExecutor({ failMigration = false } = {}) {
  const calls = [];
  let released = false;
  let statementIndex = 0;
  return {
    calls,
    get released() {
      return released;
    },
    async connect() {
      return {
        async query(sql, params = []) {
          calls.push({ sql, params });
          statementIndex += 1;
          // Lock is call 1 and schema.sql is call 2; fail on the first delta.
          if (failMigration && statementIndex === 3) throw new Error("migration failed");
          return { rows: [] };
        },
        release() {
          released = true;
        }
      };
    }
  };
}

const success = fakeExecutor();
await runMigrations(success);
assert.match(success.calls[0].sql, /pg_advisory_lock/, "migration startup first acquires the database-wide lock");
assert.deepEqual(success.calls[0].params, ["baisapar:database-migrations"]);
assert.match(success.calls.at(-1).sql, /pg_advisory_unlock/, "successful migrations release the lock");
assert.equal(success.released, true, "successful migrations return the checked-out connection");

const failure = fakeExecutor({ failMigration: true });
await assert.rejects(runMigrations(failure), /migration failed/);
assert.match(failure.calls.at(-1).sql, /pg_advisory_unlock/, "failed migrations still release the lock");
assert.equal(failure.released, true, "failed migrations return the checked-out connection");

console.log("Migration concurrency lock checks ok");

import { pool } from "../db/pool.js";

/**
 * Runs one scheduler tick across any number of API replicas.
 *
 * PostgreSQL advisory locks are tied to this checked-out connection, so a
 * crashed process releases the lease automatically. The task may use the
 * normal pool independently; keeping scheduler work off the lock connection
 * avoids leaking transaction state into the next tick.
 */
export async function runDistributedJob(name, task, executor = pool) {
  const client = await executor.connect();
  let acquired = false;
  try {
    const result = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [name]
    );
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) return { acquired: false, value: undefined };
    return { acquired: true, value: await task() };
  } finally {
    if (acquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [name]
        );
      } catch (error) {
        console.error(`[scheduler] failed to release ${name} advisory lock`, error);
      }
    }
    client.release();
  }
}

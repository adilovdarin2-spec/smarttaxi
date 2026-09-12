import pg from "pg";
import { env } from "../config/env.js";

// The container's Postgres runs in UTC, so `date_trunc('day', NOW())` and
// CURRENT_DATE meant a day that starts at 05:00 local time. A driver's
// "Сегодня" showed yesterday's takings until five in the morning and then
// reset mid-shift; the owner's daily reports and the once-a-day guard on
// recurring bookings drew the same boundary in the same wrong place.
//
// Sent as a startup parameter rather than a SET on the connect event: the
// server applies it while establishing the connection, so it is already in
// force for the first query and there is no window where one runs in UTC.
// It cannot change any stored value — the columns are TIMESTAMPTZ, an
// absolute instant. Only the answer to "which day is this instant in" moves.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  options: `-c timezone=${env.SERVICE_TIMEZONE}`
});

export function query(sql, params = []) {
  return pool.query(sql, params);
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

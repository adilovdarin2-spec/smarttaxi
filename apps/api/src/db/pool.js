import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 20 });

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

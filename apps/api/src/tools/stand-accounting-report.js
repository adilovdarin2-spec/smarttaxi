import { pool } from '../db/pool.js';

// Read-only aggregate audit, safe for release verification. Never repairs
// historical records or prints names, phones, tokens or row identifiers.
const client = await pool.connect();
try {
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='15s'");
  const result = await client.query(`
    WITH live AS (
      SELECT e.id, e.total_seats, e.taken_seats,
        COALESCE(SUM(r.seats) FILTER (WHERE r.status='CONFIRMED'), 0) confirmed,
        COALESCE(SUM(r.seats) FILTER (WHERE r.status='PENDING'
          AND (r.expires_at IS NULL OR r.expires_at > NOW())), 0) pending
      FROM taxi_stand_queue_entries e
      LEFT JOIN taxi_stand_seat_reservations r ON r.entry_id=e.id
      WHERE e.status IN ('WAITING','BOARDING')
      GROUP BY e.id
    )
    SELECT COUNT(*)::int live_entries,
      COUNT(*) FILTER (WHERE taken_seats <> confirmed)::int counter_mismatches,
      COUNT(*) FILTER (WHERE confirmed + pending > total_seats)::int overcommitted_entries,
      COUNT(*) FILTER (WHERE taken_seats + pending > total_seats)::int counter_overcapacity
    FROM live`);
  console.log(JSON.stringify({ readOnly: true, ...result.rows[0] }));
} finally {
  await client.query('ROLLBACK').catch(() => {});
  client.release();
  await pool.end();
}

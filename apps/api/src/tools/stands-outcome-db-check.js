import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const database = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname));
assert.notEqual(process.env.NODE_ENV, 'production');
process.env.DATABASE_URL = database.href;
const { pool } = await import('../db/pool.js');
const { standEntryOutcome, standReservationOutcome } = await import('../modules/stands/stands.service.js');
const connection = await pool.connect();
const query = connection.query.bind(connection);
const tag = randomUUID();
try {
  // All fixtures stay invisible to other sessions and are rolled back.
  await query('BEGIN');
  const region = (await query('SELECT id FROM regions WHERE is_active=true LIMIT 1')).rows[0];
  assert.ok(region, 'Seed local development regions first');
  const stand = (await query("INSERT INTO taxi_stands(region_id,name,lat,lng) VALUES($1,$2,40.8458,68.5041) RETURNING id", [region.id, `Outcome QA ${tag}`])).rows[0];
  const driver = (await query("INSERT INTO drivers(name,phone,car_model,plate) VALUES('QA',$1,'QA',$1) RETURNING id", [tag])).rows[0];
  const client = (await query("INSERT INTO clients(name,phone) VALUES('QA',$1) RETURNING id", [tag])).rows[0];
  const entry = (await query("INSERT INTO taxi_stand_queue_entries(stand_id,driver_id,region_id,queue_seq) VALUES($1,$2,$3,1) RETURNING id", [stand.id, driver.id, region.id])).rows[0];
  const reservation = (await query(`INSERT INTO taxi_stand_seat_reservations(entry_id,stand_id,driver_id,client_id,expires_at)
    VALUES($1,$2,$3,$4,NOW()-INTERVAL '1 second') RETURNING id`, [entry.id, stand.id, driver.id, client.id])).rows[0];
  const riderOutcome = () => standReservationOutcome(client.id, reservation.id, query);
  const driverOutcome = () => standEntryOutcome(driver.id, entry.id, query);
  assert.equal((await riderOutcome()).status, 'EXPIRED', 'Expired hold is terminal before any sweeper runs');
  assert.equal((await query('SELECT status FROM taxi_stand_seat_reservations WHERE id=$1', [reservation.id])).rows[0].status, 'PENDING', 'Outcome GET is read-only');
  await assert.rejects(() => standReservationOutcome(randomUUID(), reservation.id, query), error => error.code === 'STAND_RESERVATION_NOT_FOUND');
  await assert.rejects(() => standEntryOutcome(randomUUID(), entry.id, query), error => error.code === 'STAND_ENTRY_NOT_FOUND');
  await query("UPDATE taxi_stand_queue_entries SET status='LEFT',left_reason='STAND_CLOSED',left_at=NOW() WHERE id=$1", [entry.id]);
  await query("UPDATE taxi_stand_seat_reservations SET status='CANCELLED',cancelled_at=NOW() WHERE id=$1", [reservation.id]);
  assert.equal((await riderOutcome()).reason, 'STAND_CLOSED');
  assert.equal((await driverOutcome()).reason, 'STAND_CLOSED');
  await query("UPDATE taxi_stand_seat_reservations SET cancelled_at=NOW()-INTERVAL '1 second' WHERE id=$1", [reservation.id]);
  assert.equal((await riderOutcome()).reason, null, 'Earlier self-cancellation has no later closure reason');
  await query("UPDATE taxi_stand_queue_entries SET status='DEPARTED',left_reason=NULL,left_at=NULL,departed_at=NOW() WHERE id=$1", [entry.id]);
  await query("UPDATE taxi_stand_seat_reservations SET cancelled_at=NOW() WHERE id=$1", [reservation.id]);
  assert.equal((await driverOutcome()).reason, 'DEPARTED');
  assert.equal((await riderOutcome()).reason, 'DEPARTED');
  await query("UPDATE taxi_stand_seat_reservations SET status='BOARDED' WHERE id=$1", [reservation.id]);
  assert.deepEqual(await riderOutcome(), { id: reservation.id, standId: stand.id, status: 'BOARDED', reason: null });
  console.log('Stand outcome DB checks passed: private scope, expiry without sweep, read-only projection, closure, earlier cancellation and departure.');
} finally {
  await query('ROLLBACK');
  connection.release();
  await pool.end();
}

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Explicit, loopback-only opt-in BEFORE loading the application's DB pool.
// Service integration fixtures, not a login/authentication smoke test.
const url = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) &&
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
'Set STAND_QA_DATABASE_URL to the isolated local development database');
assert.notEqual(process.env.NODE_ENV, 'production');
process.env.DATABASE_URL = url.href;
const { pool, query, tx } = await import('../db/pool.js');
const { joinQueue, handOverTurn, departQueue, listLiveEntries } =
  await import('../modules/stands/stands.service.js');
const observe = process.argv.includes('--observe');
const tag = randomBytes(6).toString('hex');
const created = { stand: null, drivers: [], orders: [] };
let at;
let region;

async function makeDriver(index) {
  // No usable account, session, or production identity is created.
  const driver = (await query(`INSERT INTO drivers(name,phone,car_model,plate,status,current_region_id)
    VALUES($1,$2,'QA',$3,'FREE',$4) RETURNING *`,
  [`Handover QA ${tag} ${index}`, `qa-${tag}-${index}`, `QA-${tag}-${index}`, region.id])).rows[0];
  created.drivers.push(driver.id);
  await query(`INSERT INTO driver_region_approvals(driver_id,region_id,status,approved_at)
    VALUES($1,$2,'APPROVED',NOW())`, [driver.id, region.id]);
  return driver;
}
async function location(driver, { seconds = 0, accuracy = 10, lat = at.lat } = {}) {
  await query(`INSERT INTO driver_locations(driver_id,region_id,lat,lng,accuracy,updated_at)
    VALUES($1,$2,$3,$4,$5,clock_timestamp()-$6*INTERVAL '1 second')
    ON CONFLICT(driver_id) DO UPDATE SET lat=EXCLUDED.lat,lng=EXCLUDED.lng,
      accuracy=EXCLUDED.accuracy,updated_at=EXCLUDED.updated_at`,
  [driver.id, region.id, lat, at.lng, accuracy, seconds]);
}
async function join(driver) {
  return joinQueue({ driver, standId: created.stand.id, ...at });
}
async function resetQueue() {
  await query('DELETE FROM taxi_stand_queue_entries WHERE stand_id=$1', [created.stand.id]);
}
async function refused(label, code, action) {
  const before = !observe ? await listLiveEntries(created.stand.id) : null;
  let failure;
  try { await action(); } catch (error) { failure = error; }
  console.log(`[handover-db] ${label}: ${failure?.code || 'ACCEPTED'}`);
  if (!observe) {
    assert.equal(failure?.code, code, label);
    assert.deepEqual(await listLiveEntries(created.stand.id), before, `${label}: rejected operation must leave the queue untouched`);
  }
}
async function activeOrder(driver, status) {
  const row = (await query(`INSERT INTO orders(short_id,region_id,driver_id,rider_name,rider_phone,
    pickup_text,dropoff_text,tariff,payment_method,status,price)
    VALUES($1,$2,$3,'QA','QA','QA start','QA finish','Economy','CASH',$4,100) RETURNING id`,
  [`QA-${tag}-${created.orders.length}`, region.id, driver.id, status])).rows[0];
  created.orders.push(row.id);
  return row.id;
}
async function main() {
  region = (await query('SELECT * FROM regions WHERE is_active=true ORDER BY name LIMIT 1')).rows[0];
  assert.ok(region);
  created.stand = (await query(`INSERT INTO taxi_stands(region_id,name,kind,lat,lng,radius_m,boarding_slots,default_seats)
    VALUES($1,$2,'INTERCITY',$3,$4,200,1,4) RETURNING *`,
  [region.id, `Handover QA ${tag}`, region.center_lat, region.center_lng])).rows[0];
  at = { lat: Number(created.stand.lat), lng: Number(created.stand.lng) };
  const giver = await makeDriver(1);
  const target = await makeDriver(2);
  const third = await makeDriver(3);
  for (const status of ['OFFLINE', 'BUSY', 'BREAK']) {
    await query('UPDATE drivers SET status=$2 WHERE id=$1', [target.id, status]);
    await refused(`join ${status} with stale FREE object`, status === 'BUSY' ? 'DRIVER_HAS_ACTIVE_ORDER' : 'DRIVER_OFFLINE', () => join(target));
    await resetQueue();
    const entry = await join(giver);
    await location(target);
    await refused(`transfer to ${status}`, status === 'BUSY' ? 'DRIVER_HAS_ACTIVE_ORDER' : 'DRIVER_OFFLINE',
      () => handOverTurn({ driver: giver, entryId: entry.entryId, toDriverId: target.id }));
    await resetQueue();
  }
  await query("UPDATE drivers SET status='FREE' WHERE id=$1", [target.id]);
  for (const status of ['DRIVER_FOUND', 'DRIVER_GOING_TO_CLIENT', 'DRIVER_ARRIVED', 'WAITING_CLIENT', 'TRIP_STARTED', 'DRIVER_ASSIGNED', 'IN_PROGRESS']) {
    const orderId = await activeOrder(target, status);
    await refused(`join FREE with ${status}`, 'DRIVER_HAS_ACTIVE_ORDER', () => join(target));
    await resetQueue();
    const entry = await join(giver);
    await refused(`transfer to FREE with ${status}`, 'DRIVER_HAS_ACTIVE_ORDER',
      () => handOverTurn({ driver: giver, entryId: entry.entryId, toDriverId: target.id }));
    await resetQueue();
    await query('DELETE FROM orders WHERE id=$1', [orderId]);
  }
  for (const [label, fix, code] of [
    ['stale GPS', { seconds: 120 }, 'STAND_HANDOVER_LOCATION_REQUIRED'],
    ['future GPS', { seconds: -60 }, 'STAND_HANDOVER_LOCATION_REQUIRED'],
    ['coarse GPS', { accuracy: 1000 }, 'STAND_HANDOVER_LOCATION_REQUIRED'],
    ['unknown accuracy', { accuracy: null }, 'STAND_HANDOVER_LOCATION_REQUIRED'],
    ['outside stand', { lat: at.lat + 0.05 }, 'STAND_OUT_OF_RANGE'],
  ]) {
    const entry = await join(giver);
    await location(target, fix);
    await refused(label, code, () => handOverTurn({ driver: giver, entryId: entry.entryId, toDriverId: target.id }));
    await resetQueue();
  }
  await query('DELETE FROM driver_locations WHERE driver_id=$1', [target.id]);
  await query('UPDATE drivers SET lat=$2,lng=$3 WHERE id=$1', [target.id, at.lat, at.lng]);
  const missing = await join(giver);
  await refused('cached profile coordinates only', 'STAND_HANDOVER_LOCATION_REQUIRED',
    () => handOverTurn({ driver: giver, entryId: missing.entryId, toDriverId: target.id }));
  await resetQueue();

  // Existing queue members use their real stand heartbeat, not a profile cache.
  for (const test of ['unapproved', 'offline', 'stale', 'outside', 'seats', 'pending', 'closed']) {
    const entry = await join(giver);
    const other = await join(target);
    if (test === 'unapproved') await query("UPDATE driver_region_approvals SET status='BLOCKED' WHERE driver_id=$1", [target.id]);
    if (test === 'offline') await query("UPDATE drivers SET status='OFFLINE' WHERE id=$1", [target.id]);
    if (test === 'stale') await query("UPDATE taxi_stand_queue_entries SET last_seen_at=NOW()-INTERVAL '2 minutes' WHERE id=$1", [other.entryId]);
    if (test === 'outside') await query('UPDATE taxi_stand_queue_entries SET last_lat=$2 WHERE id=$1', [other.entryId, at.lat + 0.05]);
    if (test === 'seats') await query('UPDATE taxi_stand_queue_entries SET taken_seats=1 WHERE id=$1', [other.entryId]);
    if (test === 'pending') await query(`INSERT INTO taxi_stand_seat_reservations(entry_id,stand_id,driver_id,seats,status,source,expires_at)
      VALUES($1,$2,$3,1,'PENDING','APP',NOW()+INTERVAL '10 minutes')`, [other.entryId, created.stand.id, target.id]);
    if (test === 'closed') await query('UPDATE taxi_stands SET is_active=false WHERE id=$1', [created.stand.id]);
    const codes = { unapproved: 'DRIVER_REGION_BLOCKED', offline: 'DRIVER_OFFLINE', stale: 'STAND_HANDOVER_LOCATION_REQUIRED', outside: 'STAND_OUT_OF_RANGE', seats: 'STAND_HANDOVER_TARGET_HAS_SEATS', pending: 'STAND_HANDOVER_TARGET_HAS_SEATS', closed: 'STAND_INACTIVE' };
    await refused(`swap with ${test} recipient`, codes[test], () => handOverTurn({ driver: giver, entryId: entry.entryId, toDriverId: target.id }));
    await query("UPDATE driver_region_approvals SET status='APPROVED' WHERE driver_id=$1", [target.id]);
    await query("UPDATE drivers SET status='FREE' WHERE id=$1", [target.id]);
    await query('UPDATE taxi_stands SET is_active=true WHERE id=$1', [created.stand.id]);
    await resetQueue();
  }
  if (observe) return;
  const entry = await join(giver);
  await join(third);
  await location(target);
  const transfer = await handOverTurn({ driver: giver, entryId: entry.entryId, toDriverId: target.id });
  assert.equal(transfer.mode, 'TRANSFER');
  assert.deepEqual((await listLiveEntries(created.stand.id)).map(e => [e.driver_id,e.status]), [[target.id,'BOARDING'],[third.id,'WAITING']]);
  await departQueue({ driver: target, entryId: transfer.createdEntryId });
  assert.equal((await listLiveEntries(created.stand.id))[0].status, 'BOARDING');
  await resetQueue();
  const a = await join(giver);
  const b = await join(target);
  for (let index = 0; index < 4; index++) {
    const swaps = await Promise.all([
      handOverTurn({ driver: giver, entryId: a.entryId, toDriverId: target.id }),
      handOverTurn({ driver: target, entryId: b.entryId, toDriverId: giver.id }),
    ]);
    assert.ok(swaps.every(result => result.mode === 'SWAP'));
    assert.deepEqual((await listLiveEntries(created.stand.id)).map(e => [e.driver_id,e.status]), [[giver.id,'BOARDING'],[target.id,'WAITING']]);
  }
  await resetQueue();
  // An in-flight status update wins over a stale object passed to joinQueue.
  let release;
  let locked;
  const driverLocked = new Promise(resolve => { locked = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const offline = tx(async client => {
    await client.query("UPDATE drivers SET status='OFFLINE' WHERE id=$1", [target.id]);
    locked();
    await barrier;
  });
  await driverLocked;
  const joining = join(target).then(() => 'ACCEPTED', error => error.code);
  release();
  await offline;
  assert.equal(await joining, 'DRIVER_OFFLINE');
  assert.equal((await listLiveEntries(created.stand.id)).length, 0);
  console.log('[handover-db] PASS: receiver eligibility, all 7 active statuses, GPS, swaps, transfer, promotion, competing swaps, offline/join');
}
try { await main(); }
finally {
  // Only this run's exact IDs; no global sweeper or seeded account resets.
  for (const id of created.orders) await query('DELETE FROM orders WHERE id=$1', [id]);
  if (created.stand) await query('DELETE FROM taxi_stands WHERE id=$1', [created.stand.id]);
  for (const id of created.drivers) await query('DELETE FROM drivers WHERE id=$1', [id]);
  await pool.end();
}

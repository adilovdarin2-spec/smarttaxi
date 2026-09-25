import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const database = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert.ok(['postgres:', 'postgresql:'].includes(database.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname));
assert.notEqual(process.env.NODE_ENV, 'production');
process.env.DATABASE_URL = database.href;
const api = process.env.QA_API_URL || 'http://127.0.0.1:4001';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(api).hostname));
const { pool, query } = await import('../db/pool.js');
const { joinQueue, departQueue, leaveQueue, listLiveEntries, sweepStaleQueueEntries } = await import('../modules/stands/stands.service.js');
const observe = process.argv.includes('--observe');
const tag = randomBytes(6).toString('hex');
let stand;
const drivers = [];
let owner;
async function request(path, body, method = 'POST') {
  const response = await fetch(api + path, { method, headers: {
    'Content-Type': 'application/json', ...(owner ? { Authorization: `Bearer ${owner.token}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
function check(actual, expected, label) {
  console.log(`[stand-concurrency] ${label}: ${JSON.stringify(actual)}`);
  if (!observe) assert.deepEqual(actual, expected, label);
}
async function reset() {
  await query('DELETE FROM taxi_stand_queue_entries WHERE stand_id=$1', [stand.id]);
}
const joining = driver => joinQueue({ driver, standId: stand.id, lat: Number(stand.lat), lng: Number(stand.lng) });
try {
  const health = await request('/api/health/ready', undefined, 'GET');
  assert.equal(health.env, 'development');
  assert.equal(health.checks.sms, 'dev');
  owner = await request('/api/auth/login/password', { phone: '+77000000099', password: 'ChangeMe_2026!' });
  const region = (await query('SELECT * FROM regions WHERE is_active=true ORDER BY name LIMIT 1')).rows[0];
  // Stand is created through the real owner endpoint, with region validation.
  ({ stand } = await request('/api/admin/stands', { regionId: region.id, name: `Concurrency QA ${tag}`,
    lat: Number(region.center_lat), lng: Number(region.center_lng), kind: 'INTERCITY', radiusM: 200, boardingSlots: 1 }));
  for (let index = 0; index < 6; index++) {
    const driver = (await query(`INSERT INTO drivers(name,phone,car_model,plate,status,current_region_id)
      VALUES($1,$2,'QA',$3,'FREE',$4) RETURNING *`,
    [`Concurrency QA ${tag} ${index}`, `qa-${tag}-${index}`, `QA-${tag}-${index}`, region.id])).rows[0];
    drivers.push(driver);
    await query("INSERT INTO driver_region_approvals(driver_id,region_id,status) VALUES($1,$2,'APPROVED')", [driver.id, region.id]);
  }
  for (let index = 0; index < 5; index++) {
    const joined = await Promise.allSettled(drivers.map(joining));
    check(joined.map(result => result.status === 'fulfilled' ? 'OK' : result.reason.code), drivers.map(() => 'OK'), `six concurrent joins ${index + 1}`);
    const rows = await listLiveEntries(stand.id);
    check(rows.map(row => row.status), ['BOARDING', ...drivers.slice(1).map(() => 'WAITING')], 'one boarding car, ordered followers');
    await reset();
  }
  for (const driver of drivers.slice(0, 3)) await joining(driver);
  await request(`/api/admin/stands/${stand.id}`, { boardingSlots: 2 }, 'PATCH');
  check((await listLiveEntries(stand.id)).map(row => row.status), ['BOARDING', 'BOARDING', 'WAITING'], 'owner expands boarding slots immediately');
  await request(`/api/admin/stands/${stand.id}`, { boardingSlots: 1 }, 'PATCH');
  check((await listLiveEntries(stand.id)).map(row => row.status), ['BOARDING', 'WAITING', 'WAITING'], 'owner reduces boarding slots immediately');
  await reset();
  for (let index = 0; index < 5; index++) {
    for (const driver of drivers.slice(0, 3)) await joining(driver);
    const rows = await listLiveEntries(stand.id);
    const changes = await Promise.allSettled([
      departQueue({ driver: drivers[0], entryId: rows[0].id }),
      leaveQueue({ driver: drivers[1], entryId: rows[1].id }),
      joining(drivers[3]),
    ]);
    check(changes.map(result => result.status === 'fulfilled' ? 'OK' : result.reason.code), ['OK', 'OK', 'OK'], 'concurrent departure/leave/join');
    check((await listLiveEntries(stand.id)).map(row => [row.driver_id, row.status]), [[drivers[2].id, 'BOARDING'], [drivers[3].id, 'WAITING']], 'remaining queue ordering');
    await reset();
  }
  for (let index = 0; index < 5; index++) {
    const entry = await joining(drivers[0]);
    await query(`INSERT INTO taxi_stand_seat_reservations(entry_id,stand_id,driver_id,seats,status,source,expires_at)
      VALUES($1,$2,$3,1,'PENDING','APP',NOW()+INTERVAL '10 minutes')`, [entry.entryId, stand.id, drivers[0].id]);
    const racing = await Promise.allSettled([
      ...drivers.slice(1).map(joining),
      request(`/api/admin/stands/${stand.id}`, { isActive: false }, 'PATCH'),
    ]);
    const allowed = racing.every(result => result.status === 'fulfilled' || result.reason.code === 'STAND_INACTIVE');
    check(allowed, true, 'close/join only succeeds before closure or refuses as inactive');
    check((await listLiveEntries(stand.id)).length, 0, 'closed stand has no live cars');
    const liveSeats = (await query("SELECT COUNT(*)::int n FROM taxi_stand_seat_reservations WHERE stand_id=$1 AND status IN ('PENDING','CONFIRMED')", [stand.id])).rows[0].n;
    check(liveSeats, 0, 'closed stand has no live reservations');
    await reset();
    await request(`/api/admin/stands/${stand.id}`, { isActive: true }, 'PATCH');
  }

  // Force the real owner request to wait halfway through closing, without
  // changing schema or server settings. Other readers must see either the
  // old complete state or the committed closed state, never a half-close.
  const closingEntry = await joining(drivers[0]);
  const reservation = (await query(`INSERT INTO taxi_stand_seat_reservations(entry_id,stand_id,driver_id,seats,status,source,expires_at)
    VALUES($1,$2,$3,1,'PENDING','APP',NOW()+INTERVAL '10 minutes') RETURNING id`, [closingEntry.entryId, stand.id, drivers[0].id])).rows[0];
  const barrier = await pool.connect();
  let closing;
  try {
    await barrier.query('BEGIN');
    await barrier.query('SELECT id FROM taxi_stand_seat_reservations WHERE id=$1 FOR UPDATE', [reservation.id]);
    const blockerPid = (await barrier.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    closing = request(`/api/admin/stands/${stand.id}`, { isActive: false }, 'PATCH').then(value => ({ value }), error => ({ error }));
    const deadline = Date.now() + 5000;
    let blocked = false;
    while (Date.now() < deadline) {
      blocked = (await query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) blocked', [blockerPid])).rows[0].blocked;
      if (blocked) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(blocked, 'Owner request must reach the locked reservation before reading intermediate state');
    const snapshot = (await query(`SELECT s.is_active,e.status FROM taxi_stands s
      JOIN taxi_stand_queue_entries e ON e.stand_id=s.id WHERE s.id=$1 AND e.id=$2`, [stand.id, closingEntry.entryId])).rows[0];
    check(snapshot, { is_active: true, status: 'BOARDING' }, 'no partial closure visible while reservation is locked');
  } finally {
    await barrier.query('ROLLBACK');
    barrier.release();
    if (closing) {
      const result = await closing;
      if (result.error) throw result.error;
    }
  }
  check((await listLiveEntries(stand.id)).length, 0, 'atomic closure commits empty queue');
  await reset();
  await request(`/api/admin/stands/${stand.id}`, { isActive: true }, 'PATCH');

  for (let index = 0; index < 5; index++) {
    for (const driver of drivers.slice(0, 3)) await joining(driver);
    const rows = await listLiveEntries(stand.id);
    await query("UPDATE taxi_stand_queue_entries SET last_seen_at=NOW()-INTERVAL '30 minutes' WHERE id=$1", [rows[0].id]);
    await query(`INSERT INTO taxi_stand_seat_reservations(entry_id,stand_id,driver_id,seats,status,source,expires_at)
      VALUES($1,$2,$3,1,'PENDING','APP',NOW()-INTERVAL '1 second')`, [rows[1].id, stand.id, drivers[1].id]);
    const swept = await Promise.allSettled([
      sweepStaleQueueEntries(query, { standId: stand.id }),
      leaveQueue({ driver: drivers[1], entryId: rows[1].id }),
      joining(drivers[3]),
    ]);
    check(swept.map(result => result.status === 'fulfilled' ? 'OK' : result.reason.code), ['OK', 'OK', 'OK'], 'scoped sweep/leave/join');
    check((await listLiveEntries(stand.id)).map(row => [row.driver_id, row.status]), [[drivers[2].id, 'BOARDING'], [drivers[3].id, 'WAITING']], 'sweeper preserves ordering and never restores left cars');
    const again = await sweepStaleQueueEntries(query, { standId: stand.id });
    check([again.expired.length, again.expiredReservations.length], [0, 0], 'scoped sweep is idempotent');
    await reset();
  }
  console.log('[stand-concurrency] completed');
} finally {
  if (stand) await query('DELETE FROM taxi_stands WHERE id=$1', [stand.id]);
  for (const driver of drivers) await query('DELETE FROM drivers WHERE id=$1', [driver.id]);
  await pool.end();
}

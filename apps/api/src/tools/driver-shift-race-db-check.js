import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
assert.notEqual(process.env.NODE_ENV, 'production');
process.env.DATABASE_URL = url.href;
const base = process.env.QA_API_URL || 'http://127.0.0.1:4001';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
const { pool, query } = await import('../db/pool.js');
const { acceptOrderForDriver, syncDriverAvailability } = await import('../modules/orders/order-dispatch.service.js');
const observe = process.argv.includes('--observe');
async function api(path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
async function ok(path, token, body) {
  const result = await api(path, token, body);
  assert.equal(result.status, 200, JSON.stringify(result));
  return result.data;
}
let driver, previous, originalStatus, order, stand;
try {
  const ready = await ok('/api/health/ready');
  assert.equal(ready.env, 'development');
  assert.equal(ready.checks.sms, 'dev');
  const login = await ok('/api/auth/login/password', null, { phone: '+77000000000', password: '123456' });
  driver = login;
  const profile = await ok('/api/driver/profile', driver.token);
  previous = profile.driver;
  originalStatus = previous.status;
  assert.equal((await ok('/api/driver/orders/active', driver.token)).activeOrder, null);
  assert.equal((await ok('/api/driver/stands/me', driver.token)).entry, null);
  for (const action of ['offline', 'online', 'recover-after-offline', 'recover-after-accept', 'legacy-FREE', 'legacy-OFFLINE', 'legacy-BREAK']) {
    await ok('/api/driver/status/online', driver.token, {});
    order = (await query(`INSERT INTO orders(short_id,region_id,rider_name,rider_phone,pickup_text,dropoff_text,tariff,payment_method,price)
      VALUES($1,$2,'QA','QA','QA start','QA finish','Economy','CASH',1000) RETURNING id`, [randomUUID(), previous.currentRegionId])).rows[0];
    const barrier = await pool.connect();
    let changing;
    try {
      await barrier.query('BEGIN');
      await barrier.query('SELECT id FROM drivers WHERE id=$1 FOR UPDATE', [previous.id]);
      const pid = (await barrier.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const recovery = action.startsWith('recover');
      const operation = recovery
        ? syncDriverAvailability({ ...previous, status: 'BUSY' }, query).then(data => ({ status: 200, data }))
        : action.startsWith('legacy-') ? api('/api/drivers/me/status', driver.token, { status: action.slice(7) }, 'PATCH')
        : api(`/api/driver/status/${action}`, driver.token, {});
      changing = operation.then(value => ({ value }), error => ({ error }));
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline) {
        blocked = (await query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) blocked', [pid])).rows[0].blocked;
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(blocked, 'Actual HTTP shift request must contend on the driver row');
      if (action === 'recover-after-offline') await barrier.query("UPDATE drivers SET status='OFFLINE' WHERE id=$1", [previous.id]);
      else await acceptOrderForDriver({ orderId: order.id, userId: previous.userId, executor: barrier });
      await barrier.query('COMMIT');
      const settled = await changing;
      if (settled.error) throw settled.error;
      const status = (await query('SELECT status FROM drivers WHERE id=$1', [previous.id])).rows[0].status;
      console.log(`${action} racing accepted order: HTTP ${settled.value.status}, driver ${status}`);
      if (!observe) {
        assert.equal(settled.value.status, action === 'offline' || action.startsWith('legacy-') ? 409 : 200);
        assert.equal(status, action === 'recover-after-offline' ? 'OFFLINE' : 'BUSY', 'Shift or recovery must not overwrite fresh availability');
      }
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      if (changing) await changing;
      await query('DELETE FROM orders WHERE id=$1', [order.id]);
      order = null;
    }
  }
  for (const exitAction of ['core', 'OFFLINE', 'BREAK']) {
  await ok('/api/driver/status/online', driver.token, {});
  stand = (await query("INSERT INTO taxi_stands(region_id,name,lat,lng) VALUES($1,$2,40.8458,68.5041) RETURNING id", [previous.currentRegionId, `QA atomic offline ${randomUUID()}`])).rows[0];
  const entry = (await query("INSERT INTO taxi_stand_queue_entries(stand_id,driver_id,region_id,queue_seq,status,taken_seats) VALUES($1,$2,$3,1,'BOARDING',1) RETURNING id", [stand.id, previous.id, previous.currentRegionId])).rows[0];
  const seat = (await query("INSERT INTO taxi_stand_seat_reservations(entry_id,stand_id,driver_id,status) VALUES($1,$2,$3,'CONFIRMED') RETURNING id", [entry.id, stand.id, previous.id])).rows[0];
  assert.equal((await api('/api/drivers/me/status', driver.token, { status: 'FREE' }, 'PATCH')).status, 200);
  assert.equal((await query('SELECT status FROM taxi_stand_queue_entries WHERE id=$1', [entry.id])).rows[0].status, 'BOARDING', 'Staying online preserves a valid queue place');
  const barrier = await pool.connect();
  let closing;
  try {
    await barrier.query('BEGIN');
    await barrier.query('SELECT id FROM taxi_stand_seat_reservations WHERE id=$1 FOR UPDATE', [seat.id]);
    const pid = (await barrier.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const leaving = exitAction === 'core' ? api('/api/driver/status/offline', driver.token, {})
      : api('/api/drivers/me/status', driver.token, { status: exitAction }, 'PATCH');
    closing = leaving.then(value => ({ value }), error => ({ error }));
    let blocked = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      blocked = (await query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) blocked', [pid])).rows[0].blocked;
      if (blocked) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(blocked, 'Offline reaches reservation lock');
    const snapshot = async () => (await query(`SELECT d.status driver,e.status entry,r.status reservation FROM drivers d
      JOIN taxi_stand_queue_entries e ON e.driver_id=d.id JOIN taxi_stand_seat_reservations r ON r.entry_id=e.id
      WHERE d.id=$1 AND e.id=$2 AND r.id=$3`, [previous.id, entry.id, seat.id])).rows[0];
    assert.deepEqual(await snapshot(), { driver: 'FREE', entry: 'BOARDING', reservation: 'CONFIRMED' }, 'No partial offline state is visible while cancellation waits');
    await barrier.query('ROLLBACK');
    const settled = await closing;
    if (settled.error) throw settled.error;
    assert.equal(settled.value.status, 200);
    assert.deepEqual(await snapshot(), { driver: exitAction === 'BREAK' ? 'BREAK' : 'OFFLINE', entry: 'LEFT', reservation: 'CANCELLED' });
    console.log(`${exitAction}: availability + queue + confirmed seat commit atomically`);
  } finally {
    await barrier.query('ROLLBACK');
    barrier.release();
    if (closing) await closing;
  }
  await query('DELETE FROM taxi_stands WHERE id=$1', [stand.id]);
  stand = null;
  }
} finally {
  if (stand) await query('DELETE FROM taxi_stands WHERE id=$1', [stand.id]);
  if (order) await query('DELETE FROM orders WHERE id=$1', [order.id]);
  if (previous) await query('UPDATE drivers SET status=$2 WHERE id=$1', [previous.id, originalStatus]);
  await pool.end();
}

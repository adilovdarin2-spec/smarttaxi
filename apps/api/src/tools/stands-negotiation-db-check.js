import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
assert.notEqual(process.env.NODE_ENV, 'production');
process.env.DATABASE_URL = url.href;
const { pool } = await import('../db/pool.js');
const { acceptOrderForDriver, respondToDriverPriceOffer, respondToClientCounterOffer } = await import('../modules/orders/order-dispatch.service.js');
const connection = await pool.connect();
const query = connection.query.bind(connection);
const observe = process.argv.includes('--observe');
const tag = randomUUID();
try {
  await query('BEGIN');
  const region = (await query('SELECT id FROM regions WHERE is_active=true LIMIT 1')).rows[0];
  assert.ok(region);
  // Disabled, unusable service fixtures: no login, token or real account.
  const users = (await query("INSERT INTO users(name,password_hash,role,is_active) VALUES('QA','no-login','DRIVER',false),('QA','no-login','CLIENT',false) RETURNING id,role")).rows;
  const driverUser = users.find(u => u.role === 'DRIVER').id;
  const clientUser = users.find(u => u.role === 'CLIENT').id;
  const client = (await query("INSERT INTO clients(name,phone,user_id) VALUES('QA',$1,$2) RETURNING id", [tag, clientUser])).rows[0];
  const drivers = (await query("INSERT INTO drivers(name,phone,car_model,plate,status,current_region_id,user_id) VALUES('QA',$1,'QA',$1,'FREE',$2,$3),('QA',$1,'QA',$1,'FREE',$2,NULL) RETURNING id,user_id", [tag, region.id, driverUser])).rows;
  const driver = drivers.find(d => d.user_id === driverUser);
  const follower = drivers.find(d => d.id !== driver.id);
  await query("INSERT INTO driver_region_approvals(driver_id,region_id,status) VALUES($1,$2,'APPROVED')", [driver.id, region.id]);
  const stand = (await query("INSERT INTO taxi_stands(region_id,name,lat,lng) VALUES($1,$2,40.8458,68.5041) RETURNING id", [region.id, tag])).rows[0];
  const entry = (await query("INSERT INTO taxi_stand_queue_entries(stand_id,driver_id,region_id,queue_seq,status,taken_seats) VALUES($1,$2,$3,1,'BOARDING',1) RETURNING id", [stand.id, driver.id, region.id])).rows[0];
  const next = (await query("INSERT INTO taxi_stand_queue_entries(stand_id,driver_id,region_id,queue_seq,status) VALUES($1,$2,$3,2,'WAITING') RETURNING id", [stand.id, follower.id, region.id])).rows[0];
  await query("INSERT INTO taxi_stand_seat_reservations(entry_id,stand_id,driver_id,status,expires_at) VALUES($1,$2,$3,'PENDING',NOW()+INTERVAL '10 minutes'),($1,$2,$3,'CONFIRMED',NULL)", [entry.id, stand.id, driver.id]);
  const order = (await query(`INSERT INTO orders(short_id,region_id,client_id,rider_name,rider_phone,pickup_text,dropoff_text,tariff,payment_method,price,
    driver_offer_price_kzt,driver_offer_status,driver_offer_by_driver_id,driver_offer_proposed_by)
    VALUES($1,$2,$3,'QA','QA','QA start','QA finish','Economy','CASH',1000,1200,'PENDING',$4,'DRIVER') RETURNING id`, [tag, region.id, client.id, driver.id])).rows[0];
  const snapshot = async () => ({
    order: (await query('SELECT status,driver_id FROM orders WHERE id=$1', [order.id])).rows[0],
    driver: (await query('SELECT status FROM drivers WHERE id=$1', [driver.id])).rows[0].status,
    entry: (await query('SELECT status,left_reason FROM taxi_stand_queue_entries WHERE id=$1', [entry.id])).rows[0],
    follower: (await query('SELECT status FROM taxi_stand_queue_entries WHERE id=$1', [next.id])).rows[0].status,
    reservations: (await query('SELECT status FROM taxi_stand_seat_reservations WHERE entry_id=$1 ORDER BY status', [entry.id])).rows.map(r => r.status),
  });
  const before = await snapshot();
  for (const [name, proposedBy, accept] of [
    ['direct', 'DRIVER', (executor) => acceptOrderForDriver({ orderId: order.id, userId: driverUser, executor })],
    ['rider accepts driver price', 'DRIVER', (executor) => respondToDriverPriceOffer({ orderId: order.id, clientUserId: clientUser, accept: true, executor })],
    ['driver accepts rider counter', 'CLIENT', (executor) => respondToClientCounterOffer({ orderId: order.id, driverUserId: driverUser, accept: true, executor })],
  ]) {
    await query('SAVEPOINT scenario');
    await query('UPDATE orders SET driver_offer_proposed_by=$2 WHERE id=$1', [order.id, proposedBy]);
    const result = await accept(connection);
    const after = await snapshot();
    console.log(name, JSON.stringify(after));
    if (!observe) {
      assert.deepEqual(after, { order: { status: 'DRIVER_FOUND', driver_id: driver.id }, driver: 'BUSY',
        entry: { status: 'LEFT', left_reason: 'ACCEPTED_ORDER' }, follower: 'BOARDING', reservations: ['CANCELLED', 'CANCELLED'] });
      assert.equal(result.standRelease.standId, stand.id);
      assert.equal(result.standRelease.strandedRows.length, 2);
    }
    await query('ROLLBACK TO SAVEPOINT scenario');
    assert.deepEqual(await snapshot(), before, 'Rollback restores order, driver, queue and reservations together');
    await query('RELEASE SAVEPOINT scenario');
  }
  for (const [proposedBy, decline] of [
    ['DRIVER', () => respondToDriverPriceOffer({ orderId: order.id, clientUserId: clientUser, accept: false, executor: connection })],
    ['CLIENT', () => respondToClientCounterOffer({ orderId: order.id, driverUserId: driverUser, accept: false, executor: connection })],
  ]) {
    await query('SAVEPOINT decline');
    await query('UPDATE orders SET driver_offer_proposed_by=$2 WHERE id=$1', [order.id, proposedBy]);
    assert.equal((await decline()).accepted, false);
    assert.deepEqual(await snapshot(), before, 'Declining a price does not remove stand seats');
    await query('ROLLBACK TO SAVEPOINT decline');
    await query('RELEASE SAVEPOINT decline');
  }
  console.log('Stand negotiation DB checks complete; all fixtures rolled back.');
} finally {
  await query('ROLLBACK');
  connection.release();
  await pool.end();
}

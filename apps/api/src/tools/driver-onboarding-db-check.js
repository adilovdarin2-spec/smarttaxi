import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const url = new URL(process.env.STAND_QA_DATABASE_URL || 'about:blank');
assert(['postgres:', 'postgresql:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
assert.notEqual(process.env.NODE_ENV, 'production'); process.env.DATABASE_URL = url.href;
const { pool } = await import('../db/pool.js');
const { submitDriverApplication, reviewDriverApplication } = await import('../modules/admin/driver-application.service.js');
const db = await pool.connect(); const query = db.query.bind(db);
try {
  await query('BEGIN');
  const user = (await query("INSERT INTO users(name,phone,password_hash,role) VALUES('QA rollback',$1,'no-login','CLIENT') RETURNING *", [`+7702${String(Date.now()).slice(-7)}`])).rows[0];
  const region = (await query('SELECT id FROM regions WHERE is_active=true LIMIT 1')).rows[0];
  const application = await submitDriverApplication({ userId: user.id, body: { fullName: 'QA rollback', phone: user.phone, carModel: 'QA', plateNumber: randomUUID(), comment: 'Rolled-back fixture' }, executor: db });
  const snap = async () => ({
    user: (await query('SELECT role,session_version,password_hash FROM users WHERE id=$1', [user.id])).rows[0],
    application: (await query('SELECT status,driver_id,region_id FROM driver_applications WHERE id=$1', [application.id])).rows[0],
    drivers: (await query('SELECT id FROM drivers WHERE user_id=$1', [user.id])).rows,
    approvals: (await query('SELECT a.id FROM driver_region_approvals a JOIN drivers d ON d.id=a.driver_id WHERE d.user_id=$1', [user.id])).rows,
  });
  const before = await snap();
  await query('SAVEPOINT failed_approval');
  const failing = { query(sql, params) {
    if (sql.startsWith('UPDATE driver_documents')) throw new Error('QA write failure after profile, region and role');
    return query(sql, params);
  } };
  await assert.rejects(() => reviewDriverApplication({ id: application.id, status: 'APPROVED', regionId: region.id, actorUserId: user.id, executor: failing }), /QA write failure/);
  await query('ROLLBACK TO SAVEPOINT failed_approval');
  assert.deepEqual(await snap(), before, 'A failed approval cannot leave a role, driver or region behind');
  await query('UPDATE driver_applications SET user_id=NULL WHERE id=$1', [application.id]);
  await assert.rejects(() => reviewDriverApplication({ id: application.id, status: 'APPROVED', regionId: region.id, actorUserId: user.id, executor: db }), { code: 'APPLICATION_ACCOUNT_REQUIRED' });
  assert.deepEqual(await snap(), before, 'A legacy phone-only application cannot claim this account');
  await query('UPDATE driver_applications SET user_id=$2 WHERE id=$1', [application.id, user.id]);
  await reviewDriverApplication({ id: application.id, status: 'APPROVED', regionId: region.id, actorUserId: user.id, executor: db });
  const after = await snap();
  assert.equal(after.user.role, 'DRIVER');
  assert.equal(after.user.password_hash, before.user.password_hash);
  assert.equal(after.user.session_version, before.user.session_version);
  assert.equal(after.drivers.length, 1); assert.equal(after.approvals.length, 1);
  console.log('Driver onboarding DB: failed transaction rollback, anonymous legacy refusal, one profile/region and preserved password/session passed; fixtures rolled back');
} finally { await query('ROLLBACK'); db.release(); await pool.end(); }

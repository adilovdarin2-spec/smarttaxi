import assert from 'node:assert/strict';
import { submitDriverApplication, reviewDriverApplication } from '../modules/admin/driver-application.service.js';

function fixture() {
  const state = { user: { id: 'user', role: 'CLIENT', is_active: true, phone: '+77001234567' },
    application: { id: 'app', user_id: 'user', phone: '+77001234567', full_name: 'QA', car_model: 'QA car', plate_number: 'QA', status: 'PENDING', driver_id: null },
    drivers: [], approvals: [], document: { driver_application_id: 'app', driver_id: null }, regionActive: true };
  const executor = { state, async query(sql, p = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT user_id FROM driver_applications')) return { rows: state.application ? [{ user_id: state.application.user_id }] : [] };
    if (q.startsWith('SELECT * FROM users')) { assert(q.endsWith('FOR UPDATE')); return { rows: state.user ? [state.user] : [] }; }
    if (q.startsWith('SELECT * FROM driver_applications')) { assert(q.endsWith('FOR UPDATE')); return { rows: state.application && (!q.includes('user_id=$1') || ['PENDING', 'NEEDS_INFO', 'APPROVED'].includes(state.application.status)) ? [state.application] : [] }; }
    if (q.startsWith('SELECT id FROM drivers')) return { rows: state.drivers };
    if (q.startsWith('SELECT id FROM regions')) { assert(q.endsWith('FOR SHARE')); return { rows: state.regionActive && p[0] === 'region' ? [{ id: 'region' }] : [] }; }
    if (q.startsWith('INSERT INTO drivers')) { const driver = { id: 'driver', user_id: p[0], phone: p[2], status: 'OFFLINE', current_region_id: p[6] }; state.drivers.push(driver); return { rows: [driver] }; }
    if (q.startsWith('INSERT INTO driver_region_approvals')) { state.approvals.push({ driverId: p[0], regionId: p[1], approvedBy: p[2] }); return { rows: [] }; }
    if (q.startsWith('UPDATE users')) { state.user.role = 'DRIVER'; return { rows: [] }; }
    if (q.startsWith('UPDATE driver_documents')) { state.document.driver_id = p[0]; return { rows: [] }; }
    if (q.startsWith('UPDATE driver_applications SET status=')) { state.application = { ...state.application, status: p[0], comment: p[1], driver_id: p[3], region_id: p[4] }; return { rows: [state.application] }; }
    if (q.startsWith('INSERT INTO driver_applications')) { state.application = { id: 'new', user_id: p[0], full_name: p[1], phone: p[2], status: 'PENDING' }; return { rows: [state.application] }; }
    throw new Error(`Unhandled fixture SQL ${q}`);
  } };
  return executor;
}
const body = { fullName: 'QA', phone: '+77001234567', carModel: 'QA car', plateNumber: 'QA', comment: '' };
for (const [code, arrange] of [
  ['APPLICATION_ACCOUNT_REQUIRED', s => { s.application.user_id = null; }],
  ['APPLICATION_ACCOUNT_REQUIRED', s => { s.user.is_active = false; }],
  ['APPLICATION_ACCOUNT_REQUIRED', s => { s.user.role = 'OWNER'; }],
  ['APPLICATION_ACCOUNT_REQUIRED', s => { s.user.phone = '+77009999999'; }],
  ['REGION_NOT_FOUND', s => { s.regionActive = false; }],
  ['DRIVER_PROFILE_EXISTS', s => { s.drivers.push({ id: 'existing' }); }],
]) {
  const executor = fixture(); arrange(executor.state); const before = structuredClone(executor.state);
  await assert.rejects(() => reviewDriverApplication({ id: 'app', status: 'APPROVED', regionId: 'region', actorUserId: 'owner', executor }), { code });
  assert.deepEqual(executor.state, before, `${code} cannot provision or alter records`);
}
{
  const executor = fixture();
  await assert.rejects(() => reviewDriverApplication({ id: 'app', status: 'APPROVED', actorUserId: 'owner', executor }), { code: 'APPLICATION_REGION_REQUIRED' });
  const result = await reviewDriverApplication({ id: 'app', status: 'APPROVED', regionId: 'region', actorUserId: 'owner', executor });
  assert.equal(result.application.driver_id, 'driver');
  assert.equal(executor.state.user.role, 'DRIVER');
  assert.equal(executor.state.document.driver_id, 'driver');
  assert.deepEqual(executor.state.approvals, [{ driverId: 'driver', regionId: 'region', approvedBy: 'owner' }]);
  await reviewDriverApplication({ id: 'app', status: 'APPROVED', regionId: 'region', actorUserId: 'owner', executor });
  assert.equal(executor.state.drivers.length, 1);
  await assert.rejects(() => reviewDriverApplication({ id: 'app', status: 'REJECTED', actorUserId: 'owner', executor }), { code: 'APPLICATION_ALREADY_PROVISIONED' });
}
{
  const executor = fixture(); executor.state.application = null;
  await assert.rejects(() => submitDriverApplication({ userId: 'user', body: { ...body, phone: '+77009999999' }, executor }), { code: 'APPLICATION_PHONE_MISMATCH' });
  const result = await submitDriverApplication({ userId: 'user', body, executor });
  assert.equal(result.status, 'PENDING'); assert.equal(result.user_id, 'user');
  assert.equal((await submitDriverApplication({ userId: 'user', body, executor })).id, result.id);
}
console.log('Driver onboarding checks: verified ownership, explicit region, atomic provisioning contract and retry guards passed');

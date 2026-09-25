import assert from 'node:assert/strict';

// Real HTTP regression, local development/dev-SMS only. Never discards an
// existing trip or queue. Cleanup is scoped to this run's exact stand/entry.
const base = process.env.SMOKE_API_BASE_URL || 'http://127.0.0.1:4001';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
const observe = process.argv.includes('--observe');
async function api(path, { token, method = 'GET', body } = {}) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
}
async function ok(path, options) {
  const r = await api(path, options);
  assert(r.status >= 200 && r.status < 300, `${path}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
const health = await ok('/api/health/ready');
assert.equal(health.env, 'development');
assert.equal(health.checks.sms, 'dev');
let owner, driver, rider, stand, entry, qaDb;
try {
  owner = (await ok('/api/auth/login/password', { method: 'POST', body: { phone: '+77000000099', password: 'ChangeMe_2026!' } })).token;
  driver = (await ok('/api/auth/login/password', { method: 'POST', body: { phone: '+77000000000', password: '123456' } })).token;
  assert.equal((await ok('/api/driver/orders/active', { token: driver })).activeOrder, null);
  assert.equal((await ok('/api/driver/stands/me', { token: driver })).entry, null);
  const regions = (await ok('/api/regions/active')).regions;
  const region = regions.find(r => r.code === 'ATAKENT');
  assert(region);
  const phone = `+7708${String(Date.now()).slice(-7)}`;
  const sms = await ok('/api/auth/sms/send', { method: 'POST', body: { phone, purpose: 'REGISTER' } });
  assert(sms.devCode);
  const verified = await ok('/api/auth/sms/verify', { method: 'POST', body: { phone, purpose: 'REGISTER', code: sms.devCode } });
  rider = (await ok('/api/auth/register/password', { method: 'POST', body: { phone, name: 'QA вместимость', password: '123456', verificationToken: verified.verificationToken } })).token;
  stand = (await ok('/api/admin/stands', { token: owner, method: 'POST', body: {
    regionId: region.id, name: `QA вместимость ${Date.now()}`, kind: 'INTERCITY',
    lat: 40.8458, lng: 68.5041, radiusM: 150, boardingSlots: 1, defaultSeats: 4 } })).stand;
  await ok('/api/driver/status/online', { token: driver, method: 'POST', body: { regionId: region.id } });
  entry = (await ok(`/api/driver/stands/${stand.id}/join`, { token: driver, method: 'POST', body: { lat: stand.lat, lng: stand.lng, totalSeats: 4 } })).entry;
  const reservation = (await ok(`/api/stands/entries/${entry.id}/reserve`, { token: rider, method: 'POST', body: { seats: 3 } })).reservation;
  const view = await ok(`/api/stands/${stand.id}`, { token: rider });
  const list = await ok(`/api/stands?regionId=${region.id}`, { token: rider });
  console.log('Pending 3 of 4, visible free seats:', view.entries[0].freeSeats, 'map:', list.stands.find(s => s.id === stand.id).freeSeats);
  if (!observe) {
    assert.equal(view.entries[0].freeSeats, 1);
    assert.equal(view.entries[0].pendingSeats, 3);
    assert.equal(list.stands.find(s => s.id === stand.id).freeSeats, 1);
  }
  const manual = await api(`/api/driver/stands/entries/${entry.id}/seats`, { token: driver, method: 'POST', body: { seats: 2, source: 'PHONE' } });
  console.log('Add 2 manual while 3 held, HTTP:', manual.status);
  if (!observe) assert.equal(manual.status, 409);
  if (manual.status === 200) await ok(`/api/driver/stands/entries/${entry.id}/seats`, { token: driver, method: 'DELETE', body: { seats: 2 } });
  const shrink = await api(`/api/driver/stands/entries/${entry.id}`, { token: driver, method: 'PATCH', body: { totalSeats: 2 } });
  console.log('Shrink capacity below pending holds, HTTP:', shrink.status);
  if (!observe) assert.equal(shrink.status, 409);
  if (shrink.status === 200) await ok(`/api/driver/stands/entries/${entry.id}`, { token: driver, method: 'PATCH', body: { totalSeats: 4 } });
  if (!observe) {
    const race = await Promise.all([1, 2].map(() => api(`/api/driver/stands/entries/${entry.id}/seats`, {
      token: driver, method: 'POST', body: { seats: 1, source: 'PHONE' } })));
    assert.deepEqual(race.map(r => r.status).sort(), [200, 409], 'Only one manual request can take the last unheld seat');
    const full = await ok(`/api/stands/${stand.id}`, { token: rider });
    assert.equal(full.entries[0].freeSeats, 0);
    await ok(`/api/driver/stands/entries/${entry.id}/seats`, { token: driver, method: 'DELETE', body: { seats: 1 } });
    console.log('Concurrent manual requests: one accepted, one refused; pending holds preserved');
  }
  await ok(`/api/driver/stands/reservations/${reservation.id}/accept`, { token: driver, method: 'POST' });
  const minus = await api(`/api/driver/stands/entries/${entry.id}/seats`, { token: driver, method: 'DELETE', body: { seats: 1 } });
  const mine = await ok('/api/driver/stands/me', { token: driver });
  console.log('Manual minus with only APP seats, HTTP:', minus.status, 'taken:', mine.entry.takenSeats, 'APP reservation:', mine.entry.reservations.find(r => r.id === reservation.id)?.status);
  if (!observe) {
    assert.equal(minus.status, 409);
    assert.equal(mine.entry.takenSeats, 3);
    assert.equal(mine.entry.manualSeats, 0);
    await ok(`/api/driver/stands/entries/${entry.id}/seats`, { token: driver, method: 'POST', body: { seats: 1, source: 'WALK_IN' } });
    const mixed = await ok(`/api/driver/stands/entries/${entry.id}/seats`, { token: driver, method: 'DELETE', body: { seats: 1 } });
    assert.equal(mixed.entry.takenSeats, 3);
    assert.equal(mixed.entry.reservations.find(r => r.id === reservation.id)?.status, 'CONFIRMED');
    await ok(`/api/driver/stands/entries/${entry.id}/depart`, { token: driver, method: 'POST' });
    assert.equal((await ok('/api/stands/reservations/me', { token: rider })).reservation, null);
    assert.equal((await ok(`/api/stands/${stand.id}`, { token: rider })).entries.length, 0);
    const closedRelease = await api(`/api/driver/stands/entries/${entry.id}/seats`, { token: driver, method: 'DELETE', body: { seats: 1 } });
    assert.equal(closedRelease.status, 409);
    if (process.argv.includes('--check-expiry')) {
      // Only backdate this run's own reservation; never run a global sweeper
      // against somebody else's local queue or change the machine clock.
      const url = new URL(process.env.STAND_QA_DATABASE_URL);
      assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
      const { default: pg } = await import('pg');
      qaDb = new pg.Pool({ connectionString: url.href, max: 1 });
      entry = (await ok(`/api/driver/stands/${stand.id}/join`, { token: driver, method: 'POST', body: { lat: stand.lat, lng: stand.lng, totalSeats: 4 } })).entry;
      const expiring = (await ok(`/api/stands/entries/${entry.id}/reserve`, { token: rider, method: 'POST', body: { seats: 3 } })).reservation;
      const expired = await qaDb.query(`UPDATE taxi_stand_seat_reservations
        SET expires_at=clock_timestamp() - INTERVAL '1 second'
        WHERE id=$1 AND entry_id=$2 AND status='PENDING' RETURNING id`, [expiring.id, entry.id]);
      assert.equal(expired.rowCount, 1);
      const late = await api(`/api/driver/stands/reservations/${expiring.id}/accept`, { token: driver, method: 'POST' });
      assert.equal(late.status, 409, 'Expired holds cannot be confirmed before the sweeper runs');
      assert.equal((await ok('/api/stands/reservations/me', { token: rider })).reservation, null);
      assert.equal((await ok(`/api/stands/${stand.id}`, { token: rider })).entries[0].freeSeats, 4);
      const replacement = await ok(`/api/stands/entries/${entry.id}/reserve`, { token: rider, method: 'POST', body: { seats: 2 } });
      assert.equal(replacement.reservation.status, 'PENDING', 'The same passenger can book again immediately after expiry');
      console.log('Expired pending hold rejected, hidden from live state, capacity released, same passenger rebooked without waiting for sweeper');
      await ok(`/api/stands/reservations/${replacement.reservation.id}`, { token: rider, method: 'DELETE' });
      await ok(`/api/driver/stands/entries/${entry.id}/depart`, { token: driver, method: 'POST' });
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      entry = (await ok(`/api/driver/stands/${stand.id}/join`, { token: driver, method: 'POST', body: { lat: stand.lat, lng: stand.lng, totalSeats: 4 } })).entry;
      const booking = (await ok(`/api/stands/entries/${entry.id}/reserve`, { token: rider, method: 'POST', body: { seats: 2 } })).reservation;
      await ok(`/api/driver/stands/reservations/${booking.id}/accept`, { token: driver, method: 'POST' });
      const actions = [
        () => api(`/api/stands/reservations/${booking.id}`, { token: rider, method: 'DELETE' }),
        () => api(`/api/driver/stands/entries/${entry.id}/depart`, { token: driver, method: 'POST' }),
      ];
      if (attempt % 2) actions.reverse();
      const results = await Promise.all(actions.map(action => action()));
      assert.deepEqual(results.map(r => r.status), [200, 200], 'Cancellation and departure must serialize without a deadlock/500');
      assert.equal((await ok('/api/stands/reservations/me', { token: rider })).reservation, null);
      assert.equal((await ok('/api/driver/stands/me', { token: driver })).entry, null);
    }
    console.log('Concurrent cancellation/departure: 3 passes, both acknowledgements succeed, no stranded live reservation');
  }
  console.log(observe ? 'Observed baseline; cleanup follows.' : 'Stand capacity HTTP regression passed: holds, public/map counts, manual capacity, offer floor, protected APP seats, departure.');
} finally {
  if (entry && driver) {
    const mine = await ok('/api/driver/stands/me', { token: driver });
    if (mine.entry?.id === entry.id) await ok(`/api/driver/stands/entries/${entry.id}/leave`, { token: driver, method: 'POST' });
  }
  if (stand) await ok(`/api/admin/stands/${stand.id}`, { token: owner, method: 'DELETE' });
  if (qaDb) await qaDb.end();
}

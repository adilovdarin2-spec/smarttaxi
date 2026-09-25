import assert from 'node:assert/strict';
const base = process.env.QA_API_URL || 'http://127.0.0.1:4001';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
const observe = process.argv.includes('--observe');
async function request(path, token, body, expected = 200) {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (expected !== null) assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  return { status: response.status, ...data };
}
const snapshot = order => ({ driverId: order.driver_offer_by_driver_id,
  priceKzt: Number(order.driver_offer_price_kzt), proposedBy: order.driver_offer_proposed_by });
const ready = await request('/api/health/ready');
assert.equal(ready.env, 'development'); assert.equal(ready.checks.sms, 'dev');
const driver = await request('/api/auth/login/password', null, { phone: '+77000000000', password: '123456' });
assert.equal((await request('/api/driver/orders/active', driver.token)).activeOrder, null);
assert.equal((await request('/api/driver/stands/me', driver.token)).entry, null);
await request('/api/driver/status/online', driver.token, {});
const phone = `+7706${String(Date.now()).slice(-7)}`;
const sms = await request('/api/auth/sms/send', null, { phone, purpose: 'REGISTER' });
const verified = await request('/api/auth/sms/verify', null, { phone, purpose: 'REGISTER', code: sms.devCode });
const rider = await request('/api/auth/register/password', null, { phone, name: 'QA price consent', password: '123456', verificationToken: verified.verificationToken }, 201);
let order;
try {
  for (const scenario of ['rider accept', 'rider decline', 'rider counter', 'driver accept', 'driver decline', 'missing consent']) {
    order = (await request('/api/orders', rider.token, { riderName: 'QA consent', riderPhone: phone,
      pickupText: 'улица Бектасова, 12', dropoffText: 'улица Кожанова, 34', pickupLat: 40.8458, pickupLng: 68.5041,
      dropoffLat: 40.844435, dropoffLng: 68.509021, tariff: 'Economy', paymentMethod: 'CASH', distanceKm: 1, durationMin: 3 }, 201)).order;
    const path = `/api/orders/${order.id}/price-offer`;
    let current = (await request(path, driver.token, { priceKzt: 800 }, 201)).order;
    let displayed = snapshot(current);
    if (scenario.startsWith('driver')) {
      current = (await request(path + '/counter', rider.token, { priceKzt: 700, expectedOffer: snapshot(current) }, 201)).order;
      displayed = snapshot(current);
      current = (await request(path, driver.token, { priceKzt: 850 }, 201)).order;
      current = (await request(path + '/counter', rider.token, { priceKzt: 750, expectedOffer: snapshot(current) }, 201)).order;
    } else {
      current = (await request(path, driver.token, { priceKzt: 900 }, 201)).order;
    }
    const before = (await request('/api/orders/me/active', rider.token)).order;
    const actor = scenario.startsWith('driver') ? driver : rider;
    const endpoint = scenario.startsWith('driver') ? '/driver-respond' : scenario === 'rider counter' ? '/counter' : '/respond';
    const body = scenario === 'rider counter' ? { priceKzt: 700, expectedOffer: displayed }
      : { accept: !scenario.endsWith('decline'), ...(scenario === 'missing consent' ? {} : { expectedOffer: displayed }) };
    const result = await request(path + endpoint, actor.token, body, null);
    console.log(`${scenario}: HTTP ${result.status}, ${result.error || `price=${result.order?.price}, offer=${result.order?.driver_offer_price_kzt}`}`);
    if (!observe) {
      assert.equal(result.status, 409);
      assert.equal(result.error, scenario === 'missing consent' ? 'PRICE_OFFER_CONFIRMATION_REQUIRED' : 'PRICE_OFFER_CHANGED');
      const after = (await request('/api/orders/me/active', rider.token)).order;
      for (const key of ['driver_id', 'status', 'price', 'driver_offer_status', 'driver_offer_price_kzt', 'driver_offer_proposed_by']) assert.deepEqual(after[key], before[key], `${key} unchanged after stale consent`);
      const driverDecision = scenario.startsWith('driver');
      const accepted = await request(path + (driverDecision ? '/driver-respond' : '/respond'), actor.token,
        { accept: true, expectedOffer: snapshot(current) });
      assert.equal(Number(accepted.order.price), driverDecision ? 750 : 900);
    }
    await request(`/api/orders/${order.id}/cancel-public`, rider.token, { riderPhone: phone });
    order = null;
  }
} finally {
  if (order) await request(`/api/orders/${order.id}/cancel-public`, rider.token, { riderPhone: phone });
}

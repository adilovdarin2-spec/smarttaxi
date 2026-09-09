import assert from 'node:assert/strict';

// Companion to a real phone passenger session. It never logs in as that
// passenger, bypasses authentication, or creates a production order/payment.
// All commands except create-client-order log in as the seed driver and
// supersede that driver's other sessions, INCLUDING inspect. Do not run them
// alongside phone/web driver QA. create-client-order uses a fresh rider.
const base = process.env.API_URL || 'http://127.0.0.1:4001';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Local QA only');
const [command = 'inspect', id, action] = process.argv.slice(2);
assert(['prepare', 'inspect', 'step', 'offline', 'create-client-order'].includes(command));
if (command === 'step') {
  assert(/^[\da-f-]{36}$/i.test(id || ''), 'Explicit QA order UUID required');
  assert(['accept', 'going-to-client', 'arrived', 'waiting', 'start', 'complete', 'mark-paid'].includes(action));
}
let token;
async function api(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  assert(response.ok, `${method} ${path}: ${response.status} ${data.error || ''}`);
  return data;
}
const health = await api('/api/health/ready');
assert.equal(health.env, 'development');
assert.equal(health.status, 'ok');
if (command === 'create-client-order') {
  // A separate normally registered local rider preserves the phone driver's
  // session. Fixed, previously QA-resolved house addresses, not device GPS.
  const phone = `+7708${String(Date.now()).slice(-7)}`;
  const purpose = 'REGISTER';
  const sent = await api('/api/auth/sms/send', 'POST', { phone, purpose });
  assert(sent.devCode, 'Requires the local development SMS provider');
  const verified = await api('/api/auth/sms/verify', 'POST', { phone, purpose, code: sent.devCode });
  const client = await api('/api/auth/register/password', 'POST', {
    phone, verificationToken: verified.verificationToken,
    name: 'Local phone driver QA', password: '123456'
  });
  assert.equal(client.user.role, 'CLIENT');
  token = client.token;
  const route = {
    pickupLat: 40.662974, pickupLng: 68.553530,
    dropoffLat: 40.664778, dropoffLng: 68.552768, tariff: 'Economy'
  };
  const estimate = await api('/api/tariffs/estimate', 'POST', route);
  assert(estimate.priceKzt > 0 && estimate.distanceKm > 0);
  const created = await api('/api/orders', 'POST', {
    ...route, riderName: 'Local phone driver QA', riderPhone: phone,
    pickupText: 'улица Бектасова, 60, Мырзакент',
    dropoffText: 'улица Кожанова, 34, Мырзакент',
    paymentMethod: 'CASH', distanceKm: estimate.distanceKm,
    durationMin: estimate.durationMin, notes: 'Local physical driver QA; stationary test order'
  });
  console.log(JSON.stringify({ id: created.order.id, phone, status: created.order.public_status || created.order.status, localQaOnly: true }));
  process.exit(0);
}
const login = await api('/api/auth/login/password', 'POST', {
  phone: '+77000000000', password: process.env.QA_DRIVER_PASSWORD || '123456'
});
assert.equal(login.user.role, 'DRIVER');
token = login.token;
const initial = await api('/api/driver/orders/active');
if (command === 'prepare') {
  assert.equal(initial.activeOrder, null, 'Never change an unrelated active trip');
  const regions = (await api('/api/regions/active')).regions;
  const region = regions.find(item => item.code === 'MYRZAKENT');
  assert(region?.id);
  await api('/api/drivers/me/region', 'PATCH', { regionId: region.id });
  await api('/api/driver/status/online', 'POST', {});
  // Explicit stationary test-driver fix. Passenger GPS stays the phone's own.
  await api('/api/drivers/me/location', 'PATCH', { lat: 40.665495, lng: 68.549994, accuracy: 8, speed: 0, heading: 0, source: 'physical-device-qa-fixture' });
  console.log(JSON.stringify({ prepared: true, region: region.code, previousRegionId: initial.driver.currentRegionId }));
} else if (command === 'offline') {
  assert.equal(initial.activeOrder, null, 'Finish the authorized QA trip first');
  const result = await api('/api/driver/status/offline', 'POST', {});
  console.log(JSON.stringify({ status: result.driver.publicStatus }));
} else {
  const incoming = (await api('/api/driver/orders/incoming')).orders;
  const history = (await api('/api/orders/me/driver-history?limit=30')).orders;
  const orders = [...incoming, ...(initial.activeOrder ? [initial.activeOrder] : []), ...history];
  const isQa = order => order.rider_phone === '+77000000001' && order.payment_method === 'CASH';
  if (command === 'inspect') {
    console.log(JSON.stringify({ active: initial.activeOrder?.id || null, orders: orders.filter(isQa).map(order => ({ id: order.id, status: order.public_status || order.status, pickup: order.pickup_text, dropoff: order.dropoff_text, pickupLat: order.pickup_lat, pickupLng: order.pickup_lng, dropoffLat: order.dropoff_lat, dropoffLng: order.dropoff_lng, createdAt: order.created_at })) }));
  } else {
    const order = orders.find(item => item.id === id);
    assert(order && isQa(order), 'Only the seeded local phone passenger CASH order is in scope');
    assert(Date.now() - new Date(order.created_at).getTime() < 6 * 60 * 60 * 1000, 'Refuse an old order');
    assert(!initial.activeOrder || initial.activeOrder.id === id, 'Never change another trip');
    const result = await api(`/api/orders/${id}/${action}`, 'POST', {});
    console.log(JSON.stringify({ id: result.order.id, status: result.order.public_status || result.order.status, localQaOnly: true }));
  }
}

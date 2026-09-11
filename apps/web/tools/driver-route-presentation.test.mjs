import assert from 'node:assert/strict';
import test from 'node:test';
import { driverRouteMeta } from '../src/features/driver/driverRoutePresentation.js';

const pickup = { phase: 'to_pickup', distanceMeters: 950, durationSeconds: 121 };
test('driver ETA disappears on arrival, waiting and settlement, without changing statuses', () => {
  for (const status of ['DRIVER_ARRIVED', 'WAITING_CLIENT', 'TRIP_COMPLETED', 'PAYMENT_PENDING', 'PAID', 'CANCELLED_BY_CLIENT']) {
    assert.equal(driverRouteMeta(pickup, status), null);
  }
  assert.match(driverRouteMeta(pickup, 'DRIVER_GOING_TO_CLIENT'), /До точки подачи: 1,0 км · ≈ 3 мин/);
  assert.equal(driverRouteMeta(pickup, 'TRIP_STARTED'), null);
  assert.match(driverRouteMeta({...pickup, phase: 'to_dropoff'}, 'TRIP_STARTED'), /До точки назначения/);
});
test('driver ETA cannot turn fallback or missing route totals into a driving estimate', () => {
  for (const route of [null, {...pickup,fallback:true}, {...pickup,providerStatus:'Fallback'}, {...pickup,distanceMeters:null}, {...pickup,durationSeconds:-1}]) {
    assert.equal(driverRouteMeta(route, 'DRIVER_FOUND'), null);
  }
});

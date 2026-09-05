import assert from 'node:assert/strict';
import test from 'node:test';
import { createDriverLocationPublisher } from '../src/features/driver/driverLocationPublisher.js';
import { createLiveRouteScheduler } from '../src/features/client/clientTripLifecycle.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const point = (lng = 68.5041) => ({ lat: 40.8458, lng, accuracy: 8, source: 'web' });
const ack = location => ({ location: { ...location, driverId: 'driver-1' } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeClock() {
  let time = 0, serial = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer(callback, delay) { const id = ++serial; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimer: id => timers.delete(id),
    pending: () => timers.size,
    async advance(ms) {
      const end = time + ms;
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      time = end;
      await flush();
    }
  };
}

test('location becomes route-visible only after the real write acknowledges it', async () => {
  const pending = deferred();
  const published = [];
  const publisher = createDriverLocationPublisher({ publish: () => pending.promise, onPublished: value => published.push(value) });
  publisher.update(point());
  await flush();
  assert.deepEqual(published, []);
  pending.resolve(ack(point()));
  await flush();
  assert.equal(published[0].lng, point().lng);
  publisher.dispose();
});

test('a final GPS fix inside the throttle window is sent without another event', async () => {
  const clock = fakeClock();
  const sent = [];
  const publisher = createDriverLocationPublisher({ ...clock, publish: async value => { sent.push(value); return ack(value); }, onPublished() {} });
  publisher.update(point());
  await flush();
  await clock.advance(1000);
  publisher.update(point(68.5044));
  await clock.advance(13999);
  assert.equal(sent.length, 1);
  await clock.advance(1);
  assert.deepEqual(sent.map(value => value.lng), [68.5041, 68.5044]);
  assert.equal(clock.pending(), 0);
  publisher.dispose();
});

test('slow writes are serialized and movement coalesces to the newest fix', async () => {
  const clock = fakeClock();
  const first = deferred();
  const sent = [];
  const publisher = createDriverLocationPublisher({ ...clock,
    publish: value => { sent.push(value); return sent.length === 1 ? first.promise : Promise.resolve(ack(value)); }, onPublished() {} });
  publisher.update(point());
  await flush();
  publisher.update(point(68.5042));
  await clock.advance(16000);
  publisher.update(point(68.5044));
  assert.equal(sent.length, 1, 'Never overlap location writes');
  first.resolve(ack(point()));
  await flush();
  assert.deepEqual(sent.map(value => value.lng), [68.5041, 68.5044]);
  publisher.dispose();
});

test('failed publication retries the latest position, not an obsolete fix', async () => {
  const clock = fakeClock();
  const first = deferred();
  const sent = [], published = [];
  const publisher = createDriverLocationPublisher({ ...clock,
    publish: value => { sent.push(value); return sent.length === 1 ? first.promise : Promise.resolve(ack(value)); },
    onPublished: value => published.push(value) });
  publisher.update(point());
  await flush();
  publisher.update(point(68.5044));
  first.reject(new Error('network unavailable'));
  await flush();
  assert.deepEqual(published, []);
  await clock.advance(15000);
  assert.equal(sent.at(-1).lng, 68.5044);
  assert.equal(published.at(-1).lng, 68.5044);
  publisher.dispose();
});

test('missing acknowledgement cannot unlock routing and is retried', async () => {
  const clock = fakeClock();
  let calls = 0;
  const published = [];
  const publisher = createDriverLocationPublisher({ ...clock,
    publish: async value => ++calls === 1 ? {} : ack(value), onPublished: value => published.push(value) });
  publisher.update(point());
  await flush();
  assert.equal(published.length, 0);
  await clock.advance(15000);
  assert.equal(published.length, 1);
  publisher.dispose();
});

test('offline/logout disposal cancels timers and ignores a late acknowledgement', async () => {
  const clock = fakeClock();
  const pending = deferred();
  let signal;
  const published = [];
  const publisher = createDriverLocationPublisher({ ...clock,
    publish: (_, options) => { signal = options.signal; return pending.promise; }, onPublished: value => published.push(value) });
  publisher.update(point());
  await flush();
  publisher.update(point(68.5044));
  publisher.dispose();
  assert(signal.aborted);
  pending.resolve(ack(point()));
  await flush();
  await clock.advance(30000);
  assert.deepEqual(published, []);
  assert.equal(clock.pending(), 0);
});

test('a changed session cannot send a queued location using another account', async () => {
  const clock = fakeClock();
  let session = 'original';
  const sent = [];
  const publisher = createDriverLocationPublisher({ ...clock, isCurrent: () => session === 'original',
    publish: async value => { sent.push(value); return ack(value); }, onPublished() {} });
  publisher.update(point());
  await flush();
  publisher.update(point(68.5044));
  session = 'replacement';
  await clock.advance(30000);
  assert.equal(sent.length, 1);
  assert.equal(clock.pending(), 0);
});

test('invalid GPS values never become a zero fix or an API write', async () => {
  const sent = [];
  const publisher = createDriverLocationPublisher({ publish: async value => { sent.push(value); return ack(value); }, onPublished() {} });
  for (const value of [null, {}, point(null), point(''), point(NaN), point(181), { ...point(), lat: 91 }]) publisher.update(value);
  await flush();
  assert.deepEqual(sent, []);
  publisher.dispose();
});

test('server-backed route uses the persisted longitude after a delayed write', async () => {
  const clock = fakeClock();
  let stored = point();
  const pending = deferred();
  const fetched = [];
  const order = fix => ({ id: 'trip-1', driver_id: 'driver-1', status: 'DRIVER_FOUND', driver_lat: fix.lat, driver_lng: fix.lng });
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: async () => { fetched.push(stored.lng); return { phase: 'to_pickup', driverLat: stored.lat, driverLng: stored.lng }; }, onRoute() {} });
  scheduler.update(order(stored));
  await flush();
  await clock.advance(16000);
  const publisher = createDriverLocationPublisher({ ...clock,
    publish: async value => { await pending.promise; stored = value; return ack(value); },
    onPublished: value => scheduler.update(order(value)) });
  publisher.update(point(68.5044));
  await flush();
  await clock.advance(1500);
  assert.deepEqual(fetched, [68.5041], 'Unpublished movement cannot launch a route from stale server coordinates');
  pending.resolve();
  await flush();
  assert.deepEqual(fetched, [68.5041, 68.5044], 'Acknowledgement itself schedules the final route; no new GPS tick is needed');
  publisher.dispose();
  scheduler.dispose();
});

test('publication errors are reported without blocking the trailing retry', async () => {
  const clock = fakeClock();
  const errors = [], published = [];
  const failure = { code: 'DRIVER_LOCATION_OUTSIDE_REGION' };
  let attempts = 0;
  const publisher = createDriverLocationPublisher({ ...clock,
    publish: async value => { if (++attempts === 1) throw failure; return ack(value); },
    onError: error => errors.push(error), onPublished: value => published.push(value) });
  publisher.update(point());
  await flush();
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(published, []);
  publisher.update(point(68.5044));
  await clock.advance(15000);
  assert.equal(published[0].lng, 68.5044);
  publisher.dispose();
});

test('missing acknowledgement reports feedback; disposal suppresses late failures', async () => {
  const clock = fakeClock();
  const errors = [];
  const pending = deferred();
  let attempts = 0;
  const publisher = createDriverLocationPublisher({ ...clock,
    publish: () => ++attempts === 1 ? Promise.resolve({}) : pending.promise,
    onError: error => errors.push(error), onPublished() {} });
  publisher.update(point());
  await flush();
  assert.deepEqual(errors, [{ code: 'LOCATION_ACK_MISSING' }]);
  await clock.advance(15000);
  publisher.dispose();
  pending.reject(new Error('request aborted after logout'));
  await flush();
  assert.equal(errors.length, 1, 'A closed session must not show late error feedback');
  assert.equal(clock.pending(), 0);
});

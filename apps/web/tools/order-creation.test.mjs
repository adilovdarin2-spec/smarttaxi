import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderWithRecovery } from '../src/lib/orderCreation.js';

const payload = { tariff: 'Economy', paymentMethod: 'CASH', distanceKm: 0.7 };
const active = { order: { id: 'local-order', status: 'NEW', price: 700 } };
const httpError = (status, code = 'ERROR') => Object.assign(new Error(code), { status, code });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture(respond, token = 'local-session') {
  const calls = [];
  const state = { token, calls };
  state.create = () => createOrderWithRecovery(payload, {
    readToken: () => state.token,
    request: async (path, options = {}) => {
      calls.push({ path, method: options.method || 'GET', token: state.token });
      return respond(path, options);
    }
  });
  return state;
}

test('confirmed creation returns unchanged without a follow-up read', async () => {
  const f = fixture(async () => active);
  assert.equal(await f.create(), active);
  assert.deepEqual(f.calls.map(call => call.method), ['POST']);
});

test('a lost response restores the server order with one POST and one GET', async () => {
  const f = fixture(async path => {
    if (path === '/api/orders') throw new TypeError('Failed to fetch');
    assert.equal(path, '/api/orders/me/active');
    return active;
  });
  assert.equal(await f.create(), active);
  assert.deepEqual(f.calls.map(call => call.method), ['POST', 'GET']);
});

test('server failures and active-order conflicts reconcile actual settlement', async () => {
  for (const error of [httpError(500), httpError(502), httpError(503), httpError(504),
    httpError(409, 'CLIENT_HAS_ACTIVE_ORDER')]) {
    const settlement = { order: { ...active.order, status: 'PAYMENT_PENDING', price: 850 } };
    const f = fixture(async path => {
      if (path === '/api/orders') throw error;
      return settlement;
    });
    assert.equal(await f.create(), settlement);
    assert.deepEqual(f.calls.map(call => call.method), ['POST', 'GET']);
  }
});

test('validation, authorization, aborts and unrelated conflicts are not recovered', async () => {
  for (const error of [httpError(400), httpError(401), httpError(403), httpError(409),
    httpError(422), httpError(429), Object.assign(new Error('closed'), { name: 'AbortError' })]) {
    const f = fixture(async () => { throw error; });
    await assert.rejects(f.create(), actual => actual === error);
    assert.equal(f.calls.length, 1);
  }
});

test('empty/malformed reconciliation never fabricates success', async () => {
  for (const order of [null, 'bad', [], {}, { id: 'only-id' }, { status: 'NEW' },
    { id: '', status: 'NEW' }]) {
    const error = new TypeError('Original lost response');
    const f = fixture(async path => {
      if (path === '/api/orders') throw error;
      return { order };
    });
    await assert.rejects(f.create(), actual => actual === error);
    assert.equal(f.calls.length, 2);
  }
});

test('failed reconciliation preserves the original failure without a retry loop', async () => {
  const error = new TypeError('Original lost response');
  const f = fixture(async path => { throw path === '/api/orders' ? error : httpError(503); });
  await assert.rejects(f.create(), actual => actual === error);
  assert.deepEqual(f.calls.map(call => call.method), ['POST', 'GET']);
});

test('anonymous failures never read an account order', async () => {
  const error = new TypeError('network');
  const f = fixture(async () => { throw error; }, '');
  await assert.rejects(f.create(), actual => actual === error);
  assert.equal(f.calls.length, 1);
});

test('logout or a new login before the failure prevents recovery', async () => {
  for (const nextToken of ['', 'new-session']) {
    const pending = deferred();
    const error = new TypeError('network');
    const f = fixture(async () => pending.promise);
    const failure = assert.rejects(f.create(), actual => actual === error);
    f.token = nextToken;
    pending.reject(error);
    await failure;
    assert.equal(f.calls.length, 1);
  }
});

test('session change during the active-order read discards its result', async () => {
  const pending = deferred();
  const started = deferred();
  const error = new TypeError('network');
  const f = fixture(async path => {
    if (path === '/api/orders') throw error;
    started.resolve();
    return pending.promise;
  });
  const failure = assert.rejects(f.create(), actual => actual === error);
  await started.promise;
  f.token = 'replacement-session';
  pending.resolve(active);
  await failure;
  assert.deepEqual(f.calls.map(call => call.token), ['local-session', 'local-session']);
});

test('late creation success also cannot populate the replacement account', async () => {
  const pending = deferred();
  const f = fixture(async () => pending.promise);
  const failure = assert.rejects(f.create(), { name: 'AbortError' });
  f.token = 'replacement-session';
  pending.resolve(active);
  await failure;
  assert.equal(f.calls.length, 1);
});

test('payload serialization failures are not treated as an uncertain write', async () => {
  const invalid = {};
  invalid.self = invalid;
  await assert.rejects(createOrderWithRecovery(invalid, {
    readToken: () => 'local-session',
    request: () => assert.fail('A cyclic payload must not start any request')
  }), TypeError);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionGuard } from '../src/lib/sessionGuard.js';

test('only a mounted operation with its original non-empty token remains current', () => {
  let token = 'session-a';
  let alive = true;
  const current = sessionGuard(token, () => token, () => alive);
  assert(current());
  alive = false;
  assert(!current());
  alive = true;
  token = '';
  assert(!current());
  token = 'session-b';
  assert(!current());
  for (const anonymous of ['', null, undefined]) assert(!sessionGuard(anonymous, () => anonymous)());
});

test('a late superseded response cannot clear the replacement session', async () => {
  let token = 'old-login';
  const current = sessionGuard(token, () => token);
  token = 'new-login';
  let expireEvents = 0;
  await Promise.resolve();
  if (current()) { token = ''; expireEvents++; }
  assert.equal(token, 'new-login');
  assert.equal(expireEvents, 0);
});

test('supersession of the actual current session still expires it once', () => {
  let token = 'current-login';
  const first = sessionGuard(token, () => token);
  const second = sessionGuard(token, () => token);
  let expireEvents = 0;
  for (const current of [first, second]) {
    if (current()) { token = ''; expireEvents++; }
  }
  assert.equal(token, '');
  assert.equal(expireEvents, 1);
});

test('old success, error and finally callbacks cannot change the next driver screen', async () => {
  let token = 'old-login';
  const current = sessionGuard(token, () => token);
  const state = { driver: 'new-driver', error: '', loading: 'new-action' };
  token = 'new-login';
  await Promise.resolve();
  if (current()) state.driver = 'old-driver';
  if (current()) state.error = 'old-request-error';
  if (current()) state.loading = '';
  assert.deepEqual(state, { driver: 'new-driver', error: '', loading: 'new-action' });
});

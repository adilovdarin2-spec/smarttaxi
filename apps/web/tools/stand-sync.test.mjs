import test from 'node:test';
import assert from 'node:assert/strict';
import { StandSync } from '../src/features/shared/standSync.mjs';

function ready() {
  const sync = new StandSync();
  assert.equal(sync.beginWrite(), null);
  assert(sync.settleRead(sync.beginRead(), true));
  return sync;
}
test('stand writes wait for a confirmed initial snapshot', () => {
  const sync = new StandSync();
  assert.equal(sync.beginWrite(), null);
  sync.settleRead(sync.beginRead(), false);
  assert.equal(sync.beginWrite(), null);
  sync.settleRead(sync.beginRead(), true);
  assert(sync.beginWrite());
});
test('a seat write is single-flight and invalidates the earlier poll', () => {
  const sync = ready();
  const old = sync.beginRead();
  const write = sync.beginWrite();
  assert(write);
  assert.equal(sync.beginWrite(), null);
  assert.equal(sync.beginRead(), null);
  assert.equal(sync.settleRead(old, true), false);
  assert(sync.blocked);
});
test('a lost response can reconcile but never replays the seat write', () => {
  const sync = ready();
  const write = sync.beginWrite();
  assert(sync.currentWrite(write));
  const read = sync.beginRead({ reconcile: true });
  assert(sync.settleRead(read, true));
  assert.equal(sync.beginWrite(), null, 'reconciliation still belongs to the current write');
  assert(sync.finishWrite(write));
  assert(!sync.blocked);
  assert(sync.beginWrite());
});
test('failed reconciliation locks actions until a successful fresh read', () => {
  const sync = ready();
  const write = sync.beginWrite();
  sync.settleRead(sync.beginRead({ reconcile: true }), false);
  sync.finishWrite(write);
  assert.equal(sync.beginWrite(), null);
  sync.settleRead(sync.beginRead(), true);
  assert(sync.beginWrite());
});
test('late success cannot hide a newer stand read failure', () => {
  const sync = ready();
  const old = sync.beginRead();
  const latest = sync.beginRead();
  sync.settleRead(latest, false);
  assert.equal(sync.settleRead(old, true), false);
  assert(sync.blocked);
});
test('replacement session cannot accept a previous account snapshot or write', () => {
  let token = 'first';
  const sync = new StandSync(() => token);
  sync.settleRead(sync.beginRead(), true);
  const write = sync.beginWrite();
  const read = sync.beginRead({ reconcile: true });
  token = 'second';
  assert.equal(sync.currentWrite(write), false);
  assert.equal(sync.settleRead(read, true), false);
});
test('unmount and StrictMode remount invalidate old requests', () => {
  const sync = ready();
  const old = sync.beginRead();
  sync.dispose();
  assert.equal(sync.beginRead(), null);
  assert.equal(sync.settleRead(old, true), false);
  sync.activate();
  assert.equal(sync.settleRead(old, true), false);
  assert(sync.settleRead(sync.beginRead(), true));
  assert(sync.beginWrite());
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { assignWithRecovery } from '../src/lib/assignmentRecovery.js';

test('lost driver assignment acknowledgement recovers only the same private active order without replay', async () => {
  let writes = 0, reads = 0;
  const failure = new TypeError('Failed to fetch');
  const options = { orderId: 'wanted', write: async () => { writes++; throw failure; },
    readActive: async () => { reads++; return { activeOrder: { id: 'wanted', status: 'DRIVER_FOUND' } }; }, isCurrent: () => true };
  assert.equal((await assignWithRecovery(options)).order.id, 'wanted');
  assert.equal(writes, 1); assert.equal(reads, 1);
  for (const activeOrder of [null, { id: 'different' }]) {
    await assert.rejects(assignWithRecovery({ ...options, readActive: async () => ({ activeOrder }) }), error => error === failure);
  }
  await assert.rejects(assignWithRecovery({ ...options, readActive: async () => { throw new Error('read failed'); } }), error => error === failure);
});

test('successful writes need no recovery and superseded sessions cannot read or receive old state', async () => {
  const options = { orderId: 'wanted', write: async () => ({ order: { id: 'wanted' } }),
    readActive: async () => assert.fail('No read after success'), isCurrent: () => true };
  assert.equal((await assignWithRecovery(options)).order.id, 'wanted');
  const failure = new Error('lost acknowledgement');
  await assert.rejects(assignWithRecovery({ ...options, write: async () => { throw failure; }, isCurrent: () => false }), error => error === failure);
  let current = true;
  await assert.rejects(assignWithRecovery({ ...options, write: async () => { throw failure; }, isCurrent: () => current,
    readActive: async () => { current = false; return { activeOrder: { id: 'wanted' } }; } }), error => error === failure);
});

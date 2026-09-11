import assert from 'node:assert/strict';
import test from 'node:test';
import { isResolvedAddressPoint } from '../src/features/client/address-resolution.mjs';

const address = { label: 'улица Абая, 14', lat: 40.7, lng: 68.52 };
test('unresolved response cannot be confirmed even with a readable label', () => {
  assert.equal(isResolvedAddressPoint(address), true);
  assert.equal(isResolvedAddressPoint({ ...address, fallback: true }), false);
});
test('missing and invalid coordinates cannot silently become zero', () => {
  for (const lat of [null, undefined, '', ' ', false, [], {}, NaN, Infinity, 91]) {
    assert.equal(isResolvedAddressPoint({ ...address, lat }), false, String(lat));
  }
  assert.equal(isResolvedAddressPoint({ ...address, lng: 181 }), false);
  assert.equal(isResolvedAddressPoint({ ...address, lat: '40.7' }), true);
  assert.equal(isResolvedAddressPoint({ ...address, lat: 0 }), true);
});

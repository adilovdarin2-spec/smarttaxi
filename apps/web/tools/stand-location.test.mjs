import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshStandPosition } from '../src/features/shared/standLocation.mjs';

const now = 1_800_000_000_000;
const fix = { lat: 40.8458, lng: 68.5041, accuracy: 8, timestamp: now };
test('stand accepts a recent accurate sensor fix, including the parked heartbeat interval', () => {
  for (const age of [0, 25000, 30000, -5000]) {
    assert.deepEqual(freshStandPosition({ ...fix, timestamp: now - age }, now), { lat: fix.lat, lng: fix.lng });
  }
});
test('a region centre or expired/future GPS cannot renew a stand place', () => {
  for (const position of [null, { lat: fix.lat, lng: fix.lng },
    { ...fix, timestamp: now - 30001 }, { ...fix, timestamp: now + 5001 },
    { ...fix, timestamp: NaN }]) assert.equal(freshStandPosition(position, now), null);
});
test('coarse, invalid or non-sensor coordinates cannot join a stand', () => {
  for (const change of [{ accuracy: 61 }, { accuracy: -1 }, { accuracy: NaN },
    { accuracy: undefined }, { lat: 91 }, { lng: -181 }, { lat: Infinity }, { lng: '68.5041' }]) {
    assert.equal(freshStandPosition({ ...fix, ...change }, now), null);
  }
  assert.ok(freshStandPosition({ ...fix, accuracy: 60 }, now));
});

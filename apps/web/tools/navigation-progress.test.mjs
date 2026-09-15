import assert from 'node:assert/strict';
import test from 'node:test';
import { browserNavigationFix, navigationDistance, navigationFixIsFresh, navigationInstruction, navigationProgress, nextNavigationStep } from '../src/features/driver/navigationProgress.js';

const step = (type, lat, lng, distanceMeters) => ({ type, lat, lng, distanceMeters, modifier: 'right', streetName: 'Улица' });
const bend = [[0, 0], [.001, 0], [.001, .001], [0, .001]];
const route = (coordinates = bend, steps = []) => ({ geometry: { type: 'LineString', coordinates }, distanceMeters: 300, durationSeconds: 180, steps });
const close = (actual, expected) => assert(Math.abs(actual - expected) < .1, `${actual} != ${expected}`);

test('navigation measures remaining road distance around a block, not a straight shortcut', () => {
  const r = route(bend, [step('depart', 0, 0, 300), step('arrive', .001, 0, 0)]);
  const p = navigationProgress(r, { lat: 0, lng: .0005 });
  close(p.distanceMeters, 250); close(p.durationSeconds, 150);
  close(nextNavigationStep(r, p).distanceMeters, 250);
});
test('lateral GPS error does not increase remaining road distance', () => {
  const a = navigationProgress(route(), { lat: 0, lng: .0005 });
  const b = navigationProgress(route(), { lat: .0001, lng: .0005 });
  close(a.distanceMeters, b.distanceMeters); close(b.distanceFromRoute, 11.12);
});
test('a passed maneuver is removed before the next vertex', () => {
  const r = route(bend, [step('depart', 0, 0, 100), step('turn', 0, .001, 100), step('turn', .001, .001, 100), step('arrive', .001, 0, 0)]);
  const next = nextNavigationStep(r, navigationProgress(r, { lat: .0002, lng: .001 }));
  assert.equal(next.step.lat, .001); close(next.distanceMeters, 80);
});
test('arrival at a repeated coordinate uses the last occurrence, just like Flutter', () => {
  const r = route([...bend, [0, 0]], [step('depart', 0, 0, 300), step('arrive', 0, 0, 0)]);
  close(nextNavigationStep(r, navigationProgress(r, { lat: 0, lng: 0 })).distanceMeters, 300);
});
test('two-point route supports a real arrival', () => {
  const r = route(bend.slice(0, 2), [step('depart', 0, 0, 300), step('arrive', 0, .001, 0)]);
  const p = navigationProgress(r, { lat: 0, lng: .0009 });
  assert.equal(nextNavigationStep(r, p).step.type, 'arrive'); close(p.distanceMeters, 30);
});
test('off-route, fallback and malformed geometry never supply driving guidance', () => {
  assert.equal(navigationProgress(route(), { lat: .004, lng: .004 }), null);
  for (const r of [{ ...route(), fallback: true }, { ...route(), providerStatus: 'Fallback' }, route([[0, 0], [0, 0]]), route([[null, 0], [.001, 0]]), { ...route(), durationSeconds: null }]) {
    assert.equal(navigationProgress(r, { lat: 0, lng: 0 }), null);
  }
  const r = route();
  assert.equal(nextNavigationStep(r, navigationProgress(r, { lat: 0, lng: 0 })), null);
});
test('real sensor time expires; null, future, duplicate and out-of-order fixes are rejected', () => {
  const now = 100000;
  const position = { timestamp: now, coords: { latitude: 40.84, longitude: 68.50, heading: 0, speed: 0, accuracy: 8 } };
  assert(navigationFixIsFresh(now, now + 12000));
  assert(!navigationFixIsFresh(now, now + 12001));
  assert(!navigationFixIsFresh(now + 5001, now));
  assert(!navigationFixIsFresh(null, now));
  assert.equal(browserNavigationFix(position, null, now).speed, 0);
  assert.equal(browserNavigationFix(position, now, now), null);
  assert.equal(browserNavigationFix(position, now + 1, now), null);
  assert.equal(browserNavigationFix({ ...position, timestamp: now - 13000 }, null, now), null);
  assert.equal(browserNavigationFix({ ...position, coords: { ...position.coords, latitude: null } }, null, now), null);
  assert.equal(browserNavigationFix({ ...position, coords: { ...position.coords, speed: null, heading: null } }, null, now).speed, null);
});
test('maneuver wording uses real turn/exit metadata and no fake roundabout exit', () => {
  assert.equal(navigationInstruction({ type: 'turn', modifier: 'left' }).text, 'Поверните налево');
  assert.equal(navigationInstruction({ type: 'turn', modifier: 'uturn' }).icon, 'uturn');
  assert.match(navigationInstruction({ type: 'roundabout', exit: 3 }).text, /3-й съезд/);
  assert.doesNotMatch(navigationInstruction({ type: 'roundabout', exit: 0 }).text, /съезд/);
  assert.equal(navigationInstruction({ type: 'fork', modifier: 'right' }).text, 'Держитесь правее');
  assert.equal(navigationDistance(null), '—');
  assert.equal(navigationDistance(84), '80 м');
  assert.equal(navigationDistance(1250), '1,3 км');
});

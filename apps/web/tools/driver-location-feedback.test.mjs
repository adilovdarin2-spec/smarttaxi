import assert from 'node:assert/strict';
import test from 'node:test';
import { driverLocationFeedback } from '../src/features/driver/driverLocationFeedback.js';

test('GPS denial, unavailable, timeout and unsupported each explain recovery', () => {
  for (const [code, title] of [[1, 'Разрешите геолокацию'], [2, 'Местоположение недоступно'],
    [3, 'Не удалось определить местоположение'], ['unsupported', 'Геолокация недоступна в браузере']]) {
    const feedback = driverLocationFeedback({ code });
    assert.equal(feedback.title, title);
    assert.equal(feedback.source, 'browser');
    assert(feedback.description.length > 30);
  }
  assert.match(driverLocationFeedback({ code: 1 }).description, /настройках этого сайта/);
});

test('API location rejection preserves actionable region/status reason', () => {
  for (const code of ['DRIVER_LOCATION_OUTSIDE_REGION', 'DRIVER_REGION_INACTIVE',
    'DRIVER_REGION_BLOCKED', 'DRIVER_REGION_NOT_APPROVED', 'DRIVER_OFFLINE']) {
    const feedback = driverLocationFeedback({ code }, 'publication');
    assert.equal(feedback.source, 'publication');
    assert.doesNotMatch(feedback.description, /повторится автоматически/,
      'Retry alone cannot fix a region/status rejection');
    assert.notEqual(feedback.title, 'Координаты не отправлены');
  }
});

test('network and missing acknowledgement feedback does not expose raw server data', () => {
  for (const error of [new Error('private diagnostic'), { code: 'SERVICE_UNAVAILABLE' }, { code: 'LOCATION_ACK_MISSING' }, null]) {
    const feedback = driverLocationFeedback(error, 'publication');
    assert.equal(feedback.title, 'Координаты не отправлены');
    assert.match(feedback.description, /могут быть устаревшими/);
    assert.doesNotMatch(feedback.description, /private diagnostic/);
  }
});

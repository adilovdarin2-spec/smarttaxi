import test from 'node:test';
import assert from 'node:assert/strict';
import { standOutcomeNotice, standOutcomeMessages } from '../src/features/shared/standOutcome.mjs';

test('stand notices use the matching personal terminal record, not a guessed cause', () => {
  const notice = (status, reason, driver = false) => standOutcomeNotice({ id: 'own', status, reason }, 'own', driver);
  assert.equal(notice('CANCELLED', 'STAND_CLOSED'), 'closedRider');
  assert.equal(notice('EXPIRED', 'STAND_CLOSED', true), 'closedDriver');
  assert.equal(notice('EXPIRED', null), 'expired');
  assert.equal(notice('DECLINED', null), 'declined');
  assert.equal(notice('BOARDED', null), 'boarded');
  assert.equal(notice('CANCELLED', 'DEPARTED'), 'carLeft');
  assert.equal(notice('CANCELLED', null), 'cancelled');
  for (const [reason, expected] of [['LEFT_AREA','leftArea'], ['NO_SIGNAL','noSignal'], ['GAVE_TURN','handedOver'], ['ACCEPTED_ORDER','acceptedOrder']]) {
    assert.equal(notice('LEFT', reason, true), expected);
  }
  for (const status of ['WAITING','BOARDING','PENDING','CONFIRMED']) assert.equal(notice(status, null), null);
  assert.equal(standOutcomeNotice(null, 'own'), 'riderUnavailable');
  assert.equal(standOutcomeNotice({ id: 'other', status: 'CANCELLED', reason: 'STAND_CLOSED' }, 'own'), 'riderUnavailable');
  assert.equal(notice('FUTURE_STATUS', null), 'riderUnavailable');
  assert.equal(notice('DEPARTED', null, true), 'boarded');
  assert.ok(!standOutcomeMessages.boarded.includes('Бронь снята'));
});

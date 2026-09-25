import assert from 'node:assert/strict';
import test from 'node:test';
import { assignmentErrorMessage } from '../src/features/shared/assignmentError.mjs';
import { driverErrorMessage } from '../src/features/driver/driverErrorPresentation.js';

test('assignment rejection is actionable without disclosing driver debt or a private block to rider', () => {
  for (const code of ['DRIVER_DEBT_LIMIT', 'ORDER_REGION_MISMATCH', 'DRIVER_PREVIOUSLY_CANCELLED_ORDER', 'DRIVER_BLOCKED_BY_CLIENT', 'CLIENT_BLOCKED_BY_DRIVER']) {
    assert.match(assignmentErrorMessage(code), /Выберите другого водителя/);
    assert.doesNotMatch(assignmentErrorMessage(code), /долг|блокиров|соединение/i);
    assert.equal(driverErrorMessage({ code }), assignmentErrorMessage(code, true));
  }
  for (const code of [null, undefined, 'UNAUTHORIZED', 'UNKNOWN', 'toString', '__proto__']) assert.equal(assignmentErrorMessage(code), null);
});

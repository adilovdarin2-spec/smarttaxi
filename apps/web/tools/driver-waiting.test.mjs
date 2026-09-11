import test from 'node:test';
import assert from 'node:assert/strict';
import { driverWaitingPresentation as present } from '../src/features/driver/driverWaitingPresentation.js';

test('waiting face follows server window, without fabricated timestamps', () => {
  const start = Date.parse('2026-09-09T12:00:00Z');
  const order = {status:'WAITING_CLIENT', waiting_started_at:new Date(start).toISOString(),free_waiting_until:new Date(start+180000).toISOString()};
  assert.deepEqual(present(order, start+30000), {paid:false,label:'Бесплатное ожидание',time:'02:30',progress:5/6});
  assert.deepEqual(present(order, start+270000), {paid:true,label:'Платное ожидание',time:'01:30',progress:0});
  assert.equal(present(order,start+180000).time,'00:00');
  assert.equal(present({...order,status:'TRIP_STARTED'},start),null);
  assert.equal(present({...order,free_waiting_until:null},start),null);
  assert.equal(present({...order,waiting_started_at:'invalid'},start),null);
  assert.equal(present({...order,free_waiting_until:new Date(start-1).toISOString()},start),null);
  assert.equal(present({...order,waiting_started_at:null,free_waiting_until:null,waitingStartedAt:new Date(start).toISOString(),freeWaitingUntil:new Date(start+180000).toISOString()},start+30000).time,'02:30');
});

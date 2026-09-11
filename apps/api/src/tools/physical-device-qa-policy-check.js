import assert from 'node:assert/strict';
import { isPhysicalDeviceQaOrder, PHYSICAL_DEVICE_QA } from './physical-device-qa-policy.js';

const generated = {
  rider_phone: '+77081234567',
  rider_name: PHYSICAL_DEVICE_QA.riderName,
  payment_method: 'CASH',
  notes: PHYSICAL_DEVICE_QA.notes,
  pickup_text: PHYSICAL_DEVICE_QA.pickupText,
  dropoff_text: PHYSICAL_DEVICE_QA.dropoffText,
  pickup_lat: String(PHYSICAL_DEVICE_QA.pickupLat),
  pickup_lng: String(PHYSICAL_DEVICE_QA.pickupLng),
  dropoff_lat: String(PHYSICAL_DEVICE_QA.dropoffLat),
  dropoff_lng: String(PHYSICAL_DEVICE_QA.dropoffLng)
};

assert.equal(isPhysicalDeviceQaOrder(generated), true, 'fresh local phone QA order must remain actionable');
assert.equal(isPhysicalDeviceQaOrder({ ...generated, rider_phone: '+77091234567' }), false, 'unrelated rider is rejected');
assert.equal(isPhysicalDeviceQaOrder({ ...generated, notes: 'ordinary trip' }), false, 'partial fixture match is rejected');
assert.equal(isPhysicalDeviceQaOrder({ ...generated, dropoff_lng: 68.9 }), false, 'different route is rejected');
assert.equal(isPhysicalDeviceQaOrder({ ...generated, payment_method: 'KASPI' }), false, 'non-CASH order is rejected');
assert.equal(isPhysicalDeviceQaOrder({ riderPhone: '+77000000001', paymentMethod: 'CASH' }), true, 'legacy seeded fixture remains supported');
assert.equal(isPhysicalDeviceQaOrder({ riderPhone: '+77000000001', paymentMethod: 'CARD' }), false, 'legacy fixture stays CASH-only');

console.log('Physical-device QA order policy: 7 passed.');

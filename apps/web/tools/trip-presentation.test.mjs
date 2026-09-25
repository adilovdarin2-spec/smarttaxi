import test from 'node:test';
import assert from 'node:assert/strict';
import { tripIdentity, tripApproach } from '../src/features/client/tripPresentation.mjs';

test('missing driver data cannot fabricate a white car, plate, rating or order ID', () => {
  assert.deepEqual(tripIdentity(), { name: 'Водитель ещё не назначен', phone: '', plate: '', vehicle: 'Автомобиль уточняется', rating: null, avatar: '', orderId: '' });
  assert.equal(tripApproach(), 'Время подачи уточняется');
});
test('driver presentation preserves real aliases, number and complete order identifier', () => {
  const driver = tripIdentity({ driverName: ' Айдос ', driverCarModel: 'Toyota Camry', driverCarColor: 'Серебристый', driverPlate: '001 ABC 13', driverRating: 4.85, id: 'abc-123-def-456' });
  assert.equal(driver.name, 'Айдос');
  assert.equal(driver.vehicle, 'Серебристый Toyota Camry');
  assert.equal(driver.plate, '001 ABC 13');
  assert.equal(driver.orderId, 'abc-123-def-456');
  assert.equal(driver.rating, '4.8');
  assert.equal(tripIdentity({ driver_rating: 8 }).rating, null);
  assert.equal(tripIdentity({ driver_id: 'assigned-driver' }).name, 'Водитель');
  assert.equal(tripIdentity({ short_id: 'B96A757484', id: 'abc-123-def-456' }).orderId, 'B96A757484');
});
test('approach uses only live pickup leg and labels estimates honestly', () => {
  assert.equal(tripApproach({}, { phase: 'to_pickup', durationSeconds: 121, distanceMeters: 1250 }), '3 мин · 1,3 км');
  assert.equal(tripApproach({}, { phase: 'to_pickup', durationSeconds: 60, fallback: true }), '1 мин · приблизительно');
  assert.equal(tripApproach({}, { phase: 'to_dropoff', durationSeconds: 600 }), 'Время подачи уточняется');
  assert.equal(tripApproach({ status: 'DRIVER_ARRIVED' }), 'Водитель на месте');
  assert.equal(tripApproach({ status: 'TRIP_STARTED' }), 'Подача завершена');
});

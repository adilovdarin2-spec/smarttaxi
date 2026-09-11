export const PHYSICAL_DEVICE_QA = Object.freeze({
  riderName: 'Local phone driver QA',
  notes: 'Local physical driver QA; stationary test order',
  pickupText: 'улица Бектасова, 60, Мырзакент',
  dropoffText: 'улица Кожанова, 34, Мырзакент',
  pickupLat: 40.662974,
  pickupLng: 68.55353,
  dropoffLat: 40.664778,
  dropoffLng: 68.552768
});

function field(order, snake, camel) {
  return order?.[snake] ?? order?.[camel];
}

function sameCoordinate(value, expected) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number - expected) <= 0.000001;
}

export function isPhysicalDeviceQaOrder(order) {
  if (field(order, 'payment_method', 'paymentMethod') !== 'CASH') return false;
  const phone = String(field(order, 'rider_phone', 'riderPhone') || '');

  // Preserve the historical seeded-rider fixture used by earlier phone runs.
  if (phone === '+77000000001') return true;

  // create-client-order uses a fresh +7708… local rider so it does not replace
  // the phone driver's token. Require every immutable fixture field before the
  // follow-up CLI may mutate that order; matching only a name or phone prefix
  // would make a normal local CASH trip too easy to mistake for QA data.
  return /^\+7708\d{7}$/.test(phone) &&
    field(order, 'rider_name', 'riderName') === PHYSICAL_DEVICE_QA.riderName &&
    field(order, 'notes', 'notes') === PHYSICAL_DEVICE_QA.notes &&
    field(order, 'pickup_text', 'pickupText') === PHYSICAL_DEVICE_QA.pickupText &&
    field(order, 'dropoff_text', 'dropoffText') === PHYSICAL_DEVICE_QA.dropoffText &&
    sameCoordinate(field(order, 'pickup_lat', 'pickupLat'), PHYSICAL_DEVICE_QA.pickupLat) &&
    sameCoordinate(field(order, 'pickup_lng', 'pickupLng'), PHYSICAL_DEVICE_QA.pickupLng) &&
    sameCoordinate(field(order, 'dropoff_lat', 'dropoffLat'), PHYSICAL_DEVICE_QA.dropoffLat) &&
    sameCoordinate(field(order, 'dropoff_lng', 'dropoffLng'), PHYSICAL_DEVICE_QA.dropoffLng);
}

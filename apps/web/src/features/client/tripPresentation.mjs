const value = (...items) => items.find(item => typeof item === 'string' && item.trim())?.trim() || '';

// Presentation must never manufacture a car, registration number or ETA.
export function tripIdentity(order = {}) {
  const model = value(order.driver_car_model, order.driverCarModel);
  const color = value(order.driver_car_color, order.driverCarColor);
  const plate = value(order.driver_plate, order.driverPlate, order.vehicle_plate, order.car_plate);
  const name = value(order.driver_name, order.driverName);
  const phone = value(order.driver_phone, order.driverPhone);
  const rawRating = order.driver_rating ?? order.driverRating;
  const rating = rawRating == null ? NaN : Number(rawRating);
  return {
    name: name || (order.driver_id || order.driverId ? 'Водитель' : 'Водитель ещё не назначен'), phone, plate,
    vehicle: [color, model].filter(Boolean).join(' ') || 'Автомобиль уточняется',
    rating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating.toFixed(1) : null,
    avatar: value(order.driver_avatar_url, order.driverAvatarUrl),
    orderId: value(String(order.short_id ?? ''), String(order.public_id ?? ''), String(order.id ?? '')),
  };
}

export function tripApproach(order = {}, route = null) {
  const status = order.public_status || order.status;
  if (['DRIVER_ARRIVED', 'WAITING_CLIENT'].includes(status)) return 'Водитель на месте';
  if (['TRIP_STARTED', 'IN_PROGRESS', 'TRIP_COMPLETED', 'COMPLETED', 'PAYMENT_PENDING', 'PAID', 'RATED'].includes(status)) return 'Подача завершена';
  const pickupRoute = route?.phase === 'to_pickup' ? route : null;
  const minutes = pickupRoute?.durationSeconds != null
    ? Number(pickupRoute.durationSeconds) / 60
    : Number(order.driver_eta_min ?? order.driverEtaMin ?? order.etaMin);
  const km = pickupRoute?.distanceMeters != null
    ? Number(pickupRoute.distanceMeters) / 1000
    : Number(order.driver_distance_km ?? order.driverDistanceKm);
  const parts = [];
  if (Number.isFinite(minutes) && minutes > 0) parts.push(`${Math.max(1, Math.ceil(minutes))} мин`);
  if (Number.isFinite(km) && km > 0) parts.push(`${km.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`);
  return parts.length ? parts.join(' · ') + (pickupRoute?.fallback ? ' · приблизительно' : '') : 'Время подачи уточняется';
}

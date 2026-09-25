// A parked car may report less often than a moving navigator. The stand's
// heartbeat is 25 seconds; only an actual sensor fix within 30 seconds counts.
export function freshStandPosition(position, now = Date.now()) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng) ||
      Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180 ||
      !Number.isFinite(position.timestamp) || now - position.timestamp < -5000 ||
      now - position.timestamp > 30000 || !Number.isFinite(position.accuracy) ||
      position.accuracy < 0 || position.accuracy > 60) return null;
  return { lat: position.lat, lng: position.lng };
}

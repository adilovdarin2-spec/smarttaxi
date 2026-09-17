// Counting and distance for the stand screens. Both web apps show the same
// numbers to different people, so the wording and the geofence maths live in
// one place — "1 машин" reads as broken, and a distance that disagrees with
// the server's would offer a driver a button that only produces a refusal.

export function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function carsInLine(count) {
  return `${count} ${plural(count, "машина", "машины", "машин")} в очереди`;
}

export function carsLabel(count) {
  return `${count} ${plural(count, "машина", "машины", "машин")}`;
}

export function freeSeatsLabel(count) {
  return `${count} ${plural(count, "свободное место", "свободных места", "свободных мест")}`;
}

export function seatsLabel(count) {
  return `${count} ${plural(count, "место", "места", "мест")}`;
}

/// The same haversine the server checks the geofence with, so the number a
/// driver is shown and the number they are refused on cannot drift apart.
export function distanceMeters(from, to) {
  if (!from || !to) return null;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function metresLabel(value) {
  return value == null ? "" : `${value} м`;
}

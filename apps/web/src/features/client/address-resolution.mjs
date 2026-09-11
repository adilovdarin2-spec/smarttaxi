// Shared final gate for provider-backed address selection. A readable label
// does not override an unresolved response or missing/invalid coordinates.
export function isResolvedAddressPoint(address) {
  if (!address || address.fallback === true) return false;
  return [[address.lat, 90], [address.lng, 180]].every(([value, limit]) =>
    (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit
  );
}

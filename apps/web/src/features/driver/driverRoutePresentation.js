// A live driving estimate belongs to a leg, not to a stationary/waiting state.
// Keep legacy source statuses in the state machine; this only controls the UI.
export function driverRouteMeta(route, status) {
  const phase = status === "TRIP_STARTED" ? "to_dropoff"
    : ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT"].includes(status) ? "to_pickup" : null;
  if (!phase || route?.phase !== phase || route.fallback || route.providerStatus === "Fallback" ||
      !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 ||
      !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) return null;
  const distance = (route.distanceMeters / 1000).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const minutes = Math.max(1, Math.ceil(route.durationSeconds / 60));
  return `${phase === "to_dropoff" ? "До точки назначения" : "До точки подачи"}: ${distance} км · ≈ ${minutes} мин`;
}

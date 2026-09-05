const TO_PICKUP = new Set([
  "NEW", "DRIVER_FOUND", "DRIVER_ASSIGNED", "DRIVER_GOING_TO_CLIENT",
  "DRIVER_ARRIVED", "WAITING_CLIENT"
]);
const TO_DROPOFF = new Set(["TRIP_STARTED", "IN_PROGRESS"]);

export function clientRoutePhase(status) {
  if (TO_DROPOFF.has(status)) return "to_dropoff";
  if (TO_PICKUP.has(status)) return "to_pickup";
  return null;
}

function routeContext(order) {
  const phase = clientRoutePhase(order?.status);
  const driverId = order?.driver_id ?? order?.driverId;
  if (!order?.id || !phase || !driverId) return null;
  return {
    key: JSON.stringify([order.id, driverId, phase]),
    orderId: order.id,
    driverId,
    phase,
    position: JSON.stringify([
      order.driver_lat ?? order.driverLat ?? null,
      order.driver_lng ?? order.driverLng ?? null
    ])
  };
}

// One scheduler owns the in-flight request and the trailing movement update.
// A GPS tick must not discard a still-useful response for the same driving leg.
export function createLiveRouteScheduler({
  fetchRoute,
  onRoute,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  intervalMs = 8000
}) {
  let context = null;
  let generation = 0;
  let timer = null;
  let inFlight = false;
  let pending = false;
  let lastStarted = -Infinity;
  let disposed = false;

  function clearScheduled() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function schedule() {
    if (disposed || !context || !pending || inFlight || timer !== null) return;
    const remaining = Math.max(0, intervalMs - (now() - lastStarted));
    if (remaining === 0) run();
    else timer = setTimer(() => {
      timer = null;
      run();
    }, remaining);
  }

  function run() {
    if (disposed || !context || inFlight || !pending) return;
    const active = context;
    const requestGeneration = generation;
    inFlight = true;
    pending = false;
    lastStarted = now();
    Promise.resolve()
      .then(() => disposed || requestGeneration !== generation ? null : fetchRoute(active.orderId))
      .then(route => {
        if (disposed || requestGeneration !== generation) return;
        if (route?.phase === active.phase) onRoute({
          ...route,
          sourceOrderId: active.orderId,
          sourceDriverId: active.driverId
        });
        else pending = true;
      })
      .catch(() => {
        // Keep a previously confirmed route during a brief provider outage.
        if (!disposed && requestGeneration === generation) pending = true;
      })
      .finally(() => {
        if (disposed || requestGeneration !== generation) return;
        inFlight = false;
        schedule();
      });
  }

  return {
    update(order) {
      if (disposed) return;
      const next = routeContext(order);
      if (context?.key !== next?.key) {
        generation++;
        clearScheduled();
        context = next;
        inFlight = false;
        pending = Boolean(next);
        lastStarted = -Infinity;
        onRoute(null);
        schedule();
      } else if (next && context.position !== next.position) {
        context = next;
        pending = true;
        schedule();
      }
    },
    dispose() {
      disposed = true;
      generation++;
      clearScheduled();
      context = null;
    }
  };
}

// Both a React cleanup and a changed credential invalidate a recovery request.
// The credential check also covers the gap before logout's rerender commits.
export function recoverClientActiveOrder({
  session,
  getSession,
  fetchOrder,
  onRecover,
  onError = () => {}
}) {
  let cancelled = false;
  const isCurrent = () => !cancelled && Boolean(session) && getSession() === session;
  Promise.resolve()
    .then(() => isCurrent() ? fetchOrder() : null)
    .then(payload => {
      if (isCurrent() && payload?.order?.id) onRecover(payload.order);
    })
    .catch(error => {
      if (isCurrent()) onError(error);
    });
  return () => { cancelled = true; };
}

export function mergeClientDriverLocation(order, location) {
  if (!order || location?.orderId !== order.id || !clientRoutePhase(order.status)) return order;
  const driverId = order.driver_id ?? order.driverId;
  if (!driverId || location.driverId !== driverId) return order;
  if (location.lat == null || location.lng == null) return order;
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return order;
  return {
    ...order,
    driver_lat: lat,
    driver_lng: lng,
    driver_heading: location.heading,
    ...(Number.isFinite(location.tripDistanceM) ? {
      distance_traveled_m: Math.max(Number(order.distance_traveled_m) || 0, location.tripDistanceM)
    } : {})
  };
}

export function isLiveRouteForOrder(route, order) {
  const context = routeContext(order);
  return Boolean(context && route && route.sourceOrderId === context.orderId &&
    route.sourceDriverId === context.driverId && route.phase === context.phase);
}

function coordinatePair(latValue, lngValue) {
  if (latValue == null || lngValue == null || latValue === "" || lngValue === "") return null;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function clientDriverMapPoint(order, liveRoute) {
  if (!routeContext(order)) return null;
  const current = coordinatePair(order.driver_lat ?? order.driverLat, order.driver_lng ?? order.driverLng);
  if (current) return current;
  // The assignment event can precede the next location event. The routing
  // endpoint already reads the driver's stored GPS fix; use that exact pair
  // only for the request's own order, driver and current leg.
  if (!isLiveRouteForOrder(liveRoute, order)) return null;
  return coordinatePair(liveRoute.driverLat, liveRoute.driverLng);
}

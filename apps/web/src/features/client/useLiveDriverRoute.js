import { useEffect, useRef, useState } from "react";
import { driverToPickupRoute, getToken } from "../../lib/mvpApi.js";
import { createLiveRouteScheduler, isLiveRouteForOrder } from "./clientTripLifecycle.js";

export function useLiveDriverRoute(order, session) {
  return useLiveDriverRouteState(order, session).route;
}

export function useLiveDriverRouteState(order, session) {
  const [route, setRoute] = useState(null);
  const [routeError, setRouteError] = useState(null);
  const schedulerRef = useRef(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    setRoute(null);
    setRouteError(null);
    if (!session) return undefined;
    const scheduler = createLiveRouteScheduler({
      fetchRoute: async orderId => {
        if (getToken() !== session) return null;
        const payload = await driverToPickupRoute(orderId);
        return payload?.route || null;
      },
      onRoute: next => {
        if (getToken() === session) {
          setRoute(next);
          setRouteError(null);
        }
      },
      onError: context => {
        if (getToken() === session) setRouteError(context);
      }
    });
    schedulerRef.current = scheduler;
    scheduler.update(orderRef.current);
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    schedulerRef.current?.update(order);
  }, [order?.id, order?.status, order?.driver_id, order?.driverId,
    order?.driver_lat, order?.driverLat, order?.driver_lng, order?.driverLng]);

  // Identity changes are visible during render, before effect cleanup runs.
  return {
    route: session && isLiveRouteForOrder(route, order) ? route : null,
    unavailable: Boolean(session && isLiveRouteForOrder(routeError, order))
  };
}

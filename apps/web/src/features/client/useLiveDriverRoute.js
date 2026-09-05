import { useEffect, useRef, useState } from "react";
import { driverToPickupRoute, getToken } from "../../lib/mvpApi.js";
import { createLiveRouteScheduler, isLiveRouteForOrder } from "./clientTripLifecycle.js";

export function useLiveDriverRoute(order, session) {
  const [route, setRoute] = useState(null);
  const schedulerRef = useRef(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    setRoute(null);
    if (!session) return undefined;
    const scheduler = createLiveRouteScheduler({
      fetchRoute: async orderId => {
        if (getToken() !== session) return null;
        const payload = await driverToPickupRoute(orderId);
        return payload?.route || null;
      },
      onRoute: next => {
        if (getToken() === session) setRoute(next);
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
  return session && isLiveRouteForOrder(route, order) ? route : null;
}

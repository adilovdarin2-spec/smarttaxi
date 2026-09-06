import assert from "node:assert/strict";
import test from "node:test";
import {
  clientRoutePhase,
  clientDriverMapPoint,
  createLiveRouteScheduler,
  isLiveRouteForOrder,
  mergeClientDriverLocation,
  recoverClientActiveOrder
} from "../src/features/client/clientTripLifecycle.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
const order = (changes = {}) => ({
  id: "trip-1", status: "DRIVER_FOUND", driver_id: "driver-1",
  driver_lat: 40.8, driver_lng: 68.3, ...changes
});
const route = (phase = "to_pickup", marker = 1) => ({ phase, geometry: { marker } });
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fakeClock() {
  let time = 0;
  let serial = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer(callback, delay) {
      const id = ++serial;
      timers.set(id, { callback, at: time + delay });
      return id;
    },
    clearTimer: id => timers.delete(id),
    async advance(ms) {
      const end = time + ms;
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      time = end;
      await flush();
    },
    pendingTimers: () => timers.size
  };
}

test("longitude-only movement gets a trailing route without another GPS tick", async () => {
  const clock = fakeClock();
  const calls = [];
  const received = [];
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: async id => { calls.push(id); return route(); },
    onRoute: value => received.push(value)
  });
  scheduler.update(order());
  await flush();
  await clock.advance(1000);
  scheduler.update(order({ driver_lng: 68.4 }));
  await clock.advance(6999);
  assert.equal(calls.length, 1);
  await clock.advance(1);
  assert.equal(calls.length, 2);
  assert.equal(received.at(-1).phase, "to_pickup");
  scheduler.dispose();
});

test("movement during an in-flight request retains its result and schedules latest fix", async () => {
  const clock = fakeClock();
  const first = deferred();
  let calls = 0;
  const received = [];
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: () => ++calls === 1 ? first.promise : Promise.resolve(route("to_pickup", 2)),
    onRoute: value => received.push(value)
  });
  scheduler.update(order());
  await flush();
  await clock.advance(1000);
  scheduler.update(order({ driver_lat: 40.81 }));
  first.resolve(route());
  await flush();
  assert.equal(received.at(-1).geometry.marker, 1);
  await clock.advance(7000);
  assert.equal(calls, 2);
  assert.equal(received.at(-1).geometry.marker, 2);
  scheduler.dispose();
});

test("continuous movement cannot postpone the trailing refresh indefinitely", async () => {
  const clock = fakeClock();
  let calls = 0;
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: async () => { calls++; return route(); }, onRoute() {}
  });
  scheduler.update(order());
  await flush();
  for (let i = 1; i <= 8; i++) {
    await clock.advance(1000);
    scheduler.update(order({ driver_lng: 68.3 + i / 1000 }));
  }
  assert.equal(calls, 2);
  scheduler.dispose();
});

test("starting the trip bypasses throttle and ignores late pickup response", async () => {
  const clock = fakeClock();
  const pickup = deferred();
  let calls = 0;
  const received = [];
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: () => ++calls === 1 ? pickup.promise : Promise.resolve(route("to_dropoff")),
    onRoute: value => received.push(value)
  });
  scheduler.update(order());
  await flush();
  await clock.advance(1000);
  scheduler.update(order({ status: "TRIP_STARTED" }));
  await flush();
  assert.equal(calls, 2);
  assert.equal(received.at(-1).phase, "to_dropoff");
  pickup.resolve(route());
  await flush();
  assert.equal(received.at(-1).phase, "to_dropoff");
  scheduler.dispose();
});

test("changing order or assigned driver immediately replaces the route context", async () => {
  const clock = fakeClock();
  const calls = [];
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: async id => { calls.push(id); return route(); }, onRoute() {}
  });
  scheduler.update(order());
  await flush();
  scheduler.update(order({ driver_id: "driver-2" }));
  await flush();
  scheduler.update(order({ id: "trip-2" }));
  await flush();
  assert.deepEqual(calls, ["trip-1", "trip-1", "trip-2"]);
  scheduler.dispose();
});

test("cancellation and completion clear routes and cancel their pending refresh", async () => {
  for (const status of ["SEARCHING_DRIVER", "CANCELLED_BY_CLIENT", "TRIP_COMPLETED", "PAYMENT_PENDING", "PAID"]) {
    const clock = fakeClock();
    const request = deferred();
    const received = [];
    const scheduler = createLiveRouteScheduler({ ...clock,
      fetchRoute: () => request.promise, onRoute: value => received.push(value)
    });
    scheduler.update(order());
    await flush();
    scheduler.update(order({ driver_lat: 40.81 }));
    scheduler.update(order({ status }));
    request.resolve(route());
    await flush();
    assert.equal(received.at(-1), null, status);
    assert.equal(clock.pendingTimers(), 0, status);
    scheduler.dispose();
  }
});

test("logout/unmount disposes callbacks and timers even if a request resolves late", async () => {
  const clock = fakeClock();
  const request = deferred();
  const received = [];
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: () => request.promise, onRoute: value => received.push(value)
  });
  scheduler.update(order());
  await flush();
  scheduler.dispose();
  const before = received.length;
  request.resolve(route());
  await flush();
  await clock.advance(16000);
  assert.equal(received.length, before);
  assert.equal(clock.pendingTimers(), 0);
});

test("failed refresh preserves the route and retries after the throttle interval", async () => {
  const clock = fakeClock();
  let calls = 0;
  const received = [];
  const scheduler = createLiveRouteScheduler({ ...clock,
    fetchRoute: async () => {
      if (++calls === 2) throw new Error("temporary outage");
      return route("to_pickup", calls);
    }, onRoute: value => received.push(value)
  });
  scheduler.update(order());
  await flush();
  scheduler.update(order({ driver_lng: 68.31 }));
  await clock.advance(8000);
  assert.equal(received.at(-1).geometry.marker, 1);
  await clock.advance(8000);
  assert.equal(received.at(-1).geometry.marker, 3);
  scheduler.dispose();
});

test("legacy statuses keep their source-leg semantics", () => {
  assert.equal(clientRoutePhase("DRIVER_ASSIGNED"), "to_pickup");
  assert.equal(clientRoutePhase("NEW"), "to_pickup");
  assert.equal(clientRoutePhase("IN_PROGRESS"), "to_dropoff");
  assert.equal(clientRoutePhase("RATED"), null);
});

test("active/unpaid orders recover after authentication; no-active is a valid empty response", async () => {
  for (const status of ["SEARCHING_DRIVER", "TRIP_STARTED", "PAYMENT_PENDING"]) {
    const received = [];
    recoverClientActiveOrder({ session: "test-session", getSession: () => "test-session",
      fetchOrder: async () => ({ order: order({ status }) }), onRecover: value => received.push(value)
    });
    await flush();
    assert.equal(received[0].status, status);
  }
  const received = [];
  recoverClientActiveOrder({ session: "test-session", getSession: () => "test-session",
    fetchOrder: async () => ({ order: null }), onRecover: value => received.push(value)
  });
  await flush();
  assert.deepEqual(received, []);
});

test("logout, account change and cleanup invalidate an in-flight order recovery", async () => {
  for (const change of ["logout", "account", "cleanup"]) {
    let session = "first-session";
    const request = deferred();
    const received = [];
    const cancel = recoverClientActiveOrder({ session, getSession: () => session,
      fetchOrder: () => request.promise, onRecover: value => received.push(value)
    });
    await flush();
    if (change === "cleanup") cancel();
    else session = change === "logout" ? "" : "second-session";
    request.resolve({ order: order() });
    await flush();
    assert.deepEqual(received, [], change);
  }
});

test("real location events update both coordinates only for this trip's assigned driver", () => {
  const current = order({ distance_traveled_m: 50 });
  const location = { orderId: current.id, driverId: current.driver_id,
    lat: 40.81, lng: 68.31, heading: 90, tripDistanceM: 45 };
  const updated = mergeClientDriverLocation(current, location);
  assert.equal(updated.driver_lat, 40.81);
  assert.equal(updated.driver_lng, 68.31);
  assert.equal(updated.driver_heading, 90);
  assert.equal(updated.distance_traveled_m, 50);
  for (const invalid of [
    { ...location, orderId: "another-trip" },
    { ...location, driverId: "previous-driver" },
    { ...location, lat: null },
    { ...location, lng: NaN }
  ]) assert.equal(mergeClientDriverLocation(current, invalid), current);
  const cancelled = order({ status: "CANCELLED_BY_CLIENT" });
  assert.equal(mergeClientDriverLocation(cancelled, location), cancelled);
});

test("route response supplies an authoritative driver position before the next GPS event", async () => {
  const assigned = order({ driver_lat: null, driver_lng: null });
  const received = [];
  const scheduler = createLiveRouteScheduler({
    fetchRoute: async () => ({ ...route(), driverLat: 40.82, driverLng: 68.32 }),
    onRoute: value => received.push(value)
  });
  scheduler.update(assigned);
  await flush();
  const liveRoute = received.at(-1);
  assert.equal(liveRoute.sourceOrderId, assigned.id);
  assert.equal(liveRoute.sourceDriverId, assigned.driver_id);
  assert.equal(isLiveRouteForOrder(liveRoute, assigned), true);
  assert.deepEqual(clientDriverMapPoint(assigned, liveRoute), { lat: 40.82, lng: 68.32 });
  scheduler.dispose();
});

test("a fresh order location takes precedence over the previous routing fix", () => {
  const liveRoute = { ...route(), sourceOrderId: "trip-1", sourceDriverId: "driver-1", driverLat: 40.82, driverLng: 68.32 };
  assert.deepEqual(clientDriverMapPoint(order(), liveRoute), { lat: 40.8, lng: 68.3 });
});

test("driver marker never falls back to a different order, driver or leg", () => {
  const assigned = order({ driver_lat: null, driver_lng: null });
  const liveRoute = { ...route(), sourceOrderId: assigned.id, sourceDriverId: assigned.driver_id,
    driverLat: 40.82, driverLng: 68.32 };
  for (const stale of [
    { ...liveRoute, sourceOrderId: "trip-old" },
    { ...liveRoute, sourceDriverId: "driver-old" },
    { ...liveRoute, phase: "to_dropoff" },
    { ...liveRoute, sourceOrderId: undefined }
  ]) {
    assert.equal(isLiveRouteForOrder(stale, assigned), false);
    assert.equal(clientDriverMapPoint(assigned, stale), null);
  }
  assert.equal(clientDriverMapPoint({ ...assigned, status: "PAID" }, liveRoute), null);
  assert.equal(clientDriverMapPoint({ ...assigned, driver_id: null }, liveRoute), null);
});

test("missing or invalid routing GPS never turns into a zero coordinate marker", () => {
  const assigned = order({ driver_lat: null, driver_lng: null });
  const liveRoute = { ...route(), sourceOrderId: assigned.id, sourceDriverId: assigned.driver_id };
  for (const coordinates of [
    {}, { driverLat: null, driverLng: null }, { driverLat: "", driverLng: "" },
    { driverLat: 91, driverLng: 68.32 }, { driverLat: 40.82, driverLng: NaN }
  ]) assert.equal(clientDriverMapPoint(assigned, { ...liveRoute, ...coordinates }), null);
});

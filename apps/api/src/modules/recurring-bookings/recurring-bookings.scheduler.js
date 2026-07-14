import { query, tx } from "../../db/pool.js";
import { writeAudit } from "../../common/audit.js";
import { resolveTripRegion, requestRoute } from "../routing/routing.service.js";
import { emitOrderCreated } from "../orders/order-dispatch.service.js";
import { notifyOrderClient, notifyOrderDriver } from "../notifications/notification.service.js";
import { assertDriverDispatchReady } from "../driver-region-approvals/driver-region-approvals.service.js";

// NOTE on time zones: this compares against the database server's own NOW()
// (Postgres, normally UTC on a managed host like Railway), not any
// particular local time zone. time_of_day should be submitted already
// converted to that same reference — there's no per-region offset applied
// here. Worth revisiting once the app has a real "service time zone"
// setting; documented as a known limitation for now rather than guessed at.
const TRIGGER_WINDOW_MINUTES = 15;

function shortId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function findDueBookings() {
  return (await query(`
    SELECT * FROM recurring_bookings
    WHERE status='ACTIVE'
      AND EXTRACT(ISODOW FROM NOW())::int = ANY(days_of_week)
      AND NOW()::time >= (time_of_day - INTERVAL '${TRIGGER_WINDOW_MINUTES} minutes')
      AND NOW()::time <= time_of_day
      AND (last_triggered_date IS NULL OR last_triggered_date <> CURRENT_DATE)
  `)).rows;
}

async function createOrderForBooking(booking) {
  const client = (await query("SELECT * FROM clients WHERE id=$1", [booking.client_id])).rows[0];
  if (!client) {
    console.warn(`[recurring-bookings] client ${booking.client_id} missing for booking ${booking.id}, skipping`);
    return;
  }
  const driver = (await query("SELECT * FROM drivers WHERE id=$1", [booking.driver_id])).rows[0];
  if (!driver) {
    console.warn(`[recurring-bookings] driver ${booking.driver_id} missing for booking ${booking.id}, skipping`);
    return;
  }

  let region;
  try {
    ({ region } = await resolveTripRegion({
      pickupLat: booking.pickup_lat,
      pickupLng: booking.pickup_lng,
      dropoffLat: booking.dropoff_lat,
      dropoffLng: booking.dropoff_lng
    }));
  } catch (error) {
    console.warn(`[recurring-bookings] region resolution failed for booking ${booking.id}: ${error.message} — will retry next tick`);
    return;
  }

  if (driver.current_region_id !== region.id) {
    console.warn(`[recurring-bookings] driver ${driver.id} is outside booking ${booking.id}'s region right now, will retry next tick`);
    return;
  }
  try {
    await assertDriverDispatchReady(driver, query);
  } catch (error) {
    console.warn(`[recurring-bookings] driver ${driver.id} not dispatch-ready for booking ${booking.id}: ${error.message}`);
    return;
  }
  if (driver.status !== "FREE") {
    console.warn(`[recurring-bookings] driver ${driver.id} is not free for booking ${booking.id} (status=${driver.status}), will retry next tick`);
    return;
  }

  // Distance/duration are informational only — price is fixed by the
  // booking, not recalculated — so a routing hiccup shouldn't block the
  // school run from being created.
  let distanceKm = 0;
  let durationMin = 0;
  try {
    const route = await requestRoute({
      from: { lat: Number(booking.pickup_lat), lng: Number(booking.pickup_lng) },
      to: { lat: Number(booking.dropoff_lat), lng: Number(booking.dropoff_lng) }
    });
    distanceKm = route.distanceMeters / 1000;
    durationMin = route.durationSeconds / 60;
  } catch {
    // keep zeros
  }

  const tariff = (await query("SELECT * FROM tariffs WHERE region_id=$1 AND name='Economy'", [region.id])).rows[0];
  const commissionPercent = Number(tariff?.service_commission_percent ?? 0);
  const serviceCommission = Math.round((booking.price_kzt * commissionPercent) / 100);

  const order = await tx(async (dbClient) => {
    const driverRow = (await dbClient.query("SELECT * FROM drivers WHERE id=$1 FOR UPDATE", [driver.id])).rows[0];
    if (!driverRow || driverRow.status !== "FREE") return null;
    // The "already triggered today" check runs in SQL (not compared against
    // a JS-side date string) since node-postgres returns DATE columns as
    // parsed Date objects — a string comparison here would silently never
    // match and defeat the whole dedup guard.
    const bookingRow = (await dbClient.query(
      `SELECT id FROM recurring_bookings
       WHERE id=$1 AND (last_triggered_date IS NULL OR last_triggered_date <> CURRENT_DATE)
       FOR UPDATE`,
      [booking.id]
    )).rows[0];
    if (!bookingRow) return null;

    let created;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        created = (await dbClient.query(`
          INSERT INTO orders(
            short_id, status, region_id, client_id, driver_id, rider_name, rider_phone,
            pickup_text, dropoff_text, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            tariff, payment_method, price, distance_km, duration_min, service_commission,
            pricing_snapshot, notes, recurring_booking_id, accepted_at
          )
          VALUES($1,'DRIVER_FOUND',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'CASH',$14,$15,$16,$17,'{}'::jsonb,$18,$19,NOW())
          RETURNING *
        `, [
          shortId(), region.id, booking.client_id, booking.driver_id,
          client.name, client.phone,
          booking.pickup_text, booking.dropoff_text,
          booking.pickup_lat, booking.pickup_lng, booking.dropoff_lat, booking.dropoff_lng,
          "Economy", booking.price_kzt, distanceKm, durationMin, serviceCommission,
          "Регулярный маршрут" + (booking.notes ? `: ${booking.notes}` : ""), booking.id
        ])).rows[0];
        break;
      } catch (error) {
        if (error.code !== "23505") throw error;
      }
    }
    if (!created) throw new Error("Could not allocate order number for recurring booking");

    await dbClient.query("UPDATE drivers SET status='BUSY', last_seen_at=NOW() WHERE id=$1", [driver.id]);
    await dbClient.query(
      "INSERT INTO order_status_history(order_id,status,message) VALUES($1,'DRIVER_FOUND','Auto-created from recurring booking')",
      [created.id]
    );
    await dbClient.query(
      "UPDATE recurring_bookings SET last_triggered_date=CURRENT_DATE, updated_at=NOW() WHERE id=$1",
      [booking.id]
    );
    await writeAudit(dbClient, {
      action: "recurring_booking_order_created",
      entityType: "order",
      entityId: created.id,
      metadata: { recurringBookingId: booking.id, driverId: driver.id, priceKzt: booking.price_kzt }
    });
    return created;
  });

  if (!order) return;

  const fullOrder = (await query(`
    SELECT o.*, d.name AS driver_name, d.phone AS driver_phone, d.car_model AS driver_car_model,
           d.car_color AS driver_car_color, d.plate AS driver_plate, d.rating AS driver_rating
    FROM orders o
    LEFT JOIN drivers d ON d.id=o.driver_id
    WHERE o.id=$1
  `, [order.id])).rows[0];

  emitOrderCreated(global.io, fullOrder);
  notifyOrderClient(fullOrder, {
    title: "Регулярная поездка началась",
    body: `Водитель ${fullOrder.driver_name || ""} едет по вашему регулярному маршруту`.trim(),
    type: "RECURRING_BOOKING_ORDER_CREATED"
  }).catch((error) => console.error("[push] notifyOrderClient failed", error));
  notifyOrderDriver(fullOrder, {
    title: "Регулярная поездка",
    body: `${fullOrder.pickup_text} → ${fullOrder.dropoff_text}`,
    type: "RECURRING_BOOKING_ORDER_CREATED"
  }).catch((error) => console.error("[push] notifyOrderDriver failed", error));
}

async function tick() {
  const due = await findDueBookings();
  for (const booking of due) {
    try {
      await createOrderForBooking(booking);
    } catch (error) {
      console.error(`[recurring-bookings] failed to process booking ${booking.id}`, error);
    }
  }
}

let intervalHandle = null;

// io is stashed on globalThis instead of threaded through the module graph
// — this scheduler runs standalone off a setInterval, not inside a request,
// so there's no req.io to read at call time.
export function startRecurringBookingsScheduler(io) {
  global.io = io;
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    tick().catch((error) => console.error("[recurring-bookings] scheduler tick failed", error));
  }, 60_000);
  return intervalHandle;
}

export function stopRecurringBookingsScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

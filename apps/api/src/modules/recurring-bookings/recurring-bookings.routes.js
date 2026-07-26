import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { notifyUser } from "../notifications/notification.service.js";

const router = Router();

function publicBooking(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    driverId: row.driver_id,
    driverName: row.driver_name || undefined,
    clientName: row.client_name || undefined,
    pickupText: row.pickup_text,
    pickupLat: Number(row.pickup_lat),
    pickupLng: Number(row.pickup_lng),
    dropoffText: row.dropoff_text,
    dropoffLat: Number(row.dropoff_lat),
    dropoffLng: Number(row.dropoff_lng),
    daysOfWeek: row.days_of_week,
    // pg returns a TIME column as "HH:MM:SS" (no custom type parser is
    // registered in db/pool.js) -- but every client always sends and
    // expects "HH:MM" (see the TimeOfDay zod schema above), so trim the
    // seconds back off rather than round-tripping a format nothing asked for.
    timeOfDay: String(row.time_of_day).slice(0, 5),
    priceKzt: row.price_kzt,
    status: row.status,
    notes: row.notes || "",
    lastTriggeredDate: row.last_triggered_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadClient(userId) {
  const client = (await query("SELECT * FROM clients WHERE user_id=$1", [userId])).rows[0];
  if (!client) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
  return client;
}

async function loadDriver(userId) {
  const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  return driver;
}

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

const CreateBooking = z.object({
  driverId: z.string().uuid(),
  pickupText: z.string().trim().min(2).max(180),
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropoffText: z.string().trim().min(2).max(180),
  dropoffLat: z.coerce.number().min(-90).max(90),
  dropoffLng: z.coerce.number().min(-180).max(180),
  // 1=Monday..5=Friday (ISO day-of-week), matching the "school route"
  // (weekday-only) use case this feature is named after.
  daysOfWeek: z.array(z.coerce.number().int().min(1).max(5)).min(1).max(5),
  timeOfDay: TimeOfDay,
  priceKzt: z.coerce.number().int().positive().max(1_000_000),
  notes: z.string().trim().max(500).optional().default("")
});

router.post("/", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const body = CreateBooking.parse(req.body);
    const client = await loadClient(req.user.id);
    const driver = (await query("SELECT * FROM drivers WHERE id=$1", [body.driverId])).rows[0];
    if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
    if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
    const blocked = (await query(
      "SELECT 1 FROM client_driver_preferences WHERE client_id=$1 AND driver_id=$2 AND type='BLOCKED'",
      [client.id, driver.id]
    )).rows[0];
    if (blocked) throw new AppError("You have blocked this driver", 403, "DRIVER_BLOCKED_BY_CLIENT");

    const row = (await query(`
      INSERT INTO recurring_bookings(client_id, driver_id, pickup_text, pickup_lat, pickup_lng, dropoff_text, dropoff_lat, dropoff_lng, days_of_week, time_of_day, price_kzt, notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      client.id,
      body.driverId,
      body.pickupText,
      body.pickupLat,
      body.pickupLng,
      body.dropoffText,
      body.dropoffLat,
      body.dropoffLng,
      body.daysOfWeek,
      body.timeOfDay,
      body.priceKzt,
      body.notes
    ])).rows[0];

    await writeAudit(query, {
      action: "recurring_booking_created",
      actorUserId: req.user.id,
      entityType: "recurring_booking",
      entityId: row.id,
      metadata: { driverId: body.driverId, daysOfWeek: body.daysOfWeek, timeOfDay: body.timeOfDay, priceKzt: body.priceKzt },
      req
    });

    if (driver.user_id) {
      notifyUser(driver.user_id, {
        title: "Новый регулярный маршрут",
        body: `Клиент предлагает регулярную поездку: ${body.pickupText} → ${body.dropoffText}`,
        type: "RECURRING_BOOKING_REQUEST",
        data: { recurringBookingId: row.id }
      }).catch((error) => console.error("[push] notifyUser failed", error));
    }

    res.status(201).json({ booking: publicBooking(row) });
  } catch (e) { next(e); }
});

const IdParam = z.object({ id: z.string().uuid() });

router.post("/:id/respond", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = z.object({ accept: z.boolean() }).parse(req.body);
    const driver = await loadDriver(req.user.id);
    const booking = await tx(async (client) => {
      const existing = (await client.query("SELECT * FROM recurring_bookings WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!existing) throw new AppError("Recurring booking not found", 404, "RECURRING_BOOKING_NOT_FOUND");
      if (existing.driver_id !== driver.id) throw new AppError("Forbidden recurring booking", 403, "FORBIDDEN_RECURRING_BOOKING");
      if (existing.status !== "PENDING_DRIVER") {
        throw new AppError("Recurring booking already responded to", 409, "RECURRING_BOOKING_ALREADY_RESPONDED");
      }
      const nextStatus = body.accept ? "ACTIVE" : "CANCELLED";
      const updated = (await client.query(
        "UPDATE recurring_bookings SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
        [nextStatus, existing.id]
      )).rows[0];
      await writeAudit(client, {
        action: body.accept ? "recurring_booking_accepted" : "recurring_booking_declined",
        actorUserId: req.user.id,
        entityType: "recurring_booking",
        entityId: existing.id,
        req
      });
      return updated;
    });

    const clientRow = (await query("SELECT user_id FROM clients WHERE id=$1", [booking.client_id])).rows[0];
    if (clientRow?.user_id) {
      notifyUser(clientRow.user_id, body.accept
        ? { title: "Водитель принял маршрут", body: "Регулярная поездка активирована", type: "RECURRING_BOOKING_ACCEPTED", data: { recurringBookingId: booking.id } }
        : { title: "Водитель отклонил маршрут", body: "Попробуйте предложить маршрут другому водителю", type: "RECURRING_BOOKING_DECLINED", data: { recurringBookingId: booking.id } }
      ).catch((error) => console.error("[push] notifyUser failed", error));
    }

    res.json({ booking: publicBooking(booking) });
  } catch (e) { next(e); }
});

router.get("/mine", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = await loadClient(req.user.id);
    const rows = (await query(`
      SELECT rb.*, d.name AS driver_name
      FROM recurring_bookings rb
      JOIN drivers d ON d.id=rb.driver_id
      WHERE rb.client_id=$1
      ORDER BY rb.created_at DESC
    `, [client.id])).rows;
    res.json({ bookings: rows.map(publicBooking) });
  } catch (e) { next(e); }
});

router.get("/driver", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const driver = await loadDriver(req.user.id);
    const rows = (await query(`
      SELECT rb.*, c.name AS client_name
      FROM recurring_bookings rb
      JOIN clients c ON c.id=rb.client_id
      WHERE rb.driver_id=$1
      ORDER BY rb.created_at DESC
    `, [driver.id])).rows;
    res.json({ bookings: rows.map(publicBooking) });
  } catch (e) { next(e); }
});

const StatusUpdate = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"])
});

router.patch("/:id/status", requireAuth, requireRole("CLIENT", "DRIVER"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const body = StatusUpdate.parse(req.body);
    const booking = await tx(async (client) => {
      const existing = (await client.query("SELECT * FROM recurring_bookings WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!existing) throw new AppError("Recurring booking not found", 404, "RECURRING_BOOKING_NOT_FOUND");

      if (req.user.role === "CLIENT") {
        const owner = (await client.query("SELECT id FROM clients WHERE user_id=$1", [req.user.id])).rows[0];
        if (!owner || owner.id !== existing.client_id) throw new AppError("Forbidden recurring booking", 403, "FORBIDDEN_RECURRING_BOOKING");
      } else {
        const owner = (await client.query("SELECT id FROM drivers WHERE user_id=$1", [req.user.id])).rows[0];
        if (!owner || owner.id !== existing.driver_id) throw new AppError("Forbidden recurring booking", 403, "FORBIDDEN_RECURRING_BOOKING");
      }
      if (existing.status === "PENDING_DRIVER" && body.status !== "CANCELLED") {
        throw new AppError("Booking is still awaiting the driver's response", 409, "RECURRING_BOOKING_PENDING");
      }
      if (existing.status === "CANCELLED") {
        throw new AppError("Booking is already cancelled", 409, "RECURRING_BOOKING_CANCELLED");
      }
      const updated = (await client.query(
        "UPDATE recurring_bookings SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
        [body.status, existing.id]
      )).rows[0];
      await writeAudit(client, {
        action: "recurring_booking_status_changed",
        actorUserId: req.user.id,
        entityType: "recurring_booking",
        entityId: existing.id,
        metadata: { from: existing.status, to: body.status },
        req
      });
      return updated;
    });
    res.json({ booking: publicBooking(booking) });
  } catch (e) { next(e); }
});

export default router;

import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { rateLimit } from "../../common/rateLimit.js";
import { notifyUser } from "../notifications/notification.service.js";
import {
  broadcastStand,
  notifyPromotedDrivers,
  notifyReservationOutcome,
  notifyStrandedRiders
} from "./stands.notify.js";
import {
  activeReservationForClient,
  addSeatsManually,
  cancelReservation,
  departQueue,
  handOverTurn,
  haversineMeters,
  joinQueue,
  leaveQueue,
  listStands,
  loadLiveEntryForDriver,
  loadStand,
  publicReservation,
  publicStand,
  releaseSeats,
  reserveSeat,
  respondToReservation,
  standQueueView,
  standEntryOutcome,
  standReservationOutcome,
  touchPresence,
  updateOffer
} from "./stands.service.js";

const router = Router();

const IdParam = z.object({ id: z.string().uuid() });
const EntryParam = z.object({ entryId: z.string().uuid() });
const ReservationParam = z.object({ reservationId: z.string().uuid() });

const Coordinate = {
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
};

const StandListQuery = z.object({
  regionId: z.string().uuid().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional()
});

const JoinBody = z.object({
  ...Coordinate,
  destinationLabel: z.string().trim().max(120).optional(),
  destinationRegionId: z.string().uuid().optional(),
  pricePerSeat: z.coerce.number().int().min(0).max(1_000_000).optional(),
  totalSeats: z.coerce.number().int().min(1).max(20).optional(),
  comment: z.string().trim().max(200).optional()
});

const OfferBody = z.object({
  destinationLabel: z.string().trim().max(120).optional(),
  destinationRegionId: z.string().uuid().optional(),
  pricePerSeat: z.coerce.number().int().min(0).max(1_000_000).optional(),
  totalSeats: z.coerce.number().int().min(1).max(20).optional(),
  comment: z.string().trim().max(200).optional()
});

const SeatsBody = z.object({
  seats: z.coerce.number().int().min(1).max(8).default(1),
  source: z.enum(["PHONE", "WALK_IN"]).default("WALK_IN"),
  comment: z.string().trim().max(200).optional()
});

const ReleaseSeatsBody = z.object({
  seats: z.coerce.number().int().min(1).max(8).default(1)
});

const HandoverBody = z.object({
  toDriverId: z.string().uuid()
});

const PresenceBody = z.object({
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional()
});

const ReserveBody = z.object({
  seats: z.coerce.number().int().min(1).max(8).default(1),
  pickupLabel: z.string().trim().max(200).optional(),
  pickupLat: z.coerce.number().min(-90).max(90).optional(),
  pickupLng: z.coerce.number().min(-180).max(180).optional(),
  comment: z.string().trim().max(200).optional()
});

async function loadDriver(userId) {
  const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
  return driver;
}

async function loadClient(userId) {
  const rider = (await query("SELECT * FROM clients WHERE user_id=$1", [userId])).rows[0];
  if (!rider) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
  if (rider.is_blocked) throw new AppError("Client is blocked", 403, "CLIENT_BLOCKED");
  return rider;
}

async function driverUserId(driverId) {
  const row = (await query("SELECT user_id FROM drivers WHERE id=$1", [driverId])).rows[0];
  return row?.user_id || null;
}

function withDistance(stands, point) {
  if (point.lat == null || point.lng == null) return stands;
  return stands
    .map((stand) => ({
      ...stand,
      distanceM: Math.round(haversineMeters(point.lat, point.lng, stand.lat, stand.lng))
    }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

/* ---------------------------------------------------------------- riders */

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const params = StandListQuery.parse(req.query);
    const stands = await listStands({ regionId: params.regionId });
    res.json({ stands: withDistance(stands, { lat: params.lat ?? null, lng: params.lng ?? null }) });
  } catch (error) {
    next(error);
  }
});

router.get("/reservations/me", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const rider = await loadClient(req.user.id);
    const reservation = await activeReservationForClient(rider.id);
    res.json({ reservation: reservation ? publicReservation(reservation, { audience: "CLIENT" }) : null });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const params = IdParam.parse(req.params);
    const view = await standQueueView(params.id, { audience: "CLIENT" });
    res.json(view);
  } catch (error) {
    next(error);
  }
});

router.get('/reservations/:reservationId/status', requireAuth, requireRole('CLIENT'), async (req, res, next) => {
  try {
    const { reservationId } = ReservationParam.parse(req.params);
    const rider = await loadClient(req.user.id);
    res.json({ outcome: await standReservationOutcome(rider.id, reservationId) });
  } catch (error) { next(error); }
});

router.post(
  "/entries/:entryId/reserve",
  requireAuth,
  requireRole("CLIENT"),
  rateLimit({ prefix: "stand-reserve", windowMs: 60_000, max: 10 }),
  async (req, res, next) => {
    try {
      const { entryId } = EntryParam.parse(req.params);
      const body = ReserveBody.parse(req.body || {});
      const rider = await loadClient(req.user.id);
      const { reservation, entry, standId } = await reserveSeat({ client: rider, entryId, ...body });
      await writeAudit(query, {
        action: "stand_seat_reserved",
        actorUserId: req.user.id,
        entityType: "stand_reservation",
        entityId: reservation.id,
        metadata: { standId, entryId, seats: body.seats },
        req
      });
      const targetUserId = await driverUserId(entry.driver_id);
      if (targetUserId) {
        req.io?.to(`user:${targetUserId}`).emit("stand_reservation_created", {
          standId,
          reservation: publicReservation({ ...reservation, client_name: rider.name, client_phone: rider.phone })
        });
        notifyUser(targetUserId, {
          key: "standSeatRequest",
          params: { name: rider.name, seats: body.seats },
          type: "STAND_SEAT_RESERVED",
          data: { standId, entryId, reservationId: reservation.id }
        }).catch((error) => console.error("[push] stand reservation failed", error));
      }
      await broadcastStand(req.io, standId);
      res.status(201).json({ reservation: publicReservation(reservation, { audience: "CLIENT" }) });
    } catch (error) {
      next(error);
    }
  }
);

router.delete("/reservations/:reservationId", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const { reservationId } = ReservationParam.parse(req.params);
    const rider = await loadClient(req.user.id);
    const { reservation, standId } = await cancelReservation({ rider, reservationId });
    const targetUserId = await driverUserId(reservation.driver_id);
    if (targetUserId) {
      req.io?.to(`user:${targetUserId}`).emit("stand_reservation_cancelled", { standId, reservationId });
    }
    await broadcastStand(req.io, standId);
    res.json({ reservation: publicReservation(reservation, { audience: "CLIENT" }) });
  } catch (error) {
    next(error);
  }
});

export default router;

/* --------------------------------------------------------------- drivers */

export const driverStandsRouter = Router();

driverStandsRouter.use(requireAuth, requireRole("DRIVER"));

driverStandsRouter.get("/", async (req, res, next) => {
  try {
    const params = StandListQuery.parse(req.query);
    const driver = await loadDriver(req.user.id);
    const regionId = params.regionId || driver.current_region_id;
    if (!regionId) throw new AppError("Driver region is not selected", 409, "DRIVER_REGION_NOT_SELECTED");
    const stands = await listStands({ regionId });
    const point = {
      lat: params.lat ?? (driver.lat == null ? null : Number(driver.lat)),
      lng: params.lng ?? (driver.lng == null ? null : Number(driver.lng))
    };
    res.json({ stands: withDistance(stands, point) });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.get("/me", async (req, res, next) => {
  try {
    const driver = await loadDriver(req.user.id);
    const entry = await loadLiveEntryForDriver(driver.id);
    if (!entry) return res.json({ entry: null, stand: null, queue: [] });
    const view = await standQueueView(entry.stand_id, { audience: "DRIVER", forDriverId: driver.id });
    const current = view.entries.find((row) => row.id === entry.id);
    // Closure can commit between the first lookup and the queue snapshot.
    // Never revive the stale row from that earlier read in the response.
    if (!current) return res.json({ entry: null, stand: null, queue: [] });
    res.json({
      entry: current,
      stand: view.stand,
      queue: view.entries
    });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.get('/entries/:entryId/status', async (req, res, next) => {
  try {
    const { entryId } = EntryParam.parse(req.params);
    const driver = await loadDriver(req.user.id);
    res.json({ outcome: await standEntryOutcome(driver.id, entryId) });
  } catch (error) { next(error); }
});

driverStandsRouter.get("/:id/queue", async (req, res, next) => {
  try {
    const params = IdParam.parse(req.params);
    const driver = await loadDriver(req.user.id);
    const view = await standQueueView(params.id, { audience: "DRIVER", forDriverId: driver.id });
    res.json(view);
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post(
  "/:id/join",
  rateLimit({ prefix: "stand-join", windowMs: 60_000, max: 12 }),
  async (req, res, next) => {
    try {
      const params = IdParam.parse(req.params);
      const body = JoinBody.parse(req.body || {});
      const driver = await loadDriver(req.user.id);
      // A place in a line is a working driver's place: taking one while
      // offline advertises a car that dispatch cannot reach. This used to be
      // conditional on having a region selected, so a driver with none — which
      // is the state a blocked driver is left in — walked straight past it.
      if (driver.status === "OFFLINE") {
        throw new AppError("Go online before taking a place in the line", 409, "DRIVER_OFFLINE");
      }
      const { entryId } = await joinQueue({ driver, standId: params.id, ...body });
      await writeAudit(query, {
        action: "stand_queue_joined",
        actorUserId: req.user.id,
        entityType: "stand_queue_entry",
        entityId: entryId,
        metadata: { standId: params.id },
        req
      });
      await broadcastStand(req.io, params.id);
      const view = await standQueueView(params.id, { audience: "DRIVER", forDriverId: driver.id });
      res.status(201).json({
        entry: view.entries.find((row) => row.id === entryId) || null,
        stand: view.stand,
        queue: view.entries
      });
    } catch (error) {
      next(error);
    }
  }
);

driverStandsRouter.patch("/entries/:entryId", async (req, res, next) => {
  try {
    const { entryId } = EntryParam.parse(req.params);
    const patch = OfferBody.parse(req.body || {});
    const driver = await loadDriver(req.user.id);
    const { standId } = await updateOffer({ driver, entryId, patch });
    await broadcastStand(req.io, standId);
    const view = await standQueueView(standId, { audience: "DRIVER", forDriverId: driver.id });
    res.json({ entry: view.entries.find((row) => row.id === entryId) || null, stand: view.stand, queue: view.entries });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post("/entries/:entryId/seats", async (req, res, next) => {
  try {
    const { entryId } = EntryParam.parse(req.params);
    const body = SeatsBody.parse(req.body || {});
    const driver = await loadDriver(req.user.id);
    const { standId } = await addSeatsManually({ driver, entryId, ...body });
    await broadcastStand(req.io, standId);
    const view = await standQueueView(standId, { audience: "DRIVER", forDriverId: driver.id });
    res.json({ entry: view.entries.find((row) => row.id === entryId) || null, stand: view.stand, queue: view.entries });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.delete("/entries/:entryId/seats", async (req, res, next) => {
  try {
    const { entryId } = EntryParam.parse(req.params);
    const body = ReleaseSeatsBody.parse(req.body || {});
    const driver = await loadDriver(req.user.id);
    const { standId } = await releaseSeats({ driver, entryId, seats: body.seats });
    await broadcastStand(req.io, standId);
    const view = await standQueueView(standId, { audience: "DRIVER", forDriverId: driver.id });
    res.json({ entry: view.entries.find((row) => row.id === entryId) || null, stand: view.stand, queue: view.entries });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post("/entries/:entryId/depart", async (req, res, next) => {
  try {
    const { entryId } = EntryParam.parse(req.params);
    const driver = await loadDriver(req.user.id);
    const { standId, promoted, strandedRows } = await departQueue({ driver, entryId });
    await writeAudit(query, {
      action: "stand_queue_departed",
      actorUserId: req.user.id,
      entityType: "stand_queue_entry",
      entityId: entryId,
      metadata: { standId },
      req
    });
    await notifyPromotedDrivers(req.io, promoted, standId);
    await notifyStrandedRiders(req.io, strandedRows);
    await broadcastStand(req.io, standId);
    res.json({ entry: null, stand: (await standQueueView(standId, { audience: "DRIVER" })).stand });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post("/entries/:entryId/leave", async (req, res, next) => {
  try {
    const { entryId } = EntryParam.parse(req.params);
    const driver = await loadDriver(req.user.id);
    const { standId, promoted, strandedRows } = await leaveQueue({ driver, entryId });
    await notifyPromotedDrivers(req.io, promoted, standId);
    await notifyStrandedRiders(req.io, strandedRows);
    await broadcastStand(req.io, standId);
    res.json({ entry: null });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post("/entries/:entryId/handover", async (req, res, next) => {
  try {
    const { entryId } = EntryParam.parse(req.params);
    const body = HandoverBody.parse(req.body || {});
    const driver = await loadDriver(req.user.id);
    const result = await handOverTurn({ driver, entryId, toDriverId: body.toDriverId });
    await writeAudit(query, {
      action: "stand_turn_handed_over",
      actorUserId: req.user.id,
      entityType: "stand_queue_entry",
      entityId: entryId,
      metadata: { standId: result.standId, toDriverId: body.toDriverId, mode: result.mode },
      req
    });
    const targetUserId = await driverUserId(body.toDriverId);
    if (targetUserId) {
      notifyUser(targetUserId, {
        key: "standTurnHandedOver",
        params: { name: driver.name, stand: result.stand.name },
        type: "STAND_TURN_RECEIVED",
        data: { standId: result.standId }
      }).catch((error) => console.error("[push] stand handover failed", error));
    }
    await broadcastStand(req.io, result.standId);
    const view = await standQueueView(result.standId, { audience: "DRIVER", forDriverId: driver.id });
    res.json({ mode: result.mode, stand: view.stand, queue: view.entries });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post("/presence", async (req, res, next) => {
  try {
    const body = PresenceBody.parse(req.body || {});
    const driver = await loadDriver(req.user.id);
    const presence = await touchPresence({ driverId: driver.id, lat: body.lat ?? null, lng: body.lng ?? null });
    res.json({ presence });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post("/reservations/:reservationId/accept", async (req, res, next) => {
  try {
    const { reservationId } = ReservationParam.parse(req.params);
    const driver = await loadDriver(req.user.id);
    const { reservation, standId } = await respondToReservation({ driver, reservationId, accept: true });
    await notifyReservationOutcome(req.io, reservation, true);
    await broadcastStand(req.io, standId);
    res.json({ reservation: publicReservation(reservation) });
  } catch (error) {
    next(error);
  }
});

driverStandsRouter.post("/reservations/:reservationId/decline", async (req, res, next) => {
  try {
    const { reservationId } = ReservationParam.parse(req.params);
    const driver = await loadDriver(req.user.id);
    const { reservation, standId } = await respondToReservation({ driver, reservationId, accept: false });
    await notifyReservationOutcome(req.io, reservation, false);
    await broadcastStand(req.io, standId);
    res.json({ reservation: publicReservation(reservation) });
  } catch (error) {
    next(error);
  }
});

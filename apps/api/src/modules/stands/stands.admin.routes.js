import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { normalizePoint, pointInPolygon } from "../regions/regions.service.js";
import { listStands, publicStand, standQueueView, standRegionRoom, standRoom } from "./stands.service.js";
import { notifyDroppedDrivers, notifyStrandedRiders } from "./stands.notify.js";

// Stands are drawn on the map, not typed in: the owner drops a pin and drags
// a radius. The API therefore takes a point and a radius in metres and
// nothing else about geometry — everything the admin screen shows (the circle,
// the drag handle) resolves back to these two values.
const router = Router();
router.use(requireAuth, requireRole("OWNER"));

const IdParam = z.object({ id: z.string().uuid() });

const StandBody = z.object({
  regionId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["CITY", "INTERCITY"]).default("CITY"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().int().min(20).max(2000).default(120),
  boardingSlots: z.coerce.number().int().min(1).max(10).default(1),
  defaultSeats: z.coerce.number().int().min(1).max(20).default(4),
  note: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional()
});

const StandPatch = StandBody.partial().omit({ regionId: true });

const ListQuery = z.object({
  regionId: z.string().uuid().optional(),
  includeInactive: z.coerce.boolean().default(true)
});

async function assertPointInsideRegion(regionId, { lat, lng }) {
  const region = (await query("SELECT id, name, boundary, is_active FROM regions WHERE id=$1", [regionId])).rows[0];
  if (!region) throw new AppError("Region not found", 404, "REGION_NOT_FOUND");
  const point = normalizePoint({ lat, lng });
  // A stand outside its own region would never be reachable: drivers only
  // ever load the stands of the region they are approved in.
  if (!pointInPolygon(point, region.boundary)) {
    throw new AppError("Stand point is outside the selected region", 400, "STAND_OUTSIDE_REGION", {
      regionName: region.name
    });
  }
  return { region, point };
}

router.get("/", async (req, res, next) => {
  try {
    const params = ListQuery.parse(req.query);
    const stands = await listStands({ regionId: params.regionId, includeInactive: params.includeInactive });
    res.json({ stands });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const view = await standQueueView(id, { audience: "DRIVER" });
    res.json(view);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = StandBody.parse(req.body);
    const { point } = await assertPointInsideRegion(body.regionId, body);
    const existing = (await query(
      "SELECT id FROM taxi_stands WHERE region_id=$1 AND lower(name)=lower($2)",
      [body.regionId, body.name]
    )).rows[0];
    if (existing) throw new AppError("A stand with this name already exists here", 409, "STAND_NAME_TAKEN");
    const created = (await query(`
      INSERT INTO taxi_stands(
        region_id, name, kind, lat, lng, radius_m, boarding_slots, default_seats,
        note, is_active, created_by_user_id
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      body.regionId,
      body.name,
      body.kind,
      point.lat,
      point.lng,
      body.radiusM,
      body.boardingSlots,
      body.defaultSeats,
      body.note || null,
      body.isActive ?? true,
      req.user.id
    ])).rows[0];
    await writeAudit(query, {
      action: "stand_created",
      actorUserId: req.user.id,
      entityType: "taxi_stand",
      entityId: created.id,
      metadata: { regionId: body.regionId, name: body.name, radiusM: body.radiusM },
      req
    });
    req.io?.to(standRegionRoom(body.regionId)).emit("stand_created", { stand: publicStand(created) });
    res.status(201).json({ stand: publicStand(created) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const patch = StandPatch.parse(req.body || {});
    const existing = (await query("SELECT * FROM taxi_stands WHERE id=$1", [id])).rows[0];
    if (!existing) throw new AppError("Stand not found", 404, "STAND_NOT_FOUND");

    const lat = patch.lat ?? Number(existing.lat);
    const lng = patch.lng ?? Number(existing.lng);
    if (patch.lat != null || patch.lng != null) {
      await assertPointInsideRegion(existing.region_id, { lat, lng });
    }
    if (patch.name) {
      const clash = (await query(
        "SELECT id FROM taxi_stands WHERE region_id=$1 AND lower(name)=lower($2) AND id<>$3",
        [existing.region_id, patch.name, id]
      )).rows[0];
      if (clash) throw new AppError("A stand with this name already exists here", 409, "STAND_NAME_TAKEN");
    }
    const updated = (await query(`
      UPDATE taxi_stands
      SET name=COALESCE($2, name),
          kind=COALESCE($3, kind),
          lat=$4,
          lng=$5,
          radius_m=COALESCE($6, radius_m),
          boarding_slots=COALESCE($7, boarding_slots),
          default_seats=COALESCE($8, default_seats),
          note=COALESCE($9, note),
          is_active=COALESCE($10, is_active),
          updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [
      id,
      patch.name ?? null,
      patch.kind ?? null,
      lat,
      lng,
      patch.radiusM ?? null,
      patch.boardingSlots ?? null,
      patch.defaultSeats ?? null,
      patch.note ?? null,
      patch.isActive ?? null
    ])).rows[0];

    // Closing a stand has to clear the line with it, or riders keep seeing
    // cars that are no longer offered anywhere in the app.
    let closedEntries = [];
    let closedReservations = [];
    if (updated.is_active === false && existing.is_active === true) {
      closedEntries = (await query(`
        UPDATE taxi_stand_queue_entries
        SET status='EXPIRED', left_at=NOW(), left_reason='STAND_CLOSED', updated_at=NOW()
        WHERE stand_id=$1 AND status IN ('WAITING','BOARDING')
        RETURNING *
      `, [id])).rows;
      closedReservations = (await query(`
        UPDATE taxi_stand_seat_reservations
        SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW()
        WHERE stand_id=$1 AND status IN ('PENDING','CONFIRMED')
        RETURNING *
      `, [id])).rows;
    }

    await writeAudit(query, {
      action: "stand_updated",
      actorUserId: req.user.id,
      entityType: "taxi_stand",
      entityId: id,
      metadata: { patch },
      req
    });
    const payload = { stand: publicStand(updated) };
    req.io?.to(standRegionRoom(updated.region_id)).emit("stand_updated", payload);
    req.io?.to(standRoom(id)).emit("stand_updated", payload);
    // A driver standing in that line and a rider holding a seat in one of its
    // cars both just lost something through no action of their own. Without
    // this they found out by watching the screen empty: stand_updated above
    // says the stand changed, not that your place or your seat is gone.
    await notifyDroppedDrivers(req.io, closedEntries);
    await notifyStrandedRiders(req.io, closedReservations, { reason: "STAND_CLOSED" });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const existing = (await query("SELECT * FROM taxi_stands WHERE id=$1", [id])).rows[0];
    if (!existing) throw new AppError("Stand not found", 404, "STAND_NOT_FOUND");
    const live = (await query(
      "SELECT COUNT(*) c FROM taxi_stand_queue_entries WHERE stand_id=$1 AND status IN ('WAITING','BOARDING')",
      [id]
    )).rows[0];
    // Deleting a stand with drivers standing in it would take their place in
    // the line away with no trace; closing it is the reversible action and is
    // what the screen offers instead.
    if (Number(live.c) > 0) {
      throw new AppError("Drivers are still in this line — close the stand instead", 409, "STAND_HAS_LIVE_QUEUE", {
        driversCount: Number(live.c)
      });
    }
    await query("DELETE FROM taxi_stands WHERE id=$1", [id]);
    await writeAudit(query, {
      action: "stand_deleted",
      actorUserId: req.user.id,
      entityType: "taxi_stand",
      entityId: id,
      metadata: { name: existing.name, regionId: existing.region_id },
      req
    });
    req.io?.to(standRegionRoom(existing.region_id)).emit("stand_deleted", { standId: id });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;

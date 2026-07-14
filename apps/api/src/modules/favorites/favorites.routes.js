import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";

const router = Router();

async function loadClient(userId) {
  const client = (await query("SELECT * FROM clients WHERE user_id=$1", [userId])).rows[0];
  if (!client) throw new AppError("Client profile not found", 404, "CLIENT_NOT_FOUND");
  return client;
}

function publicAddress(row) {
  return {
    id: row.id,
    label: row.label,
    title: row.title,
    addressText: row.address_text,
    lat: Number(row.lat),
    lng: Number(row.lng),
    createdAt: row.created_at
  };
}

function publicDriverPreference(row) {
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name || null,
    driverCarModel: row.driver_car_model || null,
    driverPlate: row.driver_plate || null,
    type: row.type,
    createdAt: row.created_at
  };
}

const CreateAddress = z.object({
  label: z.enum(["HOME", "WORK", "OTHER"]).default("OTHER"),
  title: z.string().trim().min(1).max(80),
  addressText: z.string().trim().min(2).max(180),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

const IdParam = z.object({ id: z.string().uuid() });

router.get("/addresses", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = await loadClient(req.user.id);
    const rows = (await query(
      "SELECT * FROM client_favorite_addresses WHERE client_id=$1 ORDER BY created_at DESC",
      [client.id]
    )).rows;
    res.json({ addresses: rows.map(publicAddress) });
  } catch (e) { next(e); }
});

router.post("/addresses", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const body = CreateAddress.parse(req.body);
    const client = await loadClient(req.user.id);
    const row = (await query(`
      INSERT INTO client_favorite_addresses(client_id, label, title, address_text, lat, lng)
      VALUES($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [client.id, body.label, body.title, body.addressText, body.lat, body.lng])).rows[0];
    await writeAudit(query, {
      action: "client_favorite_address_created",
      actorUserId: req.user.id,
      entityType: "client_favorite_address",
      entityId: row.id,
      metadata: { label: row.label, title: row.title },
      req
    });
    res.status(201).json({ address: publicAddress(row) });
  } catch (e) { next(e); }
});

router.delete("/addresses/:id", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const { id } = IdParam.parse(req.params);
    const client = await loadClient(req.user.id);
    const row = (await query(
      "DELETE FROM client_favorite_addresses WHERE id=$1 AND client_id=$2 RETURNING id",
      [id, client.id]
    )).rows[0];
    if (!row) throw new AppError("Favorite address not found", 404, "FAVORITE_ADDRESS_NOT_FOUND");
    await writeAudit(query, {
      action: "client_favorite_address_deleted",
      actorUserId: req.user.id,
      entityType: "client_favorite_address",
      entityId: id,
      req
    });
    res.status(204).end();
  } catch (e) { next(e); }
});

const CreateDriverPreference = z.object({
  driverId: z.string().uuid(),
  type: z.enum(["FAVORITE", "BLOCKED"])
});

router.get("/drivers", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const client = await loadClient(req.user.id);
    const rows = (await query(`
      SELECT cdp.*, d.name AS driver_name, d.car_model AS driver_car_model, d.plate AS driver_plate
      FROM client_driver_preferences cdp
      JOIN drivers d ON d.id=cdp.driver_id
      WHERE cdp.client_id=$1
      ORDER BY cdp.created_at DESC
    `, [client.id])).rows;
    res.json({ preferences: rows.map(publicDriverPreference) });
  } catch (e) { next(e); }
});

router.post("/drivers", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const body = CreateDriverPreference.parse(req.body);
    const client = await loadClient(req.user.id);
    const driver = (await query("SELECT id FROM drivers WHERE id=$1", [body.driverId])).rows[0];
    if (!driver) throw new AppError("Driver not found", 404, "DRIVER_NOT_FOUND");
    const row = (await query(`
      INSERT INTO client_driver_preferences(client_id, driver_id, type)
      VALUES($1,$2,$3)
      ON CONFLICT (client_id, driver_id) DO UPDATE SET type=EXCLUDED.type
      RETURNING *
    `, [client.id, body.driverId, body.type])).rows[0];
    await writeAudit(query, {
      action: "client_driver_preference_set",
      actorUserId: req.user.id,
      entityType: "client_driver_preference",
      entityId: row.id,
      metadata: { driverId: body.driverId, type: body.type },
      req
    });
    res.status(201).json({ preference: publicDriverPreference({ ...row, driver_name: null, driver_car_model: null, driver_plate: null }) });
  } catch (e) { next(e); }
});

router.delete("/drivers/:driverId", requireAuth, requireRole("CLIENT"), async (req, res, next) => {
  try {
    const { driverId } = z.object({ driverId: z.string().uuid() }).parse(req.params);
    const client = await loadClient(req.user.id);
    const row = (await query(
      "DELETE FROM client_driver_preferences WHERE client_id=$1 AND driver_id=$2 RETURNING id",
      [client.id, driverId]
    )).rows[0];
    if (!row) throw new AppError("Driver preference not found", 404, "DRIVER_PREFERENCE_NOT_FOUND");
    await writeAudit(query, {
      action: "client_driver_preference_removed",
      actorUserId: req.user.id,
      entityType: "client_driver_preference",
      entityId: row.id,
      metadata: { driverId },
      req
    });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;

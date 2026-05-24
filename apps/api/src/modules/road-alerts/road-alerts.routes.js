import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { normalizePoint, pointInPolygon } from "../regions/regions.service.js";

const router = Router();

const alertTypes = [
  "ROAD_HAZARD",
  "ACCIDENT",
  "ROAD_WORK",
  "SPEED_CAMERA",
  "TRAFFIC_JAM",
  "ROAD_CLOSED",
  "OTHER"
];

const unsafeCommentPattern = new RegExp(
  [
    "\\b(pol" + "ice evasion|avoid pol" + "ice)\\b",
    "\\u043c\\u0435\\u043d\\u0442",
    "\\u043c\\u0435\\u043d\\u0442\\u044b",
    "\\u043f\\u043e\\u043b\\u0438\\u0446\\u0438"
  ].join("|"),
  "i"
);

const AlertQuery = z.object({
  regionId: z.string().uuid().optional()
});

const CreateAlertBody = z.object({
  regionId: z.string().uuid().optional(),
  type: z.enum(alertTypes),
  comment: z.string().trim().max(300).optional().default(""),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

const AlertParams = z.object({
  id: z.string().uuid()
});

function publicAlert(row) {
  return {
    id: row.id,
    regionId: row.region_id,
    driverId: row.driver_id,
    type: row.type,
    comment: row.comment || "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    status: row.status,
    confirmationsCount: Number(row.confirmations_count || 0),
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

async function loadDriver(userId) {
  const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [userId])).rows[0];
  if (!driver) throw new AppError("Driver profile not found", 404, "DRIVER_NOT_FOUND");
  if (driver.is_blocked) throw new AppError("Driver is blocked", 403, "DRIVER_BLOCKED");
  return driver;
}

async function resolveDriverRegion(driver, regionId) {
  const selectedRegionId = regionId || driver.current_region_id;
  if (!selectedRegionId) throw new AppError("Driver region is not selected", 409, "DRIVER_REGION_NOT_SELECTED");
  const approval = (await query(`
    SELECT dra.*, r.boundary, r.is_active region_is_active
    FROM driver_region_approvals dra
    JOIN regions r ON r.id=dra.region_id
    WHERE dra.driver_id=$1 AND dra.region_id=$2
  `, [driver.id, selectedRegionId])).rows[0];
  if (!approval) throw new AppError("Driver is not approved for this region", 403, "DRIVER_REGION_NOT_APPROVED");
  if (!approval.region_is_active) throw new AppError("Region is inactive", 403, "DRIVER_REGION_INACTIVE");
  if (approval.status !== "APPROVED") throw new AppError("Driver region is blocked", 403, "DRIVER_REGION_BLOCKED");
  return {
    id: approval.region_id,
    boundary: approval.boundary
  };
}

function assertSafetyComment(comment) {
  if (unsafeCommentPattern.test(comment)) {
    throw new AppError("Road alerts are for traffic safety only", 400, "UNSAFE_ROAD_ALERT_COMMENT");
  }
}

router.get("/", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = AlertQuery.parse(req.query);
    const driver = await loadDriver(req.user.id);
    const region = await resolveDriverRegion(driver, params.regionId);
    const result = await query(`
      SELECT *
      FROM road_alerts
      WHERE region_id=$1
        AND status='ACTIVE'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 100
    `, [region.id]);
    res.json({ alerts: result.rows.map(publicAlert) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const body = CreateAlertBody.parse(req.body);
    assertSafetyComment(body.comment);
    const driver = await loadDriver(req.user.id);
    const region = await resolveDriverRegion(driver, body.regionId);
    const point = normalizePoint({ lat: body.lat, lng: body.lng });
    if (!pointInPolygon(point, region.boundary)) {
      throw new AppError("Road alert point is outside selected region", 403, "ROAD_ALERT_OUTSIDE_REGION");
    }
    const result = await query(`
      INSERT INTO road_alerts(region_id, driver_id, type, comment, lat, lng)
      VALUES($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [region.id, driver.id, body.type, body.comment, point.lat, point.lng]);
    await writeAudit(query, {
      action: "road_alert_created",
      actorUserId: req.user.id,
      entityType: "road_alert",
      entityId: result.rows[0].id,
      metadata: { regionId: region.id, type: body.type },
      req
    });
    req.io?.to(`dispatch:region:${region.id}`).emit("road_alert_created", publicAlert(result.rows[0]));
    res.status(201).json({ alert: publicAlert(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/confirm", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = AlertParams.parse(req.params);
    const driver = await loadDriver(req.user.id);
    const alert = (await query("SELECT * FROM road_alerts WHERE id=$1", [params.id])).rows[0];
    if (!alert) throw new AppError("Road alert not found", 404, "ROAD_ALERT_NOT_FOUND");
    await resolveDriverRegion(driver, alert.region_id);
    const result = await query(`
      UPDATE road_alerts
      SET confirmations_count=confirmations_count + 1
      WHERE id=$1 AND status='ACTIVE' AND expires_at > NOW()
      RETURNING *
    `, [params.id]);
    if (!result.rows[0]) throw new AppError("Road alert is expired", 409, "ROAD_ALERT_EXPIRED");
    res.json({ alert: publicAlert(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/expire", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = AlertParams.parse(req.params);
    const driver = await loadDriver(req.user.id);
    const alert = (await query("SELECT * FROM road_alerts WHERE id=$1", [params.id])).rows[0];
    if (!alert) throw new AppError("Road alert not found", 404, "ROAD_ALERT_NOT_FOUND");
    await resolveDriverRegion(driver, alert.region_id);
    const result = await query(`
      UPDATE road_alerts
      SET status='EXPIRED', expires_at=LEAST(expires_at, NOW())
      WHERE id=$1
      RETURNING *
    `, [params.id]);
    res.json({ alert: publicAlert(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

export default router;

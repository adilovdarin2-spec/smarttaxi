import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { normalizePoint, pointInPolygon } from "../regions/regions.service.js";
import { dispatchRegionRoom } from "../orders/order-dispatch.service.js";
import { nearbyOsmCameras, nearestSpeedLimit, nearbyOsmTrafficSigns } from "./osm-navigation.service.js";

const router = Router();

const OsmNavigationQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().int().min(200).max(8000).optional()
});

const alertTypes = [
  "ROAD_HAZARD",
  "ACCIDENT",
  "ROAD_WORK",
  "SPEED_CAMERA",
  "POLICE",
  "TRAFFIC_JAM",
  "ROAD_CLOSED",
  "BAD_ROAD",
  "POTHOLE",
  "SPEED_BUMP",
  "ICY_ROAD",
  "SCHOOL_ZONE",
  "TEMPORARY_SPEED_LIMIT",
  "DANGEROUS_TURN",
  "RAILROAD_CROSSING",
  "PEDESTRIAN_CROSSING",
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
  lng: z.coerce.number().min(-180).max(180),
  speedLimit: z.coerce.number().int().min(5).max(160).optional(),
  // Compass heading (0-360, clockwise from north) the reporting driver was
  // travelling at the moment of the report — used as an approximation of
  // which direction a SPEED_CAMERA faces, since that's rarely something a
  // driver can measure directly.
  heading: z.coerce.number().min(0).max(360).optional()
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
    dismissalsCount: Number(row.dismissals_count || 0),
    confidenceScore: Number(row.confidence_score || 50),
    speedLimit: row.speed_limit == null ? null : Number(row.speed_limit),
    heading: row.heading == null ? null : Number(row.heading),
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

// Live OSM-sourced navigation layer: speed cameras + posted speed limit
// around the driver's current position. Read-only, never persisted to
// road_alerts — see osm-navigation.service.js for why (no free Kazakhstan
// camera API exists; this is the real, legal, zero-cost alternative).
router.get("/osm-navigation", requireAuth, requireRole("DRIVER"), async (req, res, next) => {
  try {
    const params = OsmNavigationQuery.parse(req.query);
    // allSettled, not all: each lookup already catches its own network
    // errors internally and resolves to an empty result, but this is the
    // backstop against an unexpected processing exception in any one of
    // them taking the other two down with it — a driver should still get
    // cameras even if, say, the sign-parsing path throws on a malformed tag.
    const [camerasResult, speedLimitResult, signsResult] = await Promise.allSettled([
      nearbyOsmCameras(params.lat, params.lng, params.radiusM),
      nearestSpeedLimit(params.lat, params.lng),
      nearbyOsmTrafficSigns(params.lat, params.lng, Math.min(params.radiusM || 1500, 1500))
    ]);
    res.json({
      cameras: camerasResult.status === "fulfilled" ? camerasResult.value : [],
      speedLimit: speedLimitResult.status === "fulfilled" ? speedLimitResult.value : null,
      signs: signsResult.status === "fulfilled" ? signsResult.value : []
    });
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
      INSERT INTO road_alerts(region_id, driver_id, type, comment, lat, lng, speed_limit, heading)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [region.id, driver.id, body.type, body.comment, point.lat, point.lng, body.speedLimit || null, body.heading ?? null]);
    await writeAudit(query, {
      action: "road_alert_created",
      actorUserId: req.user.id,
      entityType: "road_alert",
      entityId: result.rows[0].id,
      metadata: { regionId: region.id, type: body.type },
      req
    });
    req.io?.to(dispatchRegionRoom(region.id)).emit("road_alert_created", publicAlert(result.rows[0]));
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
    if (alert.driver_id === driver.id) {
      throw new AppError("You cannot confirm your own report", 403, "CANNOT_CONFIRM_OWN_ALERT");
    }
    await resolveDriverRegion(driver, alert.region_id);
    const result = await query(`
      UPDATE road_alerts
      SET confirmations_count=confirmations_count + 1,
          confidence_score=LEAST(100, confidence_score + 12)
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
      SET status='EXPIRED',
          dismissals_count=dismissals_count + 1,
          confidence_score=GREATEST(0, confidence_score - 20),
          expires_at=LEAST(expires_at, NOW())
      WHERE id=$1
      RETURNING *
    `, [params.id]);
    res.json({ alert: publicAlert(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

export default router;

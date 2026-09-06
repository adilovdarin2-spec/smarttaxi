import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { publicTariff } from "./tariffs.service.js";
import { buildRoutePreview } from "../routing/routing.service.js";
const router = Router();

const TariffName = z.string().trim().min(2).max(40);
const UpdateTariff = z.object({
  basePrice: z.coerce.number().int().min(0).max(500000).optional(),
  pricePerKm: z.coerce.number().int().min(0).max(500000).optional(),
  pricePerMinute: z.coerce.number().int().min(0).max(500000).optional(),
  minPrice: z.coerce.number().int().min(0).max(500000).optional(),
  serviceCommissionPercent: z.coerce.number().min(0).max(100).optional(),
  cashbackPercent: z.coerce.number().min(0).max(100).optional(),
  surgeMultiplier: z.coerce.number().min(1).max(10).optional(),
  includedKm: z.coerce.number().min(0).max(500).optional(),
  includedMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  freeWaitingMinutes: z.coerce.number().int().min(0).max(300).optional(),
  waitingPricePerMinute: z.coerce.number().int().min(0).max(500000).optional(),
  cancellationFee: z.coerce.number().int().min(0).max(500000).optional(),
  noShowFee: z.coerce.number().int().min(0).max(500000).optional(),
  zoneSurcharge: z.coerce.number().int().min(0).max(500000).optional(),
  intercityOverride: z.coerce.number().int().min(0).max(500000).nullable().optional(),
  nightCoefficient: z.coerce.number().min(1).max(10).optional(),
  demandCoefficient: z.coerce.number().min(1).max(10).optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "at least one field is required");

const columns = {
  basePrice: "base_price",
  pricePerKm: "price_per_km",
  pricePerMinute: "price_per_minute",
  minPrice: "min_price",
  serviceCommissionPercent: "service_commission_percent",
  cashbackPercent: "cashback_percent",
  surgeMultiplier: "surge_multiplier",
  includedKm: "included_km",
  includedMinutes: "included_minutes",
  freeWaitingMinutes: "free_waiting_minutes",
  waitingPricePerMinute: "waiting_price_per_minute",
  cancellationFee: "cancellation_fee",
  noShowFee: "no_show_fee",
  zoneSurcharge: "zone_surcharge",
  intercityOverride: "intercity_override",
  nightCoefficient: "night_coefficient",
  demandCoefficient: "demand_coefficient",
  sortOrder: "sort_order",
  isActive: "is_active"
};

const EstimateTariff = z.object({
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropoffLat: z.coerce.number().min(-90).max(90),
  dropoffLng: z.coerce.number().min(-180).max(180),
  tariffId: z.string().uuid().optional(),
  tariff: z.string().trim().min(2).max(40).optional(),
  tariffName: z.string().trim().min(2).max(40).optional()
}).refine(value => value.tariffId || value.tariff || value.tariffName, "tariffId or tariff is required");

router.get("/", async (req, res, next) => {
  try {
    const params = z.object({
      regionId: z.string().uuid().optional()
    }).parse(req.query);
    const result = params.regionId
      ? await query("SELECT * FROM tariffs WHERE region_id=$1 AND is_active=true ORDER BY sort_order ASC, base_price ASC", [params.regionId])
      : await query("SELECT * FROM tariffs WHERE is_active=true ORDER BY sort_order ASC, base_price ASC");
    res.json({ tariffs: result.rows.map(publicTariff) });
  } catch (e) { next(e); }
});

router.post("/estimate", async (req, res, next) => {
  try {
    const body = EstimateTariff.parse(req.body);
    const preview = await buildRoutePreview(body, query);
    res.json({
      estimate: preview.estimate,
      tariff: preview.estimate?.tariff || null,
      distanceKm: Math.round((preview.distanceMeters / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.ceil(preview.durationSeconds / 60)),
      priceKzt: preview.estimate?.estimatedPrice || null,
      currency: preview.region?.currency || "KZT",
      source: "backend",
      route: {
        regionId: preview.regionId,
        region: preview.region,
        distanceMeters: preview.distanceMeters,
        durationSeconds: preview.durationSeconds,
        geometry: preview.geometry,
        providerStatus: preview.providerStatus
      }
    });
  } catch (e) { next(e); }
});

router.patch("/:name", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const name = TariffName.parse(req.params.name);
    const body = UpdateTariff.parse(req.body);
    const tariff = await tx(async (client) => {
      const matches = (await client.query("SELECT * FROM tariffs WHERE name=$1 FOR UPDATE", [name])).rows;
      if (matches.length > 1) throw new AppError("Tariff name exists in multiple regions", 409, "TARIFF_AMBIGUOUS");
      const before = matches[0];
      if (!before) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");

      const entries = Object.entries(body);
      const values = entries.map(([, value]) => value);
      const assignments = entries.map(([key], index) => `${columns[key]}=$${index + 1}`);
      values.push(before.id);

      const updated = (await client.query(`
        UPDATE tariffs SET ${assignments.join(", ")}
        WHERE id=$${values.length}
        RETURNING *
      `, values)).rows[0];

      await writeAudit(client, {
        action: "tariff_updated",
        actorUserId: req.user.id,
        entityType: "tariff",
        metadata: { name, before, after: updated },
        req
      });
      return updated;
    });
    res.json({ tariff });
  } catch (e) { next(e); }
});

export default router;

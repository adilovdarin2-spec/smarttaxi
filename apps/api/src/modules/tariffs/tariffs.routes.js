import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
const router = Router();

const TariffName = z.string().trim().min(2).max(40);
const UpdateTariff = z.object({
  basePrice: z.coerce.number().int().min(0).max(500000).optional(),
  pricePerKm: z.coerce.number().int().min(0).max(500000).optional(),
  pricePerMinute: z.coerce.number().int().min(0).max(500000).optional(),
  minPrice: z.coerce.number().int().min(0).max(500000).optional(),
  serviceCommissionPercent: z.coerce.number().min(0).max(100).optional(),
  cashbackPercent: z.coerce.number().min(0).max(100).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "at least one field is required");

const columns = {
  basePrice: "base_price",
  pricePerKm: "price_per_km",
  pricePerMinute: "price_per_minute",
  minPrice: "min_price",
  serviceCommissionPercent: "service_commission_percent",
  cashbackPercent: "cashback_percent",
  isActive: "is_active"
};

router.get("/", async (_req, res, next) => {
  try {
    const result = await query("SELECT * FROM tariffs WHERE is_active=true ORDER BY base_price ASC");
    res.json({ tariffs: result.rows });
  } catch (e) { next(e); }
});

router.patch("/:name", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const name = TariffName.parse(req.params.name);
    const body = UpdateTariff.parse(req.body);
    const tariff = await tx(async (client) => {
      const before = (await client.query("SELECT * FROM tariffs WHERE name=$1 FOR UPDATE", [name])).rows[0];
      if (!before) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");

      const entries = Object.entries(body);
      const values = entries.map(([, value]) => value);
      const assignments = entries.map(([key], index) => `${columns[key]}=$${index + 1}`);
      values.push(name);

      const updated = (await client.query(`
        UPDATE tariffs SET ${assignments.join(", ")}
        WHERE name=$${values.length}
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

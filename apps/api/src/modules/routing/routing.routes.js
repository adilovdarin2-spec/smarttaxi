import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../common/auth.js";
import { rateLimit } from "../../common/rateLimit.js";
import { buildDriverToPickupRoute, buildRoutePreview } from "./routing.service.js";

const router = Router();

const RoutePreviewBody = z.object({
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropoffLat: z.coerce.number().min(-90).max(90),
  dropoffLng: z.coerce.number().min(-180).max(180),
  tariffId: z.string().uuid().optional()
});

const DriverToPickupBody = z.object({
  orderId: z.string().uuid()
});

router.post("/preview", rateLimit({ prefix: "routes-preview", windowMs: 60_000, max: 80 }), async (req, res, next) => {
  try {
    const body = RoutePreviewBody.parse(req.body);
    const route = await buildRoutePreview(body, query);
    res.json({ route });
  } catch (e) { next(e); }
});

router.post("/driver-to-pickup", requireAuth, rateLimit({ prefix: "routes-driver-pickup", windowMs: 60_000, max: 80 }), async (req, res, next) => {
  try {
    const body = DriverToPickupBody.parse(req.body);
    const route = await buildDriverToPickupRoute({ orderId: body.orderId, user: req.user, executor: query });
    res.json({ route });
  } catch (e) { next(e); }
});

export default router;

import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth } from "../../common/auth.js";
import { rateLimit } from "../../common/rateLimit.js";
import { buildDriverToPickupRoute, buildRoutePreview, listLocalGeoCatalog, reverseAddress, searchAddresses } from "./routing.service.js";

const router = Router();

const RoutePreviewBody = z.object({
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropoffLat: z.coerce.number().min(-90).max(90),
  dropoffLng: z.coerce.number().min(-180).max(180),
  tariffId: z.string().uuid().optional(),
  tariff: z.string().trim().min(2).max(40).optional(),
  tariffName: z.string().trim().min(2).max(40).optional()
});

const DriverToPickupBody = z.object({
  orderId: z.string().uuid()
});

const AddressSearchQuery = z.object({
  q: z.string().trim().min(2).max(160),
  region: z.string().trim().min(2).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(12).optional()
});

const ReverseAddressQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

const CatalogQuery = z.object({
  region: z.string().trim().min(2).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

router.get("/catalog", async (req, res, next) => {
  try {
    const params = CatalogQuery.parse(req.query);
    res.json({ places: listLocalGeoCatalog(params) });
  } catch (e) { next(e); }
});

router.get("/addresses/search", rateLimit({ prefix: "addresses-search", windowMs: 60_000, max: 80 }), async (req, res, next) => {
  try {
    const query = AddressSearchQuery.parse(req.query);
    const addresses = await searchAddresses(query);
    res.json({ addresses });
  } catch (e) { next(e); }
});

router.get("/addresses/reverse", rateLimit({ prefix: "addresses-reverse", windowMs: 60_000, max: 80 }), async (req, res, next) => {
  try {
    const query = ReverseAddressQuery.parse(req.query);
    const address = await reverseAddress(query);
    res.json({ address });
  } catch (e) { next(e); }
});

router.post("/preview", requireAuth, rateLimit({ prefix: "routes-preview", windowMs: 60_000, max: 80 }), async (req, res, next) => {
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

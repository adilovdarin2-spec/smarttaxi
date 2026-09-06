import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors.js";
import { rateLimit } from "../../common/rateLimit.js";
import { query } from "../../db/pool.js";
import { buildMapsDiagnostics } from "./maps.diagnostics.js";
import { buildRoutePreview, reverseAddress, searchAddresses } from "../routing/routing.service.js";

const router = Router();
const estimateLimiter = rateLimit({ prefix: "maps-estimate", windowMs: 60_000, max: 60 });
const searchLimiter = rateLimit({ prefix: "maps-search", windowMs: 60_000, max: 80 });
const reverseLimiter = rateLimit({ prefix: "maps-reverse", windowMs: 60_000, max: 80 });
const routeLimiter = rateLimit({ prefix: "maps-route", windowMs: 60_000, max: 80 });

const EstimateSchema = z.object({
  pickupText: z.string().trim().max(180).optional().default(""),
  dropoffText: z.string().trim().max(180).optional().default(""),
  pickupLat: z.coerce.number().min(-90).max(90).optional(),
  pickupLng: z.coerce.number().min(-180).max(180).optional(),
  dropoffLat: z.coerce.number().min(-90).max(90).optional(),
  dropoffLng: z.coerce.number().min(-180).max(180).optional(),
  tariff: z.string().trim().min(2).max(40).optional().default("Economy")
});

const GeocodeSchema = z.object({
  q: z.string().trim().min(2).max(160),
  region: z.string().trim().min(2).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(12).optional()
});

const ReverseGeocodeSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

const RouteSchema = z.object({
  pickupLat: z.coerce.number().min(-90).max(90),
  pickupLng: z.coerce.number().min(-180).max(180),
  dropoffLat: z.coerce.number().min(-90).max(90),
  dropoffLng: z.coerce.number().min(-180).max(180),
  tariffId: z.string().uuid().optional(),
  tariff: z.string().trim().min(2).max(40).optional(),
  tariffName: z.string().trim().min(2).max(40).optional()
});

function hasCoordinates(body) {
  return [body.pickupLat, body.pickupLng, body.dropoffLat, body.dropoffLng].every(value => Number.isFinite(value));
}

function flattenRouteInput(input = {}) {
  if (input.pickup || input.dropoff) {
    return {
      ...input,
      pickupLat: input.pickup?.lat,
      pickupLng: input.pickup?.lng,
      dropoffLat: input.dropoff?.lat,
      dropoffLng: input.dropoff?.lng
    };
  }
  return input;
}

function routeResponse(preview) {
  return {
    distanceMeters: preview.distanceMeters,
    durationSeconds: preview.durationSeconds,
    polyline: null,
    geometry: preview.geometry,
    source: "osrm",
    providerStatus: preview.providerStatus,
    route: preview
  };
}

router.get("/diagnostics", async (_req, res, next) => {
  try {
    res.json(await buildMapsDiagnostics());
  } catch (error) {
    next(error);
  }
});

async function handleEstimate(input, res, next) {
  try {
    const body = EstimateSchema.parse(flattenRouteInput(input));
    if (!hasCoordinates(body)) {
      throw new AppError("Pickup and dropoff coordinates are required", 400, "ROUTE_COORDINATES_REQUIRED");
    }
    const preview = await buildRoutePreview({
      pickupLat: body.pickupLat,
      pickupLng: body.pickupLng,
      dropoffLat: body.dropoffLat,
      dropoffLng: body.dropoffLng,
      tariff: body.tariff
    }, query);
    const payload = {
      distanceKm: Math.round((preview.distanceMeters / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.ceil(preview.durationSeconds / 60)),
      price: preview.estimate?.estimatedPrice || 0,
      priceKzt: preview.estimate?.estimatedPrice || 0,
      currency: preview.region?.currency || "KZT",
      routePolyline: null,
      tariff: preview.estimate?.tariff?.name || body.tariff,
      source: "backend_osrm",
      provider: "routing_pricing_core",
      route: routeResponse(preview),
      estimate: preview.estimate
    };
    return res.json(payload);
  } catch (error) {
    next(error);
  }
}

router.get("/estimate", estimateLimiter, async (req, res, next) => {
  await handleEstimate(req.query, res, next);
});

router.post("/estimate", estimateLimiter, async (req, res, next) => {
  await handleEstimate(req.body, res, next);
});

router.get("/geocode", searchLimiter, async (req, res, next) => {
  try {
    const params = GeocodeSchema.parse(req.query);
    const addresses = await searchAddresses(params);
    res.json({ addresses, provider: "address_core" });
  } catch (error) {
    next(error);
  }
});

router.get("/search", searchLimiter, async (req, res, next) => {
  try {
    const params = GeocodeSchema.parse(req.query);
    const addresses = await searchAddresses(params);
    res.json(addresses.map(address => ({
      title: address.title || address.label,
      label: address.label || address.title,
      subtitle: address.subtitle || address.city || "",
      lat: address.lat,
      lng: address.lng,
      source: address.source || "address_core",
      confidence: address.confidence ?? 0.75
    })));
  } catch (error) {
    next(error);
  }
});

router.get("/reverse-geocode", reverseLimiter, async (req, res, next) => {
  try {
    const params = ReverseGeocodeSchema.parse(req.query);
    const address = await reverseAddress(params);
    res.json({ address, provider: "address_core" });
  } catch (error) {
    next(error);
  }
});

router.get("/reverse", reverseLimiter, async (req, res, next) => {
  try {
    const params = ReverseGeocodeSchema.parse(req.query);
    const address = await reverseAddress(params);
    res.json({
      title: address.title || address.label || "Точка на карте",
      label: address.label || address.title || "Точка на карте",
      subtitle: address.subtitle || address.city || "",
      lat: address.lat,
      lng: address.lng,
      source: address.source || "address_core",
      fallback: Boolean(address.fallback),
      confidence: address.confidence ?? (address.fallback ? 0.2 : 0.75)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/route", routeLimiter, async (req, res, next) => {
  try {
    const body = RouteSchema.parse(flattenRouteInput(req.body));
    const route = await buildRoutePreview(body, query);
    res.json(routeResponse(route));
  } catch (error) {
    next(error);
  }
});

router.post("/estimate-v2", estimateLimiter, async (req, res, next) => {
  try {
    const body = RouteSchema.refine(value => value.tariffId || value.tariff || value.tariffName, "tariffId or tariff is required").parse(flattenRouteInput(req.body));
    const preview = await buildRoutePreview(body, query);
    res.json({
      estimate: preview.estimate,
      tariff: preview.estimate?.tariff || null,
      distanceKm: Math.round((preview.distanceMeters / 1000) * 10) / 10,
      durationMin: Math.max(1, Math.ceil(preview.durationSeconds / 60)),
      priceKzt: preview.estimate?.estimatedPrice || null,
      currency: preview.region?.currency || "KZT",
      route: preview,
      source: "backend",
      provider: "pricing_core"
    });
  } catch (error) {
    next(error);
  }
});

export default router;

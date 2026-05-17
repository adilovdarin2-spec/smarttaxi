import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";

const router = Router();

const EstimateSchema = z.object({
  pickupText: z.string().trim().max(180).optional().default(""),
  dropoffText: z.string().trim().max(180).optional().default(""),
  pickupLat: z.coerce.number().min(-90).max(90).optional(),
  pickupLng: z.coerce.number().min(-180).max(180).optional(),
  dropoffLat: z.coerce.number().min(-90).max(90).optional(),
  dropoffLng: z.coerce.number().min(-180).max(180).optional()
});

function hasCoordinates(body) {
  return [body.pickupLat, body.pickupLng, body.dropoffLat, body.dropoffLng].every(value => Number.isFinite(value));
}

function haversineKm(body) {
  const earthKm = 6371;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(body.dropoffLat - body.pickupLat);
  const dLng = toRad(body.dropoffLng - body.pickupLng);
  const lat1 = toRad(body.pickupLat);
  const lat2 = toRad(body.dropoffLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function textFallbackKm(body) {
  const seed = `${body.pickupText}|${body.dropoffText}`.length;
  return 2.4 + (seed % 9) * 0.65;
}

export function estimateRoute(body) {
  const distanceKm = hasCoordinates(body)
    ? Math.max(0.5, Math.min(80, haversineKm(body) * 1.25))
    : textFallbackKm(body);
  const durationMin = Math.max(5, Math.round(distanceKm / 0.42));

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMin,
    provider: "fallback",
    googleReady: Boolean(env.GOOGLE_MAPS_SERVER_KEY),
    message: "Fallback estimate is used until Google Maps server billing is enabled."
  };
}

router.post("/estimate", async (req, res, next) => {
  try {
    const body = EstimateSchema.parse(req.body);
    res.json({ estimate: estimateRoute(body) });
  } catch (error) {
    next(error);
  }
});

export default router;

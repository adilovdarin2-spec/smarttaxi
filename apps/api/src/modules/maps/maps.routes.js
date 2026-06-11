import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { query } from "../../db/pool.js";
import { buildRoutePreview, reverseAddress, searchAddresses } from "../routing/routing.service.js";

const router = Router();

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

function calcPrice(tariff, distanceKm, durationMin) {
  const raw = Number(tariff.base_price) + Number(tariff.price_per_km) * distanceKm + Number(tariff.price_per_minute) * durationMin;
  return Math.max(Number(tariff.min_price), Math.round(raw / 10) * 10);
}

async function getTariff(name) {
  const result = await query("SELECT * FROM tariffs WHERE LOWER(name)=LOWER($1) AND is_active=true", [name]);
  if (result.rows[0]) return result.rows[0];
  return (await query("SELECT * FROM tariffs WHERE name='Economy' AND is_active=true LIMIT 1")).rows[0];
}

function fallbackEstimate(body) {
  const distanceKm = hasCoordinates(body)
    ? Math.max(0.5, Math.min(80, haversineKm(body) * 1.25))
    : textFallbackKm(body);
  const durationMin = Math.max(5, Math.round(distanceKm / 0.42));

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMin,
    source: "fallback",
    provider: "fallback",
    googleReady: Boolean(env.GOOGLE_MAPS_SERVER_KEY),
    message: "Fallback estimate is used until Google Maps server billing is enabled."
  };
}

function googlePoint(lat, lng, text) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat},${lng}`;
  return text || "";
}

async function googleEstimate(body) {
  if (!env.GOOGLE_MAPS_SERVER_KEY) return null;
  const origin = googlePoint(body.pickupLat, body.pickupLng, body.pickupText);
  const destination = googlePoint(body.dropoffLat, body.dropoffLng, body.dropoffText);
  if (!origin || !destination) return null;

  const params = new URLSearchParams({
    origin,
    destination,
    mode: "driving",
    units: "metric",
    key: env.GOOGLE_MAPS_SERVER_KEY
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  if (!response.ok) return null;
  const data = await response.json();
  const leg = data.routes?.[0]?.legs?.[0];
  if (!leg?.distance?.value || !leg?.duration?.value) return null;
  return {
    distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round(leg.duration.value / 60)),
    source: "google",
    provider: "google",
    googleReady: true,
    message: "Google Directions estimate."
  };
}

export async function estimateRoute(body) {
  const route = await googleEstimate(body).catch(() => null) || fallbackEstimate(body);
  const tariff = await getTariff(body.tariff);
  const price = tariff ? calcPrice(tariff, route.distanceKm, route.durationMin) : 0;
  return {
    ...route,
    tariff: tariff?.name || body.tariff,
    price
  };
}

async function handleEstimate(input, res, next) {
  try {
    const body = EstimateSchema.parse(input);
    if (hasCoordinates(body)) {
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
        source: "backend",
        provider: "pricing_core",
        tariff: preview.estimate?.tariff?.name || body.tariff,
        price: preview.estimate?.estimatedPrice || 0,
        priceKzt: preview.estimate?.estimatedPrice || 0,
        currency: preview.region?.currency || "KZT",
        route: preview,
        estimate: preview.estimate
      };
      return res.json(payload);
    }
    const estimate = await estimateRoute(body);
    res.json({ ...estimate, estimate });
  } catch (error) {
    next(error);
  }
}

router.get("/estimate", async (req, res, next) => {
  await handleEstimate(req.query, res, next);
});

router.post("/estimate", async (req, res, next) => {
  await handleEstimate(req.body, res, next);
});

router.get("/geocode", async (req, res, next) => {
  try {
    const params = GeocodeSchema.parse(req.query);
    const addresses = await searchAddresses(params);
    res.json({ addresses, provider: "address_core" });
  } catch (error) {
    next(error);
  }
});

router.get("/reverse-geocode", async (req, res, next) => {
  try {
    const params = ReverseGeocodeSchema.parse(req.query);
    const address = await reverseAddress(params);
    res.json({ address, provider: "address_core" });
  } catch (error) {
    next(error);
  }
});

router.post("/route", async (req, res, next) => {
  try {
    const body = RouteSchema.parse(req.body);
    const route = await buildRoutePreview(body, query);
    res.json({ route, provider: "routing_core" });
  } catch (error) {
    next(error);
  }
});

router.post("/estimate-v2", async (req, res, next) => {
  try {
    const body = RouteSchema.refine(value => value.tariffId || value.tariff || value.tariffName, "tariffId or tariff is required").parse(req.body);
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

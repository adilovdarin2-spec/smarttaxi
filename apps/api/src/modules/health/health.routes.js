import { Router } from "express";
import { query } from "../../db/pool.js";
import { redis } from "../../db/redis.js";
import { env } from "../../config/env.js";
import { buildMapsDiagnostics } from "../maps/maps.diagnostics.js";

const router = Router();
const version = process.env.npm_package_version || "1.0.0";

async function dependencyStatus() {
  const checks = { db: "down", redis: "down", osrm: "disabled", maptiler: "not_configured" };
  let dbTime = null;

  try {
    const db = await query("SELECT NOW() AS now");
    checks.db = "ok";
    dbTime = db.rows[0].now;
  } catch {}

  try {
    checks.redis = await redis.ping();
  } catch {}

  // Unlike the db/redis checks above, buildMapsDiagnostics() wasn't guarded --
  // a throw here (e.g. redis.isOpen on a disconnected client) had nowhere to
  // go, since this route has no try/catch/next of its own, leaving the
  // request hanging forever instead of returning a degraded status.
  let maps = { osrm: { status: "fail" }, maptiler: { key: "not_configured" }, providers: {} };
  try {
    maps = await buildMapsDiagnostics();
  } catch {}
  checks.osrm = maps.osrm.status;
  checks.maptiler = maps.maptiler.key;
  checks.mapSearch = maps.providers.search;
  checks.mapReverse = maps.providers.reverse;

  const baseReady = checks.db === "ok" && checks.redis === "PONG";
  const providerReady = env.NODE_ENV !== "production" || checks.osrm !== "fail";
  const ready = baseReady && providerReady;
  return { ready, checks, dbTime, maps };
}

router.get("/live", (_req, res) => {
  res.json({
    ok: true,
    status: "ok",
    app: "SmartTaxi",
    version,
    env: env.NODE_ENV,
    city: env.CITY,
    time: new Date().toISOString()
  });
});

router.get("/ready", async (_req, res) => {
  const status = await dependencyStatus();
  res.status(status.ready ? 200 : 503).json({
    ok: status.ready,
    status: status.ready ? "ok" : "degraded",
    app: "SmartTaxi",
    version,
    env: env.NODE_ENV,
    city: env.CITY,
    time: new Date().toISOString(),
    dbTime: status.dbTime,
    checks: status.checks,
    maps: status.maps
  });
});

router.get("/", async (_req, res) => {
  const status = await dependencyStatus();
  res.status(status.ready ? 200 : 503).json({
    ok: status.ready,
    status: status.ready ? "ok" : "degraded",
    app: "SmartTaxi",
    version,
    env: env.NODE_ENV,
    city: env.CITY,
    time: new Date().toISOString(),
    dbTime: status.dbTime,
    checks: status.checks,
    maps: status.maps
  });
});

export default router;

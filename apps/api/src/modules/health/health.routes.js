import { Router } from "express";
import { query } from "../../db/pool.js";
import { redis } from "../../db/redis.js";
import { env } from "../../config/env.js";

const router = Router();

async function dependencyStatus() {
  const checks = { db: "down", redis: "down" };
  let dbTime = null;

  try {
    const db = await query("SELECT NOW() AS now");
    checks.db = "ok";
    dbTime = db.rows[0].now;
  } catch {}

  try {
    checks.redis = await redis.ping();
  } catch {}

  const ready = checks.db === "ok" && checks.redis === "PONG";
  return { ready, checks, dbTime };
}

router.get("/live", (_req, res) => {
  res.json({ status: "ok", app: "SmartTaxi", city: env.CITY, time: new Date().toISOString() });
});

router.get("/ready", async (_req, res) => {
  const status = await dependencyStatus();
  res.status(status.ready ? 200 : 503).json({
    status: status.ready ? "ok" : "degraded",
    app: "SmartTaxi",
    city: env.CITY,
    time: new Date().toISOString(),
    dbTime: status.dbTime,
    checks: status.checks
  });
});

router.get("/", async (_req, res) => {
  const status = await dependencyStatus();
  res.status(status.ready ? 200 : 503).json({
    status: status.ready ? "ok" : "degraded",
    app: "SmartTaxi",
    city: env.CITY,
    time: new Date().toISOString(),
    dbTime: status.dbTime,
    checks: status.checks
  });
});

export default router;

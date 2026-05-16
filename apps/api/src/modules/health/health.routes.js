import { Router } from "express";
import { query } from "../../db/pool.js";
import { redis } from "../../db/redis.js";
import { env } from "../../config/env.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const db = await query("SELECT NOW() AS now");
    const pong = await redis.ping();
    res.json({ status: "ok", app: "SmartTaxi", city: env.CITY, time: new Date().toISOString(), dbTime: db.rows[0].now, redis: pong });
  } catch (e) { next(e); }
});

export default router;

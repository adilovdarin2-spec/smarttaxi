import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./config/env.js";
import { connectRedis } from "./db/redis.js";
import { query, pool } from "./db/pool.js";
import { runMigrations } from "./db/migrations.js";
import { errorHandler, notFound } from "./common/errors.js";
import { rateLimit } from "./common/rateLimit.js";
import authRoutes from "./modules/auth/auth.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import driversRoutes from "./modules/drivers/drivers.routes.js";
import clientsRoutes from "./modules/clients/clients.routes.js";
import tariffsRoutes from "./modules/tariffs/tariffs.routes.js";
import financeRoutes from "./modules/finance/finance.routes.js";
import mapsRoutes from "./modules/maps/maps.routes.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.CORS_ORIGINS, credentials: true } });
const latestDriverLocations = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try { socket.user = jwt.verify(token, env.JWT_SECRET); } catch {}
  }
  next();
});
io.on("connection", socket => {
  socket.on("join_dispatch", () => socket.join("dispatch"));
  socket.on("join_drivers", () => socket.join("drivers"));
  socket.on("join_order", orderId => {
    if (orderId) socket.join(`order:${orderId}`);
  });
  socket.on("driver_location_update", async payload => {
    try {
      if (socket.user?.role !== "DRIVER") return;
      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const driver = (await query("SELECT id FROM drivers WHERE user_id=$1", [socket.user.id])).rows[0];
      if (!driver) return;
      let orderId = payload?.orderId;
      if (!orderId) {
        orderId = (await query(
          "SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) ORDER BY created_at DESC LIMIT 1",
          [driver.id, ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"]]
        )).rows[0]?.id;
      }
      const next = {
        orderId,
        driverId: driver.id,
        lat,
        lng,
        heading: Number.isFinite(Number(payload?.heading)) ? Number(payload.heading) : null,
        speed: Number.isFinite(Number(payload?.speed)) ? Number(payload.speed) : null,
        updatedAt: new Date().toISOString()
      };
      latestDriverLocations.set(driver.id, next);
      socket.to("dispatch").emit("driver_location_updated", next);
      if (orderId) io.to(`order:${orderId}`).emit("driver_location_updated", next);
    } catch {}
  });
});

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin(origin, cb) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("CORS origin is not allowed"));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => { req.io = io; next(); });
app.use("/api", rateLimit({ prefix: "api", windowMs: 60_000, max: 300 }));

app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/tariffs", tariffsRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/maps", mapsRoutes);
app.get("/", (_req, res) => res.json({ app: "SmartTaxi API", status: "ok" }));
app.use(notFound);
app.use(errorHandler);

async function bootstrap() {
  await connectRedis();
  await runMigrations();
  await query("SELECT 1");
  server.listen(env.API_PORT, () => console.log(`[API] SmartTaxi running on ${env.API_PORT}`));
}
process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
process.on("SIGINT", async () => { await pool.end(); process.exit(0); });
bootstrap().catch(e => { console.error(e); process.exit(1); });

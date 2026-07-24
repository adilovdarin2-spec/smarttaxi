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
import { captureError, initSentry } from "./common/sentry.js";
import { rateLimit } from "./common/rateLimit.js";
import authRoutes from "./modules/auth/auth.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import paymentsRoutes, { kaspiWebhookRouter } from "./modules/payments/payments.routes.js";
import driversRoutes from "./modules/drivers/drivers.routes.js";
import driverCoreRoutes from "./modules/drivers/driver-core.routes.js";
import clientsRoutes from "./modules/clients/clients.routes.js";
import tariffsRoutes from "./modules/tariffs/tariffs.routes.js";
import financeRoutes from "./modules/finance/finance.routes.js";
import mapsRoutes from "./modules/maps/maps.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import regionsRoutes from "./modules/regions/regions.routes.js";
import routingRoutes from "./modules/routing/routing.routes.js";
import roadAlertsRoutes from "./modules/road-alerts/road-alerts.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import supportRoutes, { adminSupportRouter } from "./modules/support/support.routes.js";
import walletRoutes from "./modules/wallet/wallet.routes.js";
import clientWalletRoutes from "./modules/client-wallet/client-wallet.routes.js";
import driverDocumentsRoutes, { driverApplicationDocumentsRouter } from "./modules/driver-documents/driver-documents.routes.js";
import driverAvatarRoutes from "./modules/drivers/driver-avatar.routes.js";
import favoritesRoutes from "./modules/favorites/favorites.routes.js";
import referralsRoutes from "./modules/referrals/referrals.routes.js";
import recurringBookingsRoutes from "./modules/recurring-bookings/recurring-bookings.routes.js";
import appVersionRoutes from "./modules/app-version/app-version.routes.js";
import { startRecurringBookingsScheduler } from "./modules/recurring-bookings/recurring-bookings.scheduler.js";
import { assertDriverDispatchReady } from "./modules/driver-region-approvals/driver-region-approvals.service.js";
import { assertCanAccessOrderLocation, updateDriverLocation } from "./modules/routing/routing.service.js";
import {
  dispatchRegionRoom,
  driverRegionRoom,
  orderRoom
} from "./modules/orders/order-dispatch.service.js";

initSentry();
process.on("unhandledRejection", (error) => {
  console.error("[ERROR] unhandled rejection", error);
  captureError(error, { source: "unhandledRejection" });
});
process.on("uncaughtException", (error) => {
  console.error("[ERROR] uncaught exception", error);
  captureError(error, { source: "uncaughtException" });
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.CORS_ORIGINS, credentials: true } });

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try { socket.user = jwt.verify(token, env.JWT_SECRET); } catch {}
  }
  next();
});
io.on("connection", socket => {
  socket.on("join_dispatch", async payload => {
    try {
      if (!["OWNER", "FINANCE"].includes(socket.user?.role)) return;
      const regionId = payload?.regionId;
      if (!regionId) return;
      const region = (await query("SELECT id, is_active FROM regions WHERE id=$1", [regionId])).rows[0];
      if (!region?.is_active) return;
      socket.join(dispatchRegionRoom(region.id));
    } catch {}
  });
  socket.on("join_drivers", async () => {
    try {
      if (socket.user?.role !== "DRIVER") return;
      const driver = (await query("SELECT * FROM drivers WHERE user_id=$1", [socket.user.id])).rows[0];
      if (!driver) return;
      await assertDriverDispatchReady(driver, query);
      socket.join(driverRegionRoom(driver.current_region_id));
    } catch {}
  });
  socket.on("join_order", async orderId => {
    try {
      if (!socket.user || !orderId) return;
      const order = (await query("SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
      if (!order) return;
      await assertCanAccessOrderLocation({ user: socket.user, order, executor: query });
      socket.join(orderRoom(orderId));
    } catch {}
  });
  socket.on("driver_location_update", async payload => {
    try {
      if (socket.user?.role !== "DRIVER") return;
      await updateDriverLocation({ userId: socket.user.id, location: payload || {}, io, executor: query });
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
// verify stashes the exact raw bytes on req.rawBody before parsing — the
// Kaspi Pay webhook handler (payments.routes.js) needs those, not
// JSON.stringify(req.body), to check an HMAC signature: re-serializing a
// parsed object can produce different bytes than what was actually signed
// (key order, whitespace), which would make every signature check fail.
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use((req, _res, next) => { req.io = io; next(); });
app.use("/api", rateLimit({ prefix: "api", windowMs: 60_000, max: 300 }));

app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/orders", paymentsRoutes);
// Fixed, unauthenticated (signature-verified instead) URL to register once
// in Kaspi's merchant cabinet — see
// docs/status/KASPI_PAY_READINESS_2026-07-15.md.
app.use("/api/payments/kaspi", kaspiWebhookRouter);
app.use("/api/drivers", driversRoutes);
app.use("/api/driver", driverCoreRoutes);
app.use("/api/driver/orders", ordersRoutes);
app.use("/api/driver/orders", paymentsRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/tariffs", tariffsRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/maps", mapsRoutes);
app.use("/api/routes", routingRoutes);
app.use("/api/driver/road-alerts", roadAlertsRoutes);
app.use("/api/regions", regionsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/support", adminSupportRouter);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/drivers/me/wallet", walletRoutes);
app.use("/api/clients/me/wallet", clientWalletRoutes);
app.use("/api/drivers/me/documents", driverDocumentsRoutes);
app.use("/api/drivers/me/avatar", driverAvatarRoutes);
app.use("/api/driver-applications", driverApplicationDocumentsRouter);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/referrals", referralsRoutes);
app.use("/api/recurring-bookings", recurringBookingsRoutes);
app.use("/api/app-version", appVersionRoutes);
app.get("/", (_req, res) => res.json({ app: "SmartTaxi API", status: "ok" }));
app.use(notFound);
app.use(errorHandler);

async function bootstrap() {
  await connectRedis();
  await runMigrations();
  await query("SELECT 1");
  startRecurringBookingsScheduler(io);
  server.listen(env.API_PORT, () => console.log(`[API] SmartTaxi running on ${env.API_PORT}`));
}
process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
process.on("SIGINT", async () => { await pool.end(); process.exit(0); });
bootstrap().catch(e => { console.error(e); process.exit(1); });

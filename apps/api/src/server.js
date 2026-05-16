import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./config/env.js";
import { connectRedis } from "./db/redis.js";
import { query, pool } from "./db/pool.js";
import { errorHandler } from "./common/errors.js";
import authRoutes from "./modules/auth/auth.routes.js";
import healthRoutes from "./modules/health/health.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import driversRoutes from "./modules/drivers/drivers.routes.js";
import clientsRoutes from "./modules/clients/clients.routes.js";
import tariffsRoutes from "./modules/tariffs/tariffs.routes.js";
import financeRoutes from "./modules/finance/finance.routes.js";

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
  socket.on("join_dispatch", () => socket.join("dispatch"));
  socket.on("join_drivers", () => socket.join("drivers"));
});

app.use(helmet());
app.use(cors({
  origin(origin, cb) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("CORS blocked"));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => { req.io = io; next(); });

app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/tariffs", tariffsRoutes);
app.use("/api/finance", financeRoutes);
app.get("/", (_req, res) => res.json({ app: "SmartTaxi API", status: "ok" }));
app.use(errorHandler);

async function bootstrap() {
  await connectRedis();
  await query("SELECT 1");
  server.listen(env.API_PORT, () => console.log(`[API] SmartTaxi running on ${env.API_PORT}`));
}
process.on("SIGTERM", async () => { await pool.end(); process.exit(0); });
bootstrap().catch(e => { console.error(e); process.exit(1); });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "./syntax-check.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const orders = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const auth = readFileSync(join(root, "modules", "auth", "auth.routes.js"), "utf8");
const finance = readFileSync(join(root, "modules", "finance", "finance.routes.js"), "utf8");
const drivers = readFileSync(join(root, "modules", "drivers", "drivers.routes.js"), "utf8");
const maps = readFileSync(join(root, "modules", "maps", "maps.routes.js"), "utf8");
const env = readFileSync(join(root, "config", "env.js"), "utf8");

const checks = [
  ["audit table", /CREATE TABLE IF NOT EXISTS audit_logs/i.test(schema)],
  ["audit indexes", /idx_audit_logs_created_at/i.test(schema)],
  ["order transition guard", /assertTransition/i.test(orders)],
  ["completed requires in progress", /COMPLETED:\s*\["IN_PROGRESS"\]/.test(orders)],
  ["double accept guard", /ORDER_ALREADY_ACCEPTED/.test(orders) && /FOR UPDATE/.test(orders)],
  ["driver availability codes", /DRIVER_OFFLINE/.test(orders) && /DRIVER_BUSY/.test(orders) && /DRIVER_BLOCKED/.test(orders)],
  ["driver own order guard", /FORBIDDEN_ORDER/.test(orders)],
  ["invalid transition code", /INVALID_STATUS_TRANSITION/.test(orders)],
  ["public order rate limit", /orders-create/.test(orders)],
  ["order status history", /order_status_history/.test(orders)],
  ["driver busy on accept", /status='BUSY'/.test(orders)],
  ["driver free on completion", /status='FREE'/.test(orders)],
  ["cashback transaction on complete", /cashback_transactions/.test(orders) && /cashback_balance/.test(orders)],
  ["driver debt on cash kaspi", /driver_debts/.test(orders) && /CASH/.test(orders) && /KASPI/.test(orders)],
  ["driver card balance", /balance=balance\+\(\$1-\$2\)/.test(orders)],
  ["order audit logs", /order_created/.test(orders) && /order_completed/.test(orders)],
  ["auth rate limit", /auth-login/.test(auth)],
  ["auth audit logs", /login_success/.test(auth) && /login_failed/.test(auth)],
  ["finance completed revenue", /SUM\(price\) FILTER \(WHERE status='COMPLETED'\)/.test(finance)],
  ["finance audit endpoint", /audit-logs/.test(finance)],
  ["driver stats completed orders", /completed_orders/.test(drivers) && /status='COMPLETED'/.test(drivers)],
  ["driver active order endpoint", /\/me\/active-order/.test(drivers) && /activeOrder/.test(drivers)],
  ["maps fallback estimate", /estimateRoute/.test(maps) && /provider: "fallback"/.test(maps)],
  ["env validation", /requiredUrl\("DATABASE_URL"\)/.test(env) && /jwtSecret/.test(env) && /CORS_ORIGINS: corsOrigins/.test(env)]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) console.error(`Backend check failed: ${name}`);
  process.exit(1);
}

console.log("API hardening checks ok");

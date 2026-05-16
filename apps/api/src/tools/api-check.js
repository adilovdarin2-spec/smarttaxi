import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "./syntax-check.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const orders = readFileSync(join(root, "modules", "orders", "orders.routes.js"), "utf8");
const auth = readFileSync(join(root, "modules", "auth", "auth.routes.js"), "utf8");
const finance = readFileSync(join(root, "modules", "finance", "finance.routes.js"), "utf8");

const checks = [
  ["audit table", /CREATE TABLE IF NOT EXISTS audit_logs/i.test(schema)],
  ["audit indexes", /idx_audit_logs_created_at/i.test(schema)],
  ["order transition guard", /assertTransition/i.test(orders)],
  ["order audit logs", /order_created/.test(orders) && /order_completed/.test(orders)],
  ["auth rate limit", /auth-login/.test(auth)],
  ["auth audit logs", /login_success/.test(auth) && /login_failed/.test(auth)],
  ["finance audit endpoint", /audit-logs/.test(finance)]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) console.error(`Backend check failed: ${name}`);
  process.exit(1);
}

console.log("API hardening checks ok");

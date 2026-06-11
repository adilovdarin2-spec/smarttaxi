import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const authRoutes = readFileSync(join(root, "modules", "auth", "auth.routes.js"), "utf8");
const seed = readFileSync(join(root, "seeds", "seed.js"), "utf8");
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");

assert.match(authRoutes, /router\.post\("\/login"/, "login endpoint must exist");
assert.match(authRoutes, /router\.post\("\/register"/, "register endpoint must exist");
assert.match(authRoutes, /router\.post\("\/phone\/check"/, "phone check endpoint must exist");
assert.match(authRoutes, /router\.post\("\/sms\/send"/, "SMS send endpoint must exist");
assert.match(authRoutes, /router\.post\("\/sms\/verify"/, "SMS verify endpoint must exist");
assert.match(authRoutes, /router\.post\("\/register\/password"/, "SMS registration password endpoint must exist");
assert.match(authRoutes, /router\.post\("\/login\/password"/, "phone password login endpoint must exist");
assert.match(authRoutes, /router\.get\("\/me", requireAuth/, "me endpoint must require auth");
assert.match(authRoutes, /email: z\.string\(\)\.trim\(\)\.toLowerCase\(\)\.email\(\)\.optional\(\)/, "login/register must support email");
assert.match(authRoutes, /phone: z\.string\(\)\.trim\(\)\.min\(6\)\.max\(32\)/, "login/register must support phone");
assert.match(authRoutes, /VALUES\(\$1,\$2,\$3,\$4,'CLIENT',true\)/, "public register must create CLIENT users only");
assert.doesNotMatch(authRoutes.match(/router\.post\("\/register"[\s\S]*?router\.get\("\/me"/)?.[0] || "", /role:\s*z\.enum|role\s*=/, "public register must not accept a role");

assert.match(schema, /car_color TEXT/i, "driver profile must support car color");
assert.match(schema, /CREATE TABLE IF NOT EXISTS auth_sms_codes/i, "schema must include auth_sms_codes");
assert.match(schema, /consumed_at TIMESTAMPTZ/i, "SMS verification codes must be consumable once");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS car_color TEXT/i, "migration must add driver car color");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS auth_sms_codes/i, "migration must include auth_sms_codes");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ/i, "migration must add SMS consumed_at");
assert.match(authRoutes, /consumeSmsVerification/, "auth must consume SMS verification token before registration/reset");
assert.match(authRoutes, /consumed_at IS NULL/, "auth must reject reused SMS verification tokens");

for (const expected of [
  "Test Client",
  "client@smarttaxi.local",
  "+77000000001",
  "Test Driver",
  "driver@smarttaxi.local",
  "+77000000000",
  "SmartTaxi Owner",
  "admin@smarttaxi.local",
  "+77000000099",
  "Test Operator",
  "operator@smarttaxi.local",
  "+77000000098",
  "Test Finance",
  "finance@smarttaxi.local",
  "+77000000097"
]) {
  assert.match(seed, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `seed must include ${expected}`);
}

assert.match(seed, /role:\s*"CLIENT"/, "seed must create client role");
assert.match(seed, /role:\s*"DRIVER"/, "seed must create driver role");
assert.match(seed, /role:\s*"OWNER"/, "seed must create owner role");
assert.match(seed, /role:\s*"OPERATOR"/, "seed must create operator role");
assert.match(seed, /role:\s*"FINANCE"/, "seed must create finance role");
assert.match(seed, /Toyota Camry/, "seed must set driver car model");
assert.match(seed, /Белый/, "seed must set driver car color");
assert.match(seed, /777AAA17/, "seed must set driver plate");
assert.match(seed, /status='OFFLINE'/, "seeded driver must start offline");
assert.match(seed, /current_region_id=\$4/, "seeded driver must select Atakent region");
assert.match(seed, /driver_region_approvals/, "seed must approve driver for region");
assert.match(seed, /'APPROVED'/, "seeded driver region approval must be approved");
assert.match(seed, /'Economy'/, "seed must include Economy tariff");
assert.match(seed, /'Comfort'/, "seed must include Comfort tariff");
assert.match(seed, /'Delivery'/, "seed must include Delivery tariff");
assert.match(seed, /console\.table/, "seed must print release accounts");

console.log("Auth and seed account checks ok");

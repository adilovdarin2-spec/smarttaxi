import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const authRoutes = readFileSync(join(root, "modules", "auth", "auth.routes.js"), "utf8");
const referrals = readFileSync(join(root, "modules", "referrals", "referrals.service.js"), "utf8");
const seed = readFileSync(join(root, "seeds", "seed.js"), "utf8");
const envConfig = readFileSync(join(root, "config", "env.js"), "utf8");
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");

assert.match(authRoutes, /router\.post\("\/login"/, "login endpoint must exist");
assert.match(authRoutes, /router\.post\("\/phone\/check"/, "phone check endpoint must exist");
assert.match(authRoutes, /router\.post\("\/sms\/send"/, "SMS send endpoint must exist");
assert.match(authRoutes, /router\.post\("\/sms\/verify"/, "SMS verify endpoint must exist");
assert.match(authRoutes, /router\.post\("\/register\/password"/, "SMS registration password endpoint must exist");
assert.doesNotMatch(authRoutes, /router\.post\("\/register",/, "registration must only be reachable through the SMS-verified /register/password endpoint");
assert.match(authRoutes, /router\.post\("\/login\/password"/, "phone password login endpoint must exist");
assert.match(authRoutes, /router\.post\("\/mode\/passenger", requireAuth/, "passenger mode switch must require an authenticated session");
assert.match(authRoutes, /router\.post\("\/mode\/driver", requireAuth/, "driver mode switch must require an authenticated session");
assert.match(authRoutes, /const actingUser = \{ \.\.\.user, role: "CLIENT", baseRole: user\.role \}/, "passenger mode must issue a CLIENT-scoped token");
assert.match(authRoutes, /const actingUser = \{ \.\.\.user, role: "DRIVER", baseRole: user\.role \}/, "driver mode must restore a DRIVER-scoped token");
assert.doesNotMatch(authRoutes, /UPDATE users SET role=/, "mode switching must never mutate the account's persisted role");
assert.match(authRoutes, /router\.get\("\/me", requireAuth/, "me endpoint must require auth");
assert.match(authRoutes, /email: z\.string\(\)\.trim\(\)\.toLowerCase\(\)\.email\(\)\.optional\(\)/, "login must support email");
assert.match(authRoutes, /phone: z\.string\(\)\.trim\(\)\.min\(6\)\.max\(32\)/, "login must support phone");
assert.match(authRoutes, /VALUES\(\$1,NULL,\$2,\$3,'CLIENT',true\)/, "SMS-verified register must create CLIENT users only");
assert.doesNotMatch(authRoutes.match(/const RegisterPasswordSchema[\s\S]*?\}\);/)?.[0] || "", /role:\s*z\.enum|role\s*=/, "public register must not accept a role");

assert.match(schema, /car_color TEXT/i, "driver profile must support car color");
assert.match(schema, /CREATE TABLE IF NOT EXISTS auth_sms_codes/i, "schema must include auth_sms_codes");
assert.match(schema, /consumed_at TIMESTAMPTZ/i, "SMS verification codes must be consumable once");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS car_color TEXT/i, "migration must add driver car color");
assert.match(migrations, /CREATE TABLE IF NOT EXISTS auth_sms_codes/i, "migration must include auth_sms_codes");
assert.match(migrations, /ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ/i, "migration must add SMS consumed_at");
assert.match(authRoutes, /consumeSmsVerification/, "auth must consume SMS verification token before registration/reset");
assert.match(authRoutes, /consumed_at IS NULL/, "auth must reject reused SMS verification tokens");
assert.match(authRoutes, /import \{ randomInt \} from "node:crypto"/, "SMS codes must use the cryptographic random generator");
assert.match(authRoutes, /randomInt\(100000, 1_000_000\)/, "SMS codes must use the full six-digit cryptographic range");
assert.doesNotMatch(authRoutes, /Math\.random/, "SMS codes must never use Math.random");
assert.match(referrals, /import \{ randomInt \} from "node:crypto"/, "referral codes must use the cryptographic random generator");
assert.match(referrals, /CODE_ALPHABET\[randomInt\(CODE_ALPHABET\.length\)\]/, "referral codes must sample the full alphabet securely");
assert.doesNotMatch(referrals, /Math\.random/, "referral codes must never use Math.random");

for (const expected of [
  "Test Client",
  "client@smarttaxi.local",
  "+77000000001",
  "Test Driver",
  "driver@smarttaxi.local",
  "SmartTaxi Owner",
  "+77000000099",
  "Test Finance",
  "finance@smarttaxi.local",
  "+77000000097"
]) {
  assert.match(seed, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `seed must include ${expected}`);
}
assert.match(seed, /phone:\s*env\.DEFAULT_DRIVER_PHONE/, "driver seed must use the configurable default phone");
assert.match(envConfig, /DEFAULT_DRIVER_PHONE:\s*process\.env\.DEFAULT_DRIVER_PHONE\s*\|\|\s*"\+77000000000"/, "driver default phone must remain documented in environment config");
assert.match(seed, /email:\s*env\.DEFAULT_ADMIN_EMAIL/, "owner seed must use the configurable admin email");
assert.match(envConfig, /DEFAULT_ADMIN_EMAIL:\s*process\.env\.DEFAULT_ADMIN_EMAIL\s*\|\|\s*"admin@smarttaxi\.local"/, "admin email default must remain documented in environment config");

assert.match(seed, /role:\s*"CLIENT"/, "seed must create client role");
assert.match(seed, /role:\s*"DRIVER"/, "seed must create driver role");
assert.match(seed, /role:\s*"OWNER"/, "seed must create owner role");
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

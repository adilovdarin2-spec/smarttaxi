import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const migrations = read("../db/migrations.js");
const adminRoutes = read("../modules/admin/admin.routes.js");

// AdminApp.jsx's RafflesPage (create/list/delete) and QualityPage's "За
// розыгрыш" leaderboard filter both called /api/admin/raffles endpoints
// that never existed on the backend at all — every action there 404'd.
assert(migrations.includes("CREATE TABLE IF NOT EXISTS raffles"), "raffles table must exist in migrations");
assert(migrations.includes("starts_at TIMESTAMPTZ NOT NULL"), "raffles table must require starts_at");
assert(migrations.includes("ends_at TIMESTAMPTZ NOT NULL"), "raffles table must require ends_at");

assert(adminRoutes.includes('router.get("/raffles", requireAuth, requireRole("OWNER", "FINANCE")'), "listing raffles must be readable by OWNER/FINANCE");
assert(adminRoutes.includes('router.post("/raffles", requireAuth, requireRole("OWNER", "FINANCE")'), "creating a raffle must require OWNER/FINANCE");
assert(adminRoutes.includes('router.delete("/raffles/:id", requireAuth, requireRole("OWNER", "FINANCE")'), "deleting a raffle must require OWNER/FINANCE");
assert(adminRoutes.includes("INSERT INTO raffles(title, starts_at, ends_at)"), "creating a raffle must insert title/starts_at/ends_at");
assert(adminRoutes.includes("endsAt must be after startsAt"), "creating a raffle must reject an end date before its start date");
assert(adminRoutes.includes('action: "raffle_created"'), "creating a raffle must write an audit log entry");
assert(adminRoutes.includes('action: "raffle_deleted"'), "deleting a raffle must write an audit log entry");

console.log("Raffles (admin) checks ok");

import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const adminRoutes = read("../modules/admin/admin.routes.js");

// AdminApp.jsx's QualityPage sends dateFrom/dateTo (the selected raffle's
// startsAt/endsAt) to GET /api/admin/leaderboard whenever ratingScope is
// "raffle" — the route used to ignore both params entirely, always
// returning the same all-time list regardless of which raffle was picked.
const leaderboardRoute = adminRoutes.match(/router\.get\("\/leaderboard"[\s\S]*?\n\}\);/)?.[0] || "";
assert(leaderboardRoute, "GET /leaderboard route must exist");
assert(leaderboardRoute.includes("dateFrom"), "leaderboard route must read the dateFrom query param");
assert(leaderboardRoute.includes("dateTo"), "leaderboard route must read the dateTo query param");
assert(leaderboardRoute.includes("o.created_at >= $1::timestamptz"), "leaderboard query must filter joined orders by dateFrom");
assert(leaderboardRoute.includes("o.created_at <= $2::timestamptz"), "leaderboard query must filter joined orders by dateTo");
// Must stay a LEFT JOIN condition (not a WHERE clause) so a driver with
// zero orders in the selected window still appears with zero counts.
assert(leaderboardRoute.includes("LEFT JOIN orders o ON o.driver_id=d.id"), "date filter must live in the JOIN condition, not drop drivers via a WHERE clause");

console.log("Leaderboard date-range filter (admin) checks ok");

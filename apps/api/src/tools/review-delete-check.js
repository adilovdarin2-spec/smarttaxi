import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const adminRoutes = read("../modules/admin/admin.routes.js");

// The admin web panel's "delete review" button (AdminApp.jsx deleteAdminReview)
// calls DELETE /api/admin/reviews/:id — this route didn't exist until now,
// making the button a dead click. Guard it staying wired.
assert(adminRoutes.includes('router.delete("/reviews/:id", requireAuth, requireRole("OWNER")'), "deleting a review must exist and be OWNER-only");
assert(adminRoutes.includes("DELETE FROM driver_reviews WHERE id=$1"), "deleting a review must remove the driver_reviews row");
assert(
  adminRoutes.includes('await client.query("UPDATE drivers SET rating=$1 WHERE id=$2", [rating.rating || 5.00, existing.driver_id]);'),
  "deleting a review must re-average the driver's rating (falling back to the 5.00 default when no reviews remain, matching drivers.rating's schema default)"
);
assert(adminRoutes.includes('action: "driver_review_deleted"'), "deleting a review must write an audit log entry, same precedent as promo-code deletion");

console.log("Review deletion (admin) checks ok");

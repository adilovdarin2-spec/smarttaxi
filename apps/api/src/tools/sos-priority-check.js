import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const supportRoutes = read("../modules/support/support.routes.js");

// --- SOS reports are visible as such ---

assert(supportRoutes.includes('const SOS_TOPIC = "SOS"'), "SOS topic must be a named constant, not a repeated magic string");
assert(supportRoutes.includes("isUrgent: row.topic === SOS_TOPIC"), "publicMessage must expose isUrgent so admin/web can highlight SOS reports without hardcoding the topic string themselves");

// --- SOS reports sort first in the admin queue, regardless of age ---

assert(supportRoutes.includes("ORDER BY (topic=$1) DESC, created_at DESC"), "the ALL-status admin list must sort SOS reports before anything else");
assert(supportRoutes.includes("ORDER BY (topic=$2) DESC, created_at DESC"), "the status-filtered admin list must also sort SOS reports before anything else");

// --- SOS reports get a distinct push/in-app alert to operators, not just a FIFO slot ---

assert(supportRoutes.includes("if (created.topic === SOS_TOPIC)"), "creating a support message must check for SOS specifically to trigger operator alerts");
assert(supportRoutes.includes("SELECT id FROM users WHERE role='OWNER' AND is_active=true"), "SOS alerts must go to every active OWNER user, not a hardcoded single admin");
assert(supportRoutes.includes('type: "SOS_ALERT"'), "SOS operator notifications must use a distinct type so a notifications UI can filter/highlight them");
assert(supportRoutes.includes(".catch((error) => console.error(\"[push] SOS operator notify failed\", error))"), "SOS notification failures must never fail the SOS submission itself (best-effort, same as the existing LOST_ITEM push)");

console.log("SOS priority (support queue) checks ok");

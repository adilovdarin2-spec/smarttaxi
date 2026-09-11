import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const routes = read("../modules/support/support.routes.js");

// Before this fix, PATCH /:id/respond updated the row but never told the
// client -- the only way to see a reply was to reopen Support and manually
// pull-to-refresh. The mobile copy explicitly promises "Мы ответим здесь и,
// если нужно, позвоним" (we'll answer here), which had nothing behind it.
assert(
  /notifyUser\(existing\.user_id,\s*\{[\s\S]*?type:\s*"SUPPORT_REPLY"/.test(routes),
  "admin responding to a support message must notify the original sender via notifyUser, using a SUPPORT_REPLY type"
);
assert(
  routes.includes(".catch((error) => console.error(\"[push] support reply notify failed\", error))"),
  "the support-reply notification must be best-effort, same as the SOS/LOST_ITEM pushes -- a push failure must never fail the admin's response"
);

console.log("Support reply notification checks ok");

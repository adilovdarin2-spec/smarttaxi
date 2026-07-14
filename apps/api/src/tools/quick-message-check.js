import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const routes = read("../modules/orders/orders.routes.js");
const server = read("../server.js");

assert(server.includes('app.use("/api/orders", ordersRoutes)'), "orders routes (incl. quick-message) must be mounted at /api/orders");
assert(server.includes('app.use("/api/driver/orders", ordersRoutes)'), "orders routes (incl. quick-message) must also be mounted at /api/driver/orders");

assert(
  routes.includes('router.post("/:id/quick-message", requireAuth, requireRole("CLIENT", "DRIVER"), rateLimit({ prefix: "orders-quick-message", windowMs: 60_000, max: 10 })'),
  "quick-message route must allow both CLIENT and DRIVER and be rate limited 10/min/IP"
);

// The whole point of this feature is a fixed vocabulary — no free text ever
// reaches the other party. Pin the exact key set and the fact that the body
// schema is a closed z.enum (not z.string()), so a future edit can't quietly
// open it up to arbitrary messages without this check failing.
const expectedKeys = ["I_ARRIVED", "WAITING_AT_ENTRANCE", "RUNNING_LATE_2MIN", "PLEASE_COME_OUT", "ON_MY_WAY"];
const quickMessagesBlockMatch = routes.match(/const QUICK_MESSAGES = \{([\s\S]*?)\};/);
assert(quickMessagesBlockMatch, "QUICK_MESSAGES vocabulary map must exist in orders.routes.js");
const quickMessagesBlock = quickMessagesBlockMatch[1];
expectedKeys.forEach(key => assert(quickMessagesBlock.includes(key), `QUICK_MESSAGES is missing expected key ${key}`));
assert(
  (quickMessagesBlock.match(/^\s*[A-Z0-9_]+:/gm) || []).length === expectedKeys.length,
  "QUICK_MESSAGES must contain exactly the documented 5 keys — a new key here needs a matching doc/QA update"
);

assert(routes.includes("messageKey: z.enum(Object.keys(QUICK_MESSAGES))"), "quick-message body must validate messageKey against a closed enum, not free text");
assert(!/messageKey:\s*z\.string\(\)/.test(routes), "quick-message body must never accept a free-text messageKey");

// Sender must be a participant on the order (client owns it, or driver is
// assigned to it) — this is what stops a random client/driver id from
// spamming messages into someone else's trip.
const quickMessageRouteMatch = routes.match(/router\.post\("\/:id\/quick-message"[\s\S]*?\n\}\);/);
assert(quickMessageRouteMatch, "could not isolate quick-message route body for participant-check assertions");
const quickMessageRouteBody = quickMessageRouteMatch[0];
assert(quickMessageRouteBody.includes('if (!client || client.id !== order.client_id) throw new AppError("Forbidden order"'), "quick-message must reject a CLIENT sender who doesn't own the order");
assert(quickMessageRouteBody.includes('if (!driver || driver.id !== order.driver_id) throw new AppError("Forbidden order"'), "quick-message must reject a DRIVER sender who isn't assigned to the order");

// Response echoes back messageKey/text/delivered — the client contract.
assert(quickMessageRouteBody.includes('res.status(201).json({ delivered: true, messageKey: body.messageKey, text })'), "quick-message response contract (delivered/messageKey/text) must not change without updating client docs");

console.log("Quick in-trip messages checks ok");

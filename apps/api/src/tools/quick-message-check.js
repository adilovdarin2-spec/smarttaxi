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
// reaches the other party. Pin the exact key set per audience and the fact
// that the body schema is a closed z.enum (not z.string()), so a future edit
// can't quietly open it up to arbitrary messages without this check failing.
const CLIENT_KEYS = ["COMING_OUT", "WAITING_AT_ENTRANCE", "RUNNING_LATE_2MIN", "PLEASE_WAIT"];
const DRIVER_KEYS = ["I_ARRIVED", "ON_MY_WAY", "PLEASE_COME_OUT", "RUNNING_LATE_2MIN"];

function vocabulary(name) {
  const match = routes.match(new RegExp("const " + name + " = \\{([\\s\\S]*?)\\};"));
  assert(match, `${name} vocabulary map must exist in orders.routes.js`);
  return (match[1].match(/^\s*([A-Z0-9_]+):/gm) || []).map(line => line.trim().replace(":", ""));
}

const clientKeys = vocabulary("CLIENT_QUICK_MESSAGES");
const driverKeys = vocabulary("DRIVER_QUICK_MESSAGES");
assert(
  JSON.stringify(clientKeys) === JSON.stringify(CLIENT_KEYS),
  `CLIENT_QUICK_MESSAGES must be exactly ${CLIENT_KEYS.join(", ")} — got ${clientKeys.join(", ")}`
);
assert(
  JSON.stringify(driverKeys) === JSON.stringify(DRIVER_KEYS),
  `DRIVER_QUICK_MESSAGES must be exactly ${DRIVER_KEYS.join(", ")} — got ${driverKeys.join(", ")}`
);

// The two sides do not say the same things. A rider offered "Уже еду к вам" or
// "Пожалуйста, выходите" sends the driver a sentence only a driver can act on,
// which is what one shared list used to allow.
for (const key of ["I_ARRIVED", "ON_MY_WAY", "PLEASE_COME_OUT"]) {
  assert(!clientKeys.includes(key), `${key} is a driver's line and must not be offered to a rider`);
}
assert(!driverKeys.includes("WAITING_AT_ENTRANCE"), "WAITING_AT_ENTRANCE is the rider's line, not the driver's");

// Which side may say what is decided by the server, because the text is
// rendered to somebody else. An app that offers the wrong button is refused.
assert(
  routes.includes("const allowed = quickMessagesForRole(req.user.role);"),
  "quick-message must resolve the allowed vocabulary from the sender's role"
);
assert(
  routes.includes('throw new AppError("Message is not available for this role", 400, "QUICK_MESSAGE_NOT_ALLOWED"'),
  "quick-message must refuse a code belonging to the other side"
);
assert(
  routes.includes('router.get("/quick-messages", requireAuth, requireRole("CLIENT", "DRIVER")'),
  "apps must be able to ask the server which messages this side may send"
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

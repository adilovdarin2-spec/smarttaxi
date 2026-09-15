import assert from "node:assert/strict";
import fs from "node:fs";
import { beginShutdown, isShuttingDown } from "../common/lifecycle.js";

assert.equal(isShuttingDown(), false, "a fresh process accepts traffic");
assert.equal(beginShutdown(), true, "the first signal starts draining");
assert.equal(isShuttingDown(), true, "readiness sees the draining state");
assert.equal(beginShutdown(), false, "a second signal cannot start duplicate cleanup");

const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const health = fs.readFileSync(new URL("../modules/health/health.routes.js", import.meta.url), "utf8");
const composeDockerfile = fs.readFileSync(new URL("../../../../infra/docker/Dockerfile", import.meta.url), "utf8");
const rootDockerfile = fs.readFileSync(new URL("../../../../Dockerfile.api", import.meta.url), "utf8");
const serviceDockerfile = fs.readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
const railway = fs.readFileSync(new URL("../../railway.json", import.meta.url), "utf8");
for (const stop of [
  "stopRecurringBookingsScheduler",
  "stopStandsSweeper",
  "stopCancellationReviewScheduler"
]) {
  assert(server.includes(`${stop}();`), `${stop} must run during shutdown`);
}
assert(server.includes('io.local.emit("server_draining"'), "only clients on the draining replica should receive the reconnect hint");
assert(server.includes("io.local.disconnectSockets(true)"), "only local realtime clients may be disconnected");
assert(server.includes("await closeHttpServer()"), "HTTP must stop accepting work before dependencies close");
assert(server.includes("if (redis.isOpen) await redis.quit()"), "the primary Redis connection must close cleanly");
assert(server.indexOf("await closeHttpServer()") < server.indexOf("await pool.end()"), "active HTTP work drains before PostgreSQL closes");
assert(health.includes("isShuttingDown()"), "readiness must reject a draining replica");
assert(health.includes('lifecycle: "draining"'), "readiness must explain the draining state");
for (const dockerfile of [composeDockerfile, rootDockerfile, serviceDockerfile]) {
  assert(dockerfile.includes('CMD ["node", "src/server.js"]'), "Node must be PID 1 so it receives SIGTERM");
}
assert(railway.includes('"startCommand": "node src/server.js"'), "Railway must deliver SIGTERM directly to Node");

console.log("Lifecycle and graceful shutdown checks ok");

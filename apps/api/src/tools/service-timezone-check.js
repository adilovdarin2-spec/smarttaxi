import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// Every region this service runs in keeps the same clock, and the database
// container runs in UTC. With the connection left at UTC, `date_trunc('day',
// NOW())` and CURRENT_DATE drew the day boundary at 05:00 local: a driver's
// "Сегодня" showed yesterday's takings until five in the morning and then
// reset mid-shift, the owner's daily reports covered 05:00–05:00, and the
// once-a-day guard on recurring bookings agreed with neither a calendar day
// nor a working one.

const pool = read("../db/pool.js");
const env = read("../config/env.js");

// Sent while the connection is established, not as a SET afterwards: a SET on
// the pool's connect event is not awaited by pg, so the first query on a fresh
// connection could still run in UTC.
assert.match(
  pool,
  /options: `-c timezone=\$\{env\.SERVICE_TIMEZONE\}`/,
  "the service timezone must be a connection startup parameter"
);
assert.doesNotMatch(
  pool,
  /pool\.on\("connect"[\s\S]*SET TIME ZONE/,
  "setting the zone on the connect event leaves a window where a query runs in UTC"
);

assert.match(env, /SERVICE_TIMEZONE: serviceTimezone\(\)/, "the zone must go through validation");
assert.match(env, /new Intl\.DateTimeFormat\("en-US", \{ timeZone: value \}\)/, "an unknown zone must be refused at boot");

// It reaches SQL as a literal rather than a parameter, so nothing but a plain
// IANA name may survive validation.
const { env: liveEnv } = await import("../config/env.js");
assert.match(liveEnv.SERVICE_TIMEZONE, /^[A-Za-z][A-Za-z0-9+_-]*(?:\/[A-Za-z0-9+_-]+)*$/);
assert.ok(
  !/['";\\]/.test(liveEnv.SERVICE_TIMEZONE),
  "a zone carrying quotes or a statement separator must never reach SET TIME ZONE"
);

// The default is the zone this service actually operates in.
assert.equal(
  serviceTimezoneDefault(),
  "Asia/Almaty",
  "the default must be the zone the regions keep, not the container's UTC"
);

function serviceTimezoneDefault() {
  const match = env.match(/process\.env\.SERVICE_TIMEZONE \|\| "([^"]+)"/);
  assert.ok(match, "SERVICE_TIMEZONE must have an explicit default");
  return match[1];
}

// Nothing may reintroduce a hand-rolled UTC day boundary: the point of setting
// it on the connection is that every one of these means the same local day.
const dayBoundaryUsers = [
  "../modules/drivers/driver-daily-stats.service.js",
  "../modules/finance/finance.routes.js"
];
for (const path of dayBoundaryUsers) {
  const source = read(path);
  assert.match(source, /date_trunc\('day', NOW\(\)\)/, `${path} should keep using the session's own day`);
  assert.doesNotMatch(
    source,
    /AT TIME ZONE 'UTC'/,
    `${path} must not pin its day boundary back to UTC`
  );
}

console.log("Service timezone checks ok: startup parameter, validated zone, one local day everywhere");

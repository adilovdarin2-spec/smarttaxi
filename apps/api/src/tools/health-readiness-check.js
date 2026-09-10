import assert from "node:assert/strict";
import {
  dependenciesReady,
  smsReadinessStatus,
} from "../modules/health/health-readiness.js";

const healthy = { db: "ok", redis: "PONG", osrm: "ok", sms: "configured" };

assert.equal(
  smsReadinessStatus({ NODE_ENV: "development", SMS_PROVIDER: "dev" }),
  "dev",
);
assert.equal(
  smsReadinessStatus({ NODE_ENV: "production", SMS_PROVIDER: "dev" }),
  "not_configured",
);
assert.equal(
  smsReadinessStatus({ NODE_ENV: "production", SMS_PROVIDER: "infobip" }),
  "not_configured",
);
assert.equal(
  smsReadinessStatus({
    NODE_ENV: "production",
    SMS_PROVIDER: "infobip",
    INFOBIP_API_KEY: "configured-key",
    INFOBIP_BASE_URL: "https://sms.example.test",
  }),
  "configured",
);
assert.equal(dependenciesReady(healthy, "production"), true);
assert.equal(dependenciesReady({ ...healthy, sms: "not_configured" }, "production"), false);
assert.equal(dependenciesReady({ ...healthy, osrm: "fail" }, "production"), false);
assert.equal(dependenciesReady({ ...healthy, sms: "dev", osrm: "fail" }, "development"), true);

console.log("Health readiness: 8 passed.");

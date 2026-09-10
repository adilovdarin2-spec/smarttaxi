import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
const fullSmoke = readFileSync(new URL("./smoke-full.js", import.meta.url), "utf8");
const dockerSmoke = readFileSync(
  new URL("./smoke-qa-docker.js", import.meta.url),
  "utf8",
);

assert.equal(
  packageJson.scripts["smoke:qa-docker"],
  "node src/tools/smoke-qa-docker.js",
);
assert.match(fullSmoke, /"smoke-maps\.js",\s*"smoke-route-selection\.js",/);
assert.match(dockerSmoke, /const qaApiUrl = "http:\/\/127\.0\.0\.1:4001"/);
assert.match(dockerSmoke, /process\.env\.API_URL = qaApiUrl/);

console.log("Smoke orchestration: 4 passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const compose = readFileSync(
  new URL("../../../../docker-compose.yml", import.meta.url),
  "utf8",
);
const envExample = readFileSync(
  new URL("../../../../.env.example", import.meta.url),
  "utf8",
);

assert.match(
  compose,
  /\$\{SMARTTAXI_API_BIND_HOST:-127\.0\.0\.1\}:\$\{SMARTTAXI_API_PORT:-4001\}:4000/,
  "Compose API must default to a loopback-only host binding",
);
assert.match(
  compose,
  /127\.0\.0\.1:\$\{SMARTTAXI_WEB_PORT:-5175\}:80/,
  "Compose web must remain loopback-only",
);
assert.match(
  envExample,
  /^SMARTTAXI_API_BIND_HOST=127\.0\.0\.1$/m,
  "The environment template must keep the API loopback-only",
);

console.log("Local Compose exposure: 3 passed.");

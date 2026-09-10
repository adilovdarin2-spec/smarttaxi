import assert from "node:assert/strict";

const qaApiUrl = "http://127.0.0.1:4001";
const supplied = process.env.API_URL?.replace(/\/$/, "");

assert(
  !supplied || supplied === qaApiUrl,
  `smoke:qa-docker is fixed to ${qaApiUrl}; remove the conflicting API_URL`,
);

process.env.API_URL = qaApiUrl;
await import("./smoke-full.js");

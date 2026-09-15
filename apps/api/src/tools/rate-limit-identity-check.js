import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { rateLimitIdentity } from "../common/rateLimit.js";

const request = ({ user, authorization, ip = "100.64.0.10" } = {}) => ({
  user,
  ip,
  headers: authorization ? { authorization } : {},
  socket: { remoteAddress: "127.0.0.1" }
});

assert.equal(
  rateLimitIdentity(request({ user: { id: "already-authenticated" } })),
  "user:already-authenticated",
  "route-level authenticated requests use the user bucket"
);

const signedToken = jwt.sign({ id: "signed-user" }, env.JWT_SECRET, { expiresIn: "5m" });
assert.equal(
  rateLimitIdentity(request({ authorization: `Bearer ${signedToken}` })),
  "user:signed-user",
  "the global limiter recognizes a valid signed bearer token before requireAuth runs"
);

assert.equal(
  rateLimitIdentity(request({ authorization: "Bearer not-a-jwt" })),
  "ip:100.64.0.10",
  "an arbitrary bearer value cannot create unlimited rate-limit buckets"
);

const expiredToken = jwt.sign({ id: "expired-user", exp: 1 }, env.JWT_SECRET);
assert.equal(
  rateLimitIdentity(request({ authorization: `Bearer ${expiredToken}` })),
  "ip:100.64.0.10",
  "expired tokens fall back to the network identity"
);

assert.equal(
  rateLimitIdentity({ headers: {}, socket: { remoteAddress: "10.0.0.5" } }),
  "ip:10.0.0.5",
  "unauthenticated requests use the best available network identity"
);

console.log("Rate-limit identity checks ok");

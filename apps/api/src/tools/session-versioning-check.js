import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
const migrations = readFileSync(join(root, "db", "migrations.js"), "utf8");
const auth = readFileSync(join(root, "common", "auth.js"), "utf8");
const authRoutes = readFileSync(join(root, "modules", "auth", "auth.routes.js"), "utf8");
const server = readFileSync(join(root, "server.js"), "utf8");

// A stateless JWT has no server-side way to revoke a token before its
// natural expiry -- session_version is what makes that possible: every
// token embeds the value that was current at sign time, and requireAuth
// rejects any token whose embedded value no longer matches the row.
assert.match(schema, /session_version UUID NOT NULL DEFAULT uuid_generate_v4\(\)/, "users table must have a session_version column");
assert.match(migrations, /ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version UUID NOT NULL DEFAULT uuid_generate_v4\(\)/, "migration must add session_version to existing databases");

assert.match(auth, /sessionVersion:\s*user\.session_version/, "signToken must embed the user's current session_version in the JWT");
assert.match(auth, /export async function rotateSessionVersion/, "rotateSessionVersion must be exported for auth.routes.js to call on login/reset/logout");
assert.match(auth, /UPDATE users SET session_version=uuid_generate_v4\(\) WHERE id=\$1/, "rotateSessionVersion must actually rotate the column, not just read it");
assert.match(auth, /export async function requireAuth/, "requireAuth must be async now that it looks up session_version in the DB on every request");
assert.match(auth, /SELECT session_version FROM users WHERE id=\$1/, "requireAuth must look up the current session_version, not trust the token alone");
assert.match(auth, /current\.session_version !== decoded\.sessionVersion/, "requireAuth must reject a token whose embedded session_version is stale");
assert.match(auth, /"SESSION_SUPERSEDED"/, "requireAuth must use a distinct error code so clients can tell a superseded session apart from a plain invalid/expired token");

// Every real login path must rotate -- this is what makes logging in on a
// second device immediately invalidate whatever token the first device is
// still holding.
assert.match(authRoutes, /rotateSessionVersion\s*}\s*from\s*"\.\.\/\.\.\/common\/auth\.js"|import\s*\{[^}]*rotateSessionVersion[^}]*\}\s*from\s*"\.\.\/\.\.\/common\/auth\.js"/, "auth.routes.js must import rotateSessionVersion");

const loginWithPhonePasswordBody = authRoutes.match(/async function loginWithPhonePassword[\s\S]*?\n}/)?.[0] || "";
assert.match(loginWithPhonePasswordBody, /rotateSessionVersion\(user\.id\)/, "loginWithPhonePassword (used by /login/password and the phone branch of /login) must rotate session_version");
assert.match(loginWithPhonePasswordBody, /signToken\(rotated\)/, "loginWithPhonePassword must sign the token from the rotated row, not the stale pre-rotation user");

const emailLoginBranch = authRoutes.match(/router\.post\("\/login",[\s\S]*?\n}\);/)?.[0] || "";
assert.match(emailLoginBranch, /rotateSessionVersion\(user\.id\)/, "the /login route's own email-branch fallback must also rotate session_version");

const resetConfirmBody = authRoutes.match(/router\.post\("\/password\/reset\/confirm",[\s\S]*?\n}\);/)?.[0] || "";
assert.match(resetConfirmBody, /session_version=uuid_generate_v4\(\)/, "password reset must rotate session_version -- a stolen/leaked password shouldn't leave old sessions valid after a reset");

const registerBody = authRoutes.match(/router\.post\("\/register\/password",[\s\S]*?\n}\);/)?.[0] || "";
assert.doesNotMatch(registerBody, /rotateSessionVersion/, "registration inserts a brand new row whose DEFAULT already gives a random session_version -- rotating again would be redundant");

const refreshBody = authRoutes.match(/router\.post\("\/refresh",[\s\S]*?\n}\);/)?.[0] || "";
assert.doesNotMatch(refreshBody, /rotateSessionVersion/, "/refresh must NOT rotate session_version -- it continues the same session, and rotating here would invalidate the very token that just called it");

const logoutBody = authRoutes.match(/router\.post\("\/logout",[\s\S]*?\n}\);/)?.[0] || "";
assert.match(logoutBody, /rotateSessionVersion\(req\.user\.id\)/, "/logout must rotate session_version so the presented token is actually revoked, not just discarded client-side");

// A JWT alone isn't enough for socket.io either -- requireAuth's DB check
// only guards HTTP. Without an equivalent check here, a device kicked out
// over HTTP (login/reset/logout on another device) would keep its
// already-open socket (driver location, order/dispatch events) working
// indefinitely, undermining the whole point of session_version.
assert.match(server, /async function authenticateSocketToken/, "server.js must validate session_version for socket connections too, not just HTTP");
assert.match(server, /current\.session_version !== decoded\.sessionVersion/, "authenticateSocketToken must reject a socket token whose session_version is stale, same check as requireAuth");
assert.match(server, /io\.use\(async \(socket, next\) => \{\s*socket\.user = await authenticateSocketToken/, "the io.use handshake middleware must go through authenticateSocketToken, not raw jwt.verify");
assert.match(server, /setInterval\(async \(\) => \{/, "server.js must periodically re-validate already-connected sockets, since io.use only runs once at connect time and a shift-long driver socket could otherwise outlive a revoked session indefinitely");
assert.match(server, /if \(!stillValid\) socket\.disconnect\(true\);/, "the periodic sweep must actually disconnect a socket whose session was superseded, not just detect it");

console.log("Session-versioning (single active session per account) checks ok");

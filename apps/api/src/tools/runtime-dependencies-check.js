// Run inside an API image installed with --omit=dev --omit=optional.
// This check needs no credentials and never sends a notification or request.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import admin from "firebase-admin";
import { deleteApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const require = createRequire(import.meta.url);
const excludedOptionalPackages = [
  "@google-cloud/firestore",
  "@google-cloud/storage",
  "google-gax",
  "teeny-request",
  "retry-request",
  "uuid"
];

for (const dependency of excludedOptionalPackages) {
  assert.throws(() => require.resolve(dependency), { code: "MODULE_NOT_FOUND" },
    `${dependency} must not ship in the minimal API runtime`);
}

for (const dependency of ["express", "body-parser"]) {
  const fromDependency = createRequire(require.resolve(`${dependency}/package.json`));
  assert.equal(fromDependency("qs/package.json").version, "6.16.0",
    `${dependency} must resolve the patched qs version`);
}

// Match the application's namespace initialization; a bare modular app does
// not have the legacy namespace service accessors that admin.messaging uses.
const app = admin.initializeApp({ projectId: "smarttaxi-offline-runtime-check" }, "runtime-check");
try {
  const messaging = getMessaging(app);
  assert.equal(admin.messaging(app), messaging);
  assert.equal(messaging.app, app);
  assert.equal(typeof messaging.sendEachForMulticast, "function");
} finally {
  await deleteApp(app);
}

console.log("API runtime dependencies: patched qs, optional cloud services absent, Firebase Messaging available (offline).");

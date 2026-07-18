import { readFileSync } from "fs";
import admin from "firebase-admin";
import { env } from "../../config/env.js";

let firebaseApp = null;
let initAttempted = false;

function getApp() {
  if (initAttempted) return firebaseApp;
  initAttempted = true;
  if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    console.warn(
      "[push] FIREBASE_SERVICE_ACCOUNT_PATH is not set — push notifications " +
      "are disabled (in-app notification rows are still created)."
    );
    return null;
  }
  try {
    const raw = readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8");
    const serviceAccount = JSON.parse(raw);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("[push] Firebase Admin initialized");
  } catch (error) {
    console.error(
      "[push] Failed to initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT_PATH — push notifications disabled:",
      error.message
    );
    firebaseApp = null;
  }
  return firebaseApp;
}

export function isPushConfigured() {
  return Boolean(getApp());
}

/**
 * Sends a push notification to a batch of device tokens. No-ops (and
 * returns no stale tokens) until FIREBASE_SERVICE_ACCOUNT_PATH is
 * configured, so the rest of the notification flow (DB rows, the mobile
 * "Уведомления" screen) works today even before Firebase is wired up.
 *
 * @returns {Promise<{staleTokens: string[]}>} tokens Firebase reports as
 *   unregistered/invalid, so the caller can prune them from device_tokens.
 */
export async function sendPushToTokens(tokens, { title, body, data = {} }) {
  const app = getApp();
  if (!app || tokens.length === 0) return { staleTokens: [] };

  const response = await admin.messaging(app).sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value ?? "")])
    ),
    android: { priority: "high" }
  });

  const staleTokens = [];
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code || "";
    if (
      code.includes("registration-token-not-registered") ||
      code.includes("invalid-argument")
    ) {
      staleTokens.push(tokens[index]);
    }
  });
  return { staleTokens };
}

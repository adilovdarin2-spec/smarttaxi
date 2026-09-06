import { readFileSync } from "fs";
import admin from "firebase-admin";
import { env } from "../../config/env.js";

let firebaseApp = null;
let initAttempted = false;

function getApp() {
  if (initAttempted) return firebaseApp;
  initAttempted = true;

  // _JSON (the whole service-account file's contents, pasted as one env
  // var) takes priority — Railway has no durable place to point _PATH at
  // across deploys. _PATH stays for local dev, where the file can just sit
  // next to the repo.
  const source = env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? "FIREBASE_SERVICE_ACCOUNT_JSON"
    : env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? "FIREBASE_SERVICE_ACCOUNT_PATH"
      : null;
  if (!source) {
    console.warn(
      "[push] Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVICE_ACCOUNT_PATH " +
      "is set — push notifications are disabled (in-app notification rows are still created)."
    );
    return null;
  }
  try {
    const raw = source === "FIREBASE_SERVICE_ACCOUNT_JSON"
      ? env.FIREBASE_SERVICE_ACCOUNT_JSON
      : readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8");
    const serviceAccount = JSON.parse(raw);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log(`[push] Firebase Admin initialized from ${source}`);
  } catch (error) {
    console.error(
      `[push] Failed to initialize Firebase Admin from ${source} — push notifications disabled:`,
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

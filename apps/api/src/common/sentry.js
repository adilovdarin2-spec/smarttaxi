import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";

let initialized = false;

// No-op everywhere until SENTRY_DSN is set — same pattern as
// push.service.js's Firebase gate: the feature is fully wired, it just has
// nothing to report to yet.
export function initSentry() {
  if (!env.SENTRY_DSN) {
    console.warn("[sentry] SENTRY_DSN not set — crash reporting is disabled.");
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 0
  });
  initialized = true;
  console.log("[sentry] crash reporting initialized");
}

export function captureError(error, context = {}) {
  if (!initialized) return;
  Sentry.captureException(error, { extra: context });
}

export function isSentryConfigured() {
  return initialized;
}

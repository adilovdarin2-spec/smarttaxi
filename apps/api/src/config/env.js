import dotenv from "dotenv";
dotenv.config({ path: process.env.ENV_FILE || "../../.env" });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function requiredUrl(name) {
  const value = required(name);
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid env ${name}: expected URL`);
  }
  return value;
}

function optionalUrl(name, fallback) {
  const value = process.env[name] || fallback;
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid env ${name}: expected URL`);
  }
  return value;
}

function optionalPublicUrl(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) return "";
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid env ${name}: expected URL`);
  }
  return value;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function jwtSecret() {
  const value = required("JWT_SECRET");
  if (value.length < 32) throw new Error("Invalid env JWT_SECRET: minimum 32 characters");
  if ((process.env.NODE_ENV || "development") === "production" && /change_me|dev_secret/i.test(value)) {
    throw new Error("Invalid env JWT_SECRET: production secret must be changed");
  }
  return value;
}

function corsOrigins() {
  return (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5179,http://127.0.0.1:5179")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
    .map(origin => {
      try {
        return new URL(origin).origin;
      } catch {
        throw new Error(`Invalid CORS origin: ${origin}`);
      }
    });
}

function smsProvider() {
  const value = (process.env.SMS_PROVIDER || "dev").trim().toLowerCase();
  if (!["dev", "infobip"].includes(value)) {
    throw new Error("Invalid env SMS_PROVIDER: expected dev or infobip");
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  API_PORT: Number(process.env.API_PORT || 4000),
  API_PUBLIC_URL: optionalPublicUrl("API_PUBLIC_URL"),
  WEB_PUBLIC_URL: optionalPublicUrl("WEB_PUBLIC_URL"),
  DATABASE_URL: requiredUrl("DATABASE_URL"),
  REDIS_URL: optionalUrl("REDIS_URL", "redis://redis:6379"),
  JWT_SECRET: jwtSecret(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "365d",
  CORS_ORIGINS: corsOrigins(),
  RATE_LIMIT_ENABLED: boolEnv("RATE_LIMIT_ENABLED", true),
  MAPTILER_API_KEY: process.env.MAPTILER_API_KEY || "",
  MAPTILER_STYLE_URL: process.env.MAPTILER_STYLE_URL || "https://api.maptiler.com/maps/openstreetmap/style.json?key=${MAPTILER_API_KEY}",
  MAPTILER_GEOCODING_URL: process.env.MAPTILER_GEOCODING_URL || "https://api.maptiler.com/geocoding",
  MAP_SEARCH_PROVIDER: process.env.MAP_SEARCH_PROVIDER || "local_catalog_maptiler_photon_nominatim",
  MAP_REVERSE_PROVIDER: process.env.MAP_REVERSE_PROVIDER || "maptiler_nominatim_photon_local_fallback",
  ROUTING_BASE_URL: process.env.ROUTING_BASE_URL || process.env.OSRM_BASE_URL || "",
  OSRM_BASE_URL: process.env.OSRM_BASE_URL || process.env.ROUTING_BASE_URL || "",
  OSM_TILE_URL: process.env.OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  MAP_ATTRIBUTION_TEXT: process.env.MAP_ATTRIBUTION_TEXT || "© OpenStreetMap contributors",
  SMS_PROVIDER: smsProvider(),
  SMS_FROM: process.env.SMS_FROM || "ServiceSMS",
  SMS_DEV_MODE: boolEnv("SMS_DEV_MODE", (process.env.NODE_ENV || "development") !== "production"),
  SMS_DEV_CODE: process.env.SMS_DEV_CODE || "111111",
  INFOBIP_BASE_URL: process.env.INFOBIP_BASE_URL || "",
  INFOBIP_API_KEY: process.env.INFOBIP_API_KEY || "",
  // WhatsApp OTP delivery (whatsapp.provider.js) — separate from SMS so a
  // WhatsApp Business Account can live on a different Infobip App/base URL
  // than plain SMS; falls back to the SMS Infobip credentials when unset,
  // since most Infobip accounts bundle both channels under one App.
  WHATSAPP_PROVIDER: (process.env.WHATSAPP_PROVIDER || "").trim().toLowerCase(),
  INFOBIP_WHATSAPP_BASE_URL: process.env.INFOBIP_WHATSAPP_BASE_URL || "",
  INFOBIP_WHATSAPP_API_KEY: process.env.INFOBIP_WHATSAPP_API_KEY || "",
  INFOBIP_WHATSAPP_SENDER: process.env.INFOBIP_WHATSAPP_SENDER || "",
  INFOBIP_WHATSAPP_OTP_TEMPLATE: process.env.INFOBIP_WHATSAPP_OTP_TEMPLATE || "",
  INFOBIP_WHATSAPP_OTP_LANGUAGE: process.env.INFOBIP_WHATSAPP_OTP_LANGUAGE || "ru",
  // Kaspi Pay (payment-provider.js). All four blank = KaspiPayProvider
  // stays a mock, same as today — nothing else in the app changes behavior
  // until the business has a real merchant account and these are filled
  // in. See docs/status/KASPI_PAY_READINESS_2026-07-15.md for what each one
  // is and where it comes from.
  KASPI_MERCHANT_ID: process.env.KASPI_MERCHANT_ID || "",
  KASPI_API_KEY: process.env.KASPI_API_KEY || "",
  KASPI_API_BASE_URL: process.env.KASPI_API_BASE_URL || "",
  KASPI_WEBHOOK_SECRET: process.env.KASPI_WEBHOOK_SECRET || "",
  CITY: process.env.CITY || "Atakent",
  CURRENCY: process.env.CURRENCY || "KZT",
  CURRENCY_SYMBOL: process.env.CURRENCY_SYMBOL || "₸",
  DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL || "admin@smarttaxi.local",
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || "ChangeMe_2026!",
  DEFAULT_DRIVER_PHONE: process.env.DEFAULT_DRIVER_PHONE || "+77000000000",
  DEFAULT_DRIVER_PASSWORD: process.env.DEFAULT_DRIVER_PASSWORD || "123456",
  // Path to the Firebase Admin SDK service-account JSON (Project settings ->
  // Service accounts -> Generate new private key). Push sending is a no-op
  // (logged, not thrown) whenever this is unset — see push.service.js.
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "",
  // Crash/error monitoring (Sentry). Empty disables reporting entirely —
  // see common/sentry.js.
  SENTRY_DSN: process.env.SENTRY_DSN || ""
};

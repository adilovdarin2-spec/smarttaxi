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

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  API_PORT: Number(process.env.API_PORT || 4000),
  DATABASE_URL: requiredUrl("DATABASE_URL"),
  REDIS_URL: optionalUrl("REDIS_URL", "redis://redis:6379"),
  JWT_SECRET: jwtSecret(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  CORS_ORIGINS: corsOrigins(),
  GOOGLE_MAPS_SERVER_KEY: process.env.GOOGLE_MAPS_SERVER_KEY || "",
  ROUTING_BASE_URL: process.env.ROUTING_BASE_URL || "",
  OSM_TILE_URL: process.env.OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  MAP_ATTRIBUTION_TEXT: process.env.MAP_ATTRIBUTION_TEXT || "© OpenStreetMap contributors",
  CITY: process.env.CITY || "Atakent",
  CURRENCY: process.env.CURRENCY || "KZT",
  CURRENCY_SYMBOL: process.env.CURRENCY_SYMBOL || "₸",
  DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL || "admin@smarttaxi.local",
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || "ChangeMe_2026!",
  DEFAULT_DRIVER_PHONE: process.env.DEFAULT_DRIVER_PHONE || "+77000000000",
  DEFAULT_DRIVER_PASSWORD: process.env.DEFAULT_DRIVER_PASSWORD || "123456"
};

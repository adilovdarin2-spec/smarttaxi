import dotenv from "dotenv";
dotenv.config({ path: process.env.ENV_FILE || "../../.env" });

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  API_PORT: Number(process.env.API_PORT || 4000),
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  JWT_SECRET: required("JWT_SECRET", "dev_secret_change_me"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "http://localhost:5173").split(",").map(s => s.trim()),
  CITY: process.env.CITY || "Atakent",
  CURRENCY: process.env.CURRENCY || "KZT",
  CURRENCY_SYMBOL: process.env.CURRENCY_SYMBOL || "₸",
  DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL || "admin@smarttaxi.local",
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || "ChangeMe_2026!",
  DEFAULT_DRIVER_PHONE: process.env.DEFAULT_DRIVER_PHONE || "+77000000000",
  DEFAULT_DRIVER_PASSWORD: process.env.DEFAULT_DRIVER_PASSWORD || "123456"
};

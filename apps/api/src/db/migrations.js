import { query } from "./pool.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)",
  "CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id)",
  `DO $$
  BEGIN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CLIENT','DRIVER','OWNER','OPERATOR','FINANCE'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE drivers ADD CONSTRAINT drivers_status_check CHECK (status IN ('OFFLINE','FREE','BUSY','BREAK'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('NEW','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('CASH','KASPI','CARD','CASHBACK','MIXED'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('PENDING','PAID','FAILED','REFUNDED'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE tariffs ADD CONSTRAINT tariffs_positive_prices_check CHECK (
      base_price >= 0 AND price_per_km >= 0 AND price_per_minute >= 0 AND min_price >= 0
      AND service_commission_percent >= 0 AND service_commission_percent <= 100
      AND cashback_percent >= 0 AND cashback_percent <= 100
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`
];

export async function runMigrations() {
  for (const sql of statements) {
    await query(sql);
  }
}

import { query } from "./pool.js";

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    boundary JSONB NOT NULL,
    center_lat NUMERIC(10,6) NOT NULL,
    center_lng NUMERIC(10,6) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KZT',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `INSERT INTO regions(code, name, boundary, center_lat, center_lng, currency, is_active)
   VALUES (
     'ATAKENT',
     'Atakent',
     '[[69.4500,42.2000],[69.7600,42.2000],[69.7600,42.4300],[69.4500,42.4300],[69.4500,42.2000]]'::jsonb,
     42.316700,
     69.595800,
     'KZT',
     true
   )
   ON CONFLICT (code) DO UPDATE
   SET name=EXCLUDED.name,
       boundary=EXCLUDED.boundary,
       center_lat=EXCLUDED.center_lat,
       center_lng=EXCLUDED.center_lng,
       currency=EXCLUDED.currency,
       is_active=EXCLUDED.is_active,
       updated_at=NOW()`,
  "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_region_id UUID REFERENCES regions(id) ON DELETE SET NULL",
  "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS car_color TEXT",
  `CREATE TABLE IF NOT EXISTS driver_region_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('APPROVED','BLOCKED')),
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    blocked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    block_reason TEXT,
    approved_at TIMESTAMPTZ,
    blocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(driver_id, region_id)
  )`,
  `CREATE TABLE IF NOT EXISTS driver_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    lat NUMERIC(10,6) NOT NULL,
    lng NUMERIC(10,6) NOT NULL,
    heading NUMERIC(6,2),
    speed NUMERIC(8,2),
    accuracy NUMERIC(8,2),
    source TEXT NOT NULL DEFAULT 'mobile',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(driver_id)
  )`,
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE CASCADE",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(6,2) NOT NULL DEFAULT 1",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE RESTRICT",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb",
  "UPDATE tariffs SET region_id=(SELECT id FROM regions WHERE code='ATAKENT') WHERE region_id IS NULL",
  `INSERT INTO tariffs(region_id,name,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,is_active)
   SELECT r.id, seed.name, seed.base_price, seed.price_per_km, seed.price_per_minute, seed.min_price, seed.service_commission_percent, seed.cashback_percent, 1, true
   FROM regions r
   CROSS JOIN (
     VALUES
       ('Economy',400,110,20,700,15,2),
       ('Comfort',600,150,25,1000,15,2),
       ('Business',900,220,35,1500,18,2),
       ('Delivery',500,130,20,800,15,1)
   ) AS seed(name,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent)
   WHERE r.code='ATAKENT'
   ON CONFLICT (name) DO UPDATE
   SET region_id=EXCLUDED.region_id,
       base_price=EXCLUDED.base_price,
       price_per_km=EXCLUDED.price_per_km,
       price_per_minute=EXCLUDED.price_per_minute,
       min_price=EXCLUDED.min_price,
       service_commission_percent=EXCLUDED.service_commission_percent,
       cashback_percent=EXCLUDED.cashback_percent,
       surge_multiplier=EXCLUDED.surge_multiplier,
       is_active=EXCLUDED.is_active`,
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
  `CREATE TABLE IF NOT EXISTS service_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    service_name TEXT NOT NULL DEFAULT 'SmartTaxi',
    city TEXT NOT NULL DEFAULT 'Atakent',
    currency TEXT NOT NULL DEFAULT 'KZT',
    currency_symbol TEXT NOT NULL DEFAULT '₸',
    default_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 15,
    auto_approve_drivers BOOLEAN NOT NULL DEFAULT false,
    auto_assign_orders BOOLEAN NOT NULL DEFAULT false,
    support_phone TEXT NOT NULL DEFAULT '+77000000000',
    sos_phone TEXT NOT NULL DEFAULT '+77000000000',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT service_settings_singleton CHECK (id = 1)
  )`,
  `CREATE TABLE IF NOT EXISTS driver_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    car_model TEXT NOT NULL,
    car_color TEXT,
    plate_number TEXT NOT NULL,
    year INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING',
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS driver_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS client_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    tags TEXT[] NOT NULL DEFAULT '{}',
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS commission_overrides (
    driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
    percent NUMERIC(5,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)",
  "CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id)",
  "CREATE INDEX IF NOT EXISTS idx_orders_region_id ON orders(region_id)",
  "CREATE INDEX IF NOT EXISTS idx_orders_region_status_created_at ON orders(region_id, status, created_at DESC)",
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT driver_id
        FROM orders
        WHERE driver_id IS NOT NULL
          AND status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS')
        GROUP BY driver_id
        HAVING COUNT(*) > 1
      ) duplicate_active_driver_orders
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_per_driver ON orders(driver_id)
        WHERE driver_id IS NOT NULL AND status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS');
    ELSE
      RAISE NOTICE 'Skipping idx_orders_one_active_per_driver because duplicate active driver orders exist';
    END IF;
  END $$`,
  "CREATE INDEX IF NOT EXISTS idx_regions_active ON regions(is_active)",
  "CREATE INDEX IF NOT EXISTS idx_tariffs_region_id ON tariffs(region_id)",
  "CREATE INDEX IF NOT EXISTS idx_tariffs_region_active ON tariffs(region_id, is_active)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_tariffs_region_name ON tariffs(region_id, name)",
  "CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_driver_id ON driver_region_approvals(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_region_id ON driver_region_approvals(region_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_status ON driver_region_approvals(status)",
  "CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_locations_region_id ON driver_locations(region_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_locations_updated_at ON driver_locations(updated_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_driver_applications_status ON driver_applications(status)",
  "CREATE INDEX IF NOT EXISTS idx_driver_reviews_driver_id ON driver_reviews(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_client_reviews_client_id ON client_reviews(client_id)",
  `INSERT INTO service_settings(id, service_name, city, currency, currency_symbol)
   VALUES (1, 'SmartTaxi', 'Atakent', 'KZT', '₸')
   ON CONFLICT (id) DO NOTHING`,
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
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE tariffs ADD CONSTRAINT tariffs_surge_multiplier_check CHECK (surge_multiplier > 0 AND surge_multiplier <= 10);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`
];

export async function runMigrations() {
  for (const sql of statements) {
    await query(sql);
  }
}

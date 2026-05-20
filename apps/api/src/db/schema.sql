CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  cashback_balance INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regions (
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
);

CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  car_model TEXT NOT NULL,
  plate TEXT NOT NULL,
  tariff TEXT NOT NULL DEFAULT 'Economy',
  status TEXT NOT NULL DEFAULT 'OFFLINE',
  lat NUMERIC(10,6),
  lng NUMERIC(10,6),
  current_region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  balance INTEGER NOT NULL DEFAULT 0,
  debt INTEGER NOT NULL DEFAULT 0,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_region_approvals (
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
);

CREATE TABLE IF NOT EXISTS tariffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID REFERENCES regions(id) ON DELETE CASCADE,
  name TEXT UNIQUE NOT NULL,
  base_price INTEGER NOT NULL,
  price_per_km INTEGER NOT NULL,
  price_per_minute INTEGER NOT NULL,
  min_price INTEGER NOT NULL,
  service_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 15,
  cashback_percent NUMERIC(5,2) NOT NULL DEFAULT 2,
  surge_multiplier NUMERIC(6,2) NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(region_id, name)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  short_id TEXT UNIQUE NOT NULL,
  region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  rider_name TEXT NOT NULL,
  rider_phone TEXT NOT NULL,
  pickup_text TEXT NOT NULL,
  dropoff_text TEXT NOT NULL,
  pickup_lat NUMERIC(10,6),
  pickup_lng NUMERIC(10,6),
  dropoff_lat NUMERIC(10,6),
  dropoff_lng NUMERIC(10,6),
  tariff TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  status TEXT NOT NULL DEFAULT 'NEW',
  price INTEGER NOT NULL,
  distance_km NUMERIC(8,2) NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 0,
  service_commission INTEGER NOT NULL DEFAULT 0,
  cashback_earned INTEGER NOT NULL DEFAULT 0,
  cashback_used INTEGER NOT NULL DEFAULT 0,
  pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  accepted_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashback_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS driver_debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_settings (
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
);

CREATE TABLE IF NOT EXISTS driver_applications (
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
);

CREATE TABLE IF NOT EXISTS driver_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_overrides (
  driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  percent NUMERIC(5,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_region_id ON orders(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_region_status_created_at ON orders(region_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_per_driver ON orders(driver_id)
  WHERE driver_id IS NOT NULL AND status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_regions_active ON regions(is_active);
CREATE INDEX IF NOT EXISTS idx_tariffs_region_id ON tariffs(region_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_region_active ON tariffs(region_id, is_active);
CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_driver_id ON driver_region_approvals(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_region_id ON driver_region_approvals(region_id);
CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_status ON driver_region_approvals(status);
CREATE INDEX IF NOT EXISTS idx_driver_applications_status ON driver_applications(status);
CREATE INDEX IF NOT EXISTS idx_driver_reviews_driver_id ON driver_reviews(driver_id);
CREATE INDEX IF NOT EXISTS idx_client_reviews_client_id ON client_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

INSERT INTO regions(code, name, boundary, center_lat, center_lng, currency, is_active)
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
    updated_at=NOW();

INSERT INTO service_settings(id, service_name, city, currency, currency_symbol)
VALUES (1, 'SmartTaxi', 'Atakent', 'KZT', '₸')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tariffs(region_id,name,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,is_active)
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
    is_active=EXCLUDED.is_active;

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CLIENT','DRIVER','OWNER','OPERATOR','FINANCE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE drivers ADD CONSTRAINT drivers_status_check CHECK (status IN ('OFFLINE','FREE','BUSY','BREAK'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('NEW','DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('CASH','KASPI','CARD','CASHBACK','MIXED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('PENDING','PAID','FAILED','REFUNDED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE tariffs ADD CONSTRAINT tariffs_positive_prices_check CHECK (
    base_price >= 0 AND price_per_km >= 0 AND price_per_minute >= 0 AND min_price >= 0
    AND service_commission_percent >= 0 AND service_commission_percent <= 100
    AND cashback_percent >= 0 AND cashback_percent <= 100
    AND surge_multiplier > 0 AND surge_multiplier <= 10
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

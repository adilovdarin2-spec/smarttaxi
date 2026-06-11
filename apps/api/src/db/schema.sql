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

CREATE TABLE IF NOT EXISTS auth_sms_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('REGISTER','RESET_PASSWORD')),
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
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
  car_color TEXT,
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

CREATE TABLE IF NOT EXISTS driver_locations (
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
);

CREATE TABLE IF NOT EXISTS road_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ROAD_HAZARD','ACCIDENT','ROAD_WORK','SPEED_CAMERA','POLICE','TRAFFIC_JAM','ROAD_CLOSED','BAD_ROAD','POTHOLE','SPEED_BUMP','ICY_ROAD','SCHOOL_ZONE','TEMPORARY_SPEED_LIMIT','DANGEROUS_TURN','RAILROAD_CROSSING','PEDESTRIAN_CROSSING','OTHER')),
  comment TEXT NOT NULL DEFAULT '',
  lat NUMERIC(10,6) NOT NULL,
  lng NUMERIC(10,6) NOT NULL,
  speed_limit INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
  confirmations_count INTEGER NOT NULL DEFAULT 0,
  dismissals_count INTEGER NOT NULL DEFAULT 0,
  confidence_score INTEGER NOT NULL DEFAULT 50
);

CREATE TABLE IF NOT EXISTS tariffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID REFERENCES regions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT,
  description TEXT,
  base_price INTEGER NOT NULL,
  price_per_km INTEGER NOT NULL,
  price_per_minute INTEGER NOT NULL,
  min_price INTEGER NOT NULL,
  service_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 15,
  cashback_percent NUMERIC(5,2) NOT NULL DEFAULT 2,
  surge_multiplier NUMERIC(6,2) NOT NULL DEFAULT 1,
  included_km NUMERIC(8,2) NOT NULL DEFAULT 0,
  included_minutes INTEGER NOT NULL DEFAULT 0,
  free_waiting_minutes INTEGER NOT NULL DEFAULT 0,
  waiting_price_per_minute INTEGER NOT NULL DEFAULT 0,
  cancellation_fee INTEGER NOT NULL DEFAULT 0,
  no_show_fee INTEGER NOT NULL DEFAULT 0,
  zone_surcharge INTEGER NOT NULL DEFAULT 0,
  intercity_override INTEGER,
  night_coefficient NUMERIC(6,2) NOT NULL DEFAULT 1,
  demand_coefficient NUMERIC(6,2) NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  status TEXT NOT NULL DEFAULT 'SEARCHING_DRIVER',
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
  driver_arrived_at TIMESTAMPTZ,
  waiting_started_at TIMESTAMPTZ,
  free_waiting_until TIMESTAMPTZ,
  paid_waiting_started_at TIMESTAMPTZ,
  waiting_price_per_minute INTEGER,
  waiting_total INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('CASH','KASPI')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KZT',
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  client_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
  tariff_id UUID REFERENCES tariffs(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('ORDER_COMPLETED','ORDER_CANCELLED','DRIVER_DEBT_CREATED','DRIVER_DEBT_ADJUSTED','MANUAL_ADJUSTMENT')),
  payment_method TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (payment_method IN ('CASH','KASPI_TRANSFER','UNKNOWN')),
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  service_commission NUMERIC NOT NULL DEFAULT 0,
  driver_earning NUMERIC NOT NULL DEFAULT 0,
  driver_debt_delta NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KZT',
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOIDED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_auth_sms_codes_phone_purpose_created_at ON auth_sms_codes(phone, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_region_id ON orders(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_region_status_created_at ON orders(region_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_per_driver ON orders(driver_id)
  WHERE driver_id IS NOT NULL AND status IN ('DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','DRIVER_ASSIGNED','IN_PROGRESS');
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_per_client ON orders(client_id)
  WHERE client_id IS NOT NULL AND status IN ('SEARCHING_DRIVER','NEW','DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','TRIP_COMPLETED','PAYMENT_PENDING','DRIVER_ASSIGNED','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_financial_transactions_order_id ON financial_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_driver_id ON financial_transactions(driver_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_region_id ON financial_transactions(region_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_tariff_id ON financial_transactions(tariff_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(type);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_created_at ON financial_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_status ON financial_transactions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_order_completed_once ON financial_transactions(order_id, type)
  WHERE type = 'ORDER_COMPLETED' AND status = 'POSTED';
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_regions_active ON regions(is_active);
CREATE INDEX IF NOT EXISTS idx_tariffs_region_id ON tariffs(region_id);
CREATE INDEX IF NOT EXISTS idx_tariffs_region_active ON tariffs(region_id, is_active);
CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_driver_id ON driver_region_approvals(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_region_id ON driver_region_approvals(region_id);
CREATE INDEX IF NOT EXISTS idx_driver_region_approvals_status ON driver_region_approvals(status);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_region_id ON driver_locations(region_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_updated_at ON driver_locations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_road_alerts_region_status_created_at ON road_alerts(region_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_road_alerts_driver_id ON road_alerts(driver_id);
CREATE INDEX IF NOT EXISTS idx_road_alerts_expires_at ON road_alerts(expires_at);
CREATE INDEX IF NOT EXISTS idx_driver_applications_status ON driver_applications(status);
CREATE INDEX IF NOT EXISTS idx_driver_reviews_driver_id ON driver_reviews(driver_id);
CREATE INDEX IF NOT EXISTS idx_client_reviews_client_id ON client_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

INSERT INTO regions(code, name, boundary, center_lat, center_lng, currency, is_active)
VALUES
  (
    'ATAKENT',
    'Атакент',
    '[[68.4750,40.8200],[68.5350,40.8200],[68.5350,40.8750],[68.4750,40.8750],[68.4750,40.8200]]'::jsonb,
    40.844435,
    68.509021,
    'KZT',
    true
  ),
  (
    'MYRZAKENT',
    'Мырзакент',
    '[[68.4700,40.6000],[68.6000,40.6000],[68.6000,40.7300],[68.4700,40.7300],[68.4700,40.6000]]'::jsonb,
    40.666108,
    68.543090,
    'KZT',
    true
  ),
  (
    'ZHETYSAY',
    'Жетысай',
    '[[68.0500,40.8000],[68.3300,40.8000],[68.3300,41.0000],[68.0500,41.0000],[68.0500,40.8000]]'::jsonb,
    40.884303,
    68.212621,
    'KZT',
    true
  ),
  (
    'SHYMKENT',
    'Шымкент',
    '[[69.3000,42.1000],[69.8500,42.1000],[69.8500,42.4800],[69.3000,42.4800],[69.3000,42.1000]]'::jsonb,
    42.314696,
    69.588328,
    'KZT',
    true
  ),
  (
    'KIROV',
    'Киров',
    '[[68.5000,40.7500],[68.5700,40.7500],[68.5700,40.8200],[68.5000,40.8200],[68.5000,40.7500]]'::jsonb,
    40.786900,
    68.534400,
    'KZT',
    true
  ),
  (
    'ASYKATA',
    'Асыката',
    '[[68.3200,40.8600],[68.4100,40.8600],[68.4100,40.9300],[68.3200,40.9300],[68.3200,40.8600]]'::jsonb,
    40.894700,
    68.363500,
    'KZT',
    true
  ),
  (
    'DOSTYK',
    'Достык',
    '[[68.4200,40.7800],[68.4900,40.7800],[68.4900,40.8400],[68.4200,40.8400],[68.4200,40.7800]]'::jsonb,
    40.807200,
    68.459200,
    'KZT',
    true
  ),
  (
    'YNTYMAK',
    'Ынтымак',
    '[[68.4600,40.7300],[68.5300,40.7300],[68.5300,40.7900],[68.4600,40.7900],[68.4600,40.7300]]'::jsonb,
    40.760600,
    68.497900,
    'KZT',
    true
  ),
  (
    'BIRLIK',
    'Бирлик',
    '[[68.3700,40.7900],[68.4350,40.7900],[68.4350,40.8550],[68.3700,40.8550],[68.3700,40.7900]]'::jsonb,
    40.822500,
    68.401800,
    'KZT',
    true
  ),
  (
    'FIRDOUSI',
    'Фирдоуси',
    '[[68.4700,40.6900],[68.5350,40.6900],[68.5350,40.7550],[68.4700,40.7550],[68.4700,40.6900]]'::jsonb,
    40.723100,
    68.501600,
    'KZT',
    true
  ),
  (
    'ZHANA_ZHOL',
    'Жана Жол',
    '[[68.5300,40.7250],[68.6000,40.7250],[68.6000,40.7900],[68.5300,40.7900],[68.5300,40.7250]]'::jsonb,
    40.756700,
    68.566100,
    'KZT',
    true
  ),
  (
    'MAKTAARAL',
    'Мақтаарал',
    '[[68.5050,40.7050],[68.5700,40.7050],[68.5700,40.7650],[68.5050,40.7650],[68.5050,40.7050]]'::jsonb,
    40.735800,
    68.536400,
    'KZT',
    true
  ),
  (
    'ATAMEKEN',
    'Атамекен',
    '[[68.5450,40.7800],[68.6200,40.7800],[68.6200,40.8450],[68.5450,40.8450],[68.5450,40.7800]]'::jsonb,
    40.812100,
    68.583900,
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

INSERT INTO tariffs(region_id,name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order,is_active)
SELECT r.id, seed.name, seed.display_name, seed.description, seed.base_price, seed.price_per_km, seed.price_per_minute, seed.min_price, seed.service_commission_percent, seed.cashback_percent, seed.surge_multiplier, seed.free_waiting_minutes, seed.waiting_price_per_minute, seed.cancellation_fee, seed.sort_order, true
FROM regions r
CROSS JOIN (
  VALUES
    ('Economy','Эконом','Быстро и доступно для ежедневных поездок',350,110,18,500,15,2,1,3,50,0,10),
    ('Comfort','Комфорт','Больше удобства для городских поездок',500,140,22,750,15,2,1,3,60,0,20),
    ('Business','Бизнес','Премиальный автомобиль и спокойная поездка',800,210,35,1200,15,2,1,3,80,0,30),
    ('Delivery','Доставка','Передать посылку по региону',300,80,12,450,15,0,1,3,50,0,40)
) AS seed(name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order)
WHERE r.code IN ('ATAKENT','MYRZAKENT','ZHETYSAY','SHYMKENT','KIROV','ASYKATA','DOSTYK','YNTYMAK','BIRLIK','FIRDOUSI','ZHANA_ZHOL','MAKTAARAL','ATAMEKEN')
ON CONFLICT (region_id, name) DO UPDATE
SET region_id=EXCLUDED.region_id,
    display_name=EXCLUDED.display_name,
    description=EXCLUDED.description,
    base_price=EXCLUDED.base_price,
    price_per_km=EXCLUDED.price_per_km,
    price_per_minute=EXCLUDED.price_per_minute,
    min_price=EXCLUDED.min_price,
    service_commission_percent=EXCLUDED.service_commission_percent,
    cashback_percent=EXCLUDED.cashback_percent,
    surge_multiplier=EXCLUDED.surge_multiplier,
    free_waiting_minutes=EXCLUDED.free_waiting_minutes,
    waiting_price_per_minute=EXCLUDED.waiting_price_per_minute,
    cancellation_fee=EXCLUDED.cancellation_fee,
    sort_order=EXCLUDED.sort_order,
    is_active=EXCLUDED.is_active,
    updated_at=NOW();

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
    ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('SEARCHING_DRIVER','DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','TRIP_COMPLETED','PAYMENT_PENDING','PAID','RATED','CANCELLED_BY_CLIENT','CANCELLED_BY_DRIVER','CANCELLED_BY_OPERATOR','NO_SHOW','NEW','DRIVER_ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'));
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
    AND included_km >= 0
    AND included_minutes >= 0
    AND free_waiting_minutes >= 0
    AND waiting_price_per_minute >= 0
    AND cancellation_fee >= 0
    AND no_show_fee >= 0
    AND zone_surcharge >= 0
    AND night_coefficient >= 1
    AND demand_coefficient >= 1
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

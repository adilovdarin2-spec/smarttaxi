import { query } from "./pool.js";

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE TABLE IF NOT EXISTS auth_sms_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('REGISTER','RESET_PASSWORD')),
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE auth_sms_codes ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ",
  "CREATE INDEX IF NOT EXISTS idx_auth_sms_codes_phone_purpose_created_at ON auth_sms_codes(phone, purpose, created_at DESC)",
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
  `CREATE TABLE IF NOT EXISTS road_alerts (
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
  )`,
  "ALTER TABLE road_alerts ADD COLUMN IF NOT EXISTS speed_limit INTEGER",
  "ALTER TABLE road_alerts ADD COLUMN IF NOT EXISTS dismissals_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE road_alerts ADD COLUMN IF NOT EXISTS confidence_score INTEGER NOT NULL DEFAULT 50",
  "ALTER TABLE road_alerts DROP CONSTRAINT IF EXISTS road_alerts_type_check",
  `ALTER TABLE road_alerts ADD CONSTRAINT road_alerts_type_check
   CHECK (type IN ('ROAD_HAZARD','ACCIDENT','ROAD_WORK','SPEED_CAMERA','POLICE','TRAFFIC_JAM','ROAD_CLOSED','BAD_ROAD','POTHOLE','SPEED_BUMP','ICY_ROAD','SCHOOL_ZONE','TEMPORARY_SPEED_LIMIT','DANGEROUS_TURN','RAILROAD_CROSSING','PEDESTRIAN_CROSSING','OTHER'))`,
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE CASCADE",
  "ALTER TABLE tariffs DROP CONSTRAINT IF EXISTS tariffs_name_key",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS display_name TEXT",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS description TEXT",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(6,2) NOT NULL DEFAULT 1",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS included_km NUMERIC(8,2) NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS included_minutes INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS free_waiting_minutes INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS waiting_price_per_minute INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS cancellation_fee INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS no_show_fee INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS zone_surcharge INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS intercity_override INTEGER",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS night_coefficient NUMERIC(6,2) NOT NULL DEFAULT 1",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS demand_coefficient NUMERIC(6,2) NOT NULL DEFAULT 1",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE RESTRICT",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb",
  "ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'SEARCHING_DRIVER'",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_arrived_at TIMESTAMPTZ",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiting_started_at TIMESTAMPTZ",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS free_waiting_until TIMESTAMPTZ",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_waiting_started_at TIMESTAMPTZ",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiting_price_per_minute INTEGER",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiting_total INTEGER NOT NULL DEFAULT 0",
  `CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('CASH','KASPI')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED')),
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KZT',
    provider_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)",
  "UPDATE tariffs SET region_id=(SELECT id FROM regions WHERE code='ATAKENT') WHERE region_id IS NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_tariffs_region_name ON tariffs(region_id, name)",
  `INSERT INTO tariffs(region_id,name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order,is_active)
   SELECT r.id, seed.name, seed.display_name, seed.description, seed.base_price, seed.price_per_km, seed.price_per_minute, seed.min_price, seed.service_commission_percent, seed.cashback_percent, seed.surge_multiplier, seed.free_waiting_minutes, seed.waiting_price_per_minute, seed.cancellation_fee, seed.sort_order, seed.is_active
   FROM regions r
   CROSS JOIN (
     VALUES
      ('Economy','Эконом','Фиксированная цена. Быстро и выгодно',700,0,0,700,15,0,1,3,50,0,10,true),
      ('Comfort','Комфорт','Фиксированная цена. Больше комфорта',1000,0,0,1000,15,0,1,3,60,0,20,true),
      ('Business','Бизнес','Премиальная поездка',2500,0,0,2500,15,0,1,3,80,0,25,true),
      ('Delivery','Доставка','Фиксированная цена. Посылки и небольшие грузы',800,0,0,800,15,0,1,3,50,0,30,true)
   ) AS seed(name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order,is_active)
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
       updated_at=NOW()`,
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
  `CREATE TABLE IF NOT EXISTS financial_transactions (
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
  )`,
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)",
  "CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id)",
  "CREATE INDEX IF NOT EXISTS idx_orders_region_id ON orders(region_id)",
  "CREATE INDEX IF NOT EXISTS idx_orders_region_status_created_at ON orders(region_id, status, created_at DESC)",
  "DROP INDEX IF EXISTS idx_orders_one_active_per_driver",
  "DROP INDEX IF EXISTS idx_orders_one_active_per_client",
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT driver_id
        FROM orders
        WHERE driver_id IS NOT NULL
          AND status IN ('DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','DRIVER_ASSIGNED','IN_PROGRESS')
        GROUP BY driver_id
        HAVING COUNT(*) > 1
      ) duplicate_active_driver_orders
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_per_driver ON orders(driver_id)
        WHERE driver_id IS NOT NULL AND status IN ('DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','DRIVER_ASSIGNED','IN_PROGRESS');
    ELSE
      RAISE NOTICE 'Skipping idx_orders_one_active_per_driver because duplicate active driver orders exist';
    END IF;
  END $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT client_id
        FROM orders
        WHERE client_id IS NOT NULL
          AND status IN ('SEARCHING_DRIVER','NEW','DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','TRIP_COMPLETED','PAYMENT_PENDING','DRIVER_ASSIGNED','IN_PROGRESS')
        GROUP BY client_id
        HAVING COUNT(*) > 1
      ) duplicate_active_client_orders
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_active_per_client ON orders(client_id)
        WHERE client_id IS NOT NULL AND status IN ('SEARCHING_DRIVER','NEW','DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','TRIP_COMPLETED','PAYMENT_PENDING','DRIVER_ASSIGNED','IN_PROGRESS');
    ELSE
      RAISE NOTICE 'Skipping idx_orders_one_active_per_client because duplicate active client orders exist';
    END IF;
  END $$`,
  "CREATE INDEX IF NOT EXISTS idx_financial_transactions_order_id ON financial_transactions(order_id)",
  "CREATE INDEX IF NOT EXISTS idx_financial_transactions_driver_id ON financial_transactions(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_financial_transactions_region_id ON financial_transactions(region_id)",
  "CREATE INDEX IF NOT EXISTS idx_financial_transactions_tariff_id ON financial_transactions(tariff_id)",
  "CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(type)",
  "CREATE INDEX IF NOT EXISTS idx_financial_transactions_created_at ON financial_transactions(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_financial_transactions_status ON financial_transactions(status)",
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_order_completed_once ON financial_transactions(order_id, type)
   WHERE type = 'ORDER_COMPLETED' AND status = 'POSTED'`,
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
  "CREATE INDEX IF NOT EXISTS idx_road_alerts_region_status_created_at ON road_alerts(region_id, status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_road_alerts_driver_id ON road_alerts(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_road_alerts_expires_at ON road_alerts(expires_at)",
  "CREATE INDEX IF NOT EXISTS idx_driver_applications_status ON driver_applications(status)",
  "CREATE INDEX IF NOT EXISTS idx_driver_reviews_driver_id ON driver_reviews(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_client_reviews_client_id ON client_reviews(client_id)",
  `INSERT INTO service_settings(id, service_name, city, currency, currency_symbol)
   VALUES (1, 'SmartTaxi', 'Atakent', 'KZT', '₸')
   ON CONFLICT (id) DO NOTHING`,
  `DO $$
  BEGIN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CLIENT','DRIVER','OWNER','FINANCE'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE drivers ADD CONSTRAINT drivers_status_check CHECK (status IN ('OFFLINE','FREE','BUSY','BREAK'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  "ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check",
  `ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('SEARCHING_DRIVER','DRIVER_FOUND','DRIVER_GOING_TO_CLIENT','DRIVER_ARRIVED','WAITING_CLIENT','TRIP_STARTED','TRIP_COMPLETED','PAYMENT_PENDING','PAID','RATED','CANCELLED_BY_CLIENT','CANCELLED_BY_DRIVER','CANCELLED_BY_OPERATOR','NO_SHOW','NEW','DRIVER_ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'))`,
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
  END $$`,
  `DO $$
  BEGIN
    ALTER TABLE tariffs ADD CONSTRAINT tariffs_stage6_pricing_check CHECK (
      surge_multiplier >= 1 AND surge_multiplier <= 10
      AND free_waiting_minutes >= 0
      AND waiting_price_per_minute >= 0
      AND cancellation_fee >= 0
      AND included_km >= 0
      AND included_minutes >= 0
      AND no_show_fee >= 0
      AND zone_surcharge >= 0
      AND night_coefficient >= 1
      AND demand_coefficient >= 1
      AND sort_order >= 0
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // --- Stage: payments module (Kaspi Pay groundwork) ---
  // `payments` already existed (CASH/KASPI only, no PROCESSING state, no
  // provider tracking). Widening it here instead of a new table so the
  // existing order-creation/mark-paid code in orders.routes.js keeps working
  // unchanged while payments.routes.js adds the initiate/status flow on top.
  "ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'MANUAL'",
  "ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb",
  "ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT",
  "ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check",
  "ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('CASH','KASPI','CARD'))",
  "ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check",
  "ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN ('PENDING','PROCESSING','PAID','FAILED','CANCELLED'))",
  `DO $$
  BEGIN
    ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (provider IN ('MANUAL','KASPI_PAY'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)",

  // --- Stage: push notifications (FCM) ---
  `CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios','web')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token)",
  "CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id)",
  `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ORDER_STATUS',
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON notifications(user_id, created_at DESC)",

  // --- Stage: "своя цена" fare bidding ---
  // NULL means the rider accepted the calculated estimate as-is; a value
  // means they raised/lowered it via the stepper and orders.price was set
  // to that instead (see offeredPriceBounds() in orders.routes.js).
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS offered_price_kzt INTEGER",
  `DO $$
  BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_offered_price_positive_check CHECK (offered_price_kzt IS NULL OR offered_price_kzt > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // --- Stage: promo codes ---
  `CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    region_id UUID REFERENCES regions(id) ON DELETE CASCADE,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT','FIXED')),
    discount_value INTEGER NOT NULL CHECK (discount_value > 0),
    max_discount_kzt INTEGER,
    min_order_price_kzt INTEGER NOT NULL DEFAULT 0,
    usage_limit INTEGER,
    per_client_limit INTEGER NOT NULL DEFAULT 1,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_promo_codes_region_id ON promo_codes(region_id)",
  `CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    discount_amount_kzt INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_id ON promo_code_redemptions(promo_code_id)",
  "CREATE INDEX IF NOT EXISTS idx_promo_redemptions_client_id ON promo_code_redemptions(client_id)",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount_kzt INTEGER NOT NULL DEFAULT 0",

  // --- Stage: "поделиться поездкой" public trip tracking ---
  // A random, unguessable token separate from the order's real id/short_id,
  // so a shared link can't be used to enumerate or look up other orders.
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT uuid_generate_v4()",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_share_token ON orders(share_token)",
  "UPDATE orders SET share_token=uuid_generate_v4() WHERE share_token IS NULL",

  // --- Stage: real support tickets ---
  // The admin panel's "Поддержка" page previously had nothing to show —
  // no table backed it at all, so passenger/driver support screens fell
  // back to copy-to-clipboard-and-call. This gives support messages an
  // actual home: submitted from either app, visible and answerable here.
  `CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('CLIENT','DRIVER')),
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL,
    message TEXT NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
    admin_response TEXT,
    responded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_support_messages_status_created_at ON support_messages(status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON support_messages(user_id)",
  "ALTER TABLE road_alerts ADD COLUMN IF NOT EXISTS heading NUMERIC(6,2)",

  // --- Stage: driver wallet & document verification ---
  // Wallet has no separate ledger table: earnings are read back from the
  // existing financial_transactions rows (already written per completed
  // order in orders.routes.js), payouts get their own request/review table.
  // Documents support two owners (pre-account application vs. an existing
  // driver) so the same upload/review flow works for onboarding and later
  // re-verification.
  `CREATE TABLE IF NOT EXISTS driver_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
    driver_application_id UUID REFERENCES driver_applications(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('DRIVER_LICENSE_FRONT','DRIVER_LICENSE_BACK','ID_CARD_FRONT','ID_CARD_BACK','VEHICLE_REGISTRATION','INSURANCE_POLICY','PROFILE_PHOTO','OTHER')),
    file_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    rejection_reason TEXT,
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `DO $$
  BEGIN
    ALTER TABLE driver_documents ADD CONSTRAINT driver_documents_owner_check CHECK (driver_id IS NOT NULL OR driver_application_id IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  "CREATE INDEX IF NOT EXISTS idx_driver_documents_driver_id ON driver_documents(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_documents_application_id ON driver_documents(driver_application_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_documents_status ON driver_documents(status)",

  `CREATE TABLE IF NOT EXISTS driver_payout_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    amount_kzt INTEGER NOT NULL CHECK (amount_kzt > 0),
    method TEXT NOT NULL DEFAULT 'KASPI_TRANSFER' CHECK (method IN ('KASPI_TRANSFER','CASH')),
    payout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','PAID','REJECTED','CANCELLED')),
    rejection_reason TEXT,
    provider_reference TEXT,
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_driver_payout_requests_driver_id ON driver_payout_requests(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_payout_requests_status ON driver_payout_requests(status)",

  // --- Stage: driver price counter-offer ("торг") ---
  // A driver can propose a different price on a still-open order without
  // taking it — the order stays visible to everyone else until the rider
  // explicitly accepts this specific offer (which then assigns the order to
  // this driver, same as a normal accept).
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_offer_price_kzt INTEGER",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_offer_status TEXT",
  `DO $$
  BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_driver_offer_status_check CHECK (driver_offer_status IS NULL OR driver_offer_status IN ('PENDING','ACCEPTED','DECLINED'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_offer_by_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_offer_created_at TIMESTAMPTZ",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_offer_responded_at TIMESTAMPTZ",

  // --- Stage: two-way price negotiation ("торг") ---
  // The rider used to only be able to accept/decline whatever price a driver
  // proposed. This lets the rider counter back with their own number, which
  // the driver can then accept, decline, or counter again -- the same
  // pending-offer slot on the order just flips whose turn it is via this
  // column instead of needing a separate table for a back-and-forth that
  // never has more than one live proposal at a time.
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_offer_proposed_by TEXT",
  `DO $$
  BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_driver_offer_proposed_by_check CHECK (driver_offer_proposed_by IS NULL OR driver_offer_proposed_by IN ('DRIVER','CLIENT'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // --- Stage: client favorite addresses ---
  `CREATE TABLE IF NOT EXISTS client_favorite_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'OTHER' CHECK (label IN ('HOME','WORK','OTHER')),
    title TEXT NOT NULL,
    address_text TEXT NOT NULL,
    lat NUMERIC(10,6) NOT NULL,
    lng NUMERIC(10,6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_client_favorite_addresses_client_id ON client_favorite_addresses(client_id)",

  // --- Stage: favorite / blocked drivers ---
  // BLOCKED entries are checked by the dispatch feed (listOrdersForDriver)
  // so a driver a rider blocked never sees that rider's future orders.
  `CREATE TABLE IF NOT EXISTS client_driver_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('FAVORITE','BLOCKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(client_id, driver_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_client_driver_preferences_client_id ON client_driver_preferences(client_id)",
  "CREATE INDEX IF NOT EXISTS idx_client_driver_preferences_driver_id ON client_driver_preferences(driver_id)",

  // --- Stage: referral program ---
  "ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code TEXT",
  // UNIQUE constraints are backed by an index, so re-adding one Postgres
  // already created raises duplicate_table (42P07), not duplicate_object
  // (42710) like the CHECK-constraint DO-blocks elsewhere in this file —
  // this is the only UNIQUE constraint added this way, and the mismatched
  // exception class is exactly why it crashed every redeploy after the
  // first one that successfully created it.
  `DO $$
  BEGIN
    ALTER TABLE clients ADD CONSTRAINT clients_referral_code_key UNIQUE (referral_code);
  EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
  END $$`,
  "ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by_client_id UUID REFERENCES clients(id) ON DELETE SET NULL",
  "ALTER TABLE service_settings ADD COLUMN IF NOT EXISTS referral_bonus_kzt INTEGER NOT NULL DEFAULT 500",

  // --- Stage: recurring bookings ("школьный маршрут") ---
  // last_triggered_date isn't in the original spec but is required to
  // actually satisfy "не дублировать в один день" — the scheduler sets it
  // the moment it successfully creates today's order and skips any booking
  // already stamped with today's date.
  `CREATE TABLE IF NOT EXISTS recurring_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    pickup_text TEXT NOT NULL,
    pickup_lat NUMERIC(10,6) NOT NULL,
    pickup_lng NUMERIC(10,6) NOT NULL,
    dropoff_text TEXT NOT NULL,
    dropoff_lat NUMERIC(10,6) NOT NULL,
    dropoff_lng NUMERIC(10,6) NOT NULL,
    days_of_week INTEGER[] NOT NULL,
    time_of_day TIME NOT NULL,
    price_kzt INTEGER NOT NULL CHECK (price_kzt > 0),
    status TEXT NOT NULL DEFAULT 'PENDING_DRIVER' CHECK (status IN ('PENDING_DRIVER','ACTIVE','PAUSED','CANCELLED')),
    notes TEXT NOT NULL DEFAULT '',
    last_triggered_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_recurring_bookings_client_id ON recurring_bookings(client_id)",
  "CREATE INDEX IF NOT EXISTS idx_recurring_bookings_driver_id ON recurring_bookings(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_recurring_bookings_status ON recurring_bookings(status)",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS recurring_booking_id UUID REFERENCES recurring_bookings(id) ON DELETE SET NULL",

  // --- Overnight: driver cancels after accepting reopens the order for
  // dispatch instead of dead-ending in CANCELLED_BY_DRIVER (orders.routes.js
  // /:id/cancel). The cancelling driver is remembered per-order so the same
  // driver never sees this specific order again in listOrdersForDriver
  // (order-dispatch.service.js).
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_cancelled_by_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_cancelled_by_driver_at TIMESTAMPTZ",
  "CREATE INDEX IF NOT EXISTS idx_orders_last_cancelled_by_driver_id ON orders(last_cancelled_by_driver_id)",

  // --- Stage: server symmetry (driver rates client, driver favorites/blocks client) ---
  // Mirrors drivers.rating: kept in sync on every new client_reviews row by
  // POST /orders/:id/rate-client (orders.routes.js), same pattern as
  // drivers.rating being recomputed on POST /orders/:id/rate.
  "ALTER TABLE clients ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) NOT NULL DEFAULT 5.00",
  // Mirrors client_driver_preferences but in the opposite direction — a
  // BLOCKED entry here is checked by the dispatch feed (listOrdersForDriver)
  // and the accept/offer entry points, so a client a driver blocked never
  // has their orders offered to that driver again.
  `CREATE TABLE IF NOT EXISTS driver_client_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('FAVORITE','BLOCKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(driver_id, client_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_driver_client_preferences_driver_id ON driver_client_preferences(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_client_preferences_client_id ON driver_client_preferences(client_id)",

  // --- Stage: camera-only driver avatar, shown to passengers on the order ---
  // A separate table, not a column on drivers — `drivers` is read all over
  // this codebase with SELECT *, and a BYTEA column there would put raw
  // image bytes in every one of those payloads. Stored directly in Postgres
  // rather than on disk: Railway's container filesystem doesn't survive a
  // redeploy (see the driver-documents upload dir, which has the same
  // exposure), and a single compressed face photo is small enough that a
  // BYTEA row is simpler than standing up external object storage for it.
  `CREATE TABLE IF NOT EXISTS driver_avatars (
    driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
    data BYTEA NOT NULL,
    mime TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // --- Retire the OPERATOR role: OWNER already had every permission
  // OPERATOR did (every route was already gated OWNER+OPERATOR, never
  // OPERATOR alone), so this is a pure cleanup, not a permission change.
  // Reassign any existing OPERATOR user(s) to OWNER *before* tightening the
  // constraint, otherwise the ADD CONSTRAINT below would fail on a
  // database that already has an OPERATOR row (e.g. the seeded
  // operator@smarttaxi.local account from before this migration).
  "UPDATE users SET role='OWNER' WHERE role='OPERATOR'",
  "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check",
  "ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CLIENT','DRIVER','OWNER','FINANCE'))",

  // --- Raffles: named date windows admins tag onto the driver leaderboard
  // (QualityPage's "За розыгрыш" filter) — no prize/entry/winner tracking,
  // just a labeled starts_at/ends_at pair the leaderboard query filters by.
  // The admin UI for this already existed (create/list/delete) with no
  // backend behind it at all.
  `CREATE TABLE IF NOT EXISTS raffles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_raffles_starts_at ON raffles(starts_at DESC)",

  // --- Live "km driven so far" trip counter (purely informational — every
  // tariff is fixed-price today, this never affects the charged amount).
  // Accumulated ping-by-ping in routing.service.js's updateDriverLocation
  // while the order is TRIP_STARTED/IN_PROGRESS; NULL/0 the rest of the
  // order's life.
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_traveled_m INTEGER NOT NULL DEFAULT 0",

  // --- Driver's explicitly-saved payout destination (Settings -> "Способ
  // выплаты"), distinct from driver_payout_requests.payout_details (a log of
  // what each past request actually used). Before this, "details on file"
  // meant only "whatever the last payout request happened to carry" —
  // useful as a fallback, but there was no way to set/change a payout
  // destination without submitting a real withdrawal first. wallet.routes.js
  // now checks this column before falling back to request history.
  "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS payout_method TEXT",
  "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS payout_details JSONB NOT NULL DEFAULT '{}'::jsonb",

  // --- Client-facing balance/card-binding scaffold. cashback_balance
  // (already on `clients`) remains the only real spendable balance for now —
  // client-wallet.routes.js exposes it through a wallet-shaped summary so the
  // mobile app has one stable contract to build against. client_cards is
  // store-only (Luhn-checked, never charged/tokenized), same trust model as
  // driver_payout_requests.payout_details. client_topup_requests records
  // top-up intent only and stays PENDING until real Kaspi Pay top-up
  // integration (coming separately) can move it to COMPLETED/FAILED — see
  // client-wallet.service.js for both.
  `CREATE TABLE IF NOT EXISTS client_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    card_number TEXT NOT NULL,
    holder_name TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_client_cards_client_id ON client_cards(client_id)",

  `CREATE TABLE IF NOT EXISTS client_topup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    amount_kzt INTEGER NOT NULL CHECK (amount_kzt > 0),
    method TEXT NOT NULL DEFAULT 'KASPI_PAY' CHECK (method IN ('KASPI_PAY')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED','CANCELLED')),
    provider_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_client_topup_requests_client_id ON client_topup_requests(client_id)",
  "CREATE INDEX IF NOT EXISTS idx_client_topup_requests_status ON client_topup_requests(status)",

  // --- Recurring bookings: surface a skipped day instead of silently
  // swallowing it. The scheduler used to just console.warn and return when
  // it couldn't dispatch today's ride (driver busy/out of region/not
  // dispatch-ready/etc) -- the booking stayed ACTIVE with nothing to show
  // the parent relying on it that today's ride didn't happen. last_skip_date
  // mirrors last_triggered_date's own dedup pattern (compared against
  // CURRENT_DATE) so a booking that fails every retry tick within one
  // trigger window only records/notifies once, and is cleared back to NULL
  // the moment the booking successfully dispatches again.
  "ALTER TABLE recurring_bookings ADD COLUMN IF NOT EXISTS last_skip_date DATE",
  "ALTER TABLE recurring_bookings ADD COLUMN IF NOT EXISTS last_skip_reason TEXT",
  `DO $$
  BEGIN
    ALTER TABLE recurring_bookings ADD CONSTRAINT recurring_bookings_last_skip_reason_check CHECK (last_skip_reason IS NULL OR last_skip_reason IN ('CLIENT_MISSING','DRIVER_MISSING','ROUTE_UNAVAILABLE','DRIVER_OUT_OF_REGION','DRIVER_NOT_READY','DRIVER_BUSY'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`
];

export async function runMigrations() {
  for (const sql of statements) {
    await query(sql);
  }
}

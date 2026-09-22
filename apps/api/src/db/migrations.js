import { readFile } from "node:fs/promises";
import { pool } from "./pool.js";
import { REGION_SEED } from "../modules/routing/region-geo.js";

// These statements are executed as plain strings, so the seed values are
// inlined rather than bound. They come from REGION_SEED, not from a request,
// but the quote doubling stays: a region name is the kind of value that
// eventually gets edited by a person.
const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

const statements = [
  "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL",
  "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL",
  "ALTER TABLE driver_applications ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE SET NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS driver_applications_open_user ON driver_applications(user_id) WHERE user_id IS NOT NULL AND status IN ('PENDING','NEEDS_INFO','APPROVED')",
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
  // Built from REGION_SEED, not hand-written: the same 13 regions used to be
  // spelled out again here and had already drifted from the code that reads
  // them (Мырзакент's centre by 600 m, Мақтаарал's name by one letter, which
  // silently doubled its address-search radius).
  `INSERT INTO regions(code, name, boundary, center_lat, center_lng, currency, is_active)
   VALUES
     ${REGION_SEED.map((region) => [
       sqlText(region.code),
       sqlText(region.name),
       `${sqlText(JSON.stringify(region.boundary))}::jsonb`,
       region.centerLat.toFixed(6),
       region.centerLng.toFixed(6),
       sqlText(region.currency),
       String(region.isActive)
     ].join(", ")).map((values) => `(${values})`).join(",\n     ")}
   ON CONFLICT (code) DO UPDATE
   SET name=EXCLUDED.name,
       boundary=EXCLUDED.boundary,
       center_lat=EXCLUDED.center_lat,
       center_lng=EXCLUDED.center_lng,
       currency=EXCLUDED.currency,
       is_active=EXCLUDED.is_active,
       updated_at=NOW()`,
  // Разовые правки, которые нельзя повторять при каждом запуске.
  //
  // Все остальные строки в этом файле идемпотентны: их можно выполнять хоть
  // сто раз. Но "поставить комиссию 7 процентов" — не такая правка. Если
  // выполнять её каждый раз, владелец больше никогда не сможет изменить
  // комиссию из панели: следующий деплой вернёт её обратно. Отметка о
  // выполнении делает правку однократной.
  // Язык человека. Пуш показывает операционная система, часто когда
  // приложение закрыто, — перевести его на клиенте нельзя. Без этой
  // колонки сервер не знает, на каком языке писать, и пишет по-русски всем.
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'ru'",
  `DO $$
   BEGIN
     ALTER TABLE users ADD CONSTRAINT users_locale_check CHECK (locale IN ('ru','kk','uz','zh'));
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `CREATE TABLE IF NOT EXISTS schema_one_time_changes (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Оферта обещает водителю 7 процентов с заказа, а в тарифах стояло 15.
  // Расхождение между тем, что подписано, и тем, что списывается, лечится
  // в пользу подписанного.
  `WITH claim AS (
     INSERT INTO schema_one_time_changes(name) VALUES ('service_commission_7_percent')
     ON CONFLICT (name) DO NOTHING
     RETURNING name
   )
   UPDATE tariffs SET service_commission_percent=7, updated_at=NOW()
   WHERE EXISTS (SELECT 1 FROM claim) AND service_commission_percent <> 7`,
  // Существующие строки поправлены выше, но умолчание самой колонки в базах,
  // созданных раньше, осталось 15: schema.sql видят только новые базы. Тариф,
  // добавленный без явного процента, молча получал бы ставку, которой нет ни
  // в оферте, ни в панели.
  // Кешбэк включён: 0,8 процента с поездки. Поездка за 400 ₸ возвращает
  // пассажиру 3 ₸, за 1 000 ₸ — 8 ₸. Один раз: дальше ставка живёт в панели,
  // и следующий деплой не отменит решение владельца.
  `WITH claim AS (
     INSERT INTO schema_one_time_changes(name) VALUES ('cashback_0_8_percent')
     ON CONFLICT (name) DO NOTHING
     RETURNING name
   )
   UPDATE tariffs SET cashback_percent=0.8, updated_at=NOW()
   WHERE EXISTS (SELECT 1 FROM claim) AND cashback_percent = 0`,
  // Низкий рейтинг поднимает карточку на разбор, а не блокирует сам.
  //
  // Раньше пятый отзыв, уронивший среднюю ниже трёх, отключал водителя
  // мгновенно и без единого живого взгляда. Пять поездок — это первая неделя
  // нового водителя, и этого же хватает, чтобы свести с кем-то счёты. Решение
  // лишить человека заработка принимает человек.
  `CREATE TABLE IF NOT EXISTS driver_rating_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    average_rating NUMERIC(3,2) NOT NULL,
    review_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','BLOCKED','DISMISSED')),
    resolution_note TEXT,
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_driver_rating_cases_status ON driver_rating_cases(status, created_at DESC)",
  // Одна открытая карточка на водителя: каждый следующий низкий отзыв не
  // должен плодить копии одной и той же жалобы.
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_rating_cases_one_open ON driver_rating_cases(driver_id) WHERE status = 'PENDING'",
  "ALTER TABLE tariffs ALTER COLUMN cashback_percent SET DEFAULT 1",
  // Ставка поднята с 0,8 до 1 процента: число круглое, его легко назвать
  // вслух, и при поездке за 700 ₸ человек получает 7 ₸ вместо 6. Трогаем
  // только те тарифы, где стоит ровно прежние 0,8 — если владелец уже
  // поставил своё число в панели, оно остаётся.
  `WITH claim AS (
     INSERT INTO schema_one_time_changes(name) VALUES ('cashback_1_percent')
     ON CONFLICT (name) DO NOTHING
     RETURNING name
   )
   UPDATE tariffs SET cashback_percent=1, updated_at=NOW()
   WHERE EXISTS (SELECT 1 FROM claim) AND cashback_percent = 0.8`,
  // Кешбэк — за поездку, не за посылку: отправитель выбирает доставку по
  // сроку и цене, а не копит на бесплатную. Трогаем только те тарифы
  // доставки, где стоит поставленная нами единица.
  `WITH claim AS (
     INSERT INTO schema_one_time_changes(name) VALUES ('delivery_cashback_off')
     ON CONFLICT (name) DO NOTHING
     RETURNING name
   )
   UPDATE tariffs SET cashback_percent=0, updated_at=NOW()
   WHERE EXISTS (SELECT 1 FROM claim) AND name='Delivery' AND cashback_percent = 1`,
  // Когда водитель был на линии. Без этого «заработок в час» не из чего
  // считать: в drivers лежит только текущий статус, истории нет.
  //
  // Смена открывается, когда водитель уходит с OFFLINE, и закрывается, когда
  // возвращается. Переходы FREE <-> BUSY смену не трогают: и то и другое —
  // время на линии.
  `CREATE TABLE IF NOT EXISTS driver_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    ended_reason TEXT
  )`,
  // Район записывается на смене, а не берётся из водителя при чтении: он
  // переезжает, и тогда вчерашние часы Жетысая уехали бы в Мырзакент, а
  // заработок одного района делился бы на часы другого.
  "ALTER TABLE driver_shifts ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id) ON DELETE SET NULL",
  "CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver ON driver_shifts(driver_id, started_at DESC)",
  // Открытая смена может быть только одна: иначе часы посчитаются дважды.
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_shifts_one_open ON driver_shifts(driver_id) WHERE ended_at IS NULL",
  "ALTER TABLE tariffs ALTER COLUMN service_commission_percent SET DEFAULT 7",
  "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_region_id UUID REFERENCES regions(id) ON DELETE SET NULL",
  // Телефон поддержки у каждого района свой: publicRegion его уже отдавал,
  // а колонки под него не было, и поле молча исчезало из ответа.
  "ALTER TABLE regions ADD COLUMN IF NOT EXISTS support_phone TEXT NOT NULL DEFAULT ''",
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
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashback_used INTEGER NOT NULL DEFAULT 0",
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
      ('Economy','Эконом','Фиксированная цена. Быстро и выгодно',700,0,0,700,7,1,1,3,50,0,10,true),
      ('Delivery','Доставка','Фиксированная цена. Посылки и небольшие грузы',800,0,0,800,7,0,1,3,50,0,30,true)
   ) AS seed(name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order,is_active)
   WHERE r.code IN ('ATAKENT','MYRZAKENT','ZHETYSAY','SHYMKENT','KIROV','ASYKATA','DOSTYK','YNTYMAK','BIRLIK','FIRDOUSI','ZHANA_ZHOL','MAKTAARAL','ATAMEKEN')
   ON CONFLICT (region_id, name) DO NOTHING`,
  // В сервисе два тарифа: Эконом и Доставка. Комфорт и Бизнес больше не
  // предлагаются, но строки остаются: на них ссылаются завершённые заказы и
  // проводки, а имя тарифа хранится в заказе текстом. Отключённый тариф
  // исчезает из выбора пассажира, удалённый — обрывает историю.
  `WITH claim AS (
     INSERT INTO schema_one_time_changes(name) VALUES ('retire_comfort_and_business')
     ON CONFLICT (name) DO NOTHING
     RETURNING name
   )
   UPDATE tariffs SET is_active=false, updated_at=NOW()
   WHERE EXISTS (SELECT 1 FROM claim) AND name IN ('Comfort','Business') AND is_active`,
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
    service_name TEXT NOT NULL DEFAULT 'BaiSapar',
    city TEXT NOT NULL DEFAULT 'Atakent',
    currency TEXT NOT NULL DEFAULT 'KZT',
    currency_symbol TEXT NOT NULL DEFAULT '₸',
    default_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 7,
    auto_approve_drivers BOOLEAN NOT NULL DEFAULT false,
    auto_assign_orders BOOLEAN NOT NULL DEFAULT false,
    support_phone TEXT NOT NULL DEFAULT '',
    sos_phone TEXT NOT NULL DEFAULT '112',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT service_settings_singleton CHECK (id = 1)
  )`,
  // Здесь же, а не рядом с тарифами: таблица настроек создаётся ниже по
  // списку, и обращаться к ней раньше нельзя.
  `WITH claim AS (
     INSERT INTO schema_one_time_changes(name) VALUES ('default_commission_7_percent')
     ON CONFLICT (name) DO NOTHING
     RETURNING name
   )
   UPDATE service_settings SET default_commission_percent=7, updated_at=NOW()
   WHERE EXISTS (SELECT 1 FROM claim) AND default_commission_percent <> 7`,
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
    payment_method TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (payment_method IN ('CASH','KASPI_TRANSFER','CASHBACK','UNKNOWN')),
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
   VALUES (1, 'BaiSapar', 'Atakent', 'KZT', '₸')
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
  "ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('CASH','KASPI','CARD','CASHBACK'))",
  "ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_payment_method_check",
  "ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_payment_method_check CHECK (payment_method IN ('CASH','KASPI_TRANSFER','CASHBACK','MIXED','UNKNOWN'))",
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
  "ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS data BYTEA",

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
  // Never ship a generated number as an operator or emergency contact.  An
  // empty support number makes clients use the in-app support form, while 112
  // remains a safe emergency fallback until an operator configures a local
  // service number in the admin panel.
  "ALTER TABLE service_settings ALTER COLUMN support_phone SET DEFAULT ''",
  "ALTER TABLE service_settings ALTER COLUMN sos_phone SET DEFAULT '112'",
  "UPDATE service_settings SET support_phone='' WHERE support_phone='+77000000000'",
  "UPDATE service_settings SET sos_phone='112' WHERE sos_phone='+77000000000'",

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
  END $$`,
  // Долг выше потолка закрывает водителю новые наличные заказы. Регулярный
  // рейс раздавал их мимо этой проверки, потому что назначает водителя сам.
  // У пропуска теперь своя причина: её видно и владельцу в панели, и водителю
  // у себя, иначе «водитель не готов» ничего никому не объясняет.
  "ALTER TABLE recurring_bookings DROP CONSTRAINT IF EXISTS recurring_bookings_last_skip_reason_check",
  `ALTER TABLE recurring_bookings ADD CONSTRAINT recurring_bookings_last_skip_reason_check
     CHECK (last_skip_reason IS NULL OR last_skip_reason = ANY (ARRAY[
       'CLIENT_MISSING','DRIVER_MISSING','ROUTE_UNAVAILABLE',
       'DRIVER_OUT_OF_REGION','DRIVER_NOT_READY','DRIVER_BUSY','DRIVER_DEBT_LIMIT'
     ]))`,

  // --- Driver wallet top-up requests ---
  // Mirrors client_topup_requests exactly (same PENDING-until-real-Kaspi-Pay
  // scaffold, see client-wallet.service.js) but for the driver side: a
  // driver in debt (CASH trip commissions accrue as debt, never balance --
  // see finance.service.js) had no way to signal "I paid this off" short of
  // contacting an owner directly. This records the intent; an owner/finance
  // user still applies it manually via the existing debt-adjustment admin
  // action once the transfer is actually confirmed out-of-band.
  `CREATE TABLE IF NOT EXISTS driver_topup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    amount_kzt INTEGER NOT NULL CHECK (amount_kzt > 0),
    method TEXT NOT NULL DEFAULT 'KASPI_PAY' CHECK (method IN ('KASPI_PAY')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED','CANCELLED')),
    provider_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_driver_topup_requests_driver_id ON driver_topup_requests(driver_id)",
  "CREATE INDEX IF NOT EXISTS idx_driver_topup_requests_status ON driver_topup_requests(status)",

  // --- Single active session per account ---
  // JWTs are otherwise stateless: once issued, a token stays valid until
  // its natural expiry with no server-side way to revoke it early. That
  // meant two people could use the same account from two devices at once
  // indefinitely, and /auth/logout did nothing but write an audit row --
  // the token itself kept working. session_version is embedded in every
  // newly-issued token (see common/auth.js's signToken/rotateSessionVersion)
  // and checked on every request; rotating it (on real login, password
  // reset, and logout -- NOT on /refresh, which continues the same
  // session) invalidates every token issued before the rotation
  // immediately. Existing rows getting a fresh random value here means
  // every currently-logged-in session everywhere gets invalidated once —
  // an expected, one-time side effect of shipping this, not a bug.
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version UUID NOT NULL DEFAULT uuid_generate_v4()",

  // --- Queued driver price offers (торг with multiple competing drivers) ---
  // orders.driver_offer_* is a single slot: only one driver's offer can be
  // "the" pending offer at a time. A second driver submitting one used to
  // silently overwrite the first (see order-dispatch.service.js's old
  // submitDriverPriceOffer comment) -- the rider lost the first driver's
  // offer entirely with no way to still accept it, and no signal that a
  // second driver even offered. This table holds any offer submitted while
  // a DIFFERENT driver's is already primary: the rider keeps seeing the
  // first driver's offer as before, and queued ones surface as a
  // notification the rider can promote into the primary slot (see
  // promoteQueuedPriceOffer) instead of losing them.
  `CREATE TABLE IF NOT EXISTS order_price_offer_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    price_kzt INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROMOTED','EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_order_price_offer_queue_order_status ON order_price_offer_queue(order_id, status)",
  // Guards against the same driver stacking multiple queued rows for one
  // order -- resubmitting while already queued should revise their queued
  // price (see submitDriverPriceOffer's ON CONFLICT), not add a second row.
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_order_price_offer_queue_order_driver_pending ON order_price_offer_queue(order_id, driver_id) WHERE status='PENDING'",
  // Local address gazetteer, harvested from OSM per region (see
  // tools/import-addresses.js). Live geocoding stays as the fallback for
  // anything not held here, but most of what a rider actually types -- a
  // street, a house number, a shop or clinic by name -- is already in OSM
  // for these towns (Атакент alone has ~2.9k house numbers, Шымкент ~99k)
  // and can be answered locally and instantly, with no third-party rate
  // limit sitting in the request path.
  `CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    -- 'housenumber' | 'street' | 'building' | 'poi'
    kind TEXT NOT NULL,
    -- What the rider sees and searches against, composed at import time
    -- ("улица Бектасова, 12", "Магазин Береке").
    label TEXT NOT NULL,
    street TEXT,
    housenumber TEXT,
    name TEXT,
    lat NUMERIC(10,6) NOT NULL,
    lng NUMERIC(10,6) NOT NULL,
    -- OSM element identity, so a re-import updates rather than duplicates.
    osm_type TEXT NOT NULL,
    osm_id BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_osm ON addresses(osm_type, osm_id)",
  "CREATE INDEX IF NOT EXISTS idx_addresses_region ON addresses(region_id)",
  // Trigram index over the label: substring matching that still works when
  // the rider types the middle of a name rather than its start, which a
  // plain prefix index would miss.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  "CREATE INDEX IF NOT EXISTS idx_addresses_label_trgm ON addresses USING gin(label gin_trgm_ops)",
  // Streets here are named both ways in daily use — "Бектасова" and
  // "Бектасов көшесі" are the same street, and riders type whichever comes
  // to mind. OSM carries one spelling in `name` and frequently the other in
  // `name:ru`/`name:kk`; 1 420 of Мырзакент's 26 715 harvested rows carry
  // more than one. search_text holds the label plus every spelling found,
  // so a single index answers a query in either language.
  "ALTER TABLE addresses ADD COLUMN IF NOT EXISTS search_text TEXT",
  "UPDATE addresses SET search_text = label WHERE search_text IS NULL",
  "CREATE INDEX IF NOT EXISTS idx_addresses_search_trgm ON addresses USING gin(search_text gin_trgm_ops)",
  // The row count alone cannot identify an address snapshot: names, kinds and
  // search aliases can change while the number of OSM objects stays exactly
  // the same. Store the applied file digest per region so a new catalogue is
  // never skipped merely because its cardinality matches the old one.
  `CREATE TABLE IF NOT EXISTS address_catalog_snapshots (
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(region_id, source)
  )`,

  // --- Intercity routes ---
  // Explicit, directional route configuration makes a cross-region booking
  // safe to price and dispatch.  The initial active pairs cover all current
  // service regions; operations can pause/tune a direction without disabling
  // either city itself.
  `CREATE TABLE IF NOT EXISTS intercity_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    origin_region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    destination_region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    max_distance_km INTEGER NOT NULL DEFAULT 350 CHECK (max_distance_km BETWEEN 1 AND 1000),
    max_duration_min INTEGER NOT NULL DEFAULT 720 CHECK (max_duration_min BETWEEN 1 AND 1440),
    base_surcharge_kzt INTEGER NOT NULL DEFAULT 0 CHECK (base_surcharge_kzt >= 0),
    price_per_km_override INTEGER,
    min_price_override INTEGER,
    requires_destination_approval BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (origin_region_id <> destination_region_id),
    CHECK (price_per_km_override IS NULL OR price_per_km_override >= 0),
    CHECK (min_price_override IS NULL OR min_price_override >= 0),
    UNIQUE(origin_region_id, destination_region_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_intercity_routes_origin_active ON intercity_routes(origin_region_id, is_active)",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS dropoff_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_intercity BOOLEAN NOT NULL DEFAULT false",
  "CREATE INDEX IF NOT EXISTS idx_orders_dropoff_region_id ON orders(dropoff_region_id)",
  `INSERT INTO intercity_routes(
      origin_region_id, destination_region_id, is_active, max_distance_km,
      max_duration_min, base_surcharge_kzt, price_per_km_override,
      min_price_override, requires_destination_approval
    )
    SELECT origin.id, destination.id, true, 350, 720, 0, 140, 1800, true
    FROM regions origin
    CROSS JOIN regions destination
    WHERE origin.is_active=true AND destination.is_active=true AND origin.id <> destination.id
    ON CONFLICT (origin_region_id, destination_region_id) DO NOTHING`,

  // --- Taxi stands (стоянки) ---
  // A stand is a real physical place drivers queue at — the межгород/по городу
  // lines that already exist off-app. The owner draws it on the map (point +
  // radius), and that radius is the geofence a driver must physically be inside
  // to join or hold a place in the line, so nobody joins the queue from home.
  `CREATE TABLE IF NOT EXISTS taxi_stands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'CITY' CHECK (kind IN ('CITY','INTERCITY')),
    lat NUMERIC(10,6) NOT NULL,
    lng NUMERIC(10,6) NOT NULL,
    radius_m INTEGER NOT NULL DEFAULT 120 CHECK (radius_m BETWEEN 20 AND 2000),
    boarding_slots INTEGER NOT NULL DEFAULT 1 CHECK (boarding_slots BETWEEN 1 AND 10),
    default_seats INTEGER NOT NULL DEFAULT 4 CHECK (default_seats BETWEEN 1 AND 20),
    is_active BOOLEAN NOT NULL DEFAULT true,
    note TEXT,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_taxi_stands_region_active ON taxi_stands(region_id, is_active)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_taxi_stands_region_name ON taxi_stands(region_id, lower(name))",

  // One row per driver's place in a stand's line. queue_seq (not joined_at) is
  // the ordering key, because handing your turn to the driver next to you has
  // to move exactly one place without renumbering the rest of the line — the
  // receiving entry simply takes the giver's seq. WAITING/BOARDING are the two
  // live states; the partial unique index below is what enforces "a driver
  // holds a place in exactly one line at a time".
  `CREATE TABLE IF NOT EXISTS taxi_stand_queue_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stand_id UUID NOT NULL REFERENCES taxi_stands(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'WAITING'
      CHECK (status IN ('WAITING','BOARDING','DEPARTED','LEFT','EXPIRED')),
    queue_seq BIGINT NOT NULL,
    destination_label TEXT,
    destination_region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    price_per_seat INTEGER CHECK (price_per_seat IS NULL OR price_per_seat >= 0),
    total_seats INTEGER NOT NULL DEFAULT 4 CHECK (total_seats BETWEEN 1 AND 20),
    taken_seats INTEGER NOT NULL DEFAULT 0 CHECK (taken_seats >= 0),
    comment TEXT,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    boarding_started_at TIMESTAMPTZ,
    departed_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    left_reason TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_lat NUMERIC(10,6),
    last_lng NUMERIC(10,6),
    received_turn_from_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    gave_turn_to_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (taken_seats <= total_seats)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_stand_queue_one_live_per_driver
     ON taxi_stand_queue_entries(driver_id)
     WHERE status IN ('WAITING','BOARDING')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_stand_queue_live_seq
     ON taxi_stand_queue_entries(stand_id, queue_seq)
     WHERE status IN ('WAITING','BOARDING')`,
  "CREATE INDEX IF NOT EXISTS idx_stand_queue_stand_status_seq ON taxi_stand_queue_entries(stand_id, status, queue_seq)",
  "CREATE INDEX IF NOT EXISTS idx_stand_queue_driver_created ON taxi_stand_queue_entries(driver_id, created_at DESC)",
  // A driver who drives away keeps their place for a short grace period —
  // stepping out of the geofence for a minute (fuel, a shop) must not cost
  // them the line, but leaving for good has to. outside_since is when the
  // last heartbeat first landed outside the radius; the sweeper drops the
  // entry once that has held long enough.
  "ALTER TABLE taxi_stand_queue_entries ADD COLUMN IF NOT EXISTS outside_since TIMESTAMPTZ",

  // Seats a rider claimed. APP rows start PENDING and wait for the driver to
  // confirm; PHONE/WALK_IN rows are what the driver's own "+1 место" button
  // writes, so a seat taken over the phone is still an auditable row rather
  // than an untraceable counter bump. taken_seats on the entry is maintained
  // alongside these rows inside the same transaction.
  `CREATE TABLE IF NOT EXISTS taxi_stand_seat_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID NOT NULL REFERENCES taxi_stand_queue_entries(id) ON DELETE CASCADE,
    stand_id UUID NOT NULL REFERENCES taxi_stands(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    seats INTEGER NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 8),
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','CONFIRMED','DECLINED','CANCELLED','EXPIRED','BOARDED')),
    source TEXT NOT NULL DEFAULT 'APP' CHECK (source IN ('APP','PHONE','WALK_IN')),
    pickup_label TEXT,
    pickup_lat NUMERIC(10,6),
    pickup_lng NUMERIC(10,6),
    comment TEXT,
    expires_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_stand_reservations_entry_status ON taxi_stand_seat_reservations(entry_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_stand_reservations_client_created ON taxi_stand_seat_reservations(client_id, created_at DESC)",
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_stand_reservations_one_live_per_client
     ON taxi_stand_seat_reservations(client_id)
     WHERE client_id IS NOT NULL AND status IN ('PENDING','CONFIRMED')`,

  // --- Cancellation review ---
  // Drivers who find a rider through the app and then cancel (or talk the rider
  // into cancelling) so the trip never books a commission are what this
  // records. Nothing is charged automatically: each cancellation is scored from
  // facts the server already holds — how long after arrival, how close the car
  // was, whether the same driver/rider pair keeps doing it — and the owner
  // decides. signals is the human-readable evidence list shown in review.
  `CREATE TABLE IF NOT EXISTS order_cancellation_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    region_id UUID REFERENCES regions(id) ON DELETE SET NULL,
    cancelled_by TEXT NOT NULL CHECK (cancelled_by IN ('DRIVER','CLIENT','OPERATOR','SYSTEM')),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    from_status TEXT NOT NULL,
    reason_code TEXT,
    reason_note TEXT,
    risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    order_price INTEGER,
    service_commission INTEGER,
    seconds_since_accept INTEGER,
    seconds_since_arrival INTEGER,
    driver_distance_to_pickup_m INTEGER,
    driver_lat NUMERIC(10,6),
    driver_lng NUMERIC(10,6),
    follow_up_status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (follow_up_status IN ('PENDING','OBSERVED','SKIPPED')),
    follow_up_checked_at TIMESTAMPTZ,
    follow_up_distance_from_pickup_m INTEGER,
    follow_up_distance_to_dropoff_m INTEGER,
    review_status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (review_status IN ('PENDING','CLEARED','CONFIRMED_FRAUD','DISMISSED')),
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE INDEX IF NOT EXISTS idx_cancellation_audits_review ON order_cancellation_audits(review_status, risk_score DESC, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_cancellation_audits_driver ON order_cancellation_audits(driver_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_cancellation_audits_client ON order_cancellation_audits(client_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_cancellation_audits_follow_up ON order_cancellation_audits(follow_up_status, created_at)",
  // The driver's own stated reason, captured at the moment of cancellation:
  // "rider never came out" is a legitimate cancellation and has to be
  // distinguishable in review from a silent one.
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_cancel_reason_code TEXT",
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_cancel_reason_note TEXT",
  // The service renamed itself to BaiSapar. Only a row still carrying the old
  // default is touched: an owner who typed their own name in admin settings
  // keeps it.
  `UPDATE service_settings SET service_name='BaiSapar' WHERE service_name='SmartTaxi'`,

  // One driver, one vote per road alert.
  //
  // /confirm and /expire only moved counters, so the same driver could tap
  // either one as many times as they liked: eight confirmations drove any
  // report to full confidence, and five dismissals expired any report at all
  // — including an accident several other drivers had just confirmed. The
  // comment on /expire already said that must not be possible; nothing
  // enforced it. Drivers see these alerts while driving, so a single person
  // being able to delete them is a safety problem, not a scoring one.
  `CREATE TABLE IF NOT EXISTS road_alert_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL REFERENCES road_alerts(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    vote TEXT NOT NULL CHECK (vote IN ('CONFIRM','DISMISS')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_road_alert_votes_one_per_driver ON road_alert_votes(alert_id, driver_id)",

  // --- One average fare, not a meter ---
  //
  // A trip inside a town costs what a trip inside that town costs, and a trip
  // between two towns costs what that road costs. That is how the fare is
  // actually agreed here — the price is known before anyone gets in, and the
  // rider raises or lowers it themselves if the trip is unusual. Charging by
  // the kilometre made the app quote a number nobody could predict and turned
  // every route argument into an argument about the meter.
  //
  // In-town fares were already flat in the data (price_per_km and
  // price_per_minute are 0 in every seeded tariff), so this backfill changes
  // nothing about what an in-town trip costs: it moves the number the app was
  // already quoting into a column that says what it is.
  "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS average_price_kzt INTEGER",
  "UPDATE tariffs SET average_price_kzt = GREATEST(base_price, min_price) WHERE average_price_kzt IS NULL",
  `DO $$
  BEGIN
    ALTER TABLE tariffs ADD CONSTRAINT tariffs_average_price_positive CHECK (average_price_kzt IS NULL OR average_price_kzt > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,

  // Between towns there was no such number — only 140 ₸/km with an 1800 ₸
  // floor, the same on all 156 routes because nobody had tuned them. The
  // starting value here is what that formula would have quoted for a trip
  // between the two town centres: straight-line distance with a 1.3 road
  // factor, at the route's own rate, rounded to the nearest hundred and never
  // below its floor. It is an estimate to start from, not a decision — every
  // route is editable in the owner's panel, and they are the ones who know
  // what the road to Шымкент actually costs.
  "ALTER TABLE intercity_routes ADD COLUMN IF NOT EXISTS average_price_kzt INTEGER",
  `UPDATE intercity_routes ir
   SET average_price_kzt = GREATEST(
         COALESCE(ir.min_price_override, 0),
         (100 * ROUND(
            (
              COALESCE(ir.base_surcharge_kzt, 0)
              + 2 * 6371
                * asin(sqrt(
                    power(sin(radians(d.center_lat - o.center_lat) / 2), 2)
                    + cos(radians(o.center_lat)) * cos(radians(d.center_lat))
                      * power(sin(radians(d.center_lng - o.center_lng) / 2), 2)
                  ))
                * 1.3
                * COALESCE(ir.price_per_km_override, 140)
            )::numeric / 100
          ))::integer
       )
   FROM regions o, regions d
   WHERE o.id = ir.origin_region_id
     AND d.id = ir.destination_region_id
     AND ir.average_price_kzt IS NULL`,
  `DO $$
  BEGIN
    ALTER TABLE intercity_routes ADD CONSTRAINT intercity_average_price_positive CHECK (average_price_kzt IS NULL OR average_price_kzt > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`
];

// The base tables live in schema.sql, which a local Postgres container applies
// once from docker-entrypoint-initdb.d. A managed database — Railway's, or any
// other host's — never runs that, so the migrations below (which only ALTER
// those tables) failed on the very first boot with "relation drivers does not
// exist" and the container restarted forever.
//
// Applying it here makes the API able to provision an empty database on its
// own. Every statement in schema.sql is CREATE ... IF NOT EXISTS, so running it
// on every boot is a no-op once the tables are there, and it can never
// overwrite data.
async function ensureBaseSchema(executor) {
  const schemaPath = new URL("./schema.sql", import.meta.url);
  let sql;
  try {
    sql = await readFile(schemaPath, "utf8");
  } catch (error) {
    // A deployment that ships without schema.sql is still valid when the
    // database was provisioned some other way; the migrations below will say
    // so plainly if it was not.
    console.warn("[db] schema.sql not found, relying on an existing schema", error.code);
    return;
  }
  await executor.query(sql);
}

export async function runMigrations(executor = pool) {
  const client = await executor.connect();
  const lockName = "baisapar:database-migrations";
  let locked = false;
  try {
    // All replicas boot from the same image. A session advisory lock lets one
    // apply DDL while the rest wait, avoiding concurrent ALTER/constraint races.
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [lockName]);
    locked = true;
    await ensureBaseSchema(client);
    for (const sql of statements) {
      await client.query(sql);
    }
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockName]);
      } catch (error) {
        console.error("[db] failed to release migration advisory lock", error);
      }
    }
    client.release();
  }
}

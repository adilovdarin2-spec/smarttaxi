import bcrypt from "bcryptjs";
import { pool, query } from "../db/pool.js";
import { env } from "../config/env.js";

// Every password below is readable by anyone who opens the repository, so they
// are development defaults only. `assertSeedPasswordsAreSafe` refuses to write
// them into a production database — a FINANCE account whose password is
// published is the finance module handed over.
const DEV_PASSWORD = "123456";
const DEV_ADMIN_PASSWORD = "ChangeMe_2026!";

const ACCOUNTS = {
  client: {
    name: "Test Client",
    role: "CLIENT",
    phone: "+77000000001",
    email: "client@smarttaxi.local",
    password: env.DEFAULT_CLIENT_PASSWORD
  },
  driver: {
    name: "Test Driver",
    role: "DRIVER",
    // Was hardcoded, which quietly ignored DEFAULT_DRIVER_PHONE and
    // DEFAULT_DRIVER_PASSWORD — both already declared in env.js and .env.example.
    phone: env.DEFAULT_DRIVER_PHONE,
    email: "driver@smarttaxi.local",
    password: env.DEFAULT_DRIVER_PASSWORD
  },
  owner: {
    name: "SmartTaxi Owner",
    role: "OWNER",
    phone: "+77000000099",
    email: env.DEFAULT_ADMIN_EMAIL,
    password: env.DEFAULT_ADMIN_PASSWORD
  },
  finance: {
    name: "Test Finance",
    role: "FINANCE",
    phone: "+77000000097",
    email: "finance@smarttaxi.local",
    password: env.DEFAULT_FINANCE_PASSWORD
  }
};

const PASSWORD_ENV_VAR = {
  client: "DEFAULT_CLIENT_PASSWORD",
  driver: "DEFAULT_DRIVER_PASSWORD",
  owner: "DEFAULT_ADMIN_PASSWORD",
  finance: "DEFAULT_FINANCE_PASSWORD"
};

/// Names every account still holding a published password at once, so one run
/// tells you the full list of variables to set instead of failing four times.
function assertSeedPasswordsAreSafe() {
  if (env.NODE_ENV !== "production") return;
  const weak = Object.entries(ACCOUNTS)
    .filter(([, account]) => account.password === DEV_PASSWORD || account.password === DEV_ADMIN_PASSWORD)
    .map(([key]) => PASSWORD_ENV_VAR[key]);
  if (!weak.length) return;
  throw new Error(
    `Refusing to seed production with passwords published in the repository. Set ${weak.join(", ")} and run again.`
  );
}

async function upsertUser({ name, email, phone, password, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await query(`
    SELECT *
    FROM users
    WHERE ($1::text IS NOT NULL AND email=$1)
       OR ($2::text IS NOT NULL AND phone=$2)
    LIMIT 1
  `, [email || null, phone || null]);

  if (existing.rows[0]) {
    return (await query(`
      UPDATE users
      SET name=$1,
          email=$2,
          phone=$3,
          password_hash=$4,
          role=$5,
          is_active=true
      WHERE id=$6
      RETURNING *
    `, [name, email || null, phone || null, passwordHash, role, existing.rows[0].id])).rows[0];
  }

  return (await query(`
    INSERT INTO users(name,email,phone,password_hash,role,is_active)
    VALUES($1,$2,$3,$4,$5,true)
    RETURNING *
  `, [name, email || null, phone || null, passwordHash, role])).rows[0];
}

async function seedRegions() {
  return (await query(`
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
        '[[68.2800,40.7350],[68.3700,40.7350],[68.3700,40.8150],[68.2800,40.8150],[68.2800,40.7350]]'::jsonb,
        40.777134,
        68.324677,
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
        updated_at=NOW()
    RETURNING *
  `)).rows;
}

async function seedTariffs(regions) {
  await query(`
    INSERT INTO tariffs(region_id,name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order,is_active)
    SELECT r.id, seed.name, seed.display_name, seed.description, seed.base_price, seed.price_per_km, seed.price_per_minute, seed.min_price, seed.service_commission_percent, seed.cashback_percent, seed.surge_multiplier, seed.free_waiting_minutes, seed.waiting_price_per_minute, seed.cancellation_fee, seed.sort_order, seed.is_active
    FROM regions r
    CROSS JOIN (
      VALUES
        ('Economy','Эконом','Фиксированная цена. Быстро и выгодно',700,0,0,700,7,0,1,3,50,0,10,true),
        ('Comfort','Комфорт','Фиксированная цена. Больше комфорта',1000,0,0,1000,7,0,1,3,60,0,20,false),
        ('Business','Бизнес','Премиальная поездка',2500,0,0,2500,7,0,1,3,80,0,999,false),
        ('Delivery','Доставка','Фиксированная цена. Посылки и небольшие грузы',800,0,0,800,7,0,1,3,50,0,30,true)
    ) AS seed(name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order,is_active)
    WHERE r.code = ANY($1)
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
        is_active=EXCLUDED.is_active
  `, [regions.map((region) => region.code)]);
}

async function seedClient(user) {
  await query(`
    INSERT INTO clients(user_id, name, phone)
    VALUES($1,$2,$3)
    ON CONFLICT (phone) DO UPDATE
    SET user_id=EXCLUDED.user_id,
        name=EXCLUDED.name
  `, [user.id, user.name, user.phone]);
}

async function seedDriver({ user, region, owner }) {
  const existing = await query(`
    SELECT *
    FROM drivers
    WHERE user_id=$1 OR phone=$2
    ORDER BY created_at ASC
    LIMIT 1
  `, [user.id, user.phone]);

  const driver = existing.rows[0]
    ? (await query(`
        UPDATE drivers
        SET user_id=$1,
            name=$2,
            phone=$3,
            car_model='Toyota Camry',
            car_color='Белый',
            plate='777AAA17',
            tariff='Economy',
            status='OFFLINE',
            current_region_id=$4,
            is_blocked=false,
            last_seen_at=NOW()
        WHERE id=$5
        RETURNING *
      `, [user.id, user.name, user.phone, region.id, existing.rows[0].id])).rows[0]
    : (await query(`
        INSERT INTO drivers(user_id,name,phone,car_model,car_color,plate,tariff,status,current_region_id,is_blocked,last_seen_at)
        VALUES($1,$2,$3,'Toyota Camry','Белый','777AAA17','Economy','OFFLINE',$4,false,NOW())
        RETURNING *
      `, [user.id, user.name, user.phone, region.id])).rows[0];

  await query(`
    INSERT INTO driver_region_approvals(driver_id, region_id, status, approved_by_user_id, approved_at, blocked_by_user_id, blocked_at, block_reason)
    VALUES($1,$2,'APPROVED',$3,NOW(),NULL,NULL,NULL)
    ON CONFLICT (driver_id, region_id) DO UPDATE
    SET status='APPROVED',
        approved_by_user_id=EXCLUDED.approved_by_user_id,
        approved_at=NOW(),
        blocked_by_user_id=NULL,
        blocked_at=NULL,
        block_reason=NULL,
        updated_at=NOW()
  `, [driver.id, region.id, owner.id]);

  return driver;
}

async function approveDriverRegions({ driver, regions, owner }) {
  for (const region of regions) {
    await query(`
      INSERT INTO driver_region_approvals(driver_id, region_id, status, approved_by_user_id, approved_at, blocked_by_user_id, blocked_at, block_reason)
      VALUES($1,$2,'APPROVED',$3,NOW(),NULL,NULL,NULL)
      ON CONFLICT (driver_id, region_id) DO UPDATE
      SET status='APPROVED',
          approved_by_user_id=EXCLUDED.approved_by_user_id,
          approved_at=NOW(),
          blocked_by_user_id=NULL,
          blocked_at=NULL,
          block_reason=NULL,
          updated_at=NOW()
    `, [driver.id, region.id, owner.id]);
  }
}

async function seedSettings() {
  await query(`
    INSERT INTO service_settings(id, service_name, city, currency, currency_symbol)
    VALUES (1, 'SmartTaxi', 'Atakent', 'KZT', '₸')
    ON CONFLICT (id) DO UPDATE
    SET service_name=EXCLUDED.service_name,
        city=EXCLUDED.city,
        currency=EXCLUDED.currency,
        currency_symbol=EXCLUDED.currency_symbol,
        updated_at=NOW()
  `);
}

async function seed() {
  // Before anything is written, not after the regions are already in.
  assertSeedPasswordsAreSafe();
  const regions = await seedRegions();
  const region = regions.find((item) => item.code === "ATAKENT") || regions[0];
  await seedSettings();
  await seedTariffs(regions);

  const owner = await upsertUser(ACCOUNTS.owner);
  const client = await upsertUser(ACCOUNTS.client);
  const driverUser = await upsertUser(ACCOUNTS.driver);
  await upsertUser(ACCOUNTS.finance);

  await seedClient(client);
  const driver = await seedDriver({ user: driverUser, region, owner });
  await approveDriverRegions({ driver, regions, owner });

  console.log("Seed completed");
  console.log(`Active regions: ${regions.map((item) => `${item.name} (${item.code})`).join(", ")}`);
  console.log(`Driver approved for regions: ${driver.name} -> ${regions.map((item) => item.name).join(", ")}`);
  console.table(Object.values(ACCOUNTS).map(({ role, name, phone, email, password }) => ({
    role,
    name,
    phone,
    email,
    password
  })));
}

seed()
  .then(() => pool.end())
  .catch(error => {
    console.error(error);
    pool.end();
    process.exit(1);
  });

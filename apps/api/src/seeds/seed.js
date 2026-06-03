import bcrypt from "bcryptjs";
import { pool, query } from "../db/pool.js";
import { env } from "../config/env.js";

const ACCOUNTS = {
  client: {
    name: "Test Client",
    role: "CLIENT",
    phone: "+77000000001",
    email: "client@smarttaxi.local",
    password: "123456"
  },
  driver: {
    name: "Test Driver",
    role: "DRIVER",
    phone: "+77000000000",
    email: "driver@smarttaxi.local",
    password: "123456"
  },
  owner: {
    name: "SmartTaxi Owner",
    role: "OWNER",
    phone: "+77000000099",
    email: env.DEFAULT_ADMIN_EMAIL || "admin@smarttaxi.local",
    password: env.DEFAULT_ADMIN_PASSWORD || "ChangeMe_2026!"
  },
  operator: {
    name: "Test Operator",
    role: "OPERATOR",
    phone: "+77000000098",
    email: "operator@smarttaxi.local",
    password: "123456"
  },
  finance: {
    name: "Test Finance",
    role: "FINANCE",
    phone: "+77000000097",
    email: "finance@smarttaxi.local",
    password: "123456"
  }
};

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
        '[[68.4300,40.7800],[68.5700,40.7800],[68.5700,40.9000],[68.4300,40.9000],[68.4300,40.7800]]'::jsonb,
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
    SELECT r.id, seed.name, seed.display_name, seed.description, seed.base_price, seed.price_per_km, seed.price_per_minute, seed.min_price, seed.service_commission_percent, seed.cashback_percent, seed.surge_multiplier, seed.free_waiting_minutes, seed.waiting_price_per_minute, seed.cancellation_fee, seed.sort_order, true
    FROM regions r
    CROSS JOIN (
      VALUES
        ('Economy','Эконом','Быстро и доступно',400,110,20,700,15,2,1,3,50,0,10),
        ('Comfort','Комфорт','Больше удобства',600,150,25,1000,15,2,1,3,60,0,20),
        ('Business','Бизнес','Премиальная поездка',900,220,35,1600,15,2,1,3,80,0,30)
    ) AS seed(name,display_name,description,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,free_waiting_minutes,waiting_price_per_minute,cancellation_fee,sort_order)
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
        is_active=true
  `, [regions.map((region) => region.code)]);
  await query(`
    UPDATE tariffs
    SET is_active=false, updated_at=NOW()
    WHERE name='Delivery'
      AND region_id IN (SELECT id FROM regions WHERE code = ANY($1))
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
  const regions = await seedRegions();
  const region = regions.find((item) => item.code === "ATAKENT") || regions[0];
  await seedSettings();
  await seedTariffs(regions);

  const owner = await upsertUser(ACCOUNTS.owner);
  const client = await upsertUser(ACCOUNTS.client);
  const driverUser = await upsertUser(ACCOUNTS.driver);
  await upsertUser(ACCOUNTS.operator);
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

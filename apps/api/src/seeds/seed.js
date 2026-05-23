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

async function seedRegion() {
  return (await query(`
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
        updated_at=NOW()
    RETURNING *
  `)).rows[0];
}

async function seedTariffs(regionId) {
  await query(`
    INSERT INTO tariffs(region_id,name,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent,surge_multiplier,is_active)
    VALUES
      ($1,'Economy',400,110,20,700,15,2,1,true),
      ($1,'Comfort',600,150,25,1000,15,2,1,true),
      ($1,'Delivery',500,130,20,800,15,1,1,true)
    ON CONFLICT (name) DO UPDATE
    SET region_id=EXCLUDED.region_id,
        base_price=EXCLUDED.base_price,
        price_per_km=EXCLUDED.price_per_km,
        price_per_minute=EXCLUDED.price_per_minute,
        min_price=EXCLUDED.min_price,
        service_commission_percent=EXCLUDED.service_commission_percent,
        cashback_percent=EXCLUDED.cashback_percent,
        surge_multiplier=EXCLUDED.surge_multiplier,
        is_active=true
  `, [regionId]);
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
  const region = await seedRegion();
  await seedSettings();
  await seedTariffs(region.id);

  const owner = await upsertUser(ACCOUNTS.owner);
  const client = await upsertUser(ACCOUNTS.client);
  const driverUser = await upsertUser(ACCOUNTS.driver);
  await upsertUser(ACCOUNTS.operator);
  await upsertUser(ACCOUNTS.finance);

  await seedClient(client);
  const driver = await seedDriver({ user: driverUser, region, owner });

  console.log("Seed completed");
  console.log(`Active region: ${region.name} (${region.code})`);
  console.log(`Driver approved for region: ${driver.name} -> ${region.name}`);
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

import bcrypt from "bcryptjs";
import { query, pool } from "../db/pool.js";
import { env } from "../config/env.js";

async function upsertUser({ name, email, phone, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  const existing = email
    ? await query("SELECT * FROM users WHERE email=$1", [email])
    : await query("SELECT * FROM users WHERE phone=$1", [phone]);
  if (existing.rows[0]) return existing.rows[0];
  return (await query("INSERT INTO users(name,email,phone,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING *", [name, email || null, phone || null, hash, role])).rows[0];
}

async function seed() {
  await query(`
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
  `);

  await query(`
    INSERT INTO tariffs(name,base_price,price_per_km,price_per_minute,min_price,service_commission_percent,cashback_percent)
    VALUES
      ('Economy',400,110,20,700,15,2),
      ('Comfort',600,150,25,1000,15,2),
      ('Business',900,220,35,1500,18,2),
      ('Delivery',500,130,20,800,15,1)
    ON CONFLICT (name) DO NOTHING
  `);

  await upsertUser({ name:"SmartTaxi Admin", email:env.DEFAULT_ADMIN_EMAIL, password:env.DEFAULT_ADMIN_PASSWORD, role:"OWNER" });
  const driverUser = await upsertUser({ name:"Test Driver", phone:env.DEFAULT_DRIVER_PHONE, password:env.DEFAULT_DRIVER_PASSWORD, role:"DRIVER" });

  const d = await query("SELECT * FROM drivers WHERE phone=$1", [env.DEFAULT_DRIVER_PHONE]);
  if (!d.rows[0]) {
    await query("INSERT INTO drivers(user_id,name,phone,car_model,plate,tariff,status,lat,lng) VALUES($1,'Test Driver',$2,'Toyota Camry','777 ATA 13','Economy','FREE',40.8471,68.5063)", [driverUser.id, env.DEFAULT_DRIVER_PHONE]);
  }

  console.log("Seed completed");
}
seed().then(()=>pool.end()).catch(e=>{ console.error(e); pool.end(); process.exit(1); });

import { AppError } from "../../common/errors.js";

async function defaultQuery(sql, params) {
  const db = await import("../../db/pool.js");
  return db.query(sql, params);
}

function run(executor, sql, params = []) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export function publicTariff(tariff) {
  if (!tariff) return null;
  return {
    id: tariff.id,
    regionId: tariff.region_id,
    name: tariff.name,
    displayName: tariff.display_name || tariff.name,
    description: tariff.description || "",
    basePrice: Number(tariff.base_price),
    pricePerKm: Number(tariff.price_per_km),
    pricePerMinute: Number(tariff.price_per_minute),
    minimumPrice: Number(tariff.min_price),
    serviceCommissionPercent: Number(tariff.service_commission_percent),
    cashbackPercent: Number(tariff.cashback_percent),
    surgeMultiplier: Number(tariff.surge_multiplier ?? 1),
    freeWaitingMinutes: Number(tariff.free_waiting_minutes ?? 0),
    waitingPricePerMinute: Number(tariff.waiting_price_per_minute ?? 0),
    cancellationFee: Number(tariff.cancellation_fee ?? 0),
    sortOrder: Number(tariff.sort_order ?? 0),
    isActive: tariff.is_active
  };
}

export function adminTariff(tariff) {
  if (!tariff) return null;
  return {
    ...publicTariff(tariff),
    regionName: tariff.region_name || null,
    regionCode: tariff.region_code || null,
    currency: tariff.currency || "KZT",
    createdAt: tariff.created_at,
    updatedAt: tariff.updated_at
  };
}

function dbInput(input) {
  const result = {};
  const fields = {
    regionId: "region_id",
    name: "name",
    displayName: "display_name",
    description: "description",
    basePrice: "base_price",
    pricePerKm: "price_per_km",
    pricePerMinute: "price_per_minute",
    minimumPrice: "min_price",
    minPrice: "min_price",
    serviceCommissionPercent: "service_commission_percent",
    cashbackPercent: "cashback_percent",
    surgeMultiplier: "surge_multiplier",
    freeWaitingMinutes: "free_waiting_minutes",
    waitingPricePerMinute: "waiting_price_per_minute",
    cancellationFee: "cancellation_fee",
    sortOrder: "sort_order",
    isActive: "is_active"
  };
  for (const [key, column] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) result[column] = input[key];
  }
  return result;
}

function mapUniqueTariffError(error) {
  if (error?.code === "23505") {
    throw new AppError("Tariff already exists in this region", 409, "TARIFF_DUPLICATE");
  }
  throw error;
}

export async function listAdminTariffs({ regionId } = {}, executor = defaultQuery) {
  const params = [];
  const where = [];
  if (regionId) {
    params.push(regionId);
    where.push(`t.region_id=$${params.length}`);
  }
  const result = await run(executor, `
    SELECT t.*, r.name region_name, r.code region_code, r.currency
    FROM tariffs t
    LEFT JOIN regions r ON r.id=t.region_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY r.name ASC NULLS LAST, t.sort_order ASC, t.base_price ASC, t.name ASC
  `, params);
  return result.rows;
}

export async function getAdminTariff(id, executor = defaultQuery) {
  const tariff = (await run(executor, `
    SELECT t.*, r.name region_name, r.code region_code, r.currency
    FROM tariffs t
    LEFT JOIN regions r ON r.id=t.region_id
    WHERE t.id=$1
  `, [id])).rows[0];
  if (!tariff) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
  return tariff;
}

export async function createAdminTariff(input, executor = defaultQuery) {
  const body = dbInput(input);
  try {
    const result = await run(executor, `
      INSERT INTO tariffs(region_id, name, display_name, description, base_price, price_per_km, price_per_minute, min_price, service_commission_percent, cashback_percent, surge_multiplier, free_waiting_minutes, waiting_price_per_minute, cancellation_fee, sort_order, is_active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      body.region_id,
      body.name,
      body.display_name || null,
      body.description || null,
      body.base_price,
      body.price_per_km,
      body.price_per_minute,
      body.min_price,
      body.service_commission_percent,
      body.cashback_percent ?? 0,
      body.surge_multiplier,
      body.free_waiting_minutes,
      body.waiting_price_per_minute,
      body.cancellation_fee,
      body.sort_order,
      body.is_active
    ]);
    return result.rows[0];
  } catch (error) {
    mapUniqueTariffError(error);
  }
}

export async function updateAdminTariff(id, input, executor = defaultQuery) {
  const body = dbInput(input);
  const entries = Object.entries(body);
  if (!entries.length) throw new AppError("No tariff fields provided", 400, "VALIDATION_ERROR");
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([column], index) => `${column}=$${index + 1}`);
  values.push(id);
  try {
    const before = (await run(executor, "SELECT * FROM tariffs WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!before) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
    const updated = (await run(executor, `
      UPDATE tariffs
      SET ${assignments.join(", ")}, updated_at=NOW()
      WHERE id=$${values.length}
      RETURNING *
    `, values)).rows[0];
    return { before, tariff: updated };
  } catch (error) {
    mapUniqueTariffError(error);
  }
}

export async function setAdminTariffStatus(id, isActive, executor = defaultQuery) {
  const before = (await run(executor, "SELECT * FROM tariffs WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!before) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
  const tariff = (await run(executor, `
    UPDATE tariffs
    SET is_active=$1, updated_at=NOW()
    WHERE id=$2
    RETURNING *
  `, [isActive, id])).rows[0];
  return { before, tariff };
}

export async function getTariffForRegion({ regionId, tariffId, tariffName }, executor = defaultQuery) {
  let tariff;

  if (tariffId) {
    tariff = (await run(executor, "SELECT * FROM tariffs WHERE id=$1", [tariffId])).rows[0];
    if (!tariff) throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
    if (tariff.region_id !== regionId) {
      throw new AppError("Tariff does not belong to selected region", 409, "TARIFF_REGION_MISMATCH");
    }
  } else {
    const name = tariffName || "Economy";
    tariff = (await run(executor, "SELECT * FROM tariffs WHERE region_id=$1 AND lower(name)=lower($2)", [regionId, name])).rows[0];
    if (!tariff) {
      const otherRegion = (await run(executor, "SELECT * FROM tariffs WHERE lower(name)=lower($1) LIMIT 1", [name])).rows[0];
      if (otherRegion) {
        throw new AppError("Tariff does not belong to selected region", 409, "TARIFF_REGION_MISMATCH");
      }
      throw new AppError("Tariff not found", 404, "TARIFF_NOT_FOUND");
    }
  }

  if (!tariff.is_active) throw new AppError("Tariff is inactive", 403, "TARIFF_INACTIVE");
  return tariff;
}

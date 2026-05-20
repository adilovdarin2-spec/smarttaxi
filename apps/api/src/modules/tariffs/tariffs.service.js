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
    basePrice: Number(tariff.base_price),
    pricePerKm: Number(tariff.price_per_km),
    pricePerMinute: Number(tariff.price_per_minute),
    minimumPrice: Number(tariff.min_price),
    serviceCommissionPercent: Number(tariff.service_commission_percent),
    cashbackPercent: Number(tariff.cashback_percent),
    surgeMultiplier: Number(tariff.surge_multiplier ?? 1),
    isActive: tariff.is_active
  };
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

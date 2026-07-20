import { AppError } from "../../common/errors.js";

// Looks up a promo code and throws a specific AppError for every reason it
// can't be applied right now, so both the standalone /promo/validate
// endpoint and order creation surface the same messages.
export async function findValidPromoCode({ code, regionId, clientId, orderPriceKzt, executor }) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) throw new AppError("Promo code is required", 400, "PROMO_CODE_REQUIRED");

  // FOR UPDATE serializes concurrent redemptions of the same code within the
  // order-creation transaction, so the usage_limit/per_client_limit counts
  // below can't both pass for two requests racing on the same promo code.
  const promo = (await executor.query(
    `SELECT * FROM promo_codes WHERE UPPER(code)=$1 AND is_active=true AND (region_id IS NULL OR region_id=$2) FOR UPDATE`,
    [normalizedCode, regionId]
  )).rows[0];
  if (!promo) throw new AppError("Promo code not found", 404, "PROMO_NOT_FOUND");

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    throw new AppError("Promo code is not active yet", 409, "PROMO_NOT_STARTED");
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    throw new AppError("Promo code has expired", 409, "PROMO_EXPIRED");
  }
  if (orderPriceKzt < promo.min_order_price_kzt) {
    throw new AppError("Order price is below the promo minimum", 409, "PROMO_MIN_ORDER_NOT_MET", {
      minOrderPriceKzt: promo.min_order_price_kzt
    });
  }
  if (promo.usage_limit != null) {
    const total = (await executor.query(
      "SELECT COUNT(*)::int AS count FROM promo_code_redemptions WHERE promo_code_id=$1",
      [promo.id]
    )).rows[0].count;
    if (total >= promo.usage_limit) throw new AppError("Promo code usage limit reached", 409, "PROMO_LIMIT_REACHED");
  }
  if (clientId) {
    const used = (await executor.query(
      "SELECT COUNT(*)::int AS count FROM promo_code_redemptions WHERE promo_code_id=$1 AND client_id=$2",
      [promo.id, clientId]
    )).rows[0].count;
    if (used >= promo.per_client_limit) {
      throw new AppError("You've already used this promo code", 409, "PROMO_ALREADY_USED");
    }
  }
  return promo;
}

export function calculatePromoDiscount(promo, orderPriceKzt) {
  let discount = promo.discount_type === "PERCENT"
    ? Math.round((orderPriceKzt * promo.discount_value) / 100)
    : promo.discount_value;
  if (promo.max_discount_kzt != null) discount = Math.min(discount, promo.max_discount_kzt);
  // Never let a promo make the ride free — always leave at least 1 KZT due.
  discount = Math.min(discount, orderPriceKzt - 1);
  return Math.max(0, Math.round(discount));
}

export async function recordPromoRedemption({ promoId, clientId, orderId, discountAmountKzt, executor }) {
  await executor.query(
    `INSERT INTO promo_code_redemptions(promo_code_id, client_id, order_id, discount_amount_kzt)
     VALUES($1,$2,$3,$4)`,
    [promoId, clientId, orderId, discountAmountKzt]
  );
}

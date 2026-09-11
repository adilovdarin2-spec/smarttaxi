import { AppError } from "../../common/errors.js";

export async function spendOrderCashback({ clientId, orderId, amountKzt, executor }) {
  const balanceAfter = await trySpendOrderCashback({ clientId, orderId, amountKzt, executor });
  if (balanceAfter !== null) return balanceAfter;
  throw new AppError("Not enough cashback to pay for this ride", 409, "INSUFFICIENT_CASHBACK", {
    requiredKzt: amountKzt
  });
}

export async function trySpendOrderCashback({ clientId, orderId, amountKzt, executor }) {
  if (!Number.isInteger(amountKzt) || amountKzt <= 0) {
    throw new AppError("Cashback payment amount must be positive", 400, "INVALID_CASHBACK_AMOUNT");
  }

  const updated = (await executor.query(`
    UPDATE clients
    SET cashback_balance=cashback_balance-$1
    WHERE id=$2 AND cashback_balance >= $1
    RETURNING cashback_balance
  `, [amountKzt, clientId])).rows[0];
  if (!updated) return null;

  await executor.query(`
    INSERT INTO cashback_transactions(client_id,order_id,type,amount,balance_after)
    VALUES($1,$2,'ORDER_PAYMENT',$3,$4)
  `, [clientId, orderId, -amountKzt, updated.cashback_balance]);
  return Number(updated.cashback_balance);
}

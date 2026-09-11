// Rating a settled ride must not remove it from the driver's daily totals.
// Legacy COMPLETED is retained. This is a reporting policy, not a transition.
export const DRIVER_COMPLETED_STATUSES = Object.freeze([
  "TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED", "COMPLETED"
]);

export async function driverDailyStats(driverId, executor) {
  const sql = `
    SELECT COUNT(*)::int orders_total,
           COUNT(*) FILTER (WHERE status = ANY($2::text[]))::int completed_orders,
           COALESCE(SUM(price) FILTER (WHERE status = ANY($2::text[])),0)::int revenue_total,
           COALESCE(SUM(service_commission) FILTER (WHERE status = ANY($2::text[])),0)::int commission_total
    FROM orders
    WHERE driver_id=$1 AND created_at >= date_trunc('day', NOW())
  `;
  const params = [driverId, [...DRIVER_COMPLETED_STATUSES]];
  const result = await (executor.query ? executor.query(sql, params) : executor(sql, params));
  const row = result.rows[0] || {};
  return Object.fromEntries(["orders_total", "completed_orders", "revenue_total", "commission_total"]
    .map(key => [key, Number(row[key] || 0)]));
}

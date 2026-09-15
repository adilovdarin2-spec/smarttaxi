import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { OPEN_ORDER_STATUSES, ACTIVE_ORDER_STATUSES } from "../orders/order-dispatch.service.js";
const router = Router();

// 'COMPLETED' is the pre-lifecycle-expansion terminal status, kept in the
// orders_status_check constraint (schema.sql) for old rows; 'PAID'/'RATED'
// are what current orders actually reach once money has been settled.
// TRIP_COMPLETED/PAYMENT_PENDING are deliberately excluded here -- the ride
// happened, but the client hasn't paid yet, so it isn't revenue.
const SETTLED_WITH_PAYMENT_STATUSES = ["COMPLETED", "PAID", "RATED"];

const RangeQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
}).refine((value) => {
  if (!value.from || !value.to) return true;
  return new Date(value.from) <= new Date(value.to);
}, "from must be before to");

function dateWhere(range, params) {
  const clauses = [];
  if (range.from) {
    params.push(range.from);
    clauses.push(`created_at >= $${params.length}`);
  }
  if (range.to) {
    params.push(range.to);
    clauses.push(`created_at <= $${params.length}`);
  }
  if (!clauses.length) clauses.push("created_at >= date_trunc('day', NOW())");
  return `WHERE ${clauses.join(" AND ")}`;
}

router.get("/stats", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const range = RangeQuery.parse(req.query);
    const params = [];
    const where = dateWhere(range, params);
    // Current orders never reach the legacy-only statuses this query used
    // to filter on ('COMPLETED'/'NEW'/'DRIVER_ASSIGNED'+'DRIVER_ARRIVED'+
    // 'IN_PROGRESS') -- the real lifecycle uses SEARCHING_DRIVER/DRIVER_FOUND/
    // .../PAID/RATED (see order-dispatch.service.js), so every number here
    // read ~0 for all live traffic. Kept the legacy values in each set too,
    // since old rows can still carry them under the orders_status_check
    // constraint.
    params.push(SETTLED_WITH_PAYMENT_STATUSES, OPEN_ORDER_STATUSES, ACTIVE_ORDER_STATUSES);
    const settledIdx = params.length - 2;
    const openIdx = params.length - 1;
    const activeIdx = params.length;
    const today = await query(`
      SELECT COUNT(*)::int orders_total,
             COALESCE(SUM(price) FILTER (WHERE status = ANY($${settledIdx}::text[])),0)::int revenue_total,
             COALESCE(SUM(service_commission) FILTER (WHERE status = ANY($${settledIdx}::text[])),0)::int commission_total,
             COALESCE(SUM(cashback_earned) FILTER (WHERE status = ANY($${settledIdx}::text[])),0)::int cashback_total,
             COUNT(*) FILTER (WHERE status = ANY($${openIdx}::text[]))::int new_orders,
             COUNT(*) FILTER (WHERE status = ANY($${activeIdx}::text[]))::int active_orders,
             COUNT(*) FILTER (WHERE status = ANY($${settledIdx}::text[]))::int completed_orders
      FROM orders ${where}
    `, params);
    const drivers = await query(`
      SELECT COUNT(*)::int drivers_total,
             COUNT(*) FILTER (WHERE status='FREE')::int free_drivers,
             COUNT(*) FILTER (WHERE status='BUSY')::int busy_drivers,
             COUNT(*) FILTER (WHERE status='OFFLINE')::int offline_drivers,
             COALESCE(SUM(debt),0)::int driver_debts_total
      FROM drivers
    `);
    res.json({ period: { from: range.from || null, to: range.to || null }, today: today.rows[0], drivers: drivers.rows[0] });
  } catch (e) { next(e); }
});

router.get("/audit-logs", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const range = RangeQuery.parse(req.query);
    const params = [];
    const clauses = [];
    if (range.from) {
      params.push(range.from);
      clauses.push(`created_at >= $${params.length}`);
    }
    if (range.to) {
      params.push(range.to);
      clauses.push(`created_at <= $${params.length}`);
    }
    params.push(range.limit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await query(`
      SELECT id, action, actor_user_id, entity_type, entity_id, metadata, ip, user_agent, created_at
      FROM audit_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `, params);
    res.json({ auditLogs: result.rows });
  } catch (e) { next(e); }
});

export default router;

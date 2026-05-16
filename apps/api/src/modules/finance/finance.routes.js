import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
const router = Router();

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

router.get("/stats", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (req, res, next) => {
  try {
    const range = RangeQuery.parse(req.query);
    const params = [];
    const where = dateWhere(range, params);
    const today = await query(`
      SELECT COUNT(*)::int orders_total,
             COALESCE(SUM(price),0)::int revenue_total,
             COALESCE(SUM(service_commission),0)::int commission_total,
             COALESCE(SUM(cashback_earned),0)::int cashback_total,
             COUNT(*) FILTER (WHERE status='NEW')::int new_orders,
             COUNT(*) FILTER (WHERE status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS'))::int active_orders,
             COUNT(*) FILTER (WHERE status='COMPLETED')::int completed_orders
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

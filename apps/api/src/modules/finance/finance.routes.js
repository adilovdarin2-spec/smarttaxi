import { Router } from "express";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
const router = Router();

router.get("/stats", requireAuth, requireRole("OWNER", "OPERATOR", "FINANCE"), async (_req, res, next) => {
  try {
    const today = await query(`
      SELECT COUNT(*)::int orders_total,
             COALESCE(SUM(price),0)::int revenue_total,
             COALESCE(SUM(service_commission),0)::int commission_total,
             COALESCE(SUM(cashback_earned),0)::int cashback_total,
             COUNT(*) FILTER (WHERE status='NEW')::int new_orders,
             COUNT(*) FILTER (WHERE status IN ('DRIVER_ASSIGNED','DRIVER_ARRIVED','IN_PROGRESS'))::int active_orders,
             COUNT(*) FILTER (WHERE status='COMPLETED')::int completed_orders
      FROM orders WHERE created_at >= date_trunc('day', NOW())
    `);
    const drivers = await query(`
      SELECT COUNT(*)::int drivers_total,
             COUNT(*) FILTER (WHERE status='FREE')::int free_drivers,
             COUNT(*) FILTER (WHERE status='BUSY')::int busy_drivers,
             COUNT(*) FILTER (WHERE status='OFFLINE')::int offline_drivers,
             COALESCE(SUM(debt),0)::int driver_debts_total
      FROM drivers
    `);
    res.json({ today: today.rows[0], drivers: drivers.rows[0] });
  } catch (e) { next(e); }
});

export default router;

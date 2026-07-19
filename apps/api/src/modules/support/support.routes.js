import { Router } from "express";
import { z } from "zod";
import { query } from "../../db/pool.js";
import { requireAuth, requireRole } from "../../common/auth.js";
import { AppError } from "../../common/errors.js";
import { writeAudit } from "../../common/audit.js";
import { notifyOrderDriver, notifyUser } from "../notifications/notification.service.js";

const router = Router();

// The mobile SOS button (passenger_shell.dart's _SafetySheet) submits this
// exact topic string — checked here rather than adding a schema/priority
// column, since the existing free-form `topic` field already carries the
// one signal that matters (see SECURITY_CHECKLIST.md "SOS — not
// prioritized in the support queue").
const SOS_TOPIC = "SOS";

const CreateSupportMessage = z.object({
  topic: z.string().trim().min(2).max(80),
  message: z.string().trim().min(8).max(2000),
  orderId: z.string().uuid().optional()
});

function publicMessage(row) {
  return {
    id: row.id,
    role: row.role,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    topic: row.topic,
    message: row.message,
    orderId: row.order_id,
    status: row.status,
    isUrgent: row.topic === SOS_TOPIC,
    adminResponse: row.admin_response,
    respondedAt: row.responded_at,
    createdAt: row.created_at
  };
}

// Passenger or driver — either role can reach support from their own app.
router.post("/", requireAuth, requireRole("CLIENT", "DRIVER"), async (req, res, next) => {
  try {
    const body = CreateSupportMessage.parse(req.body);
    const result = await query(`
      INSERT INTO support_messages(user_id, role, contact_name, contact_phone, topic, message, order_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      req.user.id,
      req.user.role,
      req.user.name || "",
      req.user.phone || "",
      body.topic,
      body.message,
      body.orderId || null
    ]);
    const created = result.rows[0];
    // Lost item reports go to the driver too, not just the admin queue — a
    // driver who's still near the drop-off is far more likely to actually
    // find the item than an operator reading this an hour later.
    if (created.order_id && body.topic === "LOST_ITEM") {
      const order = (await query("SELECT driver_id FROM orders WHERE id=$1", [created.order_id])).rows[0];
      if (order?.driver_id) {
        notifyOrderDriver({ driver_id: order.driver_id }, {
          title: "Пассажир забыл вещь в машине",
          body: "Проверьте салон — клиент оставил заявку в поддержку",
          type: "LOST_ITEM",
          data: { supportMessageId: created.id }
        }).catch((error) => console.error("[push] notifyOrderDriver failed", error));
      }
    }
    // SOS gets a distinct alert to every OWNER (admin/operator), not just a
    // spot in the same FIFO queue as everything else (see SECURITY_CHECKLIST.md).
    // Best-effort and non-blocking, same pattern as the LOST_ITEM push
    // above — a notification failure must never fail the SOS submission
    // itself.
    if (created.topic === SOS_TOPIC) {
      (async () => {
        const operators = (await query("SELECT id FROM users WHERE role='OWNER' AND is_active=true")).rows;
        await Promise.all(operators.map((op) => notifyUser(op.id, {
          title: "🆘 SOS",
          body: `${created.contact_name || "Пользователь"} (${created.contact_phone || "нет телефона"}) нажал(а) SOS`,
          type: "SOS_ALERT",
          orderId: created.order_id,
          data: { supportMessageId: created.id }
        })));
      })().catch((error) => console.error("[push] SOS operator notify failed", error));
    }
    res.status(201).json({ message: publicMessage(created) });
  } catch (error) {
    next(error);
  }
});

// A user's own support history — lets the app show "we got your message"
// / past replies instead of the request disappearing into a void.
router.get("/mine", requireAuth, requireRole("CLIENT", "DRIVER"), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT * FROM support_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50
    `, [req.user.id]);
    res.json({ messages: result.rows.map(publicMessage) });
  } catch (error) {
    next(error);
  }
});

export default router;

const AdminListQuery = z.object({
  status: z.enum(["OPEN", "RESOLVED", "ALL"]).optional()
});

const AdminRespondBody = z.object({
  response: z.string().trim().min(1).max(2000),
  resolve: z.boolean().optional().default(true)
});

const AdminIdParams = z.object({ id: z.string().uuid() });

export const adminSupportRouter = Router();

adminSupportRouter.get("/", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = AdminListQuery.parse(req.query);
    const status = params.status || "OPEN";
    // SOS reports jump to the top of the queue regardless of age — an
    // operator scanning top-down must see them before anything else.
    const rows = status === "ALL"
      ? (await query("SELECT * FROM support_messages ORDER BY (topic=$1) DESC, created_at DESC LIMIT 200", [SOS_TOPIC])).rows
      : (await query("SELECT * FROM support_messages WHERE status=$1 ORDER BY (topic=$2) DESC, created_at DESC LIMIT 200", [status, SOS_TOPIC])).rows;
    res.json({ messages: rows.map(publicMessage) });
  } catch (error) {
    next(error);
  }
});

adminSupportRouter.patch("/:id/respond", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = AdminIdParams.parse(req.params);
    const body = AdminRespondBody.parse(req.body);
    const existing = (await query("SELECT * FROM support_messages WHERE id=$1", [params.id])).rows[0];
    if (!existing) throw new AppError("Support message not found", 404, "SUPPORT_MESSAGE_NOT_FOUND");
    const result = await query(`
      UPDATE support_messages
      SET admin_response=$1,
          status=$2,
          responded_by_user_id=$3,
          responded_at=NOW()
      WHERE id=$4
      RETURNING *
    `, [body.response, body.resolve ? "RESOLVED" : "OPEN", req.user.id, params.id]);
    await writeAudit(query, {
      action: "support_message_responded",
      actorUserId: req.user.id,
      entityType: "support_message",
      entityId: params.id,
      metadata: { resolved: body.resolve },
      req
    });
    res.json({ message: publicMessage(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

adminSupportRouter.patch("/:id/reopen", requireAuth, requireRole("OWNER", "FINANCE"), async (req, res, next) => {
  try {
    const params = AdminIdParams.parse(req.params);
    const existing = (await query("SELECT * FROM support_messages WHERE id=$1", [params.id])).rows[0];
    if (!existing) throw new AppError("Support message not found", 404, "SUPPORT_MESSAGE_NOT_FOUND");
    const result = await query(`
      UPDATE support_messages SET status='OPEN' WHERE id=$1 RETURNING *
    `, [params.id]);
    res.json({ message: publicMessage(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

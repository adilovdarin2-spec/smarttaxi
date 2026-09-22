import { query, tx } from "../../db/pool.js";
import { runDistributedJob } from "../../common/distributedJob.js";
import { writeAudit } from "../../common/audit.js";
import { createOrderCancelledTransaction } from "../finance/finance.service.js";
import { notifyOrderClient } from "../notifications/notification.service.js";
import { emitOrderUpdated, OPEN_ORDER_STATUSES } from "./order-dispatch.service.js";

// Заказ, который никто не взял, нельзя оставлять искать вечно.
//
// Ничто его не закрывало. Человек заказал машину ночью в районе, где в тот час
// никого не было на линии, — экран крутится до утра. Но хуже другое: пока
// заказ числится активным, создать новый нельзя. Утром человек открывает
// приложение, чтобы доехать на работу, и получает «у вас уже есть активный
// заказ» — про заказ, которого никогда не будет. Сервис для него закончился, и
// починить это он может, только сам найдя кнопку отмены у призрака.
//
// Пятнадцать минут: в райцентре этого хватает, чтобы кто-то вышел на линию, и
// не настолько долго, чтобы человек успел уехать на другой машине и забыть.
export const ORDER_SEARCH_TIMEOUT_MINUTES = 15;

const SWEEP_INTERVAL_MS = 60_000;

let intervalHandle = null;

export async function expireSearchingOrders(io) {
  // Берём пачкой, но закрываем каждый в своей транзакции: один сбой не должен
  // оставить остальных висеть.
  const stale = (await query(`
    SELECT id FROM orders
    WHERE status = ANY($1::text[])
      AND driver_id IS NULL
      AND created_at < NOW() - ($2 || ' minutes')::interval
    ORDER BY created_at ASC
    LIMIT 100
  `, [OPEN_ORDER_STATUSES, String(ORDER_SEARCH_TIMEOUT_MINUTES)])).rows;

  const expired = [];
  for (const row of stale) {
    try {
      const order = await tx(async (client) => {
        // Перечитываем под блокировкой: за время между выборкой и этой
        // строкой водитель мог принять заказ, и отменять его уже нельзя.
        const existing = (await client.query(
          "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [row.id]
        )).rows[0];
        if (!existing) return null;
        if (!OPEN_ORDER_STATUSES.includes(existing.status) || existing.driver_id) return null;

        const updated = (await client.query(`
          UPDATE orders
          SET status='CANCELLED_BY_OPERATOR',
              cancelled_at=NOW(),
              last_cancel_reason_code='NO_DRIVER_FOUND',
              last_cancel_reason_note=$2
          WHERE id=$1
          RETURNING *
        `, [existing.id, `Никто не принял заказ за ${ORDER_SEARCH_TIMEOUT_MINUTES} мин`])).rows[0];

        await client.query(
          "UPDATE payments SET status='CANCELLED', updated_at=NOW() WHERE order_id=$1 AND status IN ('PENDING','PROCESSING')",
          [updated.id]
        );
        // Возврат кешбэка, если им платили, живёт здесь же — тот самый путь,
        // которым пользуются все остальные отмены.
        await createOrderCancelledTransaction(updated, null, client);
        await client.query(
          "INSERT INTO order_status_history(order_id,status,message) VALUES($1,'CANCELLED_BY_OPERATOR',$2)",
          [updated.id, `Search expired after ${ORDER_SEARCH_TIMEOUT_MINUTES} minutes`]
        );
        await writeAudit(client, {
          action: "order_search_expired",
          entityType: "order",
          entityId: updated.id,
          metadata: { minutes: ORDER_SEARCH_TIMEOUT_MINUTES, from: existing.status }
        });
        return updated;
      });
      if (order) expired.push(order);
    } catch (error) {
      console.error("[orders] search expiry failed", { orderId: row.id, error });
    }
  }

  for (const order of expired) {
    emitOrderUpdated(io, order, "order.search_expired");
    notifyOrderClient(order, {
      key: "searchExpired",
      params: { minutes: ORDER_SEARCH_TIMEOUT_MINUTES },
      type: "ORDER_SEARCH_EXPIRED"
    }).catch((error) => console.error("[push] search expiry notify failed", error));
  }

  return { expired: expired.length };
}

export function startOrderSearchSweeper(io) {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    runDistributedJob("baisapar:order-search-sweeper", () => expireSearchingOrders(io))
      .catch((error) => console.error("[orders] search sweep tick failed", error));
  }, SWEEP_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

export function stopOrderSearchSweeper() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

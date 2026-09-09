import { sessionGuard } from "./sessionGuard.js";

function recoverable(error) {
  if (error?.name === "AbortError") return false;
  return (
    (error instanceof TypeError && error.status == null) ||
    (error?.status >= 500 && error.status < 600) ||
    (error?.status === 409 && error?.code === "INVALID_STATUS_TRANSITION")
  );
}

function validCancelledOrder(data, orderId) {
  const order = data?.order;
  const status = order?.public_status || order?.status;
  return order?.id === orderId &&
    ["CANCELLED_BY_CLIENT", "CANCELLED", "CANCELED"].includes(status)
    ? order
    : null;
}

export async function cancelOrderWithRecovery(
  { orderId, riderPhone },
  { request, readBack, readToken, isAlive = () => true },
) {
  const isCurrent = sessionGuard(readToken(), readToken, isAlive);
  try {
    const data = await request(orderId, riderPhone);
    if (!isCurrent()) throw Object.assign(new Error("stale cancellation"), { name: "AbortError" });
    const order = validCancelledOrder(data, orderId);
    if (!order) {
      throw Object.assign(Error("cancellation was not acknowledged"), {
        status: 502,
      });
    }
    return { order };
  } catch (error) {
    if (!isCurrent() || !recoverable(error)) throw error;
    try {
      const data = await readBack(orderId);
      if (!isCurrent()) throw error;
      const order = validCancelledOrder(data, orderId);
      if (order) return { order };
    } catch {
      // Preserve the original failure; never replay the cancellation here.
    }
    throw error;
  }
}

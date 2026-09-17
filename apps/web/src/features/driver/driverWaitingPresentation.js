// Display-only timer. Billing remains on the server. Do not invent a free
// window or rate when the corresponding server fields are missing.
export function driverWaitingPresentation(order, now = Date.now()) {
  if (order?.status !== 'WAITING_CLIENT' || !Number.isFinite(now)) return null;
  const start = Date.parse(order.waiting_started_at ?? order.waitingStartedAt ?? '');
  const end = Date.parse(order.free_waiting_until ?? order.freeWaitingUntil ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const paid = now > end;
  const seconds = Math.max(0, Math.floor(Math.abs(end - now) / 1000));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  return {
    paid, label: paid ? 'Платное ожидание' : 'Бесплатное ожидание',
    time: `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`,
    progress: end > start ? Math.max(0, Math.min(1, (end - now) / (end - start))) : 0
  };
}

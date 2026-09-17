// An assignment may commit before its acknowledgement is lost. Reconcile via
// the actor-private active-order endpoint; never retry a write or infer success
// from a broadcast/another driver's order.
export async function assignWithRecovery({ orderId, write, readActive, isCurrent }) {
  try { return await write(); }
  catch (failure) {
    if (!isCurrent()) throw failure;
    try {
      const snapshot = await readActive();
      if (isCurrent() && snapshot?.activeOrder?.id === orderId) {
        return { order: snapshot.activeOrder, recovered: true };
      }
    } catch { /* Preserve the original failure when reconciliation is unavailable. */ }
    throw failure;
  }
}

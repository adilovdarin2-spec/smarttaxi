import { sessionGuard } from './sessionGuard.js';

function canReconcile(error) {
  // fetch rejects network failures with TypeError, not an HTTP status. An
  // explicit abort is not a request to restart work on a closed screen.
  if (error?.name === 'AbortError') return false;
  return (error instanceof TypeError && error.status == null) ||
    (error?.status >= 500 && error.status < 600) ||
    (error?.status === 409 && error.code === 'CLIENT_HAS_ACTIVE_ORDER');
}

export async function createOrderWithRecovery(payload, { request, readToken }) {
  const isCurrent = sessionGuard(readToken(), readToken);
  const body = JSON.stringify(payload);
  try {
    const data = await request('/api/orders', {
      method: 'POST', body
    });
    if (!isCurrent()) {
      const error = new Error('Order response belongs to a previous session');
      error.name = 'AbortError';
      throw error;
    }
    return data;
  } catch (error) {
    if (!isCurrent() || !canReconcile(error)) throw error;
    try {
      // The write may have committed even if its response was lost. Read the
      // authoritative active/settlement order once; never replay the POST.
      const data = await request('/api/orders/me/active');
      const order = data?.order;
      if (isCurrent() && typeof order?.id === 'string' && order.id.trim() &&
          typeof order.status === 'string' && order.status.trim()) return data;
    } catch {
      // No confirmed order: preserve the original creation failure.
    }
    throw error;
  }
}

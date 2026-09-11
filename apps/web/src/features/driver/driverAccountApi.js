import { api } from "../../lib/api.js";
const wallet = "/api/drivers/me/wallet";
const post = (path, body) =>
  api(path, {
    method: "POST",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

export const driverAccountApi = {
  profile: () => api("/api/driver/profile"),
  history: () => api("/api/orders/me/driver-history?limit=50"),
  rating: () => api("/api/drivers/me/rating-summary"),
  documents: () => api("/api/drivers/me/documents"),
  recurring: () => api("/api/recurring-bookings/driver"),
  notifications: () => api("/api/notifications?limit=50"),
  support: () => api("/api/support/mine"),
  wallet: () =>
    Promise.all([
      api(wallet),
      api(`${wallet}/transactions?limit=30`),
      api(`${wallet}/payout-requests`),
      api(`${wallet}/topup-requests`),
    ]).then(([summary, transactions, payouts, topups]) => ({
      summary,
      transactions,
      payouts,
      topups,
    })),
  transactions: (offset) =>
    api(`${wallet}/transactions?limit=30&offset=${offset}`),
  markRead: (id) => post(`/api/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: () => post("/api/notifications/read-all"),
  sendSupport: (body) => post("/api/support", body),
  uploadDocument: (type, file) => {
    const body = new FormData();
    body.append("type", type);
    body.append("file", file);
    return api("/api/drivers/me/documents", { method: "POST", body });
  },
  requestPayout: (body) => post(`${wallet}/payout-requests`, body),
  cancelPayout: (id) =>
    post(`${wallet}/payout-requests/${encodeURIComponent(id)}/cancel`),
  requestTopup: (amountKzt) => post(`${wallet}/topup-requests`, { amountKzt }),
  respondRecurring: (id, accept) =>
    post(`/api/recurring-bookings/${encodeURIComponent(id)}/respond`, {
      accept,
    }),
  updateRecurring: (id, status) =>
    api(`/api/recurring-bookings/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

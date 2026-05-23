import { api, clearToken, getToken, login as apiLogin } from "./api.js";

export { clearToken, getToken };

export async function loginUser(payload) {
  return apiLogin(payload);
}

export function getCurrentUser() {
  return api("/api/auth/me");
}

export function getActiveRegions() {
  return api("/api/regions/active");
}

export function getTariffs(regionId) {
  const query = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
  return api(`/api/tariffs${query}`);
}

export function estimateOrder(payload) {
  return api("/api/orders/estimate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createOrder(payload) {
  return api("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function cancelPublicOrder(orderId, riderPhone) {
  return api(`/api/orders/${orderId}/cancel-public`, {
    method: "POST",
    body: JSON.stringify({ riderPhone })
  });
}

export function getDriverRegions() {
  return api("/api/drivers/me/regions");
}

export function selectDriverRegion(regionId) {
  return api("/api/drivers/me/region", {
    method: "PATCH",
    body: JSON.stringify({ regionId })
  });
}

export function setDriverStatus(status) {
  return api("/api/drivers/me/status", {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function getDriverOrders() {
  return api("/api/orders");
}

export function acceptOrder(orderId) {
  return api(`/api/orders/${orderId}/accept`, { method: "POST" });
}

export function markDriverArrived(orderId) {
  return api(`/api/orders/${orderId}/arrived`, { method: "POST" });
}

export function startTrip(orderId) {
  return api(`/api/orders/${orderId}/start`, { method: "POST" });
}

export function completeTrip(orderId) {
  return api(`/api/orders/${orderId}/complete`, { method: "POST" });
}

export function cancelDriverOrder(orderId) {
  return api(`/api/orders/${orderId}/cancel`, { method: "POST" });
}

export async function getAdminDashboard() {
  const [me, health, dashboard] = await Promise.allSettled([
    getCurrentUser(),
    api("/api/health/ready"),
    api("/api/admin/dashboard")
  ]);

  if (dashboard.status === "fulfilled") {
    return {
      ...dashboard.value,
      user: me.status === "fulfilled" ? me.value.user : null,
      health: health.status === "fulfilled" ? health.value : null
    };
  }

  return {
    user: me.status === "fulfilled" ? me.value.user : null,
    health: health.status === "fulfilled" ? health.value : null,
    cards: [],
    setup: {
      title: "Панель подключается",
      text: "Сводка пока недоступна. Разделы ниже используют доступные серверные данные."
    }
  };
}

export function getAdminRegions() {
  return api("/api/admin/regions");
}

export function getAdminDrivers() {
  return api("/api/admin/drivers");
}

export function getAdminDriverApplications() {
  return api("/api/admin/driver-applications");
}

export function getAdminOrders() {
  return api("/api/orders?limit=100");
}

export function getAdminAudit() {
  return api("/api/admin/audit-logs");
}

export function getAdminSettings() {
  return api("/api/admin/settings");
}

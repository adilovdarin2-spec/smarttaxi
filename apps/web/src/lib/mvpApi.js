import { api, clearToken, getToken, login as apiLogin } from "./api.js";

export { clearToken, getToken };

export async function loginUser(payload) {
  return apiLogin(payload);
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

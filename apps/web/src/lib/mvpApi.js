import { API_URL, api, clearToken, getToken, login as apiLogin, setToken } from "./api.js";

export { clearToken, getToken };

export async function loginUser(payload) {
  const data = await api("/api/auth/login/password", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setToken(data.token);
  return data;
}

export async function registerUser(payload) {
  const data = await api("/api/auth/register/password", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setToken(data.token);
  return data;
}

export function checkAuthPhone(phone) {
  return api("/api/auth/phone/check", {
    method: "POST",
    body: JSON.stringify({ phone })
  });
}

export function sendAuthSms(phone, purpose = "REGISTER") {
  return api("/api/auth/sms/send", {
    method: "POST",
    body: JSON.stringify({ phone, purpose })
  });
}

export function verifyAuthSms({ phone, code, purpose = "REGISTER" }) {
  return api("/api/auth/sms/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code, purpose })
  });
}

export function requestPasswordReset(phone) {
  return api("/api/auth/password/reset/request", {
    method: "POST",
    body: JSON.stringify({ phone })
  });
}

export async function confirmPasswordReset(payload) {
  const data = await api("/api/auth/password/reset/confirm", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  setToken(data.token);
  return data;
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

export function searchAddresses({ q, region, limit = 10 }) {
  const params = new URLSearchParams();
  params.set("q", q);
  if (region) params.set("region", region);
  params.set("limit", String(limit));
  return api(`/api/maps/geocode?${params.toString()}`);
}

export function reverseAddress({ lat, lng }) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return api(`/api/maps/reverse-geocode?${params.toString()}`);
}

export function previewRoute(payload) {
  return api("/api/routes/preview", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function estimateTariff(payload) {
  return api("/api/tariffs/estimate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getLocalGeoCatalog(params = {}) {
  return api(`/api/routes/catalog${queryString(params)}`);
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

export function getOrderStatusHistory(orderId) {
  return api(`/api/orders/${orderId}/status-history`);
}

export function rateOrder(orderId, payload) {
  return api(`/api/orders/${orderId}/rate`, {
    method: "POST",
    body: JSON.stringify(payload)
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

export function getDriverRoadAlerts(params = {}) {
  return api(`/api/driver/road-alerts${queryString(params)}`);
}

export function createDriverRoadAlert(payload) {
  return api("/api/driver/road-alerts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function confirmDriverRoadAlert(alertId) {
  return api(`/api/driver/road-alerts/${alertId}/confirm`, { method: "PATCH" });
}

export function expireDriverRoadAlert(alertId) {
  return api(`/api/driver/road-alerts/${alertId}/expire`, { method: "PATCH" });
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

export function createAdminRegion(payload) {
  return api("/api/admin/regions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAdminRegion(regionId, payload) {
  return api(`/api/admin/regions/${regionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function toggleAdminRegion(regionId, isActive) {
  return updateAdminRegion(regionId, { isActive });
}

export function getAdminDrivers() {
  return api("/api/admin/drivers");
}

export function getAdminDriverDetail(driverId) {
  return api(`/api/admin/drivers/${driverId}`);
}

export function blockAdminDriver(driverId, reason = "") {
  return api(`/api/admin/drivers/${driverId}/block`, {
    method: "PATCH",
    body: JSON.stringify({ isBlocked: true, reason })
  });
}

export function unblockAdminDriver(driverId) {
  return api(`/api/admin/drivers/${driverId}/block`, {
    method: "PATCH",
    body: JSON.stringify({ isBlocked: false })
  });
}

export function getAdminDriverRegions(driverId) {
  return api(`/api/admin/drivers/${driverId}/regions`);
}

export function updateAdminDriverRegion(driverId, payload) {
  return api(`/api/admin/drivers/${driverId}/regions`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function getAdminDriverApplications() {
  return api("/api/admin/driver-applications");
}

export function updateAdminDriverApplication(applicationId, payload) {
  return api(`/api/admin/driver-applications/${applicationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function getAdminTariffs(regionId) {
  const query = regionId ? `?regionId=${encodeURIComponent(regionId)}` : "";
  return api(`/api/admin/tariffs${query}`);
}

export function getAdminTariffAnalytics({ regionId, dateFrom, dateTo } = {}) {
  const params = new URLSearchParams();
  if (regionId) params.set("regionId", regionId);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const query = params.toString() ? `?${params.toString()}` : "";
  return api(`/api/admin/tariffs/analytics${query}`);
}

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  return search.toString() ? `?${search.toString()}` : "";
}

export function createAdminTariff(payload) {
  return api("/api/admin/tariffs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAdminTariff(tariffId, payload) {
  return api(`/api/admin/tariffs/${tariffId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function setAdminTariffStatus(tariffId, isActive) {
  return api(`/api/admin/tariffs/${tariffId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

export function previewAdminTariffPrice(payload) {
  return api("/api/admin/tariffs/preview-price", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAdminFinanceSummary(params = {}) {
  return api(`/api/admin/finance/summary${queryString(params)}`);
}

export function getAdminFinanceDriverDebts(params = {}) {
  return api(`/api/admin/finance/driver-debts${queryString(params)}`);
}

export function getAdminFinanceTransactions(params = {}) {
  return api(`/api/admin/finance/transactions${queryString(params)}`);
}

export function getAdminFinanceReports(params = {}) {
  return api(`/api/admin/finance/reports${queryString(params)}`);
}

export function adjustAdminDriverDebt(driverId, payload) {
  return api(`/api/admin/finance/driver-debts/${driverId}/adjust`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function exportAdminFinanceTransactionsCsv(params = {}) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/admin/finance/transactions.csv${queryString(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "CSV export failed");
  }
  return response.text();
}

export function getAdminOrders() {
  return api("/api/orders?limit=100");
}

export function getAdminAudit() {
  return api("/api/admin/audit-logs");
}

export function getAdminRoadAlerts(params = {}) {
  return api(`/api/admin/road-alerts${queryString(params)}`);
}

export function expireAdminRoadAlert(alertId) {
  return api(`/api/admin/road-alerts/${alertId}/expire`, { method: "PATCH" });
}

export function getAdminSettings() {
  return api("/api/admin/settings");
}

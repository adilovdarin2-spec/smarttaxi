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
  return api(`/api/maps/search?${params.toString()}`);
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

export function driverToPickupRoute(orderId) {
  return api("/api/routes/driver-to-pickup", {
    method: "POST",
    body: JSON.stringify({ orderId })
  });
}

export function updateDriverLocation(payload) {
  return api("/api/drivers/me/location", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function createOrder(payload) {
  return api("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getClientActiveOrder() {
  return api("/api/orders/me/active");
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

export function respondPriceOffer(orderId, accept) {
  return api(`/api/orders/${orderId}/price-offer/respond`, {
    method: "POST",
    body: JSON.stringify({ accept })
  });
}

export function sendQuickMessage(orderId, messageKey) {
  return api(`/api/orders/${orderId}/quick-message`, {
    method: "POST",
    body: JSON.stringify({ messageKey })
  });
}

export function getNotifications(params = {}) {
  return api(`/api/notifications${queryString(params)}`);
}

export function markNotificationRead(notificationId) {
  return api(`/api/notifications/${notificationId}/read`, { method: "POST" });
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

export function getDriverProfile() {
  return api("/api/driver/profile");
}

export function selectDriverRegion(regionId) {
  return api("/api/drivers/me/region", {
    method: "PATCH",
    body: JSON.stringify({ regionId })
  });
}

export function setDriverStatus(status) {
  if (status === "FREE" || status === "ONLINE") {
    return api("/api/driver/status/online", { method: "POST" });
  }
  if (status === "OFFLINE") {
    return api("/api/driver/status/offline", { method: "POST" });
  }
  return api("/api/drivers/me/status", {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function getDriverOrders() {
  return api("/api/driver/orders/incoming");
}

export function getDriverActiveOrder() {
  return api("/api/driver/orders/active");
}

export function getDriverEarningsToday() {
  return api("/api/driver/earnings/today");
}

export function getDriverDebt() {
  return api("/api/driver/debt");
}

export function acceptOrder(orderId) {
  return api(`/api/driver/orders/${orderId}/accept`, { method: "POST" });
}

export function rejectDriverOrder(orderId) {
  return api(`/api/driver/orders/${orderId}/reject`, { method: "POST" });
}

export function markDriverGoingToClient(orderId) {
  return api(`/api/driver/orders/${orderId}/going-to-client`, { method: "POST" });
}

export function markDriverArrived(orderId) {
  return api(`/api/driver/orders/${orderId}/arrived`, { method: "POST" });
}

export function markDriverWaiting(orderId) {
  return api(`/api/driver/orders/${orderId}/waiting`, { method: "POST" });
}

export function startTrip(orderId) {
  return api(`/api/driver/orders/${orderId}/start`, { method: "POST" });
}

export function completeTrip(orderId) {
  return api(`/api/driver/orders/${orderId}/complete`, { method: "POST" });
}

export function cancelDriverOrder(orderId) {
  return api(`/api/driver/orders/${orderId}/cancel`, { method: "POST" });
}

export function noShowDriverOrder(orderId) {
  return api(`/api/driver/orders/${orderId}/no-show`, { method: "POST" });
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
  if (!getToken()) {
    const health = await api("/api/health/ready").catch(() => null);
    return {
      user: null,
      health,
      cards: [],
      setup: {
        title: "Панель управления",
        text: "Войдите под владельцем, оператором или финансовым пользователем, чтобы открыть рабочие данные."
      }
    };
  }

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

export function getAdminApplicationDocuments(applicationId) {
  return api(`/api/admin/driver-applications/${applicationId}/documents`);
}

export function getAdminDriverDocuments(driverId) {
  return api(`/api/admin/drivers/${driverId}/documents`);
}

export function reviewAdminDriverDocument(documentId, payload) {
  return api(`/api/admin/driver-documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function fetchAdminDriverDocumentFile(documentId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/admin/driver-documents/${documentId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "Не удалось загрузить документ");
  }
  const mimeType = response.headers.get("Content-Type") || "";
  const blob = await response.blob();
  return { blob, mimeType };
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

export function getAdminOrders(params = {}) {
  return api(`/api/orders${queryString({ limit: 100, ...params })}`);
}

export function assignAdminOrderDriver(orderId, driverId) {
  return api(`/api/orders/${orderId}/assign-driver`, {
    method: "POST",
    body: JSON.stringify({ driverId })
  });
}

export function markOperatorOrderStatus(orderId, action) {
  return api(`/api/orders/${orderId}/${action}`, { method: "POST" });
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

export function updateAdminSettings(payload) {
  return api("/api/admin/settings", { method: "PATCH", body: JSON.stringify(payload) });
}

export function getAdminSupport(params = {}) {
  return api(`/api/admin/support${queryString(params)}`);
}

export function respondAdminSupport(id, payload) {
  return api(`/api/admin/support/${id}/respond`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function reopenAdminSupport(id) {
  return api(`/api/admin/support/${id}/reopen`, { method: "PATCH" });
}

export function getAdminSettings() {
  return api("/api/admin/settings");
}

export function getAdminReviews() {
  return api("/api/admin/reviews");
}

export function deleteAdminReview(reviewId) {
  return api(`/api/admin/reviews/${reviewId}`, { method: "DELETE" });
}

export function getAdminLeaderboard(params = {}) {
  return api(`/api/admin/leaderboard${queryString(params)}`);
}

export function getAdminRaffles() {
  return api("/api/admin/raffles");
}

export function createAdminRaffle(payload) {
  return api("/api/admin/raffles", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteAdminRaffle(raffleId) {
  return api(`/api/admin/raffles/${raffleId}`, { method: "DELETE" });
}

export function getAdminPayoutRequests(params = {}) {
  return api(`/api/admin/payout-requests${queryString(params)}`);
}

export function reviewAdminPayoutRequest(payoutRequestId, payload) {
  return api(`/api/admin/payout-requests/${payoutRequestId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function getAdminPromoCodes() {
  return api("/api/admin/promo-codes");
}

export function createAdminPromoCode(payload) {
  return api("/api/admin/promo-codes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function setAdminPromoCodeStatus(promoCodeId, isActive) {
  return api(`/api/admin/promo-codes/${promoCodeId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

export function deleteAdminPromoCode(promoCodeId) {
  return api(`/api/admin/promo-codes/${promoCodeId}`, { method: "DELETE" });
}

export function validatePromoCode(payload) {
  return api("/api/orders/promo/validate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createSupportMessage(payload) {
  return api("/api/support", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getFavoriteAddresses() {
  return api("/api/favorites/addresses");
}

export function addFavoriteAddress(payload) {
  return api("/api/favorites/addresses", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteFavoriteAddress(favoriteId) {
  return api(`/api/favorites/addresses/${favoriteId}`, { method: "DELETE" });
}

export function getReferralSummary() {
  return api("/api/referrals/me");
}

export function getAdminReferrals() {
  return api("/api/admin/referrals");
}

export function getAdminRecurringBookings(params = {}) {
  return api(`/api/admin/recurring-bookings${queryString(params)}`);
}

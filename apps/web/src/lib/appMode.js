// Use only the server-issued acting-role token. A client flag never grants a role.
export async function switchAppMode({
  mode,
  request,
  readToken,
  writeToken,
  navigate,
  isAlive = () => true,
}) {
  if (!["driver", "passenger"].includes(mode))
    throw new Error("Неизвестный режим приложения.");
  const token = readToken();
  const current = () => Boolean(token) && token === readToken() && isAlive();
  if (!current()) return false;
  if (mode === "passenger") {
    const [profile, history] = await Promise.all([
      request("/api/driver/profile"),
      request("/api/orders/me/driver-history?limit=50"),
    ]);
    if (!current()) return false;
    const unsettled = (history.orders || []).some(
      (order) =>
        ["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(
          order.public_status || order.status,
        ) && order.payment_status !== "PAID",
    );
    if (
      !profile.driver ||
      profile.driver.status !== "OFFLINE" ||
      profile.activeOrder ||
      unsettled
    ) {
      throw new Error(
        "Сначала завершите поездку, подтвердите расчёт и уйдите с линии.",
      );
    }
  } else {
    const active = await request("/api/orders/me/active");
    if (!current()) return false;
    if (active.order?.id)
      throw new Error(
        "Сначала завершите текущую пассажирскую поездку и оплату.",
      );
  }
  const data = await request(`/api/auth/mode/${mode}`, { method: "POST" });
  if (!current()) return false;
  if (
    !data.token ||
    data.user?.role !== (mode === "driver" ? "DRIVER" : "CLIENT")
  ) {
    throw new Error("Сервис не подтвердил переключение режима.");
  }
  writeToken(data.token);
  navigate(mode === "driver" ? "/driver" : "/order");
  return true;
}

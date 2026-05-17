import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, clearToken, getToken, login } from "./lib/api";
import { createSocket } from "./lib/socket";
import "./styles.css";

const STATUS = {
  NEW: "Заказ создан",
  DRIVER_ASSIGNED: "Водитель назначен",
  DRIVER_ARRIVED: "Водитель приехал",
  IN_PROGRESS: "Поездка началась",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
  FREE: "На линии",
  BUSY: "На заказе",
  OFFLINE: "Не на линии",
  BREAK: "Перерыв"
};

const STATUS_STEPS = [
  ["NEW", "Заказ создан"],
  ["DRIVER_ASSIGNED", "Водитель назначен"],
  ["DRIVER_ARRIVED", "Водитель приехал"],
  ["IN_PROGRESS", "Поездка началась"],
  ["COMPLETED", "Завершено"]
];

const ACTIVE_STATUSES = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];
const FINISHED_STATUSES = ["COMPLETED", "CANCELLED"];
const DEFAULT_TARIFFS = [
  { name: "Economy", label: "Дешевле", note: "Быстрая городская поездка" },
  { name: "Comfort", label: "Комфортнее", note: "Чище салон и выше класс" },
  { name: "Business", label: "Премиум", note: "Для важных поездок" },
  { name: "Delivery", label: "Доставка", note: "Посылки и документы" }
];
const PAYMENT_OPTIONS = [
  ["CASH", "Наличные", "Водителю"],
  ["KASPI", "Kaspi", "Перевод"],
  ["CARD", "Карта", "Онлайн"],
  ["CASHBACK", "Cashback", "Бонусы"]
];
const GOOGLE_MAPS_BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || "";

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

function normalizeError(error) {
  const code = error?.code || "";
  const message = error?.message || "";
  const map = {
    DRIVER_NOT_FOUND: "Профиль водителя не найден.",
    DRIVER_OFFLINE: "Сначала выйдите на линию.",
    DRIVER_BUSY: "У вас уже есть активная поездка.",
    DRIVER_BLOCKED: "Аккаунт водителя заблокирован.",
    DRIVER_DEBT_LIMIT: "Превышен лимит долга. Погасите долг.",
    ORDER_ALREADY_ACCEPTED: "Заказ уже принял другой водитель.",
    ORDER_NOT_FOUND: "Заказ не найден.",
    FORBIDDEN_ORDER: "Это не ваш заказ.",
    INVALID_STATUS_TRANSITION: "Нельзя выполнить это действие на текущем этапе.",
    INVALID_CREDENTIALS: "Неверный логин или пароль.",
    VALIDATION_ERROR: "Проверьте заполненные поля.",
    UNAUTHORIZED: "Нужно войти в аккаунт.",
    FORBIDDEN: "Недостаточно прав для этого действия."
  };
  if (map[code]) return map[code];
  if (message === "Failed to fetch" || message.includes("NetworkError")) return "Сервер недоступен. Проверьте интернет или API.";
  if (message === "Driver is not available") return "Сначала выйдите на линию.";
  return message || "Что-то пошло не так.";
}

function fieldNumber(value) {
  if (value === "" || value === undefined || value === null) return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${String(status || "").toLowerCase()}`}>{STATUS[status] || status || "Статус"}</span>;
}

function Alert({ message }) {
  return message ? <div className="alert">{message}</div> : null;
}

function EmptyState({ title, text, action }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
      {action}
    </div>
  );
}

function LoadingState({ label = "Загружаем данные..." }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

function AppHeader({ subtitle = "Быстрая поездка по городу", right }) {
  return (
    <header className="app-header">
      <a className="brand" href="/client">
        <span className="brand-mark">ST</span>
        <span>
          <b>SmartTaxi</b>
          <small>Atakent</small>
        </span>
      </a>
      <p>{subtitle}</p>
      {right}
    </header>
  );
}

function Timeline({ status }) {
  const currentIndex = STATUS_STEPS.findIndex(([key]) => key === status);
  const safeIndex = status === "CANCELLED" ? 0 : Math.max(0, currentIndex);
  return (
    <div className="timeline">
      {STATUS_STEPS.map(([key, label], index) => (
        <div className={`timeline-step ${index <= safeIndex ? "done" : ""}`} key={key}>
          <i />
          <span>{label}</span>
        </div>
      ))}
      {status === "CANCELLED" && <div className="timeline-step cancelled"><i /><span>Заказ отменён</span></div>}
    </div>
  );
}

function RoutePreview({ form, estimate, locating, onLocate, locationOk }) {
  return (
    <section className="route-preview">
      <div className="route-bg">
        <div className="route-line" />
        <div className="pin pin-a"><b>A</b><span>Откуда</span></div>
        <div className="pin pin-b"><b>B</b><span>Куда</span></div>
        <div className="map-grid" />
      </div>
      <div className="route-overlay">
        <div>
          <strong>{estimate ? `${estimate.distanceKm} км · ${estimate.durationMin} мин` : "Маршрут рассчитывается"}</strong>
          <span>{GOOGLE_MAPS_BROWSER_KEY ? "Google Maps key подключен" : "Карта работает в fallback режиме"}</span>
        </div>
        <button className="ghost-btn" type="button" onClick={onLocate} disabled={locating}>
          {locating ? "Определяем..." : locationOk ? "Местоположение определено" : "Определить моё местоположение"}
        </button>
      </div>
      <div className="route-summary">
        <span><b>A</b>{form.pickupText || "Адрес подачи"}</span>
        <span><b>B</b>{form.dropoffText || "Куда едем"}</span>
      </div>
    </section>
  );
}

function ClientOrderCard({ order, onCancel, cancelling }) {
  const canCancel = ["NEW", "DRIVER_ASSIGNED", "DRIVER_ARRIVED"].includes(order?.status);
  return (
    <section className="active-order-card">
      <div className="card-head">
        <div>
          <small>Активный заказ</small>
          <h2>#{order.short_id}</h2>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div className="order-route">
        <p><b>A</b>{order.pickup_text}</p>
        <p><b>B</b>{order.dropoff_text}</p>
      </div>
      <div className="metric-row">
        <span><b>{money(order.price)}</b><small>Цена</small></span>
        <span><b>{order.tariff}</b><small>Тариф</small></span>
        <span><b>{order.payment_method}</b><small>Оплата</small></span>
      </div>
      {order.notes && <p className="driver-note">{order.notes}</p>}
      {order.driver_name && (
        <div className="driver-assigned">
          <div>
            <b>{order.driver_name}</b>
            <span>{order.driver_car_model || "Авто"} · {order.driver_plate || "номер уточняется"}</span>
          </div>
          {order.driver_phone && <a className="call-btn" href={`tel:${order.driver_phone}`}>Позвонить</a>}
        </div>
      )}
      <Timeline status={order.status} />
      {canCancel && <button className="danger-btn" onClick={onCancel} disabled={cancelling}>{cancelling ? "Отменяем..." : "Отменить заказ"}</button>}
    </section>
  );
}

function Client() {
  const [tariffs, setTariffs] = useState([]);
  const [form, setForm] = useState({
    riderName: "Дарын",
    riderPhone: "+77000000000",
    pickupText: "Atakent, центр",
    dropoffText: "Atakent, вокзал",
    pickupLat: "",
    pickupLng: "",
    dropoffLat: "",
    dropoffLng: "",
    tariff: "Economy",
    paymentMethod: "CASH",
    notes: ""
  });
  const [estimate, setEstimate] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationOk, setLocationOk] = useState(false);
  const [error, setError] = useState("");
  const estimateTimer = useRef(null);

  const selectedTariff = useMemo(() => {
    return (tariffs.length ? tariffs : DEFAULT_TARIFFS).find(t => t.name === form.tariff) || DEFAULT_TARIFFS[0];
  }, [tariffs, form.tariff]);
  const disabled = !form.riderPhone.trim() || !form.pickupText.trim() || !form.dropoffText.trim() || loading;
  const approxPrice = estimate && selectedTariff?.base_price
    ? Math.max(Number(selectedTariff.min_price || 0), Math.round((Number(selectedTariff.base_price || 0) + Number(selectedTariff.price_per_km || 0) * estimate.distanceKm + Number(selectedTariff.price_per_minute || 0) * estimate.durationMin) / 10) * 10)
    : order?.price || 0;

  useEffect(() => {
    api("/api/tariffs").then(data => setTariffs(data.tariffs || [])).catch(err => setError(normalizeError(err)));
  }, []);

  useEffect(() => {
    window.clearTimeout(estimateTimer.current);
    estimateTimer.current = window.setTimeout(() => estimateRoute(form).catch(() => {}), 450);
    return () => window.clearTimeout(estimateTimer.current);
  }, [form.pickupText, form.dropoffText, form.pickupLat, form.pickupLng, form.dropoffLat, form.dropoffLng]);

  useEffect(() => {
    const socket = createSocket();
    socket.on("order_status_public", payload => {
      setOrder(current => current && payload.id === current.id ? { ...current, ...payload } : current);
    });
    socket.on("order_updated", payload => {
      const next = payload.order || payload;
      setOrder(current => current && next?.id === current.id ? { ...current, ...next } : current);
    });
    return () => socket.disconnect();
  }, []);

  function orderPayload(base = form) {
    return {
      ...base,
      pickupLat: fieldNumber(base.pickupLat),
      pickupLng: fieldNumber(base.pickupLng),
      dropoffLat: fieldNumber(base.dropoffLat),
      dropoffLng: fieldNumber(base.dropoffLng)
    };
  }

  async function estimateRoute(base = form) {
    const data = await api("/api/maps/estimate", { method: "POST", body: JSON.stringify(orderPayload(base)) });
    setEstimate(data.estimate);
    return data.estimate;
  }

  async function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("Геолокация недоступна. Введите адрес вручную.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        const next = {
          ...form,
          pickupLat: position.coords.latitude.toFixed(6),
          pickupLng: position.coords.longitude.toFixed(6)
        };
        setForm(next);
        setLocationOk(true);
        setLocating(false);
        estimateRoute(next).catch(() => {});
      },
      () => {
        setLocating(false);
        setLocationOk(false);
        setError("Не удалось получить геолокацию. Разрешите доступ или оставьте ручной адрес.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function createOrder(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const route = await estimateRoute();
      const data = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({ ...orderPayload(), distanceKm: route.distanceKm, durationMin: route.durationMin })
      });
      setOrder(data.order);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder() {
    if (!order) return;
    setLoading(true);
    setError("");
    try {
      const data = await api(`/api/orders/${order.id}/cancel-public`, {
        method: "POST",
        body: JSON.stringify({ riderPhone: order.rider_phone || form.riderPhone })
      });
      setOrder(data.order);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mobile-app client-screen">
      <AppHeader right={<div className="mini-balance"><b>0 ₸</b><span>cashback</span></div>} />
      <Alert message={error} />
      {order && !FINISHED_STATUSES.includes(order.status) ? <ClientOrderCard order={order} onCancel={cancelOrder} cancelling={loading} /> : null}
      <RoutePreview form={form} estimate={estimate} locating={locating} onLocate={locate} locationOk={locationOk} />

      <form className="order-form" onSubmit={createOrder}>
        <section className="address-card">
          <label><span className="point point-a">A</span><input value={form.pickupText} onChange={e => setForm({ ...form, pickupText: e.target.value })} placeholder="Откуда" /></label>
          <label><span className="point point-b">B</span><input value={form.dropoffText} onChange={e => setForm({ ...form, dropoffText: e.target.value })} placeholder="Куда" /></label>
        </section>

        <section className="compact-grid hidden-fields">
          <input value={form.pickupLat} onChange={e => setForm({ ...form, pickupLat: e.target.value })} placeholder="pickupLat" />
          <input value={form.pickupLng} onChange={e => setForm({ ...form, pickupLng: e.target.value })} placeholder="pickupLng" />
          <input value={form.dropoffLat} onChange={e => setForm({ ...form, dropoffLat: e.target.value })} placeholder="dropoffLat" />
          <input value={form.dropoffLng} onChange={e => setForm({ ...form, dropoffLng: e.target.value })} placeholder="dropoffLng" />
        </section>

        <section>
          <h3>Тариф</h3>
          <div className="tariff-grid">
            {(tariffs.length ? tariffs : DEFAULT_TARIFFS).map(tariff => {
              const meta = DEFAULT_TARIFFS.find(item => item.name === tariff.name) || tariff;
              const active = form.tariff === tariff.name;
              const price = estimate && tariff.base_price ? Math.max(Number(tariff.min_price || 0), Math.round((Number(tariff.base_price) + Number(tariff.price_per_km || 0) * estimate.distanceKm + Number(tariff.price_per_minute || 0) * estimate.durationMin) / 10) * 10) : tariff.min_price;
              return (
                <button type="button" className={`tariff-card ${active ? "selected" : ""}`} key={tariff.name} onClick={() => setForm({ ...form, tariff: tariff.name })}>
                  <b>{tariff.name}</b>
                  <span>{meta.label || "Тариф"}</span>
                  <strong>{price ? money(price) : "по расчёту"}</strong>
                  <small>{meta.note || `${tariff.base_price || 0} посадка · ${tariff.price_per_km || 0}/км`}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3>Оплата</h3>
          <div className="payment-grid">
            {PAYMENT_OPTIONS.map(([key, title, note]) => (
              <button type="button" className={`payment-card ${form.paymentMethod === key ? "selected" : ""}`} key={key} onClick={() => setForm({ ...form, paymentMethod: key })}>
                <b>{title}</b><span>{note}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="comment-card">
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Подъезд, ориентир, комментарий водителю" />
        </section>

        <section className="profile-line">
          <input value={form.riderName} onChange={e => setForm({ ...form, riderName: e.target.value })} placeholder="Имя" />
          <input value={form.riderPhone} onChange={e => setForm({ ...form, riderPhone: e.target.value })} placeholder="Телефон" inputMode="tel" />
        </section>

        <div className="bottom-action">
          <button className="primary-cta" disabled={disabled}>{loading ? "Создаём заказ..." : `Заказать за ${approxPrice ? `~${money(approxPrice)}` : "расчётную цену"}`}</button>
        </div>
      </form>
    </main>
  );
}

function LoginCard({ type, onSuccess }) {
  const isDriver = type === "driver";
  const [identifier, setIdentifier] = useState(isDriver ? "+77000000000" : "admin@smarttaxi.local");
  const [password, setPassword] = useState(isDriver ? "123456" : "ChangeMe_2026!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(isDriver ? { phone: identifier, password } : { email: identifier, password });
      onSuccess(data.user);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mobile-app auth-screen">
      <AppHeader subtitle={isDriver ? "Рабочее приложение водителя" : "Панель управления"} />
      <form className="auth-card" onSubmit={submit}>
        <small>{isDriver ? "Driver app" : "Owner/admin"}</small>
        <h1>{isDriver ? "Вход водителя" : "Вход владельца"}</h1>
        <Alert message={error} />
        <label>{isDriver ? "Телефон" : "Email"}<input value={identifier} onChange={e => setIdentifier(e.target.value)} /></label>
        <label>Пароль<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="primary-cta" disabled={loading}>{loading ? "Проверяем..." : "Войти"}</button>
      </form>
    </main>
  );
}

function DriverProfileCard({ driver, stats, activeOrder, onStatus, loading }) {
  const status = driver?.status || "OFFLINE";
  const action = status === "OFFLINE" || status === "BREAK"
    ? ["Выйти на линию", () => onStatus("FREE")]
    : status === "FREE"
      ? ["Уйти с линии", () => onStatus("OFFLINE")]
      : ["Вы на заказе", () => {}];
  return (
    <section className="driver-profile-card">
      <div className="driver-avatar">{driver?.name?.slice(0, 1) || "D"}</div>
      <div className="driver-main">
        <div className="card-head">
          <div><h2>{driver?.name || "Водитель"}</h2><span>{driver?.car_model || "Авто"} · {driver?.plate || "номер"}</span></div>
          <StatusBadge status={status} />
        </div>
        <div className="metric-row">
          <span><b>{money(driver?.debt)}</b><small>Долг</small></span>
          <span><b>{money(driver?.balance)}</b><small>Баланс</small></span>
          <span><b>{driver?.rating || "5.00"}</b><small>Рейтинг</small></span>
        </div>
        <div className="metric-row">
          <span><b>{stats?.orders_total || 0}</b><small>Заказы</small></span>
          <span><b>{stats?.completed_orders || 0}</b><small>Завершено</small></span>
          <span><b>{money(stats?.revenue_total)}</b><small>Выручка</small></span>
        </div>
        <button className={`line-action ${status === "BUSY" ? "disabled" : ""}`} onClick={action[1]} disabled={loading || status === "BUSY"}>{activeOrder ? "Вы на заказе" : action[0]}</button>
      </div>
    </section>
  );
}

function DriverOrderCard({ order, children }) {
  return (
    <article className="job-card">
      <div className="card-head"><strong>#{order.short_id}</strong><StatusBadge status={order.status} /></div>
      <div className="job-route"><p><b>A</b>{order.pickup_text}</p><p><b>B</b>{order.dropoff_text}</p></div>
      <div className="metric-row">
        <span><b>{money(order.price)}</b><small>Цена</small></span>
        <span><b>{order.tariff}</b><small>Тариф</small></span>
        <span><b>{order.payment_method}</b><small>Оплата</small></span>
      </div>
      <div className="job-meta">
        <span>{order.rider_phone}</span>
        <span>{Number(order.distance_km || 0).toFixed(1)} км · {order.duration_min || 0} мин</span>
      </div>
      {order.notes && <p className="driver-note">{order.notes}</p>}
      {children}
    </article>
  );
}

function Driver() {
  const [auth, setAuth] = useState(Boolean(getToken()));
  const [driver, setDriver] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [me, statsData, ordersData] = await Promise.all([
        api("/api/drivers/me"),
        api("/api/drivers/me/stats"),
        api("/api/orders?limit=100")
      ]);
      setDriver(me.driver);
      setStats(statsData.today);
      setActiveOrder(statsData.activeOrder || null);
      setOrders(ordersData.orders || []);
    } catch (err) {
      setError(normalizeError(err));
      if (err?.code === "UNAUTHORIZED" || err?.code === "INVALID_TOKEN") setAuth(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (auth) load(); }, [auth]);
  useEffect(() => {
    if (!auth) return undefined;
    const socket = createSocket();
    socket.emit("join_drivers");
    socket.on("order_created", load);
    socket.on("order_taken", load);
    socket.on("order_updated", load);
    return () => socket.disconnect();
  }, [auth]);

  async function run(fn) {
    setLoading(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(normalizeError(err));
      await load().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(status) {
    await run(() => api("/api/drivers/me/status", { method: "PATCH", body: JSON.stringify({ status }) }));
  }

  async function logoutUser() {
    clearToken();
    setAuth(false);
  }

  if (!auth) return <LoginCard type="driver" onSuccess={() => setAuth(true)} />;

  const isOffline = ["OFFLINE", "BREAK"].includes(driver?.status);
  const isBusy = driver?.status === "BUSY" || Boolean(activeOrder);
  const newOrders = isBusy ? [] : orders.filter(order => order.status === "NEW");

  return (
    <main className="mobile-app driver-screen">
      <AppHeader subtitle="Рабочая смена" right={<button className="small-link" onClick={logoutUser}>Выйти</button>} />
      <Alert message={error} />
      {loading && <LoadingState label="Обновляем смену..." />}
      <DriverProfileCard driver={driver} stats={stats} activeOrder={activeOrder} onStatus={updateStatus} loading={loading} />

      {activeOrder && (
        <section className="driver-section priority">
          <h2>Активная поездка</h2>
          <DriverOrderCard order={activeOrder}>
            <Timeline status={activeOrder.status} />
            {activeOrder.status === "DRIVER_ASSIGNED" && <button className="primary-cta" onClick={() => run(() => api(`/api/orders/${activeOrder.id}/arrived`, { method: "POST" }))}>Я приехал</button>}
            {activeOrder.status === "DRIVER_ARRIVED" && <button className="primary-cta" onClick={() => run(() => api(`/api/orders/${activeOrder.id}/start`, { method: "POST" }))}>Начать поездку</button>}
            {activeOrder.status === "IN_PROGRESS" && <button className="primary-cta" onClick={() => run(() => api(`/api/orders/${activeOrder.id}/complete`, { method: "POST" }))}>Завершить поездку</button>}
          </DriverOrderCard>
        </section>
      )}

      <section className="driver-section">
        <div className="card-head"><h2>Новые заказы</h2><button className="ghost-btn" onClick={load}>Обновить</button></div>
        {isOffline && <EmptyState title="Сначала выйдите на линию" text="Новые заказы можно принимать только в статусе На линии." />}
        {isBusy && <EmptyState title="Вы на заказе" text="Пока поездка активна, новые заказы скрыты." />}
        {!isOffline && !isBusy && !newOrders.length && <EmptyState title="Новых заказов нет" text="Заказы появятся здесь автоматически." />}
        {!isOffline && !isBusy && newOrders.map(order => (
          <DriverOrderCard order={order} key={order.id}>
            <button className="primary-cta" onClick={() => run(() => api(`/api/orders/${order.id}/accept`, { method: "POST" }))}>Принять заказ</button>
          </DriverOrderCard>
        ))}
      </section>
    </main>
  );
}

function Owner() {
  const [auth, setAuth] = useState(Boolean(getToken()));
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [ordersData, driversData, statsData] = await Promise.all([
        api("/api/orders?limit=200"),
        api("/api/drivers"),
        api("/api/finance/stats")
      ]);
      setOrders(ordersData.orders || []);
      setDrivers(driversData.drivers || []);
      setStats(statsData);
    } catch (err) {
      setError(normalizeError(err));
      if (err?.code === "UNAUTHORIZED" || err?.code === "INVALID_TOKEN") setAuth(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (auth) load(); }, [auth]);
  useEffect(() => {
    if (!auth) return undefined;
    const socket = createSocket();
    socket.emit("join_dispatch");
    socket.on("order_created", load);
    socket.on("order_updated", load);
    return () => socket.disconnect();
  }, [auth]);

  if (!auth) return <LoginCard type="owner" onSuccess={() => setAuth(true)} />;

  const driverById = new Map(drivers.map(driver => [driver.id, driver]));
  const activeOrders = orders.filter(order => ACTIVE_STATUSES.includes(order.status));

  return (
    <main className="owner-app">
      <AppHeader subtitle="Панель управления такси" right={<div className="owner-actions"><button className="ghost-btn" onClick={load}>{loading ? "Обновляем..." : "Обновить"}</button><button className="small-link" onClick={() => { clearToken(); setAuth(false); }}>Выйти</button></div>} />
      <Alert message={error} />
      <section className="dashboard-stats">
        <div><b>{stats?.today?.orders_total || 0}</b><span>Заказы сегодня</span></div>
        <div><b>{stats?.today?.new_orders || 0}</b><span>Новые</span></div>
        <div><b>{stats?.today?.active_orders || 0}</b><span>Активные поездки</span></div>
        <div><b>{stats?.today?.completed_orders || 0}</b><span>Завершённые</span></div>
        <div><b>{money(stats?.today?.revenue_total)}</b><span>Выручка</span></div>
        <div><b>{money(stats?.today?.commission_total)}</b><span>Комиссия сервиса</span></div>
        <div><b>{money(stats?.drivers?.driver_debts_total)}</b><span>Долги водителей</span></div>
        <div><b>{money(stats?.today?.cashback_total)}</b><span>Кэшбэк</span></div>
        <div><b>{stats?.drivers?.free_drivers || 0}</b><span>Водители онлайн</span></div>
      </section>

      <section className="owner-grid">
        <div className="owner-panel">
          <div className="card-head"><h2>Активные поездки</h2><span>{activeOrders.length}</span></div>
          {!activeOrders.length && <EmptyState title="Активных поездок нет" text="Когда водитель примет заказ, он появится здесь." />}
          {activeOrders.map(order => <OwnerOrder order={order} driver={driverById.get(order.driver_id)} key={order.id} />)}
        </div>
        <div className="owner-panel">
          <div className="card-head"><h2>Водители</h2><span>{drivers.length}</span></div>
          <div className="drivers-grid">
            {drivers.map(driver => (
              <article className="owner-driver-card" key={driver.id}>
                <div className="card-head"><b>{driver.name}</b><StatusBadge status={driver.is_blocked ? "BLOCKED" : driver.status} /></div>
                <span>{driver.phone}</span>
                <p>{driver.car_model} · {driver.plate}</p>
                <div className="metric-row"><span><b>{money(driver.debt)}</b><small>Долг</small></span><span><b>{money(driver.balance)}</b><small>Баланс</small></span><span><b>{driver.rating || "5.00"}</b><small>Рейтинг</small></span></div>
                <small>Last seen: {driver.last_seen_at ? new Date(driver.last_seen_at).toLocaleString("ru-RU") : "нет данных"}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="owner-panel">
        <div className="card-head"><h2>Все заказы</h2><span>{orders.length}</span></div>
        <div className="orders-table">
          {orders.map(order => <OwnerOrder order={order} driver={driverById.get(order.driver_id)} key={order.id} compact />)}
        </div>
      </section>
    </main>
  );
}

function OwnerOrder({ order, driver, compact = false }) {
  return (
    <article className={`owner-order ${compact ? "compact" : ""}`}>
      <div className="card-head"><strong>#{order.short_id}</strong><StatusBadge status={order.status} /></div>
      <p><b>{order.rider_name}</b> · {order.rider_phone}</p>
      <p>{order.pickup_text} → {order.dropoff_text}</p>
      <div className="metric-row">
        <span><b>{money(order.price)}</b><small>{order.tariff}</small></span>
        <span><b>{order.payment_method}</b><small>Оплата</small></span>
        <span><b>{driver?.name || order.driver_name || "Не назначен"}</b><small>Водитель</small></span>
      </div>
      <small>{order.created_at ? new Date(order.created_at).toLocaleString("ru-RU") : ""}</small>
    </article>
  );
}

function App() {
  const path = window.location.pathname;
  if (path.startsWith("/driver")) return <Driver />;
  if (path.startsWith("/owner")) return <Owner />;
  return <Client />;
}

createRoot(document.getElementById("root")).render(<App />);

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import {
  acceptOrder,
  cancelDriverOrder,
  clearToken,
  completeTrip,
  getDriverOrders,
  getDriverRegions,
  getToken,
  loginUser,
  markDriverArrived,
  selectDriverRegion,
  setDriverStatus,
  startTrip
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";

const activeStatuses = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];
const errorMessages = {
  DRIVER_REGION_NOT_SELECTED: "Выберите рабочий регион",
  DRIVER_REGION_REQUIRED: "Выберите рабочий регион",
  DRIVER_REGION_INACTIVE: "Регион временно отключён",
  REGION_INACTIVE: "Регион временно отключён",
  DRIVER_REGION_NOT_APPROVED: "Вы не одобрены для этого региона",
  DRIVER_REGION_BLOCKED: "Работа в этом регионе заблокирована",
  DRIVER_BLOCKED: "Водитель заблокирован",
  DRIVER_HAS_ACTIVE_ORDER: "У вас уже есть активный заказ",
  ORDER_REGION_MISMATCH: "Заказ относится к другому региону",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят другим водителем",
  FORBIDDEN: "Недостаточно прав для действия",
  UNAUTHORIZED: "Войдите как водитель"
};

const tabs = [
  ["line", "Линия"],
  ["orders", "Заказы"],
  ["trip", "Поездка"]
];

const orderSteps = [
  ["DRIVER_ASSIGNED", "Принят"],
  ["DRIVER_ARRIVED", "Прибыл"],
  ["IN_PROGRESS", "В пути"],
  ["COMPLETED", "Завершено"]
];

function formatError(error) {
  return errorMessages[error?.code] || error?.message || "Запрос не выполнен";
}

function normalizeOrder(order) {
  if (!order) return null;
  const snapshot = order.pricing_snapshot || order.pricingSnapshot || {};
  return {
    ...order,
    pickup: order.pickup_text || order.pickupText || order.pickup || order.pickup_address || "Точка посадки",
    dropoff: order.dropoff_text || order.dropoffText || order.dropoff || order.dropoff_address || "Точка назначения",
    public_status: order.public_status || order.publicStatus || order.status,
    estimated_price: order.estimated_price || order.estimatedPrice || order.price || snapshot.estimatedPrice,
    routeDistanceKm: snapshot.distanceKm || order.distance_km || order.distanceKm,
    routeDurationMin: snapshot.durationMin || order.duration_min || order.durationMin
  };
}

function statusLabel(status) {
  const map = {
    OFFLINE: "Не на линии",
    FREE: "На линии",
    BUSY: "Занят",
    NEW: "Поиск",
    DRIVER_ASSIGNED: "Принят",
    DRIVER_ARRIVED: "Прибыл",
    IN_PROGRESS: "В пути",
    COMPLETED: "Завершено",
    CANCELLED: "Отменён",
    CANCELED: "Отменён"
  };
  return map[status] || status || "Не на линии";
}

function nextTripAction(order) {
  const status = order?.status || order?.public_status;
  if (status === "DRIVER_ASSIGNED") return { label: "Прибыл", action: markDriverArrived };
  if (status === "DRIVER_ARRIVED") return { label: "Начать поездку", action: startTrip };
  if (status === "IN_PROGRESS") return { label: "Завершить поездку", action: completeTrip };
  return null;
}

function mergeOrder(list, nextOrder) {
  const normalized = normalizeOrder(nextOrder);
  if (!normalized?.id) return list;
  const exists = list.some(order => order.id === normalized.id);
  return exists ? list.map(order => (order.id === normalized.id ? { ...order, ...normalized } : order)) : [normalized, ...list];
}

export default function DriverApp() {
  const [logged, setLogged] = useState(Boolean(getToken()));
  const [auth, setAuth] = useState({ phone: "", email: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [driver, setDriver] = useState(null);
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionError, setRegionError] = useState("");
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [actionError, setActionError] = useState("");
  const [tab, setTab] = useState("line");
  const socketRef = useRef(null);

  const activeOrder = useMemo(
    () => orders.map(normalizeOrder).find(order => activeStatuses.includes(order.status)) || null,
    [orders]
  );
  const availableOrders = useMemo(
    () => orders.map(normalizeOrder).filter(order => order.status === "NEW" && !order.driver_id && !order.driverId),
    [orders]
  );
  const selectedRegion = regions.find(region => region.id === selectedRegionId || region.regionId === selectedRegionId);
  const driverStatus = driver?.status || (activeOrder ? "BUSY" : "OFFLINE");
  const isOnline = driverStatus === "FREE" || driverStatus === "BUSY";
  const canGoOnline = Boolean(logged && selectedRegionId && selectedRegion?.status !== "BLOCKED" && selectedRegion?.is_active !== false && selectedRegion?.isActive !== false);
  const disabledReason = !logged
    ? "Войдите как водитель"
    : !selectedRegionId
      ? "Выберите рабочий регион"
      : selectedRegion?.status === "BLOCKED"
        ? "Работа в этом регионе заблокирована"
        : selectedRegion?.is_active === false || selectedRegion?.isActive === false
          ? "Регион временно отключён"
          : "";

  useEffect(() => {
    if (!logged) return;
    loadRegions();
    loadOrders();
    connectSocket();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [logged]);

  useEffect(() => {
    if (!logged || !isOnline) return;
    loadOrders();
  }, [logged, isOnline, selectedRegionId]);

  useEffect(() => {
    if (activeOrder?.id && socketRef.current) {
      socketRef.current.emit("join_order", activeOrder.id);
    }
  }, [activeOrder?.id]);

  async function loadRegions() {
    setRegionsLoading(true);
    setRegionError("");
    try {
      const payload = await getDriverRegions();
      const list = payload.regions || payload.items || payload || [];
      setRegions(list);
      const current = payload.driver?.current_region_id || payload.driver?.currentRegionId || list.find(item => item.selected)?.id || list[0]?.id || "";
      setSelectedRegionId(current);
      setDriver(payload.driver || null);
    } catch (error) {
      setRegionError(formatError(error));
    } finally {
      setRegionsLoading(false);
    }
  }

  async function loadOrders() {
    if (!logged) return;
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const payload = await getDriverOrders();
      const list = (payload.orders || payload.items || payload || []).map(normalizeOrder);
      setOrders(list);
    } catch (error) {
      setOrdersError(formatError(error));
    } finally {
      setOrdersLoading(false);
    }
  }

  function connectSocket() {
    socketRef.current?.disconnect();
    const socket = createSocket();
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("join_drivers");
      if (activeOrder?.id) socket.emit("join_order", activeOrder.id);
    });
    socket.on("order_created", order => setOrders(current => mergeOrder(current, order)));
    socket.on("order_update", order => setOrders(current => mergeOrder(current, order)));
    socket.on("order_status", order => setOrders(current => mergeOrder(current, order)));
    socket.on("dispatch_error", error => setOrdersError(formatError(error)));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const payload = await loginUser(auth);
      setDriver(payload.user || payload.driver || null);
      setLogged(true);
      setTab("line");
    } catch (error) {
      setLoginError(formatError(error));
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    socketRef.current?.disconnect();
    socketRef.current = null;
    clearToken();
    setLogged(false);
    setDriver(null);
    setOrders([]);
    setRegions([]);
    setSelectedRegionId("");
    setTab("line");
  }

  async function handleRegionChange(regionId) {
    setRegionError("");
    setSelectedRegionId(regionId);
    try {
      const payload = await selectDriverRegion(regionId);
      setDriver(payload.driver || driver);
      await loadOrders();
    } catch (error) {
      setRegionError(formatError(error));
    }
  }

  async function handleStatusChange(nextStatus) {
    setOnlineLoading(true);
    setActionError("");
    try {
      const payload = await setDriverStatus(nextStatus);
      setDriver(payload.driver || { ...driver, status: nextStatus });
      if (nextStatus === "FREE") {
        socketRef.current?.emit("join_drivers");
        await loadOrders();
      }
    } catch (error) {
      setActionError(formatError(error));
    } finally {
      setOnlineLoading(false);
    }
  }

  async function handleAccept(orderId) {
    setActionLoading(orderId);
    setActionError("");
    try {
      const payload = await acceptOrder(orderId);
      const order = normalizeOrder(payload.order || payload);
      setOrders(current => mergeOrder(current, order));
      setDriver(current => ({ ...(current || driver), status: "BUSY" }));
      setTab("trip");
      if (order?.id) socketRef.current?.emit("join_order", order.id);
    } catch (error) {
      setActionError(formatError(error));
    } finally {
      setActionLoading("");
    }
  }

  async function handleTripAction(orderId, action) {
    setActionLoading(orderId);
    setActionError("");
    try {
      const payload = await action(orderId);
      const order = normalizeOrder(payload.order || payload);
      setOrders(current => mergeOrder(current, order));
      if (order?.status === "COMPLETED" || order?.status === "CANCELLED") {
        setDriver(current => ({ ...(current || driver), status: "FREE" }));
      }
    } catch (error) {
      setActionError(formatError(error));
    } finally {
      setActionLoading("");
    }
  }

  async function handleCancel(orderId) {
    await handleTripAction(orderId, cancelDriverOrder);
  }

  return (
    <PhoneFrame className="taxi-pwa driver-pwa">
      <header className="taxi-app-header">
        <div className="taxi-brand">
          <SmartTaxiLogo />
          <div>
            <span>SmartTaxi</span>
            <small>Водитель</small>
          </div>
        </div>
        {logged ? (
          <button className="text-action" type="button" onClick={handleLogout}>Выйти</button>
        ) : (
          <span className="status-pill muted">Вход</span>
        )}
      </header>

      <section className="app-content">
        <div className="screen-grid driver-grid">
          <div className="screen-column primary">
            {tab === "line" && (
              <LineTab
                logged={logged}
                auth={auth}
                setAuth={setAuth}
                onLogin={handleLogin}
                loginLoading={loginLoading}
                loginError={loginError}
                driverStatus={driverStatus}
                regions={regions}
                selectedRegionId={selectedRegionId}
                selectedRegion={selectedRegion}
                regionsLoading={regionsLoading}
                regionError={regionError}
                onRegionChange={handleRegionChange}
                isOnline={isOnline}
                canGoOnline={canGoOnline}
                disabledReason={disabledReason}
                onlineLoading={onlineLoading}
                actionError={actionError}
                onStatusChange={handleStatusChange}
              />
            )}
            {tab === "orders" && (
              <OrdersTab
                isOnline={isOnline}
                orders={availableOrders}
                loading={ordersLoading}
                error={ordersError || actionError}
                actionLoading={actionLoading}
                onRefresh={loadOrders}
                onAccept={handleAccept}
              />
            )}
            {tab === "trip" && (
              <TripTab
                order={activeOrder}
                error={actionError}
                actionLoading={actionLoading}
                onTripAction={handleTripAction}
                onCancel={handleCancel}
              />
            )}
          </div>

          <aside className="screen-column secondary desktop-only">
            {logged ? (
              <>
                <DriverStateCard status={driverStatus} />
                <RegionSummary region={selectedRegion} />
                <TripPreview order={activeOrder} />
              </>
            ) : (
              <AppCard title="Работайте в своём регионе">
                <p className="helper-text">Водитель выходит на линию только после одобрения администратором.</p>
              </AppCard>
            )}
          </aside>
        </div>
      </section>

      <BottomTabs active={tab} onSelect={setTab} />
    </PhoneFrame>
  );
}

function LineTab(props) {
  const {
    logged,
    auth,
    setAuth,
    onLogin,
    loginLoading,
    loginError,
    driverStatus,
    regions,
    selectedRegionId,
    selectedRegion,
    regionsLoading,
    regionError,
    onRegionChange,
    isOnline,
    canGoOnline,
    disabledReason,
    onlineLoading,
    actionError,
    onStatusChange
  } = props;

  return (
    <>
      <ScreenIntro title="Рабочая смена" helper="Выходите на линию только в одобренном регионе" />
      {!logged ? (
        <DriverLogin auth={auth} setAuth={setAuth} onLogin={onLogin} loading={loginLoading} error={loginError} />
      ) : (
        <>
          <DriverStateCard status={driverStatus} />
          <RegionCard
            regions={regions}
            selectedRegionId={selectedRegionId}
            selectedRegion={selectedRegion}
            loading={regionsLoading}
            error={regionError}
            onChange={onRegionChange}
          />
          <OnlineCard
            isOnline={isOnline}
            canGoOnline={canGoOnline}
            disabledReason={disabledReason}
            loading={onlineLoading}
            error={actionError}
            onStatusChange={onStatusChange}
          />
        </>
      )}
    </>
  );
}

function DriverLogin({ auth, setAuth, onLogin, loading, error }) {
  return (
    <form className="app-card driver-login-clean" onSubmit={onLogin}>
      <SmartTaxiLogo large />
      <h2>Вход для водителя</h2>
      <p>Работайте только в одобренном регионе</p>
      <div className="form-grid">
        <label>
          <span>Телефон</span>
          <input value={auth.phone} onChange={event => setAuth(current => ({ ...current, phone: event.target.value }))} placeholder="+7" autoComplete="tel" />
        </label>
        <label>
          <span>Email</span>
          <input value={auth.email} onChange={event => setAuth(current => ({ ...current, email: event.target.value }))} placeholder="Если вход по email" autoComplete="email" />
        </label>
        <label>
          <span>Пароль</span>
          <input value={auth.password} onChange={event => setAuth(current => ({ ...current, password: event.target.value }))} type="password" placeholder="Пароль" autoComplete="current-password" />
        </label>
      </div>
      {error && <div className="message error">{error}</div>}
      <Button className="full-width" disabled={loading} type="submit">{loading ? "Вход..." : "Войти"}</Button>
    </form>
  );
}

function DriverStateCard({ status }) {
  return (
    <AppCard title="Статус">
      <div className="status-line">
        <StatusBadge status={status} />
        <strong>{statusLabel(status)}</strong>
      </div>
    </AppCard>
  );
}

function RegionCard({ regions, selectedRegionId, selectedRegion, loading, error, onChange }) {
  return (
    <AppCard title="Рабочий регион">
      {loading ? (
        <div className="skeleton-block" />
      ) : regions.length ? (
        <>
          <select className="select-control" value={selectedRegionId} onChange={event => onChange(event.target.value)}>
            {regions.map(region => (
              <option key={region.id || region.regionId} value={region.id || region.regionId}>
                {region.name || region.regionName}
              </option>
            ))}
          </select>
          {selectedRegion?.status === "BLOCKED" && <div className="message warning">Работа в этом регионе заблокирована</div>}
          {(selectedRegion?.is_active === false || selectedRegion?.isActive === false) && <div className="message warning">Регион временно отключён</div>}
        </>
      ) : (
        <EmptyState title="Нет одобренных регионов" text="Администратор должен одобрить вас для работы в регионе." />
      )}
      {error && <div className="message error">{error}</div>}
    </AppCard>
  );
}

function OnlineCard({ isOnline, canGoOnline, disabledReason, loading, error, onStatusChange }) {
  const disabled = loading || (!isOnline && !canGoOnline);
  return (
    <AppCard title="Линия">
      <Button className="full-width" disabled={disabled} onClick={() => onStatusChange(isOnline ? "OFFLINE" : "FREE")}>
        {loading ? "Обновляем..." : isOnline ? "Уйти с линии" : "Выйти на линию"}
      </Button>
      {!isOnline && disabledReason && <p className="helper-text center">{disabledReason}</p>}
      {error && <div className="message error">{error}</div>}
    </AppCard>
  );
}

function OrdersTab({ isOnline, orders, loading, error, actionLoading, onRefresh, onAccept }) {
  return (
    <>
      <ScreenIntro title="Заказы в регионе" helper="Показываются только заказы выбранного одобренного региона" />
      <AppCard title="Доступные заказы" action={<button type="button" className="text-action" onClick={onRefresh}>Обновить</button>}>
        {loading ? (
          <div className="skeleton-list"><span /><span /><span /></div>
        ) : !isOnline ? (
          <EmptyState title="Выйдите на линию, чтобы получать заказы" text="После выхода на линию здесь появятся региональные заказы." />
        ) : orders.length ? (
          <div className="order-list-clean">
            {orders.map(order => (
              <OrderCard key={order.id} order={order} loading={actionLoading === order.id} onAccept={() => onAccept(order.id)} />
            ))}
          </div>
        ) : (
          <EmptyState title="Заказов в вашем регионе пока нет" text="Новые заказы появятся здесь после backend-dispatch." />
        )}
        {error && <div className="message error">{error}</div>}
      </AppCard>
    </>
  );
}

function OrderCard({ order, loading, onAccept }) {
  return (
    <article className="order-card-clean">
      <CompactRoute pickup={order.pickup} dropoff={order.dropoff} />
      <div className="order-meta-clean">
        <StatusBadge status={order.status} />
        {order.estimated_price && <strong><Money value={order.estimated_price} /></strong>}
      </div>
      <RouteMeta order={order} />
      <Button className="full-width" disabled={loading} onClick={onAccept}>{loading ? "Принимаем..." : "Принять"}</Button>
    </article>
  );
}

function TripTab({ order, error, actionLoading, onTripAction, onCancel }) {
  const action = nextTripAction(order);
  return (
    <>
      <ScreenIntro title="Активная поездка" helper="Следующий шаг доступен только по текущему статусу заказа" />
      <AppCard title="Поездка">
        {order ? (
          <div className="active-trip-clean">
            <StatusBadge status={order.status} />
            <TripStepper status={order.status} />
            <CompactRoute pickup={order.pickup} dropoff={order.dropoff} />
            <RouteMeta order={order} />
            {order.estimated_price && <div className="price-row"><span>Стоимость</span><strong><Money value={order.estimated_price} /></strong></div>}
            {action && (
              <Button className="full-width" disabled={actionLoading === order.id} onClick={() => onTripAction(order.id, action.action)}>
                {actionLoading === order.id ? "Обновляем..." : action.label}
              </Button>
            )}
            {["DRIVER_ASSIGNED", "DRIVER_ARRIVED"].includes(order.status) && (
              <Button variant="secondary" className="full-width danger-soft" disabled={actionLoading === order.id} onClick={() => onCancel(order.id)}>
                Отменить поездку
              </Button>
            )}
          </div>
        ) : (
          <EmptyState title="Активной поездки нет" text="Примите заказ, и маршрут появится здесь." />
        )}
        {error && <div className="message error">{error}</div>}
      </AppCard>
    </>
  );
}

function TripPreview({ order }) {
  return (
    <AppCard title="Активная поездка">
      {order ? (
        <>
          <StatusBadge status={order.status} />
          <CompactRoute pickup={order.pickup} dropoff={order.dropoff} />
        </>
      ) : (
        <EmptyState title="Поездки нет" text="Активный заказ появится после принятия." />
      )}
    </AppCard>
  );
}

function RegionSummary({ region }) {
  return (
    <AppCard title="Регион">
      {region ? (
        <div className="region-summary">
          <strong>{region.name || region.regionName}</strong>
          <span>{region.status === "BLOCKED" ? "Заблокирован" : "Одобрен"}</span>
        </div>
      ) : (
        <p className="helper-text">Регион не выбран</p>
      )}
    </AppCard>
  );
}

function ScreenIntro({ title, helper }) {
  return (
    <div className="screen-intro">
      <h1>{title}</h1>
      <p>{helper}</p>
    </div>
  );
}

function AppCard({ title, action, children }) {
  return (
    <section className="app-card">
      <div className="card-head-clean">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CompactRoute({ pickup, dropoff }) {
  return (
    <div className="compact-route-clean">
      <div className="route-connector mini">
        <span className="route-dot pickup" />
        <span className="route-line" />
        <span className="route-dot dropoff" />
      </div>
      <div>
        <strong>{pickup}</strong>
        <span>{dropoff}</span>
      </div>
    </div>
  );
}

function RouteMeta({ order }) {
  if (!order?.routeDistanceKm && !order?.routeDurationMin) return null;
  const parts = [];
  if (order.routeDistanceKm) parts.push(`${Number(order.routeDistanceKm).toFixed(1)} км`);
  if (order.routeDurationMin) parts.push(`${Math.round(Number(order.routeDurationMin))} мин`);
  return <p className="helper-text">Маршрут: {parts.join(" · ")}</p>;
}

function TripStepper({ status }) {
  const currentIndex = Math.max(0, orderSteps.findIndex(([key]) => key === status));
  return (
    <div className="status-stepper-clean">
      {orderSteps.map(([key, label], index) => (
        <span key={key} className={index <= currentIndex ? "done" : ""}>{label}</span>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = status || "OFFLINE";
  const tone = normalized === "FREE"
    ? "success"
    : normalized === "BUSY" || activeStatuses.includes(normalized)
      ? "warning"
      : normalized === "COMPLETED"
        ? "success"
        : normalized === "CANCELLED" || normalized === "CANCELED"
          ? "danger"
          : "muted";
  return <span className={`status-badge-clean ${tone}`}>{statusLabel(normalized)}</span>;
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state-clean">
      <div className="empty-mark" aria-hidden="true">
        <span />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function BottomTabs({ active, onSelect }) {
  return (
    <nav className="mobile-bottom-tabs" aria-label="Навигация водителя">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" className={active === key ? "active" : ""} onClick={() => onSelect(key)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

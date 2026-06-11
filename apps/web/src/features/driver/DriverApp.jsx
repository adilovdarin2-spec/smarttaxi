import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import MapView from "../map/MapView.jsx";
import {
  acceptOrder,
  cancelDriverOrder,
  clearToken,
  completeTrip,
  getDriverActiveOrder,
  getDriverDebt,
  getDriverEarningsToday,
  getDriverOrders,
  getDriverProfile,
  getDriverRegions,
  getToken,
  loginUser,
  markDriverArrived,
  markDriverGoingToClient,
  markDriverWaiting,
  noShowDriverOrder,
  rejectDriverOrder,
  selectDriverRegion,
  setDriverStatus,
  startTrip
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";

const ACTIVE_STATUSES = [
  "DRIVER_FOUND",
  "DRIVER_GOING_TO_CLIENT",
  "DRIVER_ARRIVED",
  "WAITING_CLIENT",
  "TRIP_STARTED"
];

const FINAL_STATUSES = [
  "TRIP_COMPLETED",
  "PAYMENT_PENDING",
  "PAID",
  "RATED",
  "NO_SHOW",
  "CANCELLED_BY_CLIENT",
  "CANCELLED_BY_DRIVER",
  "CANCELLED_BY_OPERATOR",
  "CANCELLED",
  "COMPLETED"
];

const DRIVER_TABS = [
  ["line", "Линия"],
  ["orders", "Заказы"],
  ["active", "Поездка"],
  ["money", "Доход"]
];

const ERROR_MESSAGES = {
  DRIVER_REGION_NOT_SELECTED: "Выберите рабочий регион",
  DRIVER_REGION_REQUIRED: "Выберите рабочий регион",
  DRIVER_REGION_INACTIVE: "Регион временно отключен",
  REGION_INACTIVE: "Регион временно отключен",
  DRIVER_REGION_NOT_APPROVED: "Вы не одобрены для этого региона",
  DRIVER_REGION_BLOCKED: "Работа в этом регионе заблокирована",
  DRIVER_BLOCKED: "Профиль водителя заблокирован",
  DRIVER_HAS_ACTIVE_ORDER: "Сначала завершите активный заказ",
  DRIVER_OFFLINE: "Выйдите на линию, чтобы принять заказ",
  DRIVER_ALREADY_HAS_ACTIVE_ORDER: "У вас уже есть активный заказ",
  ORDER_REGION_MISMATCH: "Заказ относится к другому региону",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят другим водителем",
  ORDER_NOT_FOUND: "Заказ не найден",
  INVALID_STATUS_TRANSITION: "Это действие сейчас недоступно",
  FORBIDDEN: "Недостаточно прав для действия",
  UNAUTHORIZED: "Войдите как водитель"
};

const STATUS_LABELS = {
  OFFLINE: "Не на линии",
  ONLINE: "На линии",
  FREE: "На линии",
  BUSY: "Занят",
  SEARCHING_DRIVER: "Новый заказ",
  DRIVER_FOUND: "Заказ принят",
  DRIVER_GOING_TO_CLIENT: "Еду к клиенту",
  DRIVER_ARRIVED: "На месте",
  WAITING_CLIENT: "Ожидание клиента",
  TRIP_STARTED: "В поездке",
  TRIP_COMPLETED: "Поездка завершена",
  PAYMENT_PENDING: "Ожидает оплату",
  PAID: "Оплачено",
  RATED: "Оценено",
  NO_SHOW: "Клиент не вышел",
  CANCELLED_BY_CLIENT: "Отменен клиентом",
  CANCELLED_BY_DRIVER: "Отменен водителем",
  CANCELLED_BY_OPERATOR: "Отменен оператором"
};

const PAYMENT_LABELS = {
  CASH: "Наличные",
  KASPI: "Kaspi перевод",
  CARD: "Карта"
};

function formatError(error) {
  return ERROR_MESSAGES[error?.code] || error?.message || "Запрос не выполнен";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Неизвестно";
}

function cleanAddress(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /\bqa\b|test|mock|fake|demo/i.test(text)) return fallback;
  return text;
}

function normalizeOrder(order) {
  if (!order) return null;
  const snapshot = order.pricing_snapshot || order.pricingSnapshot || {};
  const pickupLat = Number(order.pickup_lat ?? order.pickupLat);
  const pickupLng = Number(order.pickup_lng ?? order.pickupLng);
  const dropoffLat = Number(order.dropoff_lat ?? order.dropoffLat);
  const dropoffLng = Number(order.dropoff_lng ?? order.dropoffLng);
  const status = order.status || order.public_status || order.publicStatus;
  return {
    ...order,
    status,
    public_status: order.public_status || order.publicStatus || status,
    pickup: cleanAddress(order.pickup_text || order.pickupText || order.pickup || order.pickup_address, "Точка подачи"),
    dropoff: cleanAddress(order.dropoff_text || order.dropoffText || order.dropoff || order.dropoff_address, "Адрес назначения"),
    pickupPoint: Number.isFinite(pickupLat) && Number.isFinite(pickupLng) ? { lat: pickupLat, lng: pickupLng } : null,
    destinationPoint: Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng) ? { lat: dropoffLat, lng: dropoffLng } : null,
    estimatedPrice: Number(order.estimated_price || order.estimatedPrice || order.price || snapshot.estimatedPrice || 0),
    payout: Number(order.driver_payout_estimate || order.driverPayoutEstimate || 0),
    tariff: order.tariff || order.tariff_name || "Economy",
    paymentMethod: order.payment_method || order.paymentMethod || "CASH",
    distanceKm: Number(snapshot.distanceKm || order.distance_km || order.distanceKm || 0),
    durationMin: Number(snapshot.durationMin || order.duration_min || order.durationMin || 0)
  };
}

function mergeOrder(list, incoming) {
  const order = normalizeOrder(incoming);
  if (!order?.id) return list;
  if (FINAL_STATUSES.includes(order.status)) {
    return list.filter(item => item.id !== order.id);
  }
  return list.some(item => item.id === order.id)
    ? list.map(item => (item.id === order.id ? { ...item, ...order } : item))
    : [order, ...list];
}

function regionName(region) {
  return region?.displayName || region?.display_name || region?.regionName || region?.region_name || region?.name || "Регион";
}

function regionKey(region) {
  return region?.regionId || region?.region_id || region?.id || "";
}

function regionCenter(region) {
  const lat = Number(region?.centerLat ?? region?.center_lat);
  const lng = Number(region?.centerLng ?? region?.center_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function extractOrders(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.orders)) return payload.orders;
  return [];
}

function orderNextAction(order) {
  const status = order?.status;
  if (status === "DRIVER_FOUND") return { label: "Еду к клиенту", fn: markDriverGoingToClient };
  if (status === "DRIVER_GOING_TO_CLIENT") return { label: "Я приехал", fn: markDriverArrived };
  if (status === "DRIVER_ARRIVED") return { label: "Начать ожидание", fn: markDriverWaiting };
  if (status === "WAITING_CLIENT") return { label: "Начать поездку", fn: startTrip };
  if (status === "TRIP_STARTED") return { label: "Завершить поездку", fn: completeTrip };
  return null;
}

function canCancelOrder(order) {
  return ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT"].includes(order?.status);
}

function canNoShow(order) {
  return ["DRIVER_ARRIVED", "WAITING_CLIENT"].includes(order?.status);
}

function DriverLogin({ auth, setAuth, onSubmit, loading, error }) {
  return (
    <PhoneFrame className="driver-core-phone driver-core-login">
      <section className="driver-core-auth-card">
        <SmartTaxiLogo className="auth-logo" />
        <div>
          <p className="driver-core-eyebrow">Кабинет водителя</p>
          <h1>Выйдите на линию и принимайте заказы</h1>
          <p>Вход только для одобренных водителей SmartTaxi.</p>
        </div>
        <form onSubmit={onSubmit} className="driver-core-form">
          <label>
            Телефон
            <input
              value={auth.phone}
              onChange={event => setAuth(prev => ({ ...prev, phone: event.target.value }))}
              placeholder="+7 700 000 00 00"
              autoComplete="tel"
              inputMode="tel"
            />
          </label>
          <label>
            Пароль
            <input
              value={auth.password}
              onChange={event => setAuth(prev => ({ ...prev, password: event.target.value }))}
              placeholder="Пароль"
              autoComplete="current-password"
              type="password"
            />
          </label>
          {error && <div className="driver-core-error">{error}</div>}
          <Button type="submit" className="driver-core-wide" disabled={loading}>{loading ? "Входим..." : "Войти"}</Button>
        </form>
      </section>
    </PhoneFrame>
  );
}

function DriverHeader({ driver, currentRegion, onLogout }) {
  const status = driver?.publicStatus || driver?.public_status || driver?.status || "OFFLINE";
  return (
    <header className="driver-core-header">
      <div className="driver-core-brand">
        <SmartTaxiLogo className="compact" />
        <span>{regionName(currentRegion)}</span>
      </div>
      <div className={`driver-core-status ${status.toLowerCase()}`}>{statusLabel(status)}</div>
      <button className="driver-core-logout" type="button" onClick={onLogout}>Выйти</button>
    </header>
  );
}

function EarningsStrip({ earnings, debt }) {
  return (
    <section className="driver-core-stats">
      <div>
        <small>Сегодня</small>
        <strong><Money value={earnings?.todayGrossKzt} /></strong>
      </div>
      <div>
        <small>Заказов</small>
        <strong>{earnings?.completedOrders || 0}</strong>
      </div>
      <div>
        <small>Долг</small>
        <strong><Money value={debt?.debtKzt ?? earnings?.debtKzt} /></strong>
      </div>
    </section>
  );
}

function RegionSelector({ regions, selectedRegionId, onSelect, disabled }) {
  if (!regions.length) return null;
  return (
    <section className="driver-core-region-card">
      <small>Рабочий регион</small>
      <select value={selectedRegionId || ""} onChange={event => onSelect(event.target.value)} disabled={disabled}>
        <option value="">Выберите регион</option>
        {regions.map(region => (
          <option key={region.id || regionKey(region)} value={regionKey(region)}>{regionName(region)}</option>
        ))}
      </select>
    </section>
  );
}

function IncomingOrderCard({ order, onAccept, onReject, loading }) {
  return (
    <article className="driver-core-order-card">
      <div className="driver-core-order-top">
        <span>{order.tariff}</span>
        <strong><Money value={order.estimatedPrice} /></strong>
      </div>
      <div className="driver-core-route-lines">
        <div>
          <i className="pickup-dot" />
          <span>
            <small>Откуда</small>
            <b>{order.pickup}</b>
          </span>
        </div>
        <div>
          <i className="dropoff-dot" />
          <span>
            <small>Куда</small>
            <b>{order.dropoff}</b>
          </span>
        </div>
      </div>
      <div className="driver-core-order-meta">
        <span>{order.distanceKm ? `${order.distanceKm.toFixed(1)} км` : "Маршрут"}</span>
        <span>{order.durationMin ? `${Math.round(order.durationMin)} мин` : "ETA"}</span>
        <span>{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</span>
      </div>
      <div className="driver-core-card-actions">
        <Button onClick={() => onAccept(order)} disabled={Boolean(loading)}>Принять</Button>
        <Button variant="secondary" onClick={() => onReject(order)} disabled={Boolean(loading)}>Пропустить</Button>
      </div>
    </article>
  );
}

function ActiveOrderPanel({ order, onAction, onCancel, onNoShow, loading }) {
  const next = orderNextAction(order);
  return (
    <section className="driver-core-active">
      <div className="driver-core-active-head">
        <span>{statusLabel(order.status)}</span>
        <strong><Money value={order.estimatedPrice} /></strong>
      </div>
      <MapView
        pickup={order.pickupPoint}
        destination={order.destinationPoint}
        center={order.pickupPoint || order.destinationPoint}
        compact
        status={statusLabel(order.status)}
      />
      <div className="driver-core-route-lines large">
        <div>
          <i className="pickup-dot" />
          <span>
            <small>Подача</small>
            <b>{order.pickup}</b>
          </span>
        </div>
        <div>
          <i className="dropoff-dot" />
          <span>
            <small>Назначение</small>
            <b>{order.dropoff}</b>
          </span>
        </div>
      </div>
      <div className="driver-core-order-meta">
        <span>{order.tariff}</span>
        <span>{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</span>
        <span>{order.payout ? `Водителю ${order.payout.toLocaleString("ru-RU")} ₸` : "Выплата после завершения"}</span>
      </div>
      <div className="driver-core-card-actions stack">
        {next && (
          <Button onClick={() => onAction(order, next)} disabled={Boolean(loading)}>
            {loading === "next" ? "Сохраняем..." : next.label}
          </Button>
        )}
        <div className="driver-core-split-actions">
          <a className="driver-core-call" href={order.rider_phone ? `tel:${order.rider_phone}` : undefined}>Позвонить</a>
          {canNoShow(order) && (
            <Button variant="secondary" onClick={() => onNoShow(order)} disabled={Boolean(loading)}>
              Клиент не вышел
            </Button>
          )}
          {canCancelOrder(order) && (
            <Button variant="ghost" onClick={() => onCancel(order)} disabled={Boolean(loading)}>
              Отменить
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function DriverApp() {
  const [logged, setLogged] = useState(Boolean(getToken()));
  const [auth, setAuth] = useState({ phone: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [driver, setDriver] = useState(null);
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [incomingOrders, setIncomingOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [debt, setDebt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("line");
  const socketRef = useRef(null);

  const currentRegion = useMemo(
    () => regions.find(region => regionKey(region) === selectedRegionId) || regions.find(region => regionKey(region) === driver?.currentRegionId),
    [regions, selectedRegionId, driver?.currentRegionId]
  );

  const isOnline = ["ONLINE", "FREE"].includes(driver?.publicStatus || driver?.status);
  const center = activeOrder?.pickupPoint || activeOrder?.destinationPoint || regionCenter(currentRegion);

  const refreshDriver = useCallback(async () => {
    if (!getToken()) return;
    const [profileResult, regionsResult, incomingResult, activeResult, earningsResult, debtResult] = await Promise.allSettled([
      getDriverProfile(),
      getDriverRegions(),
      getDriverOrders(),
      getDriverActiveOrder(),
      getDriverEarningsToday(),
      getDriverDebt()
    ]);

    if (profileResult.status === "fulfilled") {
      setDriver(profileResult.value.driver);
      setSelectedRegionId(profileResult.value.driver?.currentRegionId || "");
      if (profileResult.value.activeOrder) setActiveOrder(normalizeOrder(profileResult.value.activeOrder));
    } else {
      throw profileResult.reason;
    }

    if (regionsResult.status === "fulfilled") {
      setRegions(regionsResult.value.regions || regionsResult.value.items || []);
    }
    if (incomingResult.status === "fulfilled") {
      setIncomingOrders(extractOrders(incomingResult.value).map(normalizeOrder).filter(Boolean));
      if (incomingResult.value.driver) setDriver(incomingResult.value.driver);
    }
    if (activeResult.status === "fulfilled") {
      setActiveOrder(normalizeOrder(activeResult.value.activeOrder));
      if (activeResult.value.driver) setDriver(activeResult.value.driver);
    }
    if (earningsResult.status === "fulfilled") setEarnings(earningsResult.value);
    if (debtResult.status === "fulfilled") setDebt(debtResult.value);
  }, []);

  useEffect(() => {
    if (!logged) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError("");
    refreshDriver()
      .catch(error => {
        if (alive) setError(formatError(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [logged, refreshDriver]);

  useEffect(() => {
    if (!logged) return undefined;
    const socket = createSocket();
    socketRef.current = socket;
    const updateOrder = payload => {
      const next = normalizeOrder(payload?.order || payload);
      if (!next?.id) return;
      if (ACTIVE_STATUSES.includes(next.status)) setActiveOrder(next);
      if (FINAL_STATUSES.includes(next.status)) {
        setActiveOrder(current => (current?.id === next.id ? null : current));
        refreshDriver().catch(() => {});
      }
      setIncomingOrders(list => mergeOrder(list, next));
    };
    const refreshIncoming = () => {
      getDriverOrders()
        .then(data => setIncomingOrders(extractOrders(data).map(normalizeOrder).filter(Boolean)))
        .catch(() => {});
    };
    [
      "order_created",
      "order.created",
      "order_updated",
      "order.status",
      "order.driver_found",
      "order.driver_going_to_client",
      "order.driver_arrived",
      "order.waiting_client",
      "order.trip_started",
      "order.trip_completed",
      "order.cancelled",
      "order.paid",
      "order.rated"
    ].forEach(event => socket.on(event, updateOrder));
    socket.on("connect", refreshIncoming);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [logged, refreshDriver]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const data = await loginUser(auth);
      if (data.user?.role !== "DRIVER") throw new Error("Этот аккаунт не является водительским");
      setLogged(true);
    } catch (error) {
      setLoginError(formatError(error));
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    setLogged(false);
    setDriver(null);
    setIncomingOrders([]);
    setActiveOrder(null);
  }

  async function withAction(name, fn) {
    setActionLoading(name);
    setError("");
    try {
      const result = await fn();
      if (result?.driver) setDriver(result.driver);
      if (result?.order) {
        const order = normalizeOrder(result.order);
        if (ACTIVE_STATUSES.includes(order.status)) setActiveOrder(order);
        setIncomingOrders(list => mergeOrder(list, order));
      }
      await refreshDriver();
      return result;
    } catch (error) {
      setError(formatError(error));
      return null;
    } finally {
      setActionLoading("");
    }
  }

  async function handleRegionSelect(regionId) {
    if (!regionId) return;
    await withAction("region", () => selectDriverRegion(regionId));
    setSelectedRegionId(regionId);
  }

  async function handleStatusToggle() {
    await withAction("status", () => setDriverStatus(isOnline ? "OFFLINE" : "ONLINE"));
  }

  async function handleAccept(order) {
    await withAction(`accept-${order.id}`, () => acceptOrder(order.id));
    setTab("active");
  }

  async function handleReject(order) {
    await withAction(`reject-${order.id}`, () => rejectDriverOrder(order.id));
    setIncomingOrders(list => list.filter(item => item.id !== order.id));
  }

  async function handleNext(order, next) {
    await withAction("next", () => next.fn(order.id));
  }

  async function handleCancel(order) {
    await withAction("cancel", () => cancelDriverOrder(order.id));
    setActiveOrder(null);
    setTab("line");
  }

  async function handleNoShow(order) {
    await withAction("noshow", () => noShowDriverOrder(order.id));
    setActiveOrder(null);
    setTab("line");
  }

  if (!logged) {
    return <DriverLogin auth={auth} setAuth={setAuth} onSubmit={handleLogin} loading={loginLoading} error={loginError} />;
  }

  return (
    <PhoneFrame className="driver-core-phone">
      <DriverHeader driver={driver} currentRegion={currentRegion} onLogout={handleLogout} />
      <section className="driver-core-map-wrap">
        <MapView
          pickup={activeOrder?.pickupPoint}
          destination={activeOrder?.destinationPoint}
          center={center}
          compact
          status={activeOrder ? statusLabel(activeOrder.status) : (isOnline ? "Готов к заказам" : "Не на линии")}
        />
      </section>

      <section className="driver-core-panel">
        {loading ? (
          <div className="driver-core-loading">Загружаем смену...</div>
        ) : (
          <>
            <EarningsStrip earnings={earnings} debt={debt} />
            <RegionSelector
              regions={regions}
              selectedRegionId={selectedRegionId}
              onSelect={handleRegionSelect}
              disabled={Boolean(actionLoading || activeOrder)}
            />
            {error && <div className="driver-core-error">{error}</div>}

            {tab === "line" && (
              <section className="driver-core-home">
                <div className="driver-core-line-card">
                  <div>
                    <small>Статус смены</small>
                    <h1>{isOnline ? "Вы на линии" : "Вы не на линии"}</h1>
                    <p>{isOnline ? "Новые заказы появятся автоматически." : "Выйдите на линию, чтобы получать заказы."}</p>
                  </div>
                  <Button onClick={handleStatusToggle} disabled={Boolean(actionLoading || activeOrder)}>
                    {actionLoading === "status" ? "Сохраняем..." : (isOnline ? "Уйти с линии" : "Выйти на линию")}
                  </Button>
                </div>
                {activeOrder && <ActiveOrderPanel order={activeOrder} onAction={handleNext} onCancel={handleCancel} onNoShow={handleNoShow} loading={actionLoading} />}
                {!activeOrder && isOnline && incomingOrders.slice(0, 1).map(order => (
                  <IncomingOrderCard
                    key={order.id}
                    order={order}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    loading={actionLoading}
                  />
                ))}
              </section>
            )}

            {tab === "orders" && (
              <section className="driver-core-orders">
                <div className="driver-core-section-title">
                  <strong>Входящие заказы</strong>
                  <span>{incomingOrders.length}</span>
                </div>
                {incomingOrders.length ? incomingOrders.map(order => (
                  <IncomingOrderCard
                    key={order.id}
                    order={order}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    loading={actionLoading}
                  />
                )) : (
                  <div className="driver-core-empty">
                    {isOnline ? "Свободных заказов пока нет. Оставайтесь на линии." : "Выйдите на линию, чтобы видеть заказы."}
                  </div>
                )}
              </section>
            )}

            {tab === "active" && (
              activeOrder ? (
                <ActiveOrderPanel order={activeOrder} onAction={handleNext} onCancel={handleCancel} onNoShow={handleNoShow} loading={actionLoading} />
              ) : (
                <div className="driver-core-empty">Активной поездки нет.</div>
              )
            )}

            {tab === "money" && (
              <section className="driver-core-money">
                <div className="driver-core-money-card">
                  <small>Грязная выручка сегодня</small>
                  <strong><Money value={earnings?.todayGrossKzt} /></strong>
                </div>
                <div className="driver-core-money-grid">
                  <div>
                    <small>Водителю</small>
                    <b><Money value={earnings?.todayNetKzt} /></b>
                  </div>
                  <div>
                    <small>Комиссия</small>
                    <b><Money value={earnings?.commissionKzt} /></b>
                  </div>
                  <div>
                    <small>Долг</small>
                    <b><Money value={debt?.debtKzt ?? earnings?.debtKzt} /></b>
                  </div>
                  <div>
                    <small>Заказов</small>
                    <b>{earnings?.completedOrders || 0}</b>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </section>

      <nav className="driver-core-tabs" aria-label="Меню водителя">
        {DRIVER_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </PhoneFrame>
  );
}

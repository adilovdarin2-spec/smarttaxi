import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import { Icon } from "../../core/icons.jsx";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import { useLiveDriverRouteState } from "../client/useLiveDriverRoute.js";
import { createDriverLocationPublisher } from "./driverLocationPublisher.js";
import { driverLocationFeedback } from "./driverLocationFeedback.js";
import DriverNavigator from "./DriverNavigator.jsx";
import { driverRouteMeta } from "./driverRoutePresentation.js";
import { browserNavigationFix, navigationFixIsFresh } from "./navigationProgress.js";
import { sessionGuard } from "../../lib/sessionGuard.js";
import "./driverDesign.css";
import { driverWaitingPresentation } from "./driverWaitingPresentation.js";
const LazyMapView = React.lazy(() => import("../map/MapView.jsx"));
const LazyDriverAccount = React.lazy(() => import('./DriverAccount.jsx'));

function MapView(props) {
  return (
    <React.Suspense fallback={<div className="map-deferred-fallback" role="status">Подготавливаем карту…</div>}>
      <LazyMapView {...props} />
    </React.Suspense>
  );
}
import {
  acceptOrder,
  cancelDriverOrder,
  clearToken,
  completeTrip,
  confirmDriverRoadAlert,
  createDriverRoadAlert,
  expireDriverRoadAlert,
  getDriverActiveOrder,
  getDriverDebt,
  getDriverEarningsToday,
  getDriverOrders,
  getDriverOrderHistory,
  getDriverProfile,
  getDriverRegions,
  getDriverRoadAlerts,
  getToken,
  loginUser,
  markDriverArrived,
  markDriverGoingToClient,
  markDriverWaiting,
  markOrderPaid,
  noShowDriverOrder,
  rejectDriverOrder,
  selectDriverRegion,
  setDriverStatus,
  startTrip,
  subscribeSessionChanges,
  updateDriverLocation
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";
import { sanitizeAddressText } from "../../lib/text.js";

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
  ["line", "Линия", "home"],
  ["orders", "Заказы", "document"],
  ["active", "Поездка", "route"],
  ["road", "Дорога", "shield"],
  ["money", "Доход", "cash"]
];

// Mirrors roadAlertLabel()'s fallback map in the mobile app
// (features/shared/models.dart) -- same 17 types, same Russian labels,
// kept in sync by hand since the web panel has no shared l10n system.
const ROAD_ALERT_TYPE_LABELS = {
  ROAD_HAZARD: "Дорожная опасность",
  ACCIDENT: "ДТП",
  ROAD_WORK: "Ремонт дороги",
  SPEED_CAMERA: "Камера скорости",
  POLICE: "Контроль движения",
  TRAFFIC_JAM: "Пробка",
  ROAD_CLOSED: "Закрытая дорога",
  BAD_ROAD: "Плохая дорога",
  POTHOLE: "Яма",
  SPEED_BUMP: "Лежачий полицейский",
  ICY_ROAD: "Скользкая дорога",
  SCHOOL_ZONE: "Школьная зона",
  TEMPORARY_SPEED_LIMIT: "Временное ограничение",
  DANGEROUS_TURN: "Опасный поворот",
  RAILROAD_CROSSING: "Ж/д переезд",
  PEDESTRIAN_CROSSING: "Пешеходный переход",
  OTHER: "Другое"
};

function roadAlertTypeLabel(type) {
  return ROAD_ALERT_TYPE_LABELS[type] || ROAD_ALERT_TYPE_LABELS.OTHER;
}

const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Неверный телефон или пароль",
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
  DRIVER_PAYMENT_CONFIRMATION_FORBIDDEN: "Электронная оплата ожидает подтверждения платёжного сервиса",
  SERVICE_UNAVAILABLE: "Сервис временно недоступен. Попробуйте ещё раз.",
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
  CARD: "Карта",
  CASHBACK: "Бонусы",
  MIXED: "Бонусы + карта"
};

const TARIFF_LABELS = { Economy: "Эконом", Delivery: "Доставка" };

function formatError(error) {
  return ERROR_MESSAGES[error?.code] || error?.message || "Запрос не выполнен";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Неизвестно";
}

function cleanAddress(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /\bqa\b|test|mock|fake|demo/i.test(text)) return fallback;
  return sanitizeAddressText(text, fallback);
}

function normalizeOrder(order) {
  if (!order) return null;
  const snapshot = order.pricing_snapshot || order.pricingSnapshot || {};
  const pickupLat = Number(order.pickup_lat ?? order.pickupLat);
  const pickupLng = Number(order.pickup_lng ?? order.pickupLng);
  const dropoffLat = Number(order.dropoff_lat ?? order.dropoffLat);
  const dropoffLng = Number(order.dropoff_lng ?? order.dropoffLng);
  const status = order.public_status || order.publicStatus || order.status;
  const settled = ["TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED"].includes(status);
  return {
    ...order,
    status,
    public_status: order.public_status || order.publicStatus || status,
    pickup: cleanAddress(order.pickup_text || order.pickupText || order.pickup || order.pickup_address, "Точка подачи"),
    dropoff: cleanAddress(order.dropoff_text || order.dropoffText || order.dropoff || order.dropoff_address, "Адрес назначения"),
    pickupPoint: Number.isFinite(pickupLat) && Number.isFinite(pickupLng) ? { lat: pickupLat, lng: pickupLng } : null,
    destinationPoint: Number.isFinite(dropoffLat) && Number.isFinite(dropoffLng) ? { lat: dropoffLat, lng: dropoffLng } : null,
    estimatedPrice: Number((settled ? order.price : undefined) ?? order.estimated_price ?? order.estimatedPrice ?? order.price ?? snapshot.estimatedPrice ?? 0),
    payout: Number(order.driver_payout_estimate ?? order.driverPayoutEstimate ??
      (order.price != null && order.service_commission != null ? Math.max(0, Number(order.price) - Number(order.service_commission)) : snapshot.driverEarning) ?? 0),
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
  if (status === "TRIP_COMPLETED" || status === "PAYMENT_PENDING") {
    return ["CASH", "KASPI"].includes(order.paymentMethod)
      ? { label: "Подтвердить оплату", fn: markOrderPaid }
      : null;
  }
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
          <h1>Хорошая смена начинается здесь</h1>
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

function DriverHeader({ driver, activeOrder, currentRegion, onAccount }) {
  const status = activeOrder ? "BUSY" : (driver?.publicStatus || driver?.public_status || driver?.status || "OFFLINE");
  return (
    <header className="driver-core-header">
      <div className="driver-core-brand">
        <SmartTaxiLogo className="compact" />
        <span>{regionName(currentRegion)}</span>
      </div>
      <div className={`driver-core-status ${status.toLowerCase()}`}>{statusLabel(status)}</div>
      <button className="driver-core-logout" type="button" onClick={onAccount} aria-label="Открыть кабинет водителя"><Icon name="user" size={20} /></button>
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
      <Icon name="pin" />
      <select aria-label="Рабочий регион" value={selectedRegionId || ""} onChange={event => onSelect(event.target.value)} disabled={disabled}>
        <option value="">Выберите регион</option>
        {regions.map(region => (
          <option key={region.id || regionKey(region)} value={regionKey(region)}>{regionName(region)}</option>
        ))}
      </select>
    </section>
  );
}

export function IncomingOrderCard({ order, onAccept, onReject, loading }) {
  return (
    <article className="driver-core-order-card" data-order-id={order.id}>
      <div className="driver-core-order-top">
        <h2>Новый заказ</h2>
        <span className="driver-design-tariff">{TARIFF_LABELS[order.tariff] || order.tariff}</span>
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
      <div className="driver-design-fare">
        <div><strong><Money value={order.estimatedPrice} /></strong>
          <small>{[order.distanceKm > 0 && `${order.distanceKm.toFixed(1)} км`,
            order.durationMin > 0 && `${Math.max(1, Math.round(order.durationMin))} мин`].filter(Boolean).join(" · ") || "Маршрут уточняется"}</small>
        </div>
        <span>{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</span>
      </div>
      <div className="driver-core-card-actions">
        <Button variant="secondary" onClick={() => onReject(order)} disabled={Boolean(loading)}>Пропустить</Button>
        <Button onClick={() => onAccept(order)} disabled={Boolean(loading)}>{loading === "accept" ? "Принимаем…" : "Принять"}</Button>
      </div>
    </article>
  );
}

export function ActiveOrderPanel({ order, driverRoute, onAction, onCancel, onNoShow, onNavigate, loading }) {
  const next = orderNextAction(order);
  const meta = driverRouteMeta(driverRoute, order.status);
  const awaitingPayment = ["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(order.status);
  return (
    <section className="driver-core-active" data-order-id={order.id}>
      <div className="driver-core-active-head">
        <h2>{statusLabel(order.status)}</h2>
        <strong><Money value={order.estimatedPrice} /></strong>
      </div>
      {order.status === "WAITING_CLIENT" && <DriverWaitingCard key={order.id} order={order} />}
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
      {meta && (
        <div className="driver-core-live-eta">
          <span>{meta}</span>
        </div>
      )}
      <div className="driver-core-order-meta">
        <span>{TARIFF_LABELS[order.tariff] || order.tariff}</span>
        <span>{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</span>
        <span>{order.payout ? `Водителю ${order.payout.toLocaleString("ru-RU")} ₸` : "Выплата после завершения"}</span>
      </div>
      <div className="driver-core-card-actions stack">
        {["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "TRIP_STARTED"].includes(order.status) &&
          <Button variant="secondary" onClick={() => onNavigate(order)}><Icon name="route" /> Навигатор</Button>}
        {awaitingPayment && <p className="driver-core-payment-note">{next
          ? "Поездка завершена. Подтвердите оплату после получения денег."
          : "Поездка завершена. Ожидаем подтверждения электронной оплаты."}</p>}
        {!awaitingPayment && <div className="driver-core-split-actions">
          {order.rider_phone && <a className="driver-core-call" href={`tel:${order.rider_phone}`}><Icon name="phone" /> Позвонить</a>}
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
        </div>}
      </div>
      {next && <div className="driver-core-next-action">
        <Button onClick={() => onAction(order, next)} disabled={Boolean(loading)}>
          {loading === "next" ? "Сохраняем..." : next.label}
        </Button>
      </div>}
    </section>
  );
}

export function DriverWaitingCard({ order }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (order?.status !== 'WAITING_CLIENT') return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [order?.status, order?.id]);
  const timer = driverWaitingPresentation(order, now);
  if (!timer) return null;
  return <div className={`driver-design-waiting ${timer.paid ? 'paid' : ''}`}>
    <div className="driver-design-timer" style={{'--waiting-progress':`${(timer.paid ? 1 : timer.progress) * 360}deg`}}
      role="timer" aria-label={`${timer.label}: ${timer.time}`}>
      <strong aria-hidden="true">{timer.time}</strong>
    </div>
    <p>{timer.label}</p>
  </div>;
}

export function DriverShiftPanel({ title, description, regions, selectedRegionId, onRegionSelect,
  earnings, debt, isWorking, disabled, loading, onToggle }) {
  return <section className="driver-core-line-card">
    <div className="driver-design-shift-heading">
      <h1>{title}</h1><span className={`driver-design-availability ${isWorking ? "online" : ""}`} aria-hidden="true" />
    </div>
    <RegionSelector regions={regions} selectedRegionId={selectedRegionId} onSelect={onRegionSelect} disabled={disabled} />
    <p>{description}</p>
    <EarningsStrip earnings={earnings} debt={debt} />
    <Button variant={isWorking ? "secondary" : "primary"} onClick={onToggle} disabled={disabled}>
      {loading ? "Сохраняем…" : (isWorking ? "Уйти с линии" : "Выйти на линию")}
    </Button>
  </section>;
}

export function DriverEmptyState({
  icon = "route",
  title,
  text,
  action = "",
  onAction,
}) {
  return (
    <section className="driver-core-empty driver-core-empty-rich">
      <span className="driver-core-empty-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {action}
        </Button>
      )}
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
  const [regionsLoadFailed, setRegionsLoadFailed] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [incomingOrders, setIncomingOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [settlementOrders, setSettlementOrders] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [debt, setDebt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("line");
  const [accountSection, setAccountSection] = useState(null);
  const [navigationOrderId, setNavigationOrderId] = useState(null);
  const closeNavigation = useCallback(() => { setNavigationOrderId(null); setTab("active"); }, []);
  const [driverPosition, setDriverPosition] = useState(null);
  const [publishedDriverPosition, setPublishedDriverPosition] = useState(null);
  const [locationIssue, setLocationIssue] = useState(null);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [roadAlerts, setRoadAlerts] = useState([]);
  const [roadAlertsLoading, setRoadAlertsLoading] = useState(false);
  const [roadAlertsError, setRoadAlertsError] = useState("");
  const [roadAlertForm, setRoadAlertForm] = useState({ type: "ROAD_HAZARD", comment: "" });
  const [roadAlertSubmitting, setRoadAlertSubmitting] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);
  const socketRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const protectSession = useCallback(() => sessionGuard(getToken(), getToken, () => mountedRef.current), []);
  const resetDriverSession = useCallback((loginMessage = "") => {
    setLogged(false);
    setAuth(current => ({ ...current, password: "" }));
    setDriver(null);
    setRegions([]);
    setRegionsLoadFailed(false);
    setSelectedRegionId("");
    setIncomingOrders([]);
    setActiveOrder(null);
    setSettlementOrders([]);
    setEarnings(null);
    setDebt(null);
    setRoadAlerts([]);
    setRoadAlertsError("");
    setRoadAlertsLoading(false);
    setRoadAlertSubmitting(false);
    setRoadAlertForm({ type: "ROAD_HAZARD", comment: "" });
    setNavigationOrderId(null);
    setDriverPosition(null);
    setPublishedDriverPosition(null);
    setLocationIssue(null);
    setError("");
    setActionLoading("");
    setTab("line");
    setAccountSection(null);
    setLoginError(loginMessage);
  }, []);

  useEffect(() => subscribeSessionChanges(({ token }) => {
    // localStorage is shared by the passenger and driver tabs. Never keep a
    // previous driver's profile/orders painted after either tab replaces it.
    resetDriverSession(token ? "Проверяем новый режим аккаунта…" : "");
    setSessionRevision(revision => revision + 1);
    setLogged(Boolean(token));
  }), [resetDriverSession]);

  const currentRegion = useMemo(
    () => regions.find(region => regionKey(region) === selectedRegionId) || regions.find(region => regionKey(region) === driver?.currentRegionId),
    [regions, selectedRegionId, driver?.currentRegionId]
  );

  const isOnline = ["ONLINE", "FREE"].includes(driver?.publicStatus || driver?.status);
  const isWorking = isOnline || ["BUSY"].includes(driver?.publicStatus || driver?.status);
  const displayedOrder = activeOrder || settlementOrders[0] || null;
  const lineStatusTitle = activeOrder
    ? "Вы выполняете заказ"
    : isOnline
      ? "На линии"
      : "Не на линии";
  const session = logged ? getToken() : "";
  const confirmedPosition = publishedDriverPosition?.session === session &&
    publishedDriverPosition?.driverId === driver?.id ? publishedDriverPosition : null;
  const center = driverPosition || activeOrder?.pickupPoint || activeOrder?.destinationPoint || regionCenter(currentRegion);
  const routeOrder = activeOrder ? {
    ...activeOrder,
    driver_id: driver?.id || activeOrder.driver_id,
    driver_lat: confirmedPosition?.lat ?? activeOrder.driver_lat,
    driver_lng: confirmedPosition?.lng ?? activeOrder.driver_lng
  } : null;
  const { route: driverRoute, unavailable: routeUnavailable } = useLiveDriverRouteState(routeOrder, session);
  const navigationActive = Boolean(session && activeOrder?.id === navigationOrderId &&
    ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "TRIP_STARTED"].includes(activeOrder?.status));
  useEffect(() => {
    if (!navigationActive && navigationOrderId !== null) {
      setNavigationOrderId(null);
      setTab("active");
    }
  }, [navigationActive, navigationOrderId]);

  const refreshDriver = useCallback(async () => {
    const isCurrent = protectSession();
    if (!isCurrent()) return;
    const [profileResult, regionsResult, incomingResult, activeResult, earningsResult, debtResult, historyResult] = await Promise.allSettled([
      getDriverProfile(),
      getDriverRegions(),
      getDriverOrders(),
      getDriverActiveOrder(),
      getDriverEarningsToday(),
      getDriverDebt(),
      getDriverOrderHistory()
    ]);
    if (!isCurrent()) return;

    if (profileResult.status === "fulfilled") {
      setDriver(profileResult.value.driver);
      setSelectedRegionId(profileResult.value.driver?.currentRegionId || "");
      if (profileResult.value.activeOrder) setActiveOrder(normalizeOrder(profileResult.value.activeOrder));
    } else {
      throw profileResult.reason;
    }

    if (regionsResult.status === "fulfilled") {
      setRegions(regionsResult.value.regions || regionsResult.value.items || []);
      setRegionsLoadFailed(false);
    } else {
      setRegionsLoadFailed(true);
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
    if (historyResult.status === "fulfilled") {
      setSettlementOrders(extractOrders(historyResult.value).map(normalizeOrder).filter(order =>
        order && ["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(order.status)
          && String(order.payment_status || order.paymentStatus || "").toUpperCase() !== "PAID"
      ));
    }
  }, [protectSession]);

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
        if (!alive) return;
        if ([401, 403].includes(error.status)) {
          // Do not clear a valid rider/admin token shared with another tab.
          resetDriverSession('Войдите в водительский аккаунт, чтобы открыть смену.');
        } else setError(formatError(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [logged, refreshDriver, resetDriverSession, sessionRevision]);

  useEffect(() => {
    if (!logged || !driver?.id) return undefined;
    const socket = createSocket();
    socketRef.current = socket;
    let refreshTimer;
    let alive = true;
    let refreshing = false;
    let refreshAgain = false;
    const refreshState = async () => {
      if (!alive) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      try {
        await refreshDriver();
      } catch (error) {
        if (alive) setError(formatError(error));
      } finally {
        refreshing = false;
        if (alive && refreshAgain) {
          refreshAgain = false;
          scheduleRefresh();
        }
      }
    };
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshState, 120);
    };
    const joinRooms = () => {
      if (isOnline) socket.emit("join_drivers");
      if (displayedOrder?.id) socket.emit("join_order", displayedOrder.id);
      scheduleRefresh();
    };
    // Region events include other drivers' orders. Fetch the authenticated
    // incoming/active endpoints instead of assigning a broadcast to this
    // driver's active trip. Debounce the aliases of the same status change.
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
      "order.rated",
      "order_status_public"
    ].forEach(event => socket.on(event, scheduleRefresh));
    socket.on("connect", joinRooms);
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // A short HTTP reconciliation also recovers dropped events or exhausted
    // socket reconnects without requiring the driver to reload the page.
    const pollTimer = window.setInterval(onVisibility, 15000);
    return () => {
      alive = false;
      window.clearTimeout(refreshTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [logged, driver?.id, selectedRegionId, isOnline, displayedOrder?.id, refreshDriver]);

  // Reports the driver's live position while working, mirroring the mobile
  // app's continuous location stream (see driver_shell.dart _startLocationFlow)
  // — the web driver client previously never called this endpoint at all, so
  // a driver working from a browser was invisible on the dispatch map and
  // could never get a live route/ETA back.
  useEffect(() => {
    setPublishedDriverPosition(null);
    setLocationIssue(null);
    if (!session || !driver?.id || !isWorking) {
      setDriverPosition(null);
      return undefined;
    }
    if (!navigator.geolocation) {
      setDriverPosition(null);
      setLocationIssue(driverLocationFeedback({ code: 'unsupported' }));
      return undefined;
    }
    let alive = true;
    let publisher;
    let lastFixTimestamp = null;
    const createPublisher = () => createDriverLocationPublisher({
      publish: updateDriverLocation,
      intervalMs: 4000,
      isFresh: location => navigationFixIsFresh(location.timestamp),
      isCurrent: () => alive && getToken() === session,
      onPublished: location => {
        if (location.driverId !== driver.id) return;
        setPublishedDriverPosition({ ...location, session });
        setLocationIssue(issue => issue?.source === 'publication' ? null : issue);
      },
      onError: error => setLocationIssue(driverLocationFeedback(error, 'publication'))
    });
    const handlePosition = position => {
      if (!alive || getToken() !== session) return;
      const point = browserNavigationFix(position, lastFixTimestamp);
      if (!point) return;
      lastFixTimestamp = point.timestamp;
      setDriverPosition(point);
      setLocationIssue(issue => issue?.source === 'browser' ? null : issue);
      publisher ||= createPublisher();
      // The marker is immediate. Routing uses the acknowledged server fix,
      // not this raw point: the route endpoint reads persisted coordinates.
      publisher.update({
        lat: point.lat,
        lng: point.lng,
        timestamp: point.timestamp,
        heading: point.heading ?? undefined,
        speed: point.speed ?? undefined,
        accuracy: point.accuracy ?? undefined,
        source: "web"
      });
    };
    const handleLocationError = error => {
      if (!alive || getToken() !== session) return;
      // Do not keep retrying an old fix after GPS/permission has been lost.
      // A subsequent valid stream event can create a fresh publisher.
      publisher?.dispose();
      publisher = null;
      setDriverPosition(null);
      setLocationIssue(driverLocationFeedback(error));
    };
    const watchId = navigator.geolocation.watchPosition(handlePosition, handleLocationError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000
    });
    // Browser watches need not fire while stationary. Request actual fresh
    // fixes during navigation; never turn a repaint into a GPS timestamp.
    let polling = false;
    const gpsTimer = navigationActive ? window.setInterval(() => {
      if (polling || document.visibilityState !== "visible") return;
      polling = true;
      const polledAfter = lastFixTimestamp;
      navigator.geolocation.getCurrentPosition(
        position => { polling = false; handlePosition(position); },
        error => {
          polling = false;
          // A timeout from the poll must not erase a newer watch fix.
          if (lastFixTimestamp === polledAfter) handleLocationError(error);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    }, 4000) : null;
    return () => {
      alive = false;
      publisher?.dispose();
      if (gpsTimer !== null) window.clearInterval(gpsTimer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [session, driver?.id, isWorking, selectedRegionId, locationAttempt, navigationActive]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const data = await loginUser(auth);
      if (data.user?.role !== "DRIVER") {
        resetDriverSession("Этот аккаунт не является водительским");
        return;
      }
      setLoginError("");
      setLogged(true);
    } catch (error) {
      setLoginError(formatError(error));
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    resetDriverSession();
  }

  const loadRoadAlerts = useCallback(async () => {
    const isCurrent = protectSession();
    if (!logged || !isCurrent()) return;
    setRoadAlertsLoading(true);
    setRoadAlertsError("");
    try {
      const payload = await getDriverRoadAlerts({ regionId: selectedRegionId || undefined });
      if (!isCurrent()) return;
      setRoadAlerts(Array.isArray(payload?.alerts) ? payload.alerts : []);
    } catch (error) {
      if (!isCurrent()) return;
      setRoadAlertsError(formatError(error));
    } finally {
      if (isCurrent()) setRoadAlertsLoading(false);
    }
  }, [logged, selectedRegionId, protectSession]);

  // Only fetched while the tab is actually open -- unlike orders/earnings
  // (shown on the home tab every session), road alerts are a secondary
  // screen most shifts never open.
  useEffect(() => {
    if (tab === "road") loadRoadAlerts();
  }, [tab, loadRoadAlerts]);

  async function submitRoadAlert(event) {
    event.preventDefault();
    const isCurrent = protectSession();
    if (!isCurrent()) return;
    if (!driverPosition) {
      setRoadAlertsError("Нет GPS-сигнала — выйдите на линию и подождите, пока определится местоположение.");
      return;
    }
    setRoadAlertSubmitting(true);
    setRoadAlertsError("");
    try {
      await createDriverRoadAlert({
        type: roadAlertForm.type,
        comment: roadAlertForm.comment.trim(),
        lat: driverPosition.lat,
        lng: driverPosition.lng,
        regionId: selectedRegionId || undefined
      });
      if (!isCurrent()) return;
      setRoadAlertForm(current => ({ ...current, comment: "" }));
      await loadRoadAlerts();
    } catch (error) {
      if (!isCurrent()) return;
      setRoadAlertsError(formatError(error));
    } finally {
      if (isCurrent()) setRoadAlertSubmitting(false);
    }
  }

  async function confirmRoadAlert(alertId) {
    const isCurrent = protectSession();
    if (!isCurrent()) return;
    try {
      await confirmDriverRoadAlert(alertId);
      if (!isCurrent()) return;
      await loadRoadAlerts();
    } catch (error) {
      if (!isCurrent()) return;
      setRoadAlertsError(formatError(error));
    }
  }

  async function dismissRoadAlert(alertId) {
    const isCurrent = protectSession();
    if (!isCurrent()) return;
    try {
      await expireDriverRoadAlert(alertId);
      if (!isCurrent()) return;
      await loadRoadAlerts();
    } catch (error) {
      if (!isCurrent()) return;
      setRoadAlertsError(formatError(error));
    }
  }

  // Fires the instant any request comes back 401/SESSION_SUPERSEDED --
  // another device logged into this account and the backend invalidated
  // every token issued before that (see common/auth.js). Without this the
  // driver stays stuck on a stale panel silently failing every request
  // instead of being dropped back to the login screen.
  useEffect(() => {
    window.addEventListener("smarttaxi:session-expired", handleLogout);
    return () => window.removeEventListener("smarttaxi:session-expired", handleLogout);
  }, []);

  async function withAction(name, fn) {
    const isCurrent = protectSession();
    if (!isCurrent()) return null;
    setActionLoading(name);
    setError("");
    try {
      const result = await fn();
      if (!isCurrent()) return null;
      if (result?.driver) setDriver(result.driver);
      if (result?.order) {
        const order = normalizeOrder(result.order);
        if (ACTIVE_STATUSES.includes(order.status)) setActiveOrder(order);
        if (["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(order.status)) {
          setActiveOrder(current => current?.id === order.id ? null : current);
          setSettlementOrders(current => [order, ...current.filter(item => item.id !== order.id)]);
        }
        if (["PAID", "RATED"].includes(order.status)) {
          setSettlementOrders(current => current.filter(item => item.id !== order.id));
        }
        setIncomingOrders(list => mergeOrder(list, order));
      }
      try {
        await refreshDriver();
      } catch (error) {
        // The mutation response is authoritative even if reconciliation
        // temporarily fails. Keep its successful navigation/state change.
        if (isCurrent()) setError(formatError(error));
      }
      return isCurrent() ? result : null;
    } catch (error) {
      if (isCurrent()) setError(formatError(error));
      return null;
    } finally {
      if (isCurrent()) setActionLoading("");
    }
  }

  async function handleRegionSelect(regionId) {
    if (!regionId) return;
    const result = await withAction("region", () => selectDriverRegion(regionId));
    if (result) setSelectedRegionId(regionId);
  }

  async function handleStatusToggle() {
    await withAction("status", () => setDriverStatus(isOnline ? "OFFLINE" : "ONLINE"));
  }

  async function handleAccept(order) {
    const result = await withAction(`accept-${order.id}`, () => acceptOrder(order.id));
    if (result) setTab("active");
  }

  async function handleReject(order) {
    const result = await withAction(`reject-${order.id}`, () => rejectDriverOrder(order.id));
    if (result) setIncomingOrders(list => list.filter(item => item.id !== order.id));
  }

  async function handleNext(order, next) {
    await withAction("next", () => next.fn(order.id));
  }

  async function handleCancel(order) {
    const result = await withAction("cancel", () => cancelDriverOrder(order.id));
    if (!result) return;
    setActiveOrder(null);
    setTab("line");
  }

  async function handleNoShow(order) {
    const result = await withAction("noshow", () => noShowDriverOrder(order.id));
    if (!result) return;
    setActiveOrder(null);
    setTab("line");
  }

  if (!logged) {
    return <DriverLogin auth={auth} setAuth={setAuth} onSubmit={handleLogin} loading={loginLoading} error={loginError} />;
  }
  if (accountSection) {
    return <React.Suspense fallback={<PhoneFrame className="driver-account-phone"><div role="status">Открываем кабинет…</div></PhoneFrame>}>
      <LazyDriverAccount key={session} driver={driver} activeOrder={displayedOrder} initialSection={accountSection}
        onClose={() => setAccountSection(null)} onLogout={handleLogout}
        incomingCount={isOnline ? incomingOrders.length : 0} onOrders={() => { setAccountSection(null); setTab('orders'); }}
        onTrip={() => { setAccountSection(null); setTab('active'); }} />
    </React.Suspense>;
  }
  if (navigationActive) {
    return <PhoneFrame className="driver-navigation-phone"><DriverNavigator
      order={activeOrder} route={driverRoute} routeUnavailable={routeUnavailable} position={driverPosition} locationIssue={locationIssue}
      error={error} nextAction={orderNextAction(activeOrder)} loading={actionLoading}
      onNext={() => handleNext(activeOrder, orderNextAction(activeOrder))} onClose={closeNavigation}
      onRetryGPS={() => setLocationAttempt(attempt => attempt + 1)} MapComponent={MapView}
    /></PhoneFrame>;
  }
  const mapTab = ["line", "orders", "active"].includes(tab);

  return (
    <PhoneFrame className={`driver-core-phone driver-design driver-core-view-${tab}`}>
      <DriverHeader driver={driver} activeOrder={activeOrder} currentRegion={currentRegion} onAccount={() => setAccountSection('home')} />
      {mapTab && error && <div className="driver-core-error driver-core-action-notice" role="alert">{error}</div>}
      {mapTab && <section className="driver-core-map-wrap">
        <MapView
          pickup={activeOrder?.pickupPoint}
          destination={activeOrder?.destinationPoint}
          driver={driverPosition}
          route={driverRoute}
          center={center}
          compact
          status={activeOrder ? statusLabel(activeOrder.status) : (isWorking && locationIssue ? "GPS требует внимания" : isOnline ? (confirmedPosition ? "Готов к заказам" : "Определяем местоположение") : "Не на линии")}
        />
      </section>}

      <section className="driver-core-panel">
        {mapTab && isWorking && locationIssue && (
          <section className="driver-core-location-notice" role="status" aria-live="polite">
            <div className="driver-core-location-icon" aria-hidden="true"><Icon name="pin" /></div>
            <div>
              <h2>{locationIssue.title}</h2>
              <p>{locationIssue.description}</p>
              <Button variant="secondary" onClick={() => setLocationAttempt(attempt => attempt + 1)}>Повторить GPS</Button>
            </div>
          </section>
        )}
        {loading ? (
          <div className="driver-core-loading">Загружаем смену...</div>
        ) : (
          <>
            {!regions.length && regionsLoadFailed && (
              <div className="driver-core-error">
                Не удалось загрузить регионы.{" "}
                <button
                  type="button"
                  onClick={() => refreshDriver().catch(error => setError(formatError(error)))}
                  style={{ background: "none", border: "none", padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                >
                  Повторить
                </button>
              </div>
            )}
            {!mapTab && error && <div className="driver-core-error" role="alert">{error}</div>}

            {tab === "line" && (
              <section className="driver-core-home">
                <DriverShiftPanel title={lineStatusTitle}
                  description={activeOrder ? "Действия по текущей поездке доступны ниже." : isOnline ? "Новые заказы появятся автоматически." : "Выйдите на линию, чтобы получать заказы."}
                  regions={regions} selectedRegionId={selectedRegionId} onRegionSelect={handleRegionSelect}
                  earnings={earnings} debt={debt} isWorking={isWorking}
                  disabled={Boolean(actionLoading || activeOrder)} loading={actionLoading === "status"} onToggle={handleStatusToggle} />
                {displayedOrder && <ActiveOrderPanel order={displayedOrder} driverRoute={driverRoute} onAction={handleNext} onCancel={handleCancel} onNoShow={handleNoShow} onNavigate={order => setNavigationOrderId(order.id)} loading={actionLoading} />}
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
                  <DriverEmptyState
                    icon="document"
                    title={isOnline ? "Ждём ближайший заказ" : "Вы не на линии"}
                    text={isOnline
                      ? "Новый заказ появится здесь автоматически — обновлять экран не нужно."
                      : "Выберите рабочий регион и выйдите на линию, чтобы получать заказы."}
                    action={isOnline ? "" : "Перейти на линию"}
                    onAction={() => setTab("line")}
                  />
                )}
              </section>
            )}

            {tab === "active" && (
              displayedOrder ? (
                <ActiveOrderPanel order={displayedOrder} driverRoute={driverRoute} onAction={handleNext} onCancel={handleCancel} onNoShow={handleNoShow} onNavigate={order => setNavigationOrderId(order.id)} loading={actionLoading} />
              ) : (
                <DriverEmptyState
                  title="Активной поездки нет"
                  text={isOnline
                    ? "Примите подходящий заказ — маршрут и все действия поездки появятся здесь."
                    : "Сначала выйдите на линию, затем примите заказ для начала поездки."}
                  action={isOnline ? "Смотреть заказы" : "Перейти на линию"}
                  onAction={() => setTab(isOnline ? "orders" : "line")}
                />
              )
            )}

            {tab === "road" && (
              <section className="driver-core-road">
                <form className="driver-core-road-form" onSubmit={submitRoadAlert}>
                  <div className="driver-core-section-title">
                    <strong>Сообщить о дороге</strong>
                  </div>
                  <select
                    aria-label="Тип дорожного события"
                    value={roadAlertForm.type}
                    onChange={event => setRoadAlertForm(current => ({ ...current, type: event.target.value }))}
                  >
                    {Object.keys(ROAD_ALERT_TYPE_LABELS).map(type => (
                      <option key={type} value={type}>{roadAlertTypeLabel(type)}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    aria-label="Комментарий к дорожному событию"
                    placeholder="Комментарий (необязательно)"
                    value={roadAlertForm.comment}
                    onChange={event => setRoadAlertForm(current => ({ ...current, comment: event.target.value }))}
                    maxLength={300}
                  />
                  <Button type="submit" disabled={roadAlertSubmitting || !driverPosition}>
                    {roadAlertSubmitting ? "Отправляем..." : "Сообщить"}
                  </Button>
                  {!driverPosition && (
                    <div className="driver-core-empty">{isWorking ? "Нет сигнала GPS. Разрешите доступ к геолокации в браузере и дождитесь определения местоположения." : "Выйдите на линию, чтобы определить местоположение."}</div>
                  )}
                </form>

                {roadAlertsError && <div className="driver-core-error">{roadAlertsError}</div>}

                <div className="driver-core-section-title">
                  <strong>Активные события</strong>
                  <span>{roadAlerts.length}</span>
                </div>
                {roadAlertsLoading ? (
                  <div className="driver-core-loading">Загружаем события...</div>
                ) : roadAlerts.length ? (
                  roadAlerts.map(alert => (
                    <div className="driver-core-road-card" key={alert.id}>
                      <div>
                        <strong>{roadAlertTypeLabel(alert.type)}</strong>
                        {alert.comment && <p>{alert.comment}</p>}
                      </div>
                      <div className="driver-core-road-actions">
                        <Button variant="secondary" onClick={() => confirmRoadAlert(alert.id)}>Подтвердить</Button>
                        <Button variant="ghost" onClick={() => dismissRoadAlert(alert.id)}>Не актуально</Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="driver-core-empty">Активных событий в регионе нет.</div>
                )}
              </section>
            )}

            {tab === "money" && (
              <section className="driver-core-money">
                <div className="driver-core-money-card">
                  <small>Выручка сегодня</small>
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
                <Button variant="secondary" onClick={() => setAccountSection('wallet')}>Открыть кошелёк и операции</Button>
                <Button variant="secondary" onClick={() => setAccountSection('history')}>История поездок</Button>
              </section>
            )}
          </>
        )}
      </section>

      <nav className="driver-core-tabs" aria-label="Меню водителя">
        {DRIVER_TABS.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            aria-label={label}
          >
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </PhoneFrame>
  );
}

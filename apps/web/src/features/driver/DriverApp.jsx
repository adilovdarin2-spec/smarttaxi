import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, SmartLogo } from "../../core/icons.jsx";
import { AppHeader, BottomNav, Button, Money, PhoneFrame } from "../../core/ui.jsx";
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
import MapView from "../map/MapView.jsx";

const activeStatuses = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];
const errorMessages = {
  DRIVER_REGION_NOT_SELECTED: "Выберите утверждённый регион.",
  DRIVER_REGION_REQUIRED: "Выберите утверждённый регион.",
  DRIVER_REGION_INACTIVE: "Выбранный регион неактивен.",
  REGION_INACTIVE: "Выбранный регион неактивен.",
  DRIVER_REGION_NOT_APPROVED: "Водитель не утверждён в этом регионе.",
  DRIVER_REGION_BLOCKED: "Водитель заблокирован в этом регионе.",
  DRIVER_BLOCKED: "Водитель заблокирован.",
  DRIVER_HAS_ACTIVE_ORDER: "У водителя уже есть активный заказ.",
  ORDER_REGION_MISMATCH: "Заказ относится к другому региону.",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят.",
  FORBIDDEN: "Недостаточно прав для действия.",
  UNAUTHORIZED: "Войдите как водитель."
};

function formatError(error) {
  return errorMessages[error?.code] || error?.message || "Запрос не выполнен.";
}

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    pickup: order.pickup_text || order.pickupText || order.pickup || "Точка посадки",
    dropoff: order.dropoff_text || order.dropoffText || order.dropoff || "Точка назначения",
    public_status: order.public_status || order.publicStatus || order.status
  };
}

export default function DriverApp() {
  const [logged, setLogged] = useState(Boolean(getToken()));
  const [auth, setAuth] = useState({ phone: "+77000000000", email: "", password: "123456" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [driver, setDriver] = useState(null);
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionError, setRegionError] = useState("");
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [orders, setOrders] = useState([]);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("home");
  const [message, setMessage] = useState("");
  const [socketState, setSocketState] = useState("offline");
  const socketRef = useRef(null);

  const online = driver?.status === "FREE" || driver?.status === "BUSY";
  const disabledReason = useMemo(() => {
    if (regionsLoading) return "Загружаем регионы";
    if (!regions.length) return "Нет утверждённых активных регионов";
    if (!selectedRegionId) return "Выберите регион";
    if (driver?.is_blocked) return errorMessages.DRIVER_BLOCKED;
    return "";
  }, [driver?.is_blocked, regions, regionsLoading, selectedRegionId]);

  useEffect(() => {
    if (logged) loadDriverState();
  }, [logged]);

  useEffect(() => {
    if (!logged || !getToken()) return undefined;
    const socket = createSocket();
    socketRef.current = socket;
    setSocketState("connecting");
    socket.on("connect", () => {
      setSocketState("connected");
      socket.emit("join_drivers");
      if (active?.id) socket.emit("join_order", active.id);
    });
    socket.on("disconnect", () => setSocketState("offline"));
    const updateOrder = payload => {
      const next = normalizeOrder(payload);
      if (!next?.id) return;
      setOrders(current => mergeOrder(current, next));
      setActive(current => current?.id === next.id ? normalizeOrder({ ...current, ...next }) : current);
    };
    socket.on("order_created", updateOrder);
    socket.on("order_updated", updateOrder);
    socket.on("order_accepted", updateOrder);
    socket.on("order_assigned", updateOrder);
    socket.on("order_status_public", updateOrder);
    return () => {
      socket.off("order_created", updateOrder);
      socket.off("order_updated", updateOrder);
      socket.off("order_accepted", updateOrder);
      socket.off("order_assigned", updateOrder);
      socket.off("order_status_public", updateOrder);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [logged, active?.id]);

  async function loadDriverState() {
    setRegionsLoading(true);
    setRegionError("");
    try {
      const data = await getDriverRegions();
      setDriver(data.driver);
      setRegions(data.regions || []);
      setSelectedRegionId(data.driver?.current_region_id || "");
      await refreshOrders();
    } catch (error) {
      setRegionError(formatError(error));
      if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") setLogged(false);
    } finally {
      setRegionsLoading(false);
    }
  }

  async function refreshOrders() {
    setOrdersLoading(true);
    try {
      const data = await getDriverOrders();
      const nextOrders = (data.orders || []).map(normalizeOrder);
      const activeFromOrders = nextOrders.find(order => activeStatuses.includes(order.status));
      setOrders(nextOrders);
      setActive(current => activeFromOrders || (current && activeStatuses.includes(current.status) ? current : null));
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setOrdersLoading(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const data = await loginUser({
        phone: auth.email ? undefined : auth.phone,
        email: auth.email || undefined,
        password: auth.password
      });
      if (data.user?.role !== "DRIVER") {
        clearToken();
        throw Object.assign(new Error("Войдите аккаунтом водителя."), { code: "FORBIDDEN" });
      }
      setLogged(true);
    } catch (error) {
      setLoginError(formatError(error));
    } finally {
      setLoginLoading(false);
    }
  }

  async function changeRegion(regionId) {
    setSelectedRegionId(regionId);
    setRegionError("");
    try {
      const data = await selectDriverRegion(regionId);
      setDriver(data.driver);
      setMessage(`Регион выбран: ${data.region?.name || regionId}`);
      socketRef.current?.emit("join_drivers");
      await refreshOrders();
    } catch (error) {
      setSelectedRegionId(driver?.current_region_id || "");
      setRegionError(formatError(error));
    }
  }

  async function toggleOnline() {
    if (disabledReason || onlineLoading) return;
    setOnlineLoading(true);
    setMessage("");
    try {
      const data = await setDriverStatus(online ? "OFFLINE" : "FREE");
      setDriver(data.driver);
      setMessage(online ? "Вы ушли с линии." : "Вы на линии. Заказы приходят из выбранного региона.");
      socketRef.current?.emit("join_drivers");
      await refreshOrders();
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setOnlineLoading(false);
    }
  }

  async function takeOrder(order) {
    setActionLoading(order.id);
    setMessage("");
    try {
      const data = await acceptOrder(order.id);
      setActive(normalizeOrder(data.order));
      setDriver(current => current ? { ...current, status: "BUSY" } : current);
      setOrders(current => current.filter(item => item.id !== order.id));
      socketRef.current?.emit("join_order", order.id);
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setActionLoading("");
    }
  }

  async function updateTrip(action) {
    if (!active?.id || actionLoading) return;
    setActionLoading(action);
    setMessage("");
    try {
      const calls = {
        arrived: markDriverArrived,
        start: startTrip,
        complete: completeTrip,
        cancel: cancelDriverOrder
      };
      const data = await calls[action](active.id);
      const next = normalizeOrder(data.order);
      setActive(next && activeStatuses.includes(next.status) ? next : null);
      await refreshOrders();
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setActionLoading("");
    }
  }

  function logout() {
    clearToken();
    socketRef.current?.disconnect();
    setLogged(false);
    setDriver(null);
    setOrders([]);
    setActive(null);
  }

  if (!logged) {
    return <DriverLogin auth={auth} setAuth={setAuth} loading={loginLoading} error={loginError} onSubmit={submitLogin} />;
  }

  if (tab === "history") {
    return (
      <PhoneFrame className="driver-app">
        <AppHeader title="Заказы" subtitle="Реальные данные backend" right={<SmartLogo compact />} />
        <section className="orders-list">
          {ordersLoading && <p className="inline-status">Загружаем заказы...</p>}
          {!ordersLoading && !orders.length && <p className="muted-note">В выбранном регионе заказов нет.</p>}
          {orders.map(order => <OrderCard key={order.id} order={order} onAccept={takeOrder} loading={actionLoading === order.id} />)}
        </section>
        <BottomNav active="history" onSelect={setTab} />
      </PhoneFrame>
    );
  }

  if (tab === "support") {
    return (
      <PhoneFrame className="driver-app">
        <AppHeader title="Статус связи" subtitle={`Socket: ${socketState}`} right={<SmartLogo compact />} />
        <section className="orders-list"><article className="driver-order"><b>Backend realtime</b><p>Водитель подключается к серверной комнате региона через join_drivers без передачи regionId с клиента.</p></article></section>
        <BottomNav active="support" onSelect={setTab} />
      </PhoneFrame>
    );
  }

  if (tab === "profile") {
    return (
      <PhoneFrame className="driver-app">
        <AppHeader title="Профиль водителя" subtitle={driver?.phone || ""} right={<SmartLogo compact />} />
        <section className="orders-list">
          <div className="list-card">
            <button type="button"><Icon name="route" /><span>Регион<small>{regions.find(r => r.regionId === selectedRegionId)?.regionName || "Не выбран"}</small></span><Icon name="back" /></button>
            <button type="button"><Icon name="star" /><span>Рейтинг<small>{driver?.rating || "5.00"}</small></span><Icon name="back" /></button>
            <button type="button" onClick={logout}><Icon name="logout" /><span>Выйти</span><Icon name="back" /></button>
          </div>
        </section>
        <BottomNav active="profile" onSelect={setTab} />
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame className="driver-app">
      <AppHeader title="Водитель" subtitle={online ? "На линии" : "Не на линии"} right={<SmartLogo compact />} />
      <section className="driver-status-card">
        <div className="avatar">{driver?.name?.slice(0, 1) || "D"}</div>
        <span><b>{driver?.name || "Driver"}</b><small>{driver?.car_model || "Авто"} · {driver?.plate || "номер"}</small></span>
        <strong>{driver?.rating || "5.00"}</strong>
      </section>
      <RegionSelector regions={regions} value={selectedRegionId} loading={regionsLoading} error={regionError} onChange={changeRegion} />
      <Button className="wide" variant={online ? "secondary" : "primary"} disabled={Boolean(disabledReason) || onlineLoading} onClick={toggleOnline}>
        {onlineLoading ? "Обновляем..." : online ? "Уйти с линии" : "Выйти на линию"}
      </Button>
      {disabledReason && <p className="inline-error driver-message">{disabledReason}</p>}
      {message && <p className={message.includes("линии") || message.includes("Регион") ? "inline-status driver-message" : "inline-error driver-message"}>{message}</p>}
      {active ? (
        <ActiveTrip order={active} loading={actionLoading} onAction={updateTrip} />
      ) : (
        <section className="orders-list">
          <h2>{online ? "Новые заказы региона" : "Вы не на линии"}</h2>
          {!online && <p className="muted-note">Выберите утверждённый регион и выйдите на линию, чтобы получать заказы.</p>}
          {online && ordersLoading && <p className="inline-status">Загружаем заказы...</p>}
          {online && !ordersLoading && !orders.length && <p className="muted-note">В выбранном регионе пока нет заказов.</p>}
          {online && orders.filter(order => order.status === "NEW").map(order => <OrderCard key={order.id} order={order} onAccept={takeOrder} loading={actionLoading === order.id} />)}
        </section>
      )}
      <BottomNav active="home" onSelect={setTab} />
    </PhoneFrame>
  );
}

function DriverLogin({ auth, setAuth, loading, error, onSubmit }) {
  return (
    <PhoneFrame className="driver-app auth-screen">
      <SmartLogo />
      <h1>Вход водителя</h1>
      <p>Только реальный backend login.</p>
      <form className="form-stack" onSubmit={onSubmit}>
        <input placeholder="Телефон" value={auth.phone} onChange={event => setAuth({ ...auth, phone: event.target.value, email: "" })} />
        <input placeholder="или email" value={auth.email} onChange={event => setAuth({ ...auth, email: event.target.value })} />
        <input placeholder="Пароль" type="password" value={auth.password} onChange={event => setAuth({ ...auth, password: event.target.value })} />
        {error && <p className="inline-error">{error}</p>}
        <Button className="wide" type="submit" disabled={loading}>{loading ? "Входим..." : "Войти"}</Button>
      </form>
    </PhoneFrame>
  );
}

function RegionSelector({ regions, value, loading, error, onChange }) {
  return (
    <section className="region-selector">
      <label>
        <span>Утверждённый регион</span>
        <select value={value} disabled={loading || !regions.length} onChange={event => onChange(event.target.value)}>
          <option value="">{loading ? "Загрузка..." : "Выберите регион"}</option>
          {regions.map(region => <option value={region.regionId} key={region.regionId}>{region.regionName}</option>)}
        </select>
      </label>
      {error && <p className="inline-error">{error}</p>}
      {!loading && !regions.length && <p className="inline-error">Нет активных утверждённых регионов.</p>}
    </section>
  );
}

function OrderCard({ order, onAccept, loading }) {
  return (
    <article className="driver-order">
      <MapView pickup={{ lat: order.pickup_lat, lng: order.pickup_lng }} destination={{ lat: order.dropoff_lat, lng: order.dropoff_lng }} status={order.public_status || order.status} compact />
      <b>{order.pickup} {"->"} {order.dropoff}</b>
      <p>{order.tariff} · {order.payment_method}</p>
      <strong><Money value={order.price} /></strong>
      {order.status === "NEW" && <div className="button-row"><Button onClick={() => onAccept(order)} disabled={loading}>{loading ? "Принимаем..." : "Принять заказ"}</Button></div>}
    </article>
  );
}

function ActiveTrip({ order, loading, onAction }) {
  return (
    <section className="order-panel">
      <MapView pickup={{ lat: order.pickup_lat, lng: order.pickup_lng }} destination={{ lat: order.dropoff_lat, lng: order.dropoff_lng }} driver status={order.public_status || order.status} compact />
      <h2>Активный заказ</h2>
      <p>{order.pickup} {"->"} {order.dropoff}</p>
      <div className="summary-card"><b>{order.short_id || order.id}</b><span><Money value={order.price} /></span><small>{order.status}</small></div>
      <div className="button-row">
        {order.status === "DRIVER_ASSIGNED" && <Button onClick={() => onAction("arrived")} disabled={loading === "arrived"}>{loading === "arrived" ? "..." : "Я приехал"}</Button>}
        {order.status === "DRIVER_ARRIVED" && <Button onClick={() => onAction("start")} disabled={loading === "start"}>{loading === "start" ? "..." : "Начать поездку"}</Button>}
        {order.status === "IN_PROGRESS" && <Button onClick={() => onAction("complete")} disabled={loading === "complete"}>{loading === "complete" ? "..." : "Завершить"}</Button>}
        {["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(order.status) && <Button variant="secondary" onClick={() => onAction("cancel")} disabled={loading === "cancel"}>Отменить</Button>}
      </div>
    </section>
  );
}

function mergeOrder(list, order) {
  if (activeStatuses.includes(order.status)) return list.filter(item => item.id !== order.id);
  if (order.status !== "NEW") return list.filter(item => item.id !== order.id);
  const index = list.findIndex(item => item.id === order.id);
  if (index === -1) return [order, ...list];
  return list.map(item => item.id === order.id ? { ...item, ...order } : item);
}

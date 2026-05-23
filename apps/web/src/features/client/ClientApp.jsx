import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../core/icons.jsx";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import { PAYMENTS, PLACES } from "../../core/data.js";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import {
  cancelPublicOrder,
  createOrder,
  estimateOrder,
  getActiveRegions,
  getTariffs,
  getToken,
  loginUser
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";

const paymentOptions = PAYMENTS.filter(item => ["CASH", "KASPI", "CARD"].includes(item.id));
const errorMessages = {
  PICKUP_REGION_INACTIVE: "В этом месте сервис пока недоступен",
  DROPOFF_REGION_INACTIVE: "Точка назначения вне активного региона",
  INTERCITY_NOT_SUPPORTED: "Межгород пока не поддерживается",
  TARIFF_INACTIVE: "Этот тариф временно недоступен",
  TARIFF_REGION_MISMATCH: "Тариф недоступен для выбранного региона",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят другим водителем",
  UNAUTHORIZED: "Войдите, чтобы заказать поездку",
  FORBIDDEN: "У аккаунта нет прав пассажира"
};
const orderSteps = [["SEARCHING", "Поиск"], ["ACCEPTED", "Принят"], ["DRIVER_ARRIVED", "Прибыл"], ["IN_PROGRESS", "В пути"], ["COMPLETED", "Завершено"]];

function formatError(error) {
  return errorMessages[error?.code] || error?.message || "Не удалось выполнить запрос";
}

function publicStatus(status) {
  const map = { NEW: "SEARCHING", DRIVER_ASSIGNED: "ACCEPTED", DRIVER_ARRIVED: "DRIVER_ARRIVED", IN_PROGRESS: "IN_PROGRESS", COMPLETED: "COMPLETED", CANCELLED: "CANCELED", CANCELED: "CANCELED" };
  return map[status] || status || "SEARCHING";
}

function statusLabel(status) {
  const map = { NEW: "Поиск", SEARCHING: "Поиск", ACCEPTED: "Принят", DRIVER_ASSIGNED: "Принят", DRIVER_ARRIVED: "Прибыл", IN_PROGRESS: "В пути", COMPLETED: "Завершено", CANCELLED: "Отменён", CANCELED: "Отменён" };
  return map[status] || status || "Статус";
}

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    short_id: order.short_id || order.shortId || order.id,
    pickup_text: order.pickup_text || order.pickupText || order.pickup || "Откуда",
    dropoff_text: order.dropoff_text || order.dropoffText || order.dropoff || "Куда",
    payment_method: order.payment_method || order.paymentMethod,
    public_status: order.public_status || order.publicStatus || publicStatus(order.status)
  };
}

function tariffTitle(tariff) {
  return tariff?.name || tariff?.title || "Тариф";
}

function estimateDistanceKm(a, b) {
  const latKm = (Number(a.lat) - Number(b.lat)) * 111;
  const lngKm = (Number(a.lng) - Number(b.lng)) * 82;
  return Math.max(0.4, Math.round(Math.sqrt(latKm * latKm + lngKm * lngKm) * 10) / 10);
}

function estimateDurationMin(a, b) {
  return Math.max(3, Math.round(estimateDistanceKm(a, b) * 3.4));
}

function buildRoutePayload({ pickup, destination, tariff }) {
  return {
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffLat: destination.lat,
    dropoffLng: destination.lng,
    tariffId: tariff?.id,
    tariff: tariff?.name || tariff?.id || "Economy",
    distanceKm: estimateDistanceKm(pickup, destination),
    durationMin: estimateDurationMin(pickup, destination)
  };
}

export default function ClientApp() {
  const [tab, setTab] = useState("order");
  const [addressMode, setAddressMode] = useState("");
  const [pickup, setPickup] = useState({ ...PLACES[0], title: "ул. Шамо, 58", subtitle: "Точка посадки" });
  const [destination, setDestination] = useState(PLACES[2]);
  const [payment, setPayment] = useState(paymentOptions[0]);
  const [regions, setRegions] = useState([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsError, setRegionsError] = useState("");
  const [tariffs, setTariffs] = useState([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsError, setTariffsError] = useState("");
  const [tariff, setTariff] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [auth, setAuth] = useState({ phone: "+77000000001", email: "", password: "123456" });
  const [rider, setRider] = useState({ name: "Пассажир", phone: "+77000000001" });
  const [authenticated, setAuthenticated] = useState(Boolean(getToken()));
  const socketRef = useRef(null);

  const selectedRegionId = estimate?.regionId || regions[0]?.id || "";
  const selectedRegionName = estimate?.regionName || regions.find(region => region.id === selectedRegionId)?.name || "";
  const canCreate = Boolean(authenticated && pickup && destination && tariff && estimate && !estimateError);

  useEffect(() => {
    let ignore = false;
    setRegionsLoading(true);
    getActiveRegions()
      .then(data => {
        if (ignore) return;
        setRegions(data.regions || []);
        setRegionsError("");
      })
      .catch(error => !ignore && setRegionsError(formatError(error)))
      .finally(() => !ignore && setRegionsLoading(false));
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!selectedRegionId) return undefined;
    let ignore = false;
    setTariffsLoading(true);
    getTariffs(selectedRegionId)
      .then(data => {
        if (ignore) return;
        const nextTariffs = data.tariffs || [];
        setTariffs(nextTariffs);
        setTariff(current => nextTariffs.find(item => item.id === current?.id) || nextTariffs[0] || null);
        setTariffsError("");
      })
      .catch(error => !ignore && setTariffsError(formatError(error)))
      .finally(() => !ignore && setTariffsLoading(false));
    return () => { ignore = true; };
  }, [selectedRegionId]);

  useEffect(() => {
    if (!pickup || !destination || !tariff) {
      setEstimate(null);
      return undefined;
    }
    let ignore = false;
    setEstimateLoading(true);
    setEstimateError("");
    estimateOrder(buildRoutePayload({ pickup, destination, tariff }))
      .then(data => {
        if (ignore) return;
        setEstimate(data.estimate || null);
      })
      .catch(error => {
        if (ignore) return;
        setEstimate(null);
        setEstimateError(formatError(error));
      })
      .finally(() => !ignore && setEstimateLoading(false));
    return () => { ignore = true; };
  }, [pickup, destination, tariff]);

  useEffect(() => {
    if (!order?.id || !getToken()) return undefined;
    const socket = createSocket();
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("join_order", order.id));
    const updateOrder = payload => {
      if (payload?.id === order.id) setOrder(current => normalizeOrder({ ...current, ...payload }));
    };
    socket.on("order_status_public", updateOrder);
    socket.on("order_updated", updateOrder);
    socket.on("order_accepted", updateOrder);
    return () => {
      socket.off("order_status_public", updateOrder);
      socket.off("order_updated", updateOrder);
      socket.off("order_accepted", updateOrder);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [order?.id]);

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await loginUser({ phone: auth.email ? undefined : auth.phone, email: auth.email || undefined, password: auth.password });
      setAuthenticated(true);
      setRider(current => ({ ...current, phone: auth.phone || current.phone }));
      setMessage("Вы вошли в аккаунт");
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitOrder() {
    if (loading) return;
    if (!authenticated || !getToken()) {
      setTab("profile");
      setMessage(errorMessages.UNAUTHORIZED);
      return;
    }
    if (!pickup || !destination || !tariff || !estimate) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await createOrder({
        ...buildRoutePayload({ pickup, destination, tariff }),
        riderName: rider.name,
        riderPhone: rider.phone,
        pickupText: pickup.title,
        dropoffText: destination.title,
        paymentMethod: payment.id,
        notes: ""
      });
      setOrder(normalizeOrder(data.order));
      setTab("trip");
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  async function cancelOrder() {
    if (!order?.id || loading) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await cancelPublicOrder(order.id, rider.phone);
      setOrder(normalizeOrder(data.order));
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  function chooseAddress(place) {
    if (addressMode === "pickup") setPickup(place);
    if (addressMode === "destination") setDestination(place);
    setAddressMode("");
  }

  const ctaText = !authenticated ? "Войдите, чтобы заказать" : estimate ? "Заказать" : "Рассчитать стоимость";

  return (
    <PhoneFrame className="taxi-pwa passenger-pwa">
      <AppHeader regionName={selectedRegionName} />
      {addressMode ? (
        <AddressPicker mode={addressMode} onBack={() => setAddressMode("")} onSelect={chooseAddress} />
      ) : (
        <main className="app-content passenger-content">
          {tab === "order" && <OrderTab pickup={pickup} destination={destination} onPickup={() => setAddressMode("pickup")} onDestination={() => setAddressMode("destination")} tariffs={tariffs} tariff={tariff} setTariff={setTariff} tariffsLoading={tariffsLoading} tariffError={tariffsError} regionsLoading={regionsLoading} regionsError={regionsError} regions={regions} estimate={estimate} estimateLoading={estimateLoading} estimateError={estimateError} payment={payment} setPayment={setPayment} ctaText={ctaText} loading={loading} canCreate={canCreate} onSubmit={submitOrder} />}
          {tab === "trip" && <TripTab order={order} pickup={pickup} destination={destination} estimate={estimate} loading={loading} onCancel={cancelOrder} />}
          {tab === "profile" && <ProfileTab authenticated={authenticated} rider={rider} setRider={setRider} auth={auth} setAuth={setAuth} message={message} loading={loading} onSubmit={submitLogin} />}
        </main>
      )}
      {!addressMode && <BottomTabs active={tab} onSelect={setTab} items={[["order", "Заказ"], ["trip", "Поездка"], ["profile", "Профиль"]]} />}
    </PhoneFrame>
  );
}

function AppHeader({ regionName }) {
  return <header className="taxi-app-header"><SmartTaxiLogo /><span className="header-region">{regionName || "Регион не выбран"}</span></header>;
}

function OrderTab({ pickup, destination, onPickup, onDestination, tariffs, tariff, setTariff, tariffsLoading, tariffError, regionsLoading, regionsError, regions, estimate, estimateLoading, estimateError, payment, setPayment, ctaText, loading, canCreate, onSubmit }) {
  return (
    <div className="screen-grid order-screen">
      <section className="screen-intro"><h1>Закажите поездку</h1><p>Поездки только внутри активного региона</p></section>
      <RouteCard pickup={pickup} destination={destination} onPickup={onPickup} onDestination={onDestination} />
      <TariffCard tariffs={tariffs} tariff={tariff} setTariff={setTariff} loading={tariffsLoading} error={tariffError} />
      <PriceCard estimate={estimate} loading={estimateLoading} error={estimateError || regionsError} regionsLoading={regionsLoading} hasRegions={Boolean(regions.length)} />
      <PaymentSelector payment={payment} setPayment={setPayment} />
      <section className="action-card"><Button className="wide primary-gold" disabled={loading || estimateLoading || !tariff || !regions.length} onClick={onSubmit}>{loading ? "Отправляем заказ" : ctaText}{canCreate && estimate?.estimatedPrice ? <> · <Money value={estimate.estimatedPrice} /></> : null}</Button></section>
    </div>
  );
}

function RouteCard({ pickup, destination, onPickup, onDestination }) {
  return (
    <section className="app-card route-input-card">
      <h2>Куда едем?</h2>
      <div className="route-input-grid">
        <div className="route-connector" aria-hidden="true"><span className="route-dot pickup" /><span className="route-line" /><span className="route-dot dropoff" /></div>
        <div className="route-inputs">
          <button className="route-input" type="button" onClick={onPickup}><span>Откуда</span><b>{pickup?.title || "Укажите точку посадки"}</b>{pickup?.subtitle && <small>{pickup.subtitle}</small>}</button>
          <button className="route-input" type="button" onClick={onDestination}><span>Куда</span><b>{destination?.title || "Укажите точку назначения"}</b>{destination?.subtitle && <small>{destination.subtitle}</small>}</button>
        </div>
      </div>
    </section>
  );
}

function TariffCard({ tariffs, tariff, setTariff, loading, error }) {
  return (
    <section className="app-card tariff-card-clean">
      <h2>Выберите тариф</h2>
      {loading && <p className="state-note">Загружаем тарифы</p>}
      {error && <p className="state-note danger">{error}</p>}
      {!loading && !error && !tariffs.length && <p className="state-note">Нет доступных тарифов</p>}
      <div className="tariff-scroll">{tariffs.map(item => <button type="button" key={item.id} className={tariff?.id === item.id ? "selected" : ""} onClick={() => setTariff(item)}><strong>{tariffTitle(item)}</strong><span>{item.description || "Поездка по активному региону"}</span><small>Минимум <Money value={item.minimumPrice || item.minimum_price || item.min_price || 0} /></small></button>)}</div>
    </section>
  );
}

function PriceCard({ estimate, loading, error, regionsLoading, hasRegions }) {
  return (
    <section className="app-card price-card-clean">
      <h2>Стоимость</h2>
      {regionsLoading && <p className="state-note">Проверяем активные регионы</p>}
      {!regionsLoading && !hasRegions && <p className="state-note danger">Нет активных регионов</p>}
      {error && <p className="state-note danger">{error}</p>}
      {loading ? <div className="price-skeleton" /> : estimate ? <div className="price-value"><strong><Money value={estimate.estimatedPrice} /></strong><span>Рассчитано сервером</span><RouteEstimate estimate={estimate} /></div> : <p className="state-note">Укажите маршрут, чтобы рассчитать стоимость</p>}
    </section>
  );
}

function PaymentSelector({ payment, setPayment }) {
  return <section className="payment-strip">{paymentOptions.map(item => <button type="button" key={item.id} className={payment?.id === item.id ? "selected" : ""} onClick={() => setPayment(item)}>{item.title}</button>)}</section>;
}

function RouteEstimate({ estimate }) {
  const distance = estimate?.pricing?.distanceKm || estimate?.distanceKm;
  const duration = estimate?.pricing?.durationMin || estimate?.durationMin;
  if (!distance && !duration) return null;
  return <em>Маршрут: {distance ? `${distance} км` : ""}{distance && duration ? " · " : ""}{duration ? `${duration} мин` : ""}</em>;
}

function TripTab({ order, pickup, destination, estimate, loading, onCancel }) {
  if (!order) return <section className="screen-grid"><section className="screen-intro"><h1>Текущая поездка</h1><p>Создайте заказ, и его статус появится здесь.</p></section><EmptyState title="Активной поездки нет" text="Создайте заказ, и его статус появится здесь." /></section>;
  const status = publicStatus(order.public_status || order.status);
  const terminal = ["COMPLETED", "CANCELLED", "CANCELED"].includes(status);
  return (
    <section className="screen-grid">
      <section className="screen-intro"><h1>Текущая поездка</h1><p>{statusLabel(status)}</p></section>
      <section className="app-card active-order-clean">
        <div className="card-topline"><h2>Заказ {order.short_id || order.id}</h2><StatusBadge label={statusLabel(status)} tone={terminal ? "muted" : "gold"} /></div>
        <StatusStepper status={status} />
        <CompactRoute pickup={order.pickup_text || pickup.title} dropoff={order.dropoff_text || destination.title} />
        <div className="price-value compact"><strong><Money value={order.price || estimate?.estimatedPrice} /></strong><span>Стоимость поездки</span></div>
        {!["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"].includes(status) && <p className="state-note">Данные водителя появятся после принятия заказа</p>}
        {!terminal && <Button variant="danger" className="wide" onClick={onCancel} disabled={loading}>{loading ? "Отменяем" : "Отменить заказ"}</Button>}
      </section>
    </section>
  );
}

function ProfileTab({ authenticated, rider, setRider, auth, setAuth, message, loading, onSubmit }) {
  return (
    <section className="screen-grid profile-screen">
      <section className="screen-intro"><h1>Профиль</h1><p>{authenticated ? "Аккаунт подключён" : "Войдите, чтобы заказать поездку"}</p></section>
      <section className="app-card account-card">
        <div className="card-topline"><h2>Аккаунт пассажира</h2><StatusBadge label={authenticated ? "Вход выполнен" : "Нужен вход"} tone={authenticated ? "success" : "muted"} /></div>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>Телефон<input value={auth.phone} onChange={event => setAuth({ ...auth, phone: event.target.value, email: "" })} placeholder="Телефон" /></label>
          <label>Email<input value={auth.email} onChange={event => setAuth({ ...auth, email: event.target.value })} placeholder="Если вход по email" /></label>
          <label>Пароль<input value={auth.password} onChange={event => setAuth({ ...auth, password: event.target.value })} placeholder="Пароль" type="password" /></label>
          <label>Имя<input value={rider.name} onChange={event => setRider({ ...rider, name: event.target.value })} placeholder="Имя пассажира" /></label>
          <label>Телефон для заказа<input value={rider.phone} onChange={event => setRider({ ...rider, phone: event.target.value })} placeholder="Телефон" /></label>
          {message && <p className={message.includes("вошли") ? "state-note success" : "state-note danger"}>{message}</p>}
          <Button className="wide primary-gold" type="submit" disabled={loading}>{loading ? "Входим" : authenticated ? "Обновить данные" : "Войти"}</Button>
        </form>
      </section>
      <section className="app-card support-card"><h2>Поддержка</h2><p>Все проверки региона, тарифа и стоимости выполняет backend.</p></section>
    </section>
  );
}

function AddressPicker({ mode, onBack, onSelect }) {
  const [query, setQuery] = useState("");
  const filtered = PLACES.filter(place => `${place.title} ${place.subtitle}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <main className="app-content address-screen">
      <div className="screen-intro with-back"><button type="button" onClick={onBack} aria-label="Назад"><Icon name="back" /></button><div><h1>{mode === "pickup" ? "Откуда" : "Куда"}</h1><p>Выберите адрес из подсказок</p></div></div>
      <label className="single-input">Адрес<input value={query} onChange={event => setQuery(event.target.value)} autoFocus placeholder="Введите адрес" /></label>
      <section className="address-list-clean">{filtered.map(place => <button type="button" key={`${place.title}-${place.subtitle}`} onClick={() => onSelect(place)}><span><b>{place.title}</b><small>{place.subtitle}</small></span></button>)}</section>
      {query && <Button variant="secondary" className="wide" onClick={() => onSelect({ title: query, subtitle: "Введённый адрес", lat: 42.316, lng: 69.596 })}>Использовать адрес</Button>}
    </main>
  );
}

function StatusStepper({ status }) {
  const currentIndex = Math.max(0, orderSteps.findIndex(([key]) => key === status));
  return <ol className="status-stepper-clean">{orderSteps.map(([key, label], index) => <li key={key} className={index <= currentIndex ? "done" : ""}><span /><b>{label}</b></li>)}</ol>;
}

function CompactRoute({ pickup, dropoff }) {
  return <div className="compact-route-clean"><b>{pickup}</b><span>{dropoff}</span></div>;
}

function StatusBadge({ label, tone = "gold" }) {
  return <span className={`status-badge-clean ${tone}`}>{label}</span>;
}

function EmptyState({ title, text }) {
  return <section className="app-card empty-state-clean"><b>{title}</b><p>{text}</p></section>;
}

function BottomTabs({ active, onSelect, items }) {
  return <nav className="mobile-bottom-tabs">{items.map(([key, label]) => <button type="button" key={key} className={active === key ? "active" : ""} onClick={() => onSelect(key)}>{label}</button>)}</nav>;
}

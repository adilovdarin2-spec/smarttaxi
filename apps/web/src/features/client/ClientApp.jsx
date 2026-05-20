import React, { useEffect, useRef, useState } from "react";
import { Icon, SmartLogo, VehicleIcon } from "../../core/icons.jsx";
import { AppHeader, BottomNav, Button, Money, PhoneFrame } from "../../core/ui.jsx";
import { PAYMENTS, PLACES } from "../../core/data.js";
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
import MapView from "../map/MapView.jsx";

const quick = [
  ["home", "Дом"],
  ["work", "Работа"],
  ["star", "Избранное"],
  ["clock", "Недавние"]
];
const paymentOptions = PAYMENTS.filter(item => ["CASH", "KASPI", "CARD", "CASHBACK", "MIXED"].includes(item.id));
const errorMessages = {
  PICKUP_REGION_INACTIVE: "Точка посадки вне активного региона.",
  DROPOFF_REGION_INACTIVE: "Точка назначения вне активного региона.",
  INTERCITY_NOT_SUPPORTED: "Поездки между регионами в MVP не поддерживаются.",
  TARIFF_INACTIVE: "Выбранный тариф сейчас недоступен.",
  TARIFF_REGION_MISMATCH: "Тариф не относится к региону поездки.",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят водителем.",
  UNAUTHORIZED: "Войдите как пассажир, чтобы создать заказ.",
  FORBIDDEN: "У аккаунта нет прав пассажира для создания заказа."
};

function formatError(error) {
  return errorMessages[error?.code] || error?.message || "Не удалось выполнить запрос.";
}

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    short_id: order.short_id || order.shortId || order.id,
    pickup_text: order.pickup_text || order.pickupText,
    dropoff_text: order.dropoff_text || order.dropoffText,
    payment_method: order.payment_method || order.paymentMethod,
    public_status: order.public_status || order.publicStatus || order.status
  };
}

function tariffTitle(tariff) {
  return tariff?.name || tariff?.title || "Tariff";
}

function tariffPrice(tariff, estimate) {
  if (estimate?.pricing?.tariffId === tariff?.id) return estimate.estimatedPrice;
  return tariff?.minimumPrice || tariff?.min_price || 0;
}

export default function ClientApp() {
  const [screen, setScreen] = useState("splash");
  const [sheet, setSheet] = useState("home");
  const [pickup, setPickup] = useState({ ...PLACES[0], title: "ул. Шамо, 58", subtitle: "Моё местоположение" });
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
  const [socketState, setSocketState] = useState("offline");
  const [authOpen, setAuthOpen] = useState(!getToken());
  const [auth, setAuth] = useState({ phone: "+77000000001", email: "", password: "123456" });
  const [rider, setRider] = useState({ name: "SmartTaxi Passenger", phone: "+77000000001" });
  const socketRef = useRef(null);

  const selectedRegionId = estimate?.regionId || regions[0]?.id || "";
  const canRequest = Boolean(destination && pickup && tariff && estimate && !estimateError && getToken());
  const price = estimate?.estimatedPrice || 0;

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
    if (!selectedRegionId) return;
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
      return;
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
    setSocketState("connecting");
    socket.on("connect", () => {
      setSocketState("connected");
      socket.emit("join_order", order.id);
    });
    socket.on("disconnect", () => setSocketState("offline"));
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
      await loginUser({
        phone: auth.email ? undefined : auth.phone,
        email: auth.email || undefined,
        password: auth.password
      });
      setRider(current => ({ ...current, phone: auth.phone || current.phone }));
      setAuthOpen(false);
      setMessage("Вход выполнен. Теперь можно создать заказ.");
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitOrder() {
    if (!destination || !tariff || loading) return;
    if (!getToken()) {
      setAuthOpen(true);
      setMessage(errorMessages.UNAUTHORIZED);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const payload = {
        ...buildRoutePayload({ pickup, destination, tariff }),
        riderName: rider.name,
        riderPhone: rider.phone,
        pickupText: pickup.title,
        dropoffText: destination.title,
        paymentMethod: payment.id,
        notes: ""
      };
      const data = await createOrder(payload);
      setOrder(normalizeOrder(data.order));
      setSheet("searching");
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
      setSheet("home");
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  if (screen === "splash") return <WelcomeScreen onStart={() => setScreen("home")} />;

  return (
    <PhoneFrame className="client-app">
      {sheet === "home" && (
        <>
          <MapView pickup={pickup} destination={destination} status={estimateLoading ? "Расчёт..." : estimate ? `${estimate.pricing?.durationMin || 0} мин` : ""} />
          <HomeHeader onMenu={() => setSheet("menu")} />
          <section className="ride-sheet">
            <div className="sheet-grip" />
            <RouteCard pickup={pickup} destination={destination} onPickup={() => setSheet("pickup")} onDestination={() => setSheet("destination")} />
            <div className="quick-grid">{quick.map(([icon, label]) => <button key={label} type="button" onClick={() => setSheet(label === "Недавние" ? "history" : "destination")}><Icon name={icon} /><span>{label}</span></button>)}</div>
            <RegionState loading={regionsLoading} error={regionsError} regions={regions} />
            <TariffCarousel tariffs={tariffs} tariff={tariff} setTariff={setTariff} estimate={estimate} loading={tariffsLoading} error={tariffsError} />
            <PaymentRow payment={payment} setPayment={setPayment} />
            {authOpen && <PassengerLogin auth={auth} setAuth={setAuth} rider={rider} setRider={setRider} loading={loading} onSubmit={submitLogin} />}
            {estimateLoading && <p className="inline-status">Считаем стоимость на backend...</p>}
            {estimateError && <p className="inline-error">{estimateError}</p>}
            {message && <p className={message.includes("Вход") ? "inline-status" : "inline-error"}>{message}</p>}
            <Button className="wide" disabled={!destination || !tariff || loading || estimateLoading || !regions.length} onClick={submitOrder}>
              {loading ? "Отправляем..." : canRequest ? <>Заказать за <Money value={price} /></> : "Войти и выбрать тариф"}
            </Button>
          </section>
          <BottomNav active="home" onSelect={key => setSheet(key === "profile" ? "profile" : key)} />
        </>
      )}
      {sheet === "pickup" && <AddressScreen mode="pickup" onBack={() => setSheet("home")} onSelect={place => { setPickup(place); setSheet("home"); }} />}
      {sheet === "destination" && <AddressScreen mode="destination" onBack={() => setSheet("home")} onSelect={place => { setDestination(place); setSheet("home"); }} />}
      {sheet === "payment" && <PaymentScreen payment={payment} setPayment={setPayment} onBack={() => setSheet("home")} />}
      {sheet === "searching" && <ActiveOrderScreen order={order} pickup={pickup} destination={destination} price={price} socketState={socketState} loading={loading} onCancel={cancelOrder} onHome={() => setSheet("home")} />}
      {sheet === "history" && <HistoryScreen onBack={() => setSheet("home")} order={order} />}
      {sheet === "profile" && <ProfileScreen onBack={() => setSheet("home")} setSheet={setSheet} rider={rider} />}
      {sheet === "menu" && <ClientMenu onBack={() => setSheet("home")} setSheet={setSheet} />}
    </PhoneFrame>
  );
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

function estimateDistanceKm(a, b) {
  const latKm = (Number(a.lat) - Number(b.lat)) * 111;
  const lngKm = (Number(a.lng) - Number(b.lng)) * 82;
  return Math.max(0.4, Math.round(Math.sqrt(latKm * latKm + lngKm * lngKm) * 10) / 10);
}

function estimateDurationMin(a, b) {
  return Math.max(3, Math.round(estimateDistanceKm(a, b) * 3.4));
}

function WelcomeScreen({ onStart }) {
  return (
    <PhoneFrame className="welcome-screen">
      <div className="welcome-inner">
        <SmartLogo />
        <h1>Smart<span>Taxi</span></h1>
        <p>Заказы только внутри активного региона.</p>
        <div className="splash-city" />
        <div className="splash-car"><VehicleIcon /></div>
        <ul>
          <li><Icon name="route" />Backend проверяет регион поездки</li>
          <li><Icon name="cash" />Цена считается на сервере</li>
          <li><Icon name="shield" />Межгород заблокирован</li>
        </ul>
        <Button className="wide" onClick={onStart}>Начать поездку</Button>
      </div>
    </PhoneFrame>
  );
}

function HomeHeader({ onMenu }) {
  return (
    <header className="floating-header">
      <button className="round-button" type="button" onClick={onMenu} aria-label="Меню"><Icon name="menu" /></button>
      <span className="bonus-pill"><SmartLogo compact /><span>Live API<br /><b>backend</b></span></span>
    </header>
  );
}

function RouteCard({ pickup, destination, onPickup, onDestination }) {
  return (
    <div className="route-card">
      <button type="button" onClick={onPickup}><b className="dot blue" /> <span><small>Откуда</small>{pickup?.title || "Моё местоположение"}</span><Icon name="plus" /></button>
      <button type="button" onClick={onDestination}><b className="dot gold" /> <span><small>Куда</small>{destination?.title || "Куда едем?"}</span><Icon name="plus" /></button>
    </div>
  );
}

function RegionState({ loading, error, regions }) {
  if (loading) return <p className="inline-status">Загружаем активные регионы...</p>;
  if (error) return <p className="inline-error">{error}</p>;
  if (!regions.length) return <p className="inline-error">Нет активных регионов. Заказ недоступен.</p>;
  return <p className="inline-status">Активный регион: {regions.map(region => region.name).join(", ")}</p>;
}

function TariffCarousel({ tariffs, tariff, setTariff, estimate, loading, error }) {
  return (
    <section>
      <h3 className="section-title">Тариф</h3>
      {loading && <p className="inline-status">Загружаем тарифы...</p>}
      {error && <p className="inline-error">{error}</p>}
      {!loading && !error && !tariffs.length && <p className="inline-error">Нет активных тарифов для региона.</p>}
      <div className="tariff-carousel">
        {tariffs.map(item => (
          <button type="button" className={`tariff-card ${tariff?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => setTariff(item)}>
            <VehicleIcon type={item.name === "Business" ? "business" : item.name === "Comfort" ? "comfort" : "sedan"} />
            {tariff?.id === item.id && <span className="check"><Icon name="check" size={14} /></span>}
            <strong>{tariffTitle(item)}</strong>
            <small>Мин. цена</small>
            <b><Money value={tariffPrice(item, estimate)} /></b>
            <em>{Number(item.surgeMultiplier || 1) > 1 ? `x${item.surgeMultiplier}` : "обычный спрос"}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function PaymentRow({ payment, setPayment }) {
  return (
    <div className="tabs">
      {paymentOptions.map(item => (
        <button key={item.id} type="button" className={payment.id === item.id ? "active" : ""} onClick={() => setPayment(item)}>{item.title}</button>
      ))}
    </div>
  );
}

function PassengerLogin({ auth, setAuth, rider, setRider, loading, onSubmit }) {
  return (
    <form className="auth-inline form-stack" onSubmit={onSubmit}>
      <b>Вход пассажира</b>
      <input value={auth.phone} onChange={event => setAuth({ ...auth, phone: event.target.value, email: "" })} placeholder="Телефон аккаунта" />
      <input value={auth.email} onChange={event => setAuth({ ...auth, email: event.target.value })} placeholder="или email" />
      <input value={auth.password} onChange={event => setAuth({ ...auth, password: event.target.value })} placeholder="Пароль" type="password" />
      <input value={rider.name} onChange={event => setRider({ ...rider, name: event.target.value })} placeholder="Имя пассажира" />
      <input value={rider.phone} onChange={event => setRider({ ...rider, phone: event.target.value })} placeholder="Телефон для заказа" />
      <Button className="wide" type="submit" disabled={loading}>{loading ? "Входим..." : "Войти"}</Button>
    </form>
  );
}

function AddressScreen({ mode, onBack, onSelect }) {
  const [query, setQuery] = useState("");
  const filtered = PLACES.filter(p => `${p.title} ${p.subtitle}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="panel-screen">
      <AppHeader title={mode === "pickup" ? "Откуда поедем?" : "Куда едем?"} onBack={onBack} />
      <label className="search-field"><Icon name="search" /><input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder="Адрес" /></label>
      <section className="address-group">
        <h3>Адреса</h3>
        {filtered.map(place => <button key={`${place.title}-${place.subtitle}`} type="button" onClick={() => onSelect(place)}><Icon name="pin" /><span>{place.title}<small>{place.subtitle}</small></span><Icon name="back" /></button>)}
      </section>
      {query && <Button variant="secondary" className="wide" onClick={() => onSelect({ title: query, subtitle: "Введённый адрес", lat: 42.316, lng: 69.596 })}>Использовать адрес: {query}</Button>}
    </section>
  );
}

function PaymentScreen({ payment, setPayment, onBack }) {
  return (
    <section className="panel-screen">
      <AppHeader title="Способ оплаты" onBack={onBack} />
      <div className="list-card">{paymentOptions.map(item => <button key={item.id} type="button" className={payment.id === item.id ? "selected" : ""} onClick={() => setPayment(item)}><Icon name={item.id === "CARD" ? "card" : "cash"} /><span>{item.title}<small>{item.note}</small></span>{payment.id === item.id && <Icon name="check" />}</button>)}</div>
    </section>
  );
}

function ActiveOrderScreen({ order, pickup, destination, price, socketState, loading, onCancel, onHome }) {
  const status = order?.public_status || order?.status || "SEARCHING";
  const terminal = ["COMPLETED", "CANCELLED", "CANCELED"].includes(status);
  return (
    <section className="panel-screen ride-state">
      <AppHeader title="Активный заказ" onBack={onHome} right={!terminal ? <button className="text-danger" onClick={onCancel} disabled={loading}>Отмена</button> : null} />
      <MapView pickup={pickup} destination={destination} status={status} compact />
      <div className="summary-card">
        <b>Заказ {order?.short_id || order?.id}</b>
        <span>{status}</span>
        <small>{pickup.title} {"->"} {destination.title}</small>
        <strong><Money value={order?.price || price} /></strong>
      </div>
      <p className="inline-status">Realtime: {socketState}</p>
      {!terminal && <Button variant="secondary" className="wide" onClick={onCancel} disabled={loading}>{loading ? "Отменяем..." : "Отменить заказ"}</Button>}
      {terminal && <Button className="wide" onClick={onHome}>Новый заказ</Button>}
    </section>
  );
}

function HistoryScreen({ onBack, order }) {
  return (
    <section className="panel-screen">
      <AppHeader title="История поездок" onBack={onBack} />
      <div className="trip-list">
        {order ? <article><span><b>{order.short_id || order.id}</b><small>{order.pickup_text} {"->"} {order.dropoff_text}</small></span><strong>{order.price ? <Money value={order.price} /> : order.status}</strong><small>{order.status}</small></article> : <p className="muted-note">История появится после реальных заказов.</p>}
      </div>
    </section>
  );
}

function ProfileScreen({ onBack, setSheet, rider }) {
  return <section className="panel-screen"><AppHeader title="Профиль" onBack={onBack} /><div className="profile-card"><div className="avatar">{rider.name.slice(0, 1)}</div><span><b>{rider.name}</b><small>{rider.phone}</small></span></div><div className="list-card"><button type="button" onClick={() => setSheet("payment")}><Icon name="card" /><span>Способ оплаты</span><Icon name="back" /></button><button type="button" onClick={() => setSheet("history")}><Icon name="clock" /><span>История поездок</span><Icon name="back" /></button></div></section>;
}

function ClientMenu({ onBack, setSheet }) {
  return <section className="panel-screen"><AppHeader title="Меню пассажира" onBack={onBack} /><div className="list-card"><button type="button" onClick={() => setSheet("profile")}><Icon name="user" /><span>Профиль</span><Icon name="back" /></button><button type="button" onClick={() => setSheet("history")}><Icon name="clock" /><span>История</span><Icon name="back" /></button><button type="button" onClick={() => setSheet("payment")}><Icon name="card" /><span>Оплата</span><Icon name="back" /></button></div></section>;
}

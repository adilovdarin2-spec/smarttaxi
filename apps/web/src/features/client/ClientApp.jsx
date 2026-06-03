import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../core/icons.jsx";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import MapView from "../map/MapView.jsx";
import {
  cancelPublicOrder,
  clearToken,
  createOrder,
  getActiveRegions,
  getTariffs,
  getToken,
  loginUser,
  previewRoute,
  reverseAddress,
  searchAddresses
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";

const paymentOptions = [
  { id: "CASH", title: "Наличные", note: "Оплата после поездки" },
  { id: "KASPI", title: "Kaspi", note: "Перевод по заказу" },
  { id: "CARD", title: "Карта", note: "Выберите при посадке" }
];

const menuItems = [
  ["home", "Главная", "route"],
  ["trips", "Мои поездки", "clock"],
  ["profile", "Профиль", "user"],
  ["driver", "Стать водителем", "shield"],
  ["support", "Поддержка", "support"],
  ["faq", "FAQ", "chat"],
  ["about", "О нас", "star"],
  ["settings", "Настройки", "settings"]
];

const carImages = {
  Economy: "/cars/tariff_economy_white_sedan_flutter.png",
  Comfort: "/cars/tariff_comfort_white_sedan_flutter.png",
  Business: "/cars/tariff_business_white_premium_sedan_flutter.png",
  Эконом: "/cars/tariff_economy_white_sedan_flutter.png",
  Комфорт: "/cars/tariff_comfort_white_sedan_flutter.png",
  Бизнес: "/cars/tariff_business_white_premium_sedan_flutter.png"
};

const orderSteps = [
  ["SEARCHING", "Поиск"],
  ["ACCEPTED", "Принят"],
  ["DRIVER_ARRIVED", "Прибыл"],
  ["IN_PROGRESS", "В пути"],
  ["COMPLETED", "Готово"]
];

const errorMessages = {
  PICKUP_REGION_INACTIVE: "В этом месте сервис пока недоступен",
  DROPOFF_REGION_INACTIVE: "Точка назначения вне активного региона",
  INTERCITY_NOT_SUPPORTED: "Межгород пока не поддерживается",
  ROUTE_UNAVAILABLE: "Не удалось построить маршрут",
  ADDRESS_SEARCH_UNAVAILABLE: "Поиск адресов временно недоступен",
  TARIFF_INACTIVE: "Этот тариф временно недоступен",
  TARIFF_REGION_MISMATCH: "Тариф недоступен для выбранного региона",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят другим водителем",
  UNAUTHORIZED: "Войдите, чтобы заказать поездку",
  FORBIDDEN: "У аккаунта нет прав пассажира"
};

function formatError(error) {
  return errorMessages[error?.code] || error?.message || "Не удалось выполнить запрос";
}

function publicStatus(status) {
  const map = {
    NEW: "SEARCHING",
    DRIVER_ASSIGNED: "ACCEPTED",
    DRIVER_ARRIVED: "DRIVER_ARRIVED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELED",
    CANCELED: "CANCELED"
  };
  return map[status] || status || "SEARCHING";
}

function statusLabel(status) {
  const map = {
    NEW: "Поиск",
    SEARCHING: "Ищем водителя",
    ACCEPTED: "Водитель назначен",
    DRIVER_ASSIGNED: "Водитель назначен",
    DRIVER_ARRIVED: "Водитель подъехал",
    IN_PROGRESS: "Поездка началась",
    COMPLETED: "Поездка завершена",
    CANCELLED: "Заказ отменён",
    CANCELED: "Заказ отменён"
  };
  return map[status] || status || "Статус заказа";
}

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    short_id: order.short_id || order.shortId || order.id,
    pickup_text: order.pickup_text || order.pickupText || order.pickup || "Точка посадки",
    dropoff_text: order.dropoff_text || order.dropoffText || order.dropoff || "Точка назначения",
    payment_method: order.payment_method || order.paymentMethod,
    public_status: publicStatus(order.public_status || order.publicStatus || order.status)
  };
}

function normalizeAddress(address) {
  if (!address) return null;
  const lat = Number(address.lat);
  const lng = Number(address.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    title: address.label || address.title || "Точка на карте",
    subtitle: address.subtitle || address.city || address.region || "Адрес выбран",
    lat,
    lng
  };
}

function tariffTitle(tariff) {
  return tariff?.displayName || tariff?.display_name || tariff?.title || tariff?.name || "Тариф";
}

function regionCenter(region) {
  const lat = Number(region?.centerLat ?? region?.center_lat);
  const lng = Number(region?.centerLng ?? region?.center_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function pointInRegion(point, region) {
  const boundary = region?.boundary;
  if (!point || !Array.isArray(boundary) || boundary.length < 3) return false;
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const xi = Number(boundary[i][0]);
    const yi = Number(boundary[i][1]);
    const xj = Number(boundary[j][0]);
    const yj = Number(boundary[j][1]);
    const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || 0.000001) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceKmFromRoute(route) {
  if (!route?.distanceMeters) return null;
  return Math.max(0.1, Math.round((Number(route.distanceMeters) / 1000) * 10) / 10);
}

function durationMinFromRoute(route) {
  if (!route?.durationSeconds) return null;
  return Math.max(1, Math.ceil(Number(route.durationSeconds) / 60));
}

export default function ClientApp() {
  const [section, setSection] = useState("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addressMode, setAddressMode] = useState("");
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [payment, setPayment] = useState(paymentOptions[0]);
  const [regions, setRegions] = useState([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsError, setRegionsError] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [tariffs, setTariffs] = useState([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsError, setTariffsError] = useState("");
  const [tariff, setTariff] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [auth, setAuth] = useState({ phone: "", password: "" });
  const [rider, setRider] = useState({ name: "Пассажир", phone: "" });
  const [authenticated, setAuthenticated] = useState(Boolean(getToken()));
  const socketRef = useRef(null);

  const selectedRegion = regions.find(region => region.id === selectedRegionId) || regions[0] || null;
  const selectedRegionName = selectedRegion?.name || "";
  const mapCenter = pickup || destination || regionCenter(selectedRegion);
  const estimate = route?.estimate || null;
  const canShowTariffs = Boolean(pickup && destination);
  const canCreate = Boolean(authenticated && pickup && destination && tariff && route && estimate && !routeError);

  useEffect(() => {
    let ignore = false;
    setRegionsLoading(true);
    getActiveRegions()
      .then(data => {
        if (ignore) return;
        const list = data.regions || [];
        setRegions(list);
        setSelectedRegionId(current => current || list[0]?.id || "");
        setRegionsError("");
      })
      .catch(error => !ignore && setRegionsError(formatError(error)))
      .finally(() => !ignore && setRegionsLoading(false));
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!selectedRegionId || !canShowTariffs) {
      setTariffs([]);
      setTariff(null);
      return undefined;
    }
    let ignore = false;
    setTariffsLoading(true);
    setTariffsError("");
    getTariffs(selectedRegionId)
      .then(data => {
        if (ignore) return;
        const nextTariffs = (data.tariffs || []).filter(item => ["Economy", "Comfort", "Business", "Эконом", "Комфорт", "Бизнес"].includes(item.name) || ["Эконом", "Комфорт", "Бизнес"].includes(item.displayName || item.display_name));
        setTariffs(nextTariffs);
        setTariff(current => nextTariffs.find(item => item.id === current?.id) || nextTariffs[0] || null);
      })
      .catch(error => !ignore && setTariffsError(formatError(error)))
      .finally(() => !ignore && setTariffsLoading(false));
    return () => { ignore = true; };
  }, [selectedRegionId, canShowTariffs]);

  useEffect(() => {
    if (!pickup || !destination || !tariff) {
      setRoute(null);
      setRouteError("");
      return undefined;
    }
    let ignore = false;
    setRouteLoading(true);
    setRouteError("");
    previewRoute({
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: destination.lat,
      dropoffLng: destination.lng,
      tariffId: tariff.id
    })
      .then(data => {
        if (ignore) return;
        setRoute(data.route || null);
      })
      .catch(error => {
        if (ignore) return;
        setRoute(null);
        setRouteError(formatError(error));
      })
      .finally(() => !ignore && setRouteLoading(false));
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

  function selectSection(next) {
    if (next === "driver") {
      window.location.href = "/driver";
      return;
    }
    setSection(next);
    setDrawerOpen(false);
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const payload = await loginUser({ phone: auth.phone, password: auth.password });
      const user = payload.user || {};
      setAuthenticated(true);
      setRider({
        name: [user.name, user.surname].filter(Boolean).join(" ") || user.login || "Пассажир",
        phone: user.phone || auth.phone
      });
      setMessage("Вход выполнен");
      setSection("home");
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  async function useCurrentLocation() {
    setMessage("");
    if (!navigator.geolocation) {
      setMessage("Геолокация недоступна в этом браузере");
      return;
    }
    navigator.geolocation.getCurrentPosition(async position => {
      const point = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      const matched = regions.find(region => pointInRegion(point, region));
      if (matched) setSelectedRegionId(matched.id);
      try {
        const data = await reverseAddress(point);
        const address = normalizeAddress(data.address) || { title: "Моё местоположение", subtitle: "Точка определена", ...point };
        setPickup(address);
        setMessage(matched ? `Регион: ${matched.name}` : "Местоположение выбрано");
      } catch {
        setPickup({ title: "Моё местоположение", subtitle: "Точка определена", ...point });
        setMessage(matched ? `Регион: ${matched.name}` : "Местоположение выбрано");
      }
    }, () => {
      setMessage("Разрешите доступ к геолокации или выберите адрес вручную");
    }, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    });
  }

  function chooseAddress(address) {
    const next = normalizeAddress(address);
    if (!next) return;
    if (addressMode === "pickup") setPickup(next);
    if (addressMode === "destination") setDestination(next);
    setAddressMode("");
  }

  async function submitOrder() {
    if (loading) return;
    if (!authenticated || !getToken()) {
      setSection("profile");
      setMessage(errorMessages.UNAUTHORIZED);
      return;
    }
    if (!pickup || !destination || !tariff || !route || !estimate) return;
    const distanceKm = distanceKmFromRoute(route);
    const durationMin = durationMinFromRoute(route);
    if (!distanceKm || !durationMin) {
      setRouteError("Маршрут временно недоступен");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const data = await createOrder({
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: destination.lat,
        dropoffLng: destination.lng,
        tariffId: tariff.id,
        tariff: tariff.name || "Economy",
        distanceKm,
        durationMin,
        riderName: rider.name || "Пассажир",
        riderPhone: rider.phone || auth.phone,
        pickupText: pickup.title,
        dropoffText: destination.title,
        paymentMethod: payment.id,
        notes: ""
      });
      setOrder(normalizeOrder(data.order));
      setSection("trips");
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
      const data = await cancelPublicOrder(order.id, rider.phone || auth.phone);
      setOrder(normalizeOrder(data.order));
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    setAuthenticated(false);
    setRider({ name: "Пассажир", phone: "" });
    setAuth({ phone: "", password: "" });
    setSection("profile");
    setDrawerOpen(false);
  }

  return (
    <PhoneFrame className="taxi-pwa passenger-pwa taxi-client-shell">
      <ClientHeader
        regionName={selectedRegionName}
        onMenu={() => setDrawerOpen(true)}
        onBell={() => setSection("support")}
      />
      <ClientDrawer
        open={drawerOpen}
        active={section}
        rider={rider}
        regionName={selectedRegionName}
        authenticated={authenticated}
        onClose={() => setDrawerOpen(false)}
        onSelect={selectSection}
        onLogout={logout}
      />
      {addressMode ? (
        <AddressPicker
          mode={addressMode}
          region={selectedRegion}
          onBack={() => setAddressMode("")}
          onSelect={chooseAddress}
        />
      ) : (
        <main className="app-content passenger-content taxi-home-layout">
          {section === "home" && (
            <HomeSection
              regions={regions}
              selectedRegionId={selectedRegionId}
              setSelectedRegionId={setSelectedRegionId}
              regionsLoading={regionsLoading}
              regionsError={regionsError}
              pickup={pickup}
              destination={destination}
              route={route}
              routeLoading={routeLoading}
              routeError={routeError}
              mapCenter={mapCenter}
              onUseLocation={useCurrentLocation}
              onPickup={() => setAddressMode("pickup")}
              onDestination={() => setAddressMode("destination")}
              tariffs={tariffs}
              tariff={tariff}
              setTariff={setTariff}
              tariffsLoading={tariffsLoading}
              tariffsError={tariffsError}
              payment={payment}
              setPayment={setPayment}
              estimate={estimate}
              loading={loading}
              canCreate={canCreate}
              authenticated={authenticated}
              message={message}
              onSubmit={submitOrder}
            />
          )}
          {section === "trips" && <TripsSection order={order} pickup={pickup} destination={destination} estimate={estimate} loading={loading} onCancel={cancelOrder} onHome={() => setSection("home")} />}
          {section === "profile" && <ProfileSection authenticated={authenticated} rider={rider} setRider={setRider} auth={auth} setAuth={setAuth} message={message} loading={loading} onSubmit={submitLogin} onLogout={logout} />}
          {section === "support" && <SupportSection />}
          {section === "faq" && <FaqSection />}
          {section === "about" && <AboutSection regions={regions} />}
          {section === "settings" && <SettingsSection regionName={selectedRegionName} onLogout={logout} />}
        </main>
      )}
    </PhoneFrame>
  );
}

function ClientHeader({ regionName, onMenu, onBell }) {
  return (
    <header className="taxi-app-header premium-client-header">
      <button type="button" className="client-icon-button" onClick={onMenu} aria-label="Открыть меню">
        <Icon name="menu" size={26} />
      </button>
      <div className="taxi-brand">
        <SmartTaxiLogo />
        <div>
          <span>SmartTaxi</span>
          <small>{regionName || "Выберите регион"}</small>
        </div>
      </div>
      <button type="button" className="client-icon-button notification" onClick={onBell} aria-label="Уведомления">
        <Icon name="chat" size={22} />
        <i />
      </button>
    </header>
  );
}

function ClientDrawer({ open, active, rider, regionName, authenticated, onClose, onSelect, onLogout }) {
  return (
    <>
      <div className={`client-drawer-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`client-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <header>
          <SmartTaxiLogo large />
          <div>
            <strong>{authenticated ? rider.name || "Пассажир" : "SmartTaxi"}</strong>
            <span>{authenticated ? rider.phone || "Телефон не указан" : "Войдите для заказа"}</span>
            <small>{regionName || "Регион не выбран"}</small>
          </div>
        </header>
        <nav>
          {menuItems.map(([key, label, icon]) => (
            <button type="button" key={key} className={active === key ? "active" : ""} onClick={() => onSelect(key)}>
              <Icon name={icon} size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="drawer-logout" onClick={onLogout}>
          <Icon name="logout" size={20} />
          <span>Выйти</span>
        </button>
      </aside>
    </>
  );
}

function HomeSection(props) {
  const {
    regions,
    selectedRegionId,
    setSelectedRegionId,
    regionsLoading,
    regionsError,
    pickup,
    destination,
    route,
    routeLoading,
    routeError,
    mapCenter,
    onUseLocation,
    onPickup,
    onDestination,
    tariffs,
    tariff,
    setTariff,
    tariffsLoading,
    tariffsError,
    payment,
    setPayment,
    estimate,
    loading,
    canCreate,
    authenticated,
    message,
    onSubmit
  } = props;

  const ctaText = !authenticated
    ? "Войти и заказать"
    : !pickup || !destination
      ? "Выбрать адрес"
      : !tariff
        ? "Выбрать тариф"
        : routeLoading
          ? "Считаем стоимость..."
          : estimate
            ? "Заказать"
            : "Рассчитать";

  return (
    <section className="client-home-screen">
      <MapView
        pickup={pickup}
        destination={destination}
        route={route}
        center={mapCenter}
        status={routeLoading ? "Прокладываем маршрут" : ""}
        onUseLocation={onUseLocation}
      />
      <section className="floating-route-panel">
        <RegionStrip
          regions={regions}
          selectedRegionId={selectedRegionId}
          setSelectedRegionId={setSelectedRegionId}
          loading={regionsLoading}
          error={regionsError}
        />
        <RouteCard pickup={pickup} destination={destination} onPickup={onPickup} onDestination={onDestination} />
      </section>
      <section className="premium-order-sheet">
        <div className="sheet-grip" />
        <div className="card-topline sheet-title-row">
          <div>
            <span>Поездка</span>
            <h1>{pickup && destination ? "Выберите тариф" : "Куда едем?"}</h1>
            <p>{pickup && destination ? "Проверьте класс поездки, цену и оплату" : "Укажите точку подачи и адрес назначения"}</p>
          </div>
        </div>
        {routeError && <p className="state-note danger">{routeError}</p>}
        {message && <p className={message.includes("Регион") || message.includes("выбра") || message.includes("Вход") ? "state-note success" : "state-note danger"}>{message}</p>}
        <TariffSelector tariffs={tariffs} tariff={tariff} setTariff={setTariff} loading={tariffsLoading} error={tariffsError} enabled={Boolean(pickup && destination)} estimate={estimate} />
        <PriceBlock estimate={estimate} route={route} loading={routeLoading} error={routeError} hasRoute={Boolean(pickup && destination)} />
        {pickup && destination && <PaymentSelector payment={payment} setPayment={setPayment} />}
        <Button className="wide primary-gold client-main-cta" disabled={loading || routeLoading || (!canCreate && authenticated)} onClick={onSubmit}>
          {loading ? "Создаём заказ..." : ctaText}
          {canCreate && estimate?.estimatedPrice ? <> · <Money value={estimate.estimatedPrice} /></> : null}
        </Button>
      </section>
    </section>
  );
}

function RegionStrip({ regions, selectedRegionId, setSelectedRegionId, loading, error }) {
  if (loading) return <div className="region-strip"><span>Загружаем регионы</span></div>;
  if (error) return <div className="region-strip danger"><span>{error}</span></div>;
  if (!regions.length) return <div className="region-strip danger"><span>Нет активных регионов</span></div>;
  return (
    <div className="region-strip" aria-label="Рабочий регион">
      {regions.map(region => (
        <button type="button" key={region.id} className={region.id === selectedRegionId ? "active" : ""} onClick={() => setSelectedRegionId(region.id)}>
          {region.name}
        </button>
      ))}
    </div>
  );
}

function RouteCard({ pickup, destination, onPickup, onDestination }) {
  return (
    <section className="route-input-card premium-route-card">
      <div className="route-input-grid">
        <div className="route-connector" aria-hidden="true">
          <span className="route-dot pickup" />
          <span className="route-line" />
          <span className="route-dot dropoff" />
        </div>
        <div className="route-inputs">
          <button className="route-input route-field-pickup" type="button" onClick={onPickup}>
            <span>Откуда</span>
            <b>{pickup?.title || "Адрес подачи"}</b>
            <small>{pickup?.subtitle || "Введите улицу, дом или выберите геолокацию"}</small>
          </button>
          <button className="route-input route-field-destination" type="button" onClick={onDestination}>
            <span>Куда</span>
            <b>{destination?.title || "Куда поедем?"}</b>
            <small>{destination?.subtitle || "Начните вводить улицу, дом или объект"}</small>
          </button>
        </div>
      </div>
    </section>
  );
}

function TariffSelector({ tariffs, tariff, setTariff, loading, error, enabled, estimate }) {
  if (!enabled) {
    return <section className="tariff-stage-card"><strong>Тарифы появятся после маршрута</strong><span>Выберите адреса, и мы покажем доступные классы поездки.</span></section>;
  }
  if (loading) return <section className="tariff-stage-card"><div className="skeleton-list"><span /><span /><span /></div></section>;
  if (error) return <p className="state-note danger">{error}</p>;
  if (!tariffs.length) return <p className="state-note">В выбранном регионе нет активных тарифов</p>;
  return (
    <section className="premium-tariff-row">
      {tariffs.map(item => {
        const title = tariffTitle(item);
        const image = carImages[item.name] || carImages[title] || carImages.Economy;
        const selected = tariff?.id === item.id;
        const price = estimate?.tariff?.id === item.id || tariff?.id === item.id ? estimate?.estimatedPrice : null;
        return (
          <button type="button" key={item.id} className={selected ? "selected" : ""} onClick={() => setTariff(item)}>
            <span className="tariff-name">{title}</span>
            <img src={image} alt="" loading="lazy" />
            <b>{price ? <Money value={price} /> : "Цена после расчёта"}</b>
            <small>{item.description || "Поездка по региону"}</small>
          </button>
        );
      })}
    </section>
  );
}

function PriceBlock({ estimate, route, loading, error, hasRoute }) {
  const distance = distanceKmFromRoute(route);
  const duration = durationMinFromRoute(route);
  return (
    <section className="premium-price-block">
      <div>
        <span>Стоимость</span>
        {loading ? (
          <strong>Считаем...</strong>
        ) : estimate?.estimatedPrice ? (
          <strong><Money value={estimate.estimatedPrice} /></strong>
        ) : error ? (
          <strong>Недоступна</strong>
        ) : (
          <strong>{hasRoute ? "Выберите тариф" : "Укажите маршрут"}</strong>
        )}
      </div>
      {distance || duration ? (
        <small>{distance ? `${distance} км` : ""}{distance && duration ? " · " : ""}{duration ? `${duration} мин` : ""}</small>
      ) : (
        <small>Маршрут и цена рассчитываются автоматически</small>
      )}
    </section>
  );
}

function PaymentSelector({ payment, setPayment }) {
  return (
    <section className="premium-payment-row">
      {paymentOptions.map(item => (
        <button type="button" key={item.id} className={payment?.id === item.id ? "selected" : ""} onClick={() => setPayment(item)}>
          <Icon name={item.id === "CASH" ? "cash" : "card"} size={18} />
          <span>{item.title}</span>
        </button>
      ))}
    </section>
  );
}

function AddressPicker({ mode, region, onBack, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const label = mode === "pickup" ? "Откуда" : "Куда";

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      setError("");
      return undefined;
    }
    let ignore = false;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      searchAddresses({ q: clean, region: region?.name, limit: 10 })
        .then(data => {
          if (ignore) return;
          setResults((data.addresses || []).map(normalizeAddress).filter(Boolean));
        })
        .catch(fetchError => !ignore && setError(formatError(fetchError)))
        .finally(() => !ignore && setLoading(false));
    }, 280);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [query, region?.name]);

  return (
    <main className="app-content address-screen premium-address-screen">
      <div className="screen-intro with-back">
        <button type="button" onClick={onBack} aria-label="Назад"><Icon name="back" /></button>
        <div>
          <h1>{label}</h1>
          <p>{region?.name ? `Поиск по региону: ${region.name}` : "Сначала выберите регион"}</p>
        </div>
      </div>
      <label className="single-input address-search-input">
        Адрес
        <input value={query} onChange={event => setQuery(event.target.value)} autoFocus placeholder="Улица, дом или место" />
      </label>
      {loading && <div className="skeleton-list"><span /><span /><span /></div>}
      {error && <p className="state-note danger">{error}</p>}
      {!loading && query.trim().length >= 2 && !error && !results.length && <p className="state-note">Ничего не найдено. Уточните улицу, дом или место.</p>}
      <section className="address-list-clean premium-address-list">
        {results.map(place => (
          <button type="button" key={`${place.title}-${place.subtitle}-${place.lat}-${place.lng}`} onClick={() => onSelect(place)}>
            <Icon name={mode === "pickup" ? "pin" : "route"} size={21} />
            <span>
              <b>{place.title}</b>
              <small>{place.subtitle}</small>
            </span>
          </button>
        ))}
      </section>
    </main>
  );
}

function TripsSection({ order, pickup, destination, estimate, loading, onCancel, onHome }) {
  if (!order) {
    return (
      <section className="screen-grid">
        <section className="screen-intro"><h1>Мои поездки</h1><p>Активные поездки и история заказов.</p></section>
        <EmptyState title="Поездок пока нет" text="Выберите маршрут на главном экране, чтобы создать заказ." action="Заказать поездку" onAction={onHome} />
      </section>
    );
  }
  const status = publicStatus(order.public_status || order.status);
  const terminal = ["COMPLETED", "CANCELLED", "CANCELED"].includes(status);
  return (
    <section className="screen-grid">
      <section className="screen-intro"><h1>Текущая поездка</h1><p>{statusLabel(status)}</p></section>
      <section className="app-card active-order-clean premium-active-order">
        <div className="card-topline"><h2>Заказ {order.short_id || order.id}</h2><StatusBadge label={statusLabel(status)} tone={terminal ? "muted" : "gold"} /></div>
        <StatusStepper status={status} />
        <CompactRoute pickup={order.pickup_text || pickup?.title} dropoff={order.dropoff_text || destination?.title} />
        <div className="price-value compact"><strong><Money value={order.price || estimate?.estimatedPrice} /></strong><span>Стоимость поездки</span></div>
        {!["ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"].includes(status) && <p className="state-note">Данные водителя появятся после принятия заказа</p>}
        {!terminal && <Button variant="danger" className="wide" onClick={onCancel} disabled={loading}>{loading ? "Отменяем" : "Отменить заказ"}</Button>}
      </section>
    </section>
  );
}

function ProfileSection({ authenticated, rider, setRider, auth, setAuth, message, loading, onSubmit, onLogout }) {
  return (
    <section className="screen-grid profile-screen">
      <section className="screen-intro"><h1>Профиль</h1><p>{authenticated ? "Аккаунт пассажира" : "Войдите, чтобы заказать поездку"}</p></section>
      <section className="app-card account-card premium-profile-card">
        <div className="profile-avatar-row">
          <SmartTaxiLogo />
          <div>
            <h2>{authenticated ? rider.name || "Пассажир" : "Вход"}</h2>
            <span>{authenticated ? rider.phone || "Телефон не указан" : "Телефон и пароль"}</span>
          </div>
        </div>
        {!authenticated ? (
          <form className="form-grid premium-login-form" onSubmit={onSubmit}>
            <label>Телефон<input value={auth.phone} onChange={event => setAuth({ ...auth, phone: event.target.value })} placeholder="+7" inputMode="tel" /></label>
            <label>Пароль<input value={auth.password} onChange={event => setAuth({ ...auth, password: event.target.value })} placeholder="Пароль" type="password" /></label>
            {message && <p className={message.includes("Вход") ? "state-note success" : "state-note danger"}>{message}</p>}
            <Button className="wide primary-gold" type="submit" disabled={loading}>{loading ? "Входим..." : "Войти"}</Button>
          </form>
        ) : (
          <div className="profile-actions-grid">
            <label>Имя<input value={rider.name} onChange={event => setRider({ ...rider, name: event.target.value })} /></label>
            <label>Телефон для заказа<input value={rider.phone} onChange={event => setRider({ ...rider, phone: event.target.value })} inputMode="tel" /></label>
            <button type="button"><Icon name="star" /> Избранные адреса <span>Нет данных</span></button>
            <button type="button"><Icon name="card" /> Способы оплаты <span>Выбираются при заказе</span></button>
            <button type="button" className="danger" onClick={onLogout}><Icon name="logout" /> Выйти</button>
          </div>
        )}
      </section>
    </section>
  );
}

function SupportSection() {
  const [topic, setTopic] = useState("Проблема с поездкой");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const topics = ["Проблема с поездкой", "Водитель не приехал", "Забыл вещь", "Оплата", "Другое"];
  return (
    <section className="screen-grid">
      <section className="screen-intro"><h1>Поддержка</h1><p>Опишите ситуацию, оператор увидит тему и текст обращения.</p></section>
      <section className="app-card premium-support-card">
        <div className="support-topic-row">
          {topics.map(item => <button type="button" key={item} className={topic === item ? "selected" : ""} onClick={() => setTopic(item)}>{item}</button>)}
        </div>
        <label className="admin-textarea-field support-textarea">
          <span>Сообщение</span>
          <textarea value={text} onChange={event => { setText(event.target.value); setSent(false); }} placeholder="Напишите сообщение..." rows={5} />
        </label>
        {sent && <p className="state-note success">Сообщение подготовлено. Проверьте текст перед отправкой оператору.</p>}
        <Button className="wide primary-gold" disabled={!text.trim()} onClick={() => setSent(true)}>Отправить</Button>
      </section>
    </section>
  );
}

function SettingsSection({ regionName, onLogout }) {
  return (
    <section className="screen-grid">
      <section className="screen-intro"><h1>Настройки</h1><p>Параметры аккаунта и приложения.</p></section>
      <section className="app-card settings-list-premium">
        <SettingsRow icon="user" title="Аккаунт" text="Имя и телефон в профиле" />
        <SettingsRow icon="pin" title="Город и регион" text={regionName || "Регион не выбран"} />
        <SettingsRow icon="support" title="Уведомления" text="Недоступно" muted />
        <SettingsRow icon="shield" title="Безопасность" text="Пароль аккаунта" />
        <SettingsRow icon="settings" title="Тема" text="Светлая золотая" />
        <button type="button" className="settings-danger" onClick={onLogout}><Icon name="logout" /> Выйти</button>
      </section>
    </section>
  );
}

function SettingsRow({ icon, title, text, muted = false }) {
  return <div className={`settings-row-premium ${muted ? "muted" : ""}`}><Icon name={icon} /><span><b>{title}</b><small>{text}</small></span></div>;
}

function FaqSection() {
  const items = [
    ["Как заказать поездку?", "Выберите точку подачи, адрес назначения, тариф и нажмите кнопку заказа."],
    ["Почему нужно выбрать регион?", "SmartTaxi работает по активным регионам. Тарифы и доступ водителей зависят от выбранной зоны."],
    ["Как считается цена?", "Система строит маршрут, учитывает длительность и применяет тариф выбранного региона."],
    ["Когда появится водитель?", "Информация о водителе появится только после принятия заказа."],
    ["Как отменить заказ?", "Откройте текущую поездку и нажмите кнопку отмены, если статус позволяет отмену."]
  ];
  return (
    <section className="screen-grid">
      <section className="screen-intro"><h1>FAQ</h1><p>Короткие ответы по поездкам.</p></section>
      <section className="faq-list-premium">
        {items.map(([title, text]) => <details key={title} className="app-card"><summary>{title}</summary><p>{text}</p></details>)}
      </section>
    </section>
  );
}

function AboutSection({ regions }) {
  return (
    <section className="screen-grid">
      <section className="screen-intro"><h1>О SmartTaxi</h1><p>Региональный сервис поездок для клиентов и водителей.</p></section>
      <section className="app-card about-card-premium">
        <SmartTaxiLogo large />
        <h2>SmartTaxi</h2>
        <p>Сервис работает в активных регионах, где настроены тарифы и доступ водителей. Межгород не входит в текущую модель заказов.</p>
        <div className="region-chip-list">{regions.map(region => <span key={region.id}>{region.name}</span>)}</div>
      </section>
    </section>
  );
}

function StatusStepper({ status }) {
  const currentIndex = Math.max(0, orderSteps.findIndex(([key]) => key === status));
  return <ol className="status-stepper-clean">{orderSteps.map(([key, label], index) => <li key={key} className={index <= currentIndex ? "done" : ""}><span /><b>{label}</b></li>)}</ol>;
}

function CompactRoute({ pickup, dropoff }) {
  return <div className="compact-route-clean"><div className="route-connector mini" aria-hidden="true"><span className="route-dot pickup" /><span className="route-line" /><span className="route-dot dropoff" /></div><div><strong>{pickup}</strong><span>{dropoff}</span></div></div>;
}

function StatusBadge({ label, tone = "gold" }) {
  return <span className={`status-badge-clean ${tone}`}>{label}</span>;
}

function EmptyState({ title, text, action, onAction }) {
  return <section className="app-card empty-state-clean"><span className="empty-mark"><span /></span><b>{title}</b><p>{text}</p>{action && <Button className="wide primary-gold" onClick={onAction}>{action}</Button>}</section>;
}

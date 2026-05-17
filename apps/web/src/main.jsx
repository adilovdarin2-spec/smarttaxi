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
  { name: "Economy", label: "Дешевле", note: "Быстрая городская поездка", base_price: 700, price_per_km: 120, price_per_minute: 25, min_price: 1200 },
  { name: "Comfort", label: "Комфортнее", note: "Чище салон и выше класс", base_price: 900, price_per_km: 150, price_per_minute: 30, min_price: 1800 },
  { name: "Business", label: "Премиум", note: "Для важных поездок", base_price: 1300, price_per_km: 220, price_per_minute: 45, min_price: 2500 },
  { name: "Delivery", label: "Доставка", note: "Посылки и документы", base_price: 800, price_per_km: 130, price_per_minute: 25, min_price: 1500 }
];
const PAYMENT_OPTIONS = [
  ["CASH", "Наличные", "Водителю"],
  ["KASPI", "Kaspi", "Перевод"],
  ["CARD", "Карта", "Онлайн"],
  ["CASHBACK", "Cashback", "Бонусы"]
];
const MAP_CENTER = { lat: 43.238949, lng: 76.889709 };
const GOLD_ROUTE = "#F5C542";
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b0b0b" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8d8d8d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#050505" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#262626" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1b1b1b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#101010" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#252015" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#050505" }] }
];

let googleMapsPromise;

function getGoogleMapsBrowserKey() {
  return window.__SMARTTAXI_CONFIG__?.googleMapsBrowserKey || import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || "";
}

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

function loadGoogleMaps() {
  const googleMapsBrowserKey = getGoogleMapsBrowserKey();
  if (!googleMapsBrowserKey) return Promise.reject(new Error("GOOGLE_MAPS_BROWSER_KEY_MISSING"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-smarttaxi-google-maps]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.google.maps), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsBrowserKey)}&libraries=places&language=ru&region=KZ`;
      script.async = true;
      script.defer = true;
      script.dataset.smarttaxiGoogleMaps = "true";
      script.onload = () => resolve(window.google.maps);
      script.onerror = () => reject(new Error("GOOGLE_MAPS_LOAD_FAILED"));
      document.head.appendChild(script);
    });
  }
  return googleMapsPromise;
}

function coordsFromForm(form, prefix) {
  const lat = fieldNumber(form[`${prefix}Lat`]);
  const lng = fieldNumber(form[`${prefix}Lng`]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function haversineDistanceKm(a, b) {
  const toRad = value => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function calculateTariffPrice(tariff, distanceKm, durationMin) {
  const raw = Number(tariff.base_price || 0) + Number(tariff.price_per_km || 0) * distanceKm + Number(tariff.price_per_minute || 0) * durationMin;
  return Math.max(Number(tariff.min_price || 0), Math.round(raw / 10) * 10);
}

function markerIcon() {
  const maps = window.google.maps;
  return {
    path: maps.SymbolPath.CIRCLE,
    fillColor: GOLD_ROUTE,
    fillOpacity: 1,
    strokeColor: "#D4AF37",
    strokeWeight: 2,
    scale: 15,
    labelOrigin: new maps.Point(0, 0)
  };
}

async function reverseGeocode(lat, lng) {
  if (!getGoogleMapsBrowserKey()) return "";
  const maps = await loadGoogleMaps();
  return new Promise(resolve => {
    const geocoder = new maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]?.formatted_address) resolve(results[0].formatted_address);
      else resolve("");
    });
  });
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

function SmartTaxiLogo({ compact = false }) {
  return (
    <span className={`smart-logo ${compact ? "compact" : ""}`} aria-label="SmartTaxi">
      <svg viewBox="0 0 64 64" role="img">
        <defs>
          <linearGradient id="smartTaxiGold" x1="14" y1="4" x2="52" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F5C542" />
            <stop offset="1" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        <path d="M32 4 52 12v16c0 15-8.5 25.2-20 31C20.5 53.2 12 43 12 28V12L32 4Z" fill="url(#smartTaxiGold)" />
        <path d="M41.5 19.5c-4.6-3.7-13.8-3.5-15.4 1.7-2.2 7.1 16.8 6 14.1 14.1-1.9 5.8-12.1 6-17.7 1.4" fill="none" stroke="#070A0A" strokeWidth="6" strokeLinecap="round" />
        <path d="M27 20.5c4.4 2.6 11.4 5.2 13.1 9.9" fill="none" stroke="#F8E08A" strokeWidth="2" strokeLinecap="round" opacity=".9" />
        <circle cx="24" cy="38" r="3" fill="#070A0A" />
      </svg>
    </span>
  );
}

function BrandBlock({ small = false }) {
  return (
    <span className={`brand-block ${small ? "small" : ""}`}>
      <SmartTaxiLogo compact={small} />
      <span>
        <b>SmartTaxi</b>
        <small>Ваш комфорт. Ваш город.</small>
      </span>
    </span>
  );
}

function AppHeader({ subtitle = "Быстрая поездка по городу", right }) {
  return (
    <header className="app-header">
      <a className="brand" href="/client">
        <BrandBlock small />
      </a>
      <p>{subtitle}</p>
      {right ? <div className="header-right">{right}</div> : null}
    </header>
  );
}

function ClientTopBar({ onMenu, onAbout }) {
  return (
    <header className="client-topbar">
      <button className="icon-btn" type="button" onClick={onMenu} aria-label="Меню">☰</button>
      <a href="/client" className="client-brand">
        <BrandBlock small />
        <em>Atakent</em>
      </a>
      <button className="icon-btn gift" type="button" onClick={onAbout} aria-label="О нас">🎁</button>
    </header>
  );
}

function AppMenu({ open, onClose, onAbout }) {
  if (!open) return null;
  const items = ["Главная", "Поездки", "Сообщения", "Профиль", "О нас", "Поддержка 24/7"];
  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="app-drawer" role="dialog" aria-label="Меню SmartTaxi" onClick={event => event.stopPropagation()}>
        <div className="drawer-head">
          <BrandBlock />
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="drawer-tagline">Городское такси для Атакента: быстро, безопасно, по понятной цене.</div>
        <nav className="drawer-nav">
          {items.map(item => (
            <button key={item} type="button" onClick={() => item === "О нас" ? onAbout() : onClose()}>
              <span>{item}</span>
              <b>›</b>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}

function AboutPanel({ open, onClose }) {
  if (!open) return null;
  const reasons = [
    "чтобы в городе было своё удобное такси",
    "чтобы цена была понятной до заказа",
    "чтобы водитель и клиент видели маршрут",
    "чтобы сервис можно было развивать под нужды Атакента",
    "чтобы поездки стали безопаснее и комфортнее"
  ];
  const principles = ["Безопасность", "Прозрачная цена", "Комфорт", "Поддержка 24/7", "Свой городской сервис"];
  return (
    <div className="drawer-backdrop about-backdrop" role="presentation" onClick={onClose}>
      <section className="about-panel" role="dialog" aria-label="О нас" onClick={event => event.stopPropagation()}>
        <div className="about-hero">
          <SmartTaxiLogo />
          <div>
            <small>О нас</small>
            <h2>SmartTaxi — такси для Атакента</h2>
            <p>Ваш комфорт. Ваш город.</p>
          </div>
        </div>
        <p className="about-lead">SmartTaxi создан, чтобы сделать поездки по Атакенту понятнее, безопаснее и удобнее. Мы хотим дать людям быстрый заказ машины, прозрачную цену, проверенных водителей и удобную оплату наличными или Kaspi.</p>
        <div className="about-grid">
          <article>
            <h3>Зачем создали</h3>
            {reasons.map(item => <span key={item}>✓ {item}</span>)}
          </article>
          <article>
            <h3>Кто создал</h3>
            <p><b>Дарын</b> — технический руководитель / CTO. Отвечает за приложение, backend, VPS, Docker, SSL, базу данных, тестирование и запуск.</p>
            <p><b>Frontend-разработчик</b> — отвечает за сайт, визуальные страницы, интерфейс и адаптивную вёрстку.</p>
            <p><b>Ереке</b> — отвечает за финансы, продвижение, переговоры, запуск и развитие сервиса.</p>
          </article>
        </div>
        <div className="principles">
          {principles.map(item => <span key={item}>{item}</span>)}
        </div>
        <div className="about-final">SmartTaxi работает в пределах города и развивается поэтапно. Сначала — стабильный запуск, потом — больше функций для клиентов и водителей.</div>
        <button className="primary-cta" type="button" onClick={onClose}>Закрыть</button>
      </section>
    </div>
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
  const hasGoogleMapsKey = Boolean(getGoogleMapsBrowserKey());
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
          <span>{hasGoogleMapsKey ? "Google Maps key подключен" : "Карта работает в fallback режиме"}</span>
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

function RoutePlanner({ form, setForm, estimate, locating, onLocate, locationOk }) {
  const mapNode = useRef(null);
  const pickupInput = useRef(null);
  const dropoffInput = useRef(null);
  const mapState = useRef({});
  const [mapsReady, setMapsReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const hasGoogleMapsKey = Boolean(getGoogleMapsBrowserKey());

  useEffect(() => {
    if (!getGoogleMapsBrowserKey()) return undefined;
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (!cancelled) {
          setMapsReady(true);
          setMapFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setMapFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapsReady || !pickupInput.current || !dropoffInput.current) return undefined;
    const maps = window.google.maps;
    const attach = (input, prefix) => {
      const autocomplete = new maps.places.Autocomplete(input, {
        fields: ["formatted_address", "geometry", "name"],
        componentRestrictions: { country: "kz" }
      });
      return autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const location = place.geometry?.location;
        const text = place.formatted_address || place.name || input.value;
        setForm(current => ({
          ...current,
          [`${prefix}Text`]: text,
          [`${prefix}Lat`]: location ? location.lat().toFixed(6) : current[`${prefix}Lat`],
          [`${prefix}Lng`]: location ? location.lng().toFixed(6) : current[`${prefix}Lng`]
        }));
      });
    };
    const pickupListener = attach(pickupInput.current, "pickup");
    const dropoffListener = attach(dropoffInput.current, "dropoff");
    return () => {
      pickupListener.remove();
      dropoffListener.remove();
    };
  }, [mapsReady, setForm]);

  useEffect(() => {
    if (!mapsReady || !mapNode.current) return;
    const maps = window.google.maps;
    if (!mapState.current.map) {
      const map = new maps.Map(mapNode.current, {
        center: MAP_CENTER,
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        styles: DARK_MAP_STYLE,
        gestureHandling: "greedy"
      });
      mapState.current = {
        map,
        pickupMarker: new maps.Marker({ map, label: { text: "A", color: "#050505", fontWeight: "900" }, icon: markerIcon() }),
        dropoffMarker: new maps.Marker({ map, label: { text: "B", color: "#050505", fontWeight: "900" }, icon: markerIcon() }),
        polyline: new maps.Polyline({ map, strokeColor: GOLD_ROUTE, strokeOpacity: .95, strokeWeight: 5 }),
        directionsService: new maps.DirectionsService(),
        directionsRenderer: new maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          preserveViewport: false,
          polylineOptions: { strokeColor: GOLD_ROUTE, strokeOpacity: .96, strokeWeight: 5 }
        })
      };
    }

    const state = mapState.current;
    const pickup = coordsFromForm(form, "pickup");
    const dropoff = coordsFromForm(form, "dropoff");
    state.pickupMarker.setVisible(Boolean(pickup));
    state.dropoffMarker.setVisible(Boolean(dropoff));
    if (pickup) state.pickupMarker.setPosition(pickup);
    if (dropoff) state.dropoffMarker.setPosition(dropoff);
    state.directionsRenderer.setMap(null);
    state.directionsRenderer.setMap(state.map);
    state.polyline.setPath([]);

    if (pickup && dropoff) {
      state.directionsService.route({ origin: pickup, destination: dropoff, travelMode: maps.TravelMode.DRIVING }, (result, status) => {
        if (status === "OK" && result) {
          state.directionsRenderer.setDirections(result);
          return;
        }
        state.polyline.setPath([pickup, dropoff]);
        const bounds = new maps.LatLngBounds();
        bounds.extend(pickup);
        bounds.extend(dropoff);
        state.map.fitBounds(bounds, 60);
      });
    } else if (pickup || dropoff) {
      state.map.panTo(pickup || dropoff);
      state.map.setZoom(14);
    }
  }, [mapsReady, form.pickupLat, form.pickupLng, form.dropoffLat, form.dropoffLng]);

  const hasRealMap = Boolean(hasGoogleMapsKey && mapsReady && !mapFailed);
  return (
    <section className="route-preview route-planner">
      <div className="route-bg">
        {hasRealMap ? <div ref={mapNode} className="google-map" /> : (
          <div className="fallback-map">
            <div className="route-line" />
            <div className="pin pin-a"><b>A</b><span>Откуда</span></div>
            <div className="pin pin-b"><b>B</b><span>Куда</span></div>
            <div className="map-grid" />
            <div className="fallback-label">Карта в fallback режиме</div>
          </div>
        )}
        <div className="map-badges">
          <span>Atakent</span>
          <b>{estimate ? `${estimate.durationMin} мин` : "маршрут"}</b>
        </div>
      </div>
      <div className="route-overlay">
        <div>
          <strong>{estimate ? `${estimate.distanceKm} км · ${estimate.durationMin} мин · ${money(estimate.price)}` : "Маршрут рассчитывается"}</strong>
          <span>{hasRealMap ? "Google Maps · тёмная карта" : "Карта в fallback режиме"}</span>
        </div>
        <button className="ghost-btn" type="button" onClick={onLocate} disabled={locating}>
          {locating ? "Определяем..." : locationOk ? "Местоположение определено" : "Определить моё местоположение"}
        </button>
      </div>
      <div className="route-card">
        <label>
          <span className="point point-a">A</span>
          <input ref={pickupInput} value={form.pickupText} onChange={e => setForm({ ...form, pickupText: e.target.value })} placeholder="Откуда" autoComplete="off" />
        </label>
        <label>
          <span className="point point-b">B</span>
          <input ref={dropoffInput} value={form.dropoffText} onChange={e => setForm({ ...form, dropoffText: e.target.value })} placeholder="Куда" autoComplete="off" />
        </label>
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
      <div className="trip-actions">
        <button type="button">SOS</button>
        <button type="button">Поделиться поездкой</button>
        <button type="button">Доверенные контакты</button>
      </div>
      {canCancel && <button className="danger-btn" onClick={onCancel} disabled={cancelling}>{cancelling ? "Отменяем..." : "Отменить заказ"}</button>}
    </section>
  );
}

function MiniRoutePreview({ order }) {
  return (
    <div className="mini-route-map">
      <div className="map-grid" />
      <div className="route-line mini" />
      <div className="pin pin-a"><b>A</b></div>
      <div className="pin pin-b"><b>B</b></div>
      <span>{Number(order.distance_km || 0).toFixed(1)} км · {order.duration_min || 0} мин</span>
    </div>
  );
}

function BottomNav({ type }) {
  const items = type === "owner"
    ? [["⌂", "Главная"], ["▣", "Заказы"], ["●", "Водители"], ["₸", "Финансы"]]
    : [["⌂", "Главная"], ["▣", "Заказы"], ["₸", "Статистика"], ["●", "Профиль"]];
  return (
    <nav className="bottom-nav">
      {items.map(([icon, label], index) => <span className={index === 0 ? "active" : ""} key={label}><b>{icon}</b>{label}</span>)}
    </nav>
  );
}

function QuickActions({ onSelect }) {
  const actions = [
    ["Дом", "🏠", { dropoffText: "Дом, Atakent" }],
    ["Работа", "💼", { dropoffText: "Работа, Atakent" }],
    ["Аэропорт", "✈", { dropoffText: "Аэропорт Алматы" }],
    ["Доставка", "📦", { tariff: "Delivery" }],
    ["По времени", "⏱", { notes: "Нужна поездка ко времени" }],
    ["Ещё", "•••", {}]
  ];
  return (
    <section className="quick-actions" aria-label="Быстрые действия">
      {actions.map(([label, icon, patch]) => (
        <button type="button" key={label} onClick={() => onSelect(patch)}>
          <b>{icon}</b>
          <span>{label}</span>
        </button>
      ))}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const estimateTimer = useRef(null);

  const selectedTariff = useMemo(() => {
    return (tariffs.length ? tariffs : DEFAULT_TARIFFS).find(t => t.name === form.tariff) || DEFAULT_TARIFFS[0];
  }, [tariffs, form.tariff]);
  const disabled = !form.riderPhone.trim() || !form.pickupText.trim() || !form.dropoffText.trim() || loading;
  const approxPrice = estimate && selectedTariff?.base_price
    ? estimate.tariff === form.tariff && estimate.price
      ? estimate.price
      : Math.max(Number(selectedTariff.min_price || 0), Math.round((Number(selectedTariff.base_price || 0) + Number(selectedTariff.price_per_km || 0) * estimate.distanceKm + Number(selectedTariff.price_per_minute || 0) * estimate.durationMin) / 10) * 10)
    : order?.price || 0;

  useEffect(() => {
    api("/api/tariffs").then(data => setTariffs(data.tariffs || [])).catch(err => setError(normalizeError(err)));
  }, []);

  useEffect(() => {
    window.clearTimeout(estimateTimer.current);
    estimateTimer.current = window.setTimeout(() => estimateRoute(form).catch(() => {}), 450);
    return () => window.clearTimeout(estimateTimer.current);
  }, [form.pickupText, form.dropoffText, form.pickupLat, form.pickupLng, form.dropoffLat, form.dropoffLng, form.tariff]);

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

  function fallbackEstimate(base = form) {
    const pickup = coordsFromForm(base, "pickup");
    const dropoff = coordsFromForm(base, "dropoff");
    const distanceKm = pickup && dropoff
      ? Math.round(Math.max(0.5, Math.min(80, haversineDistanceKm(pickup, dropoff) * 1.25)) * 10) / 10
      : Math.round((2.4 + ((base.pickupText || "").length + (base.dropoffText || "").length) % 7 * 0.7) * 10) / 10;
    const durationMin = Math.max(5, Math.round(distanceKm / 0.42));
    const tariff = (tariffs.length ? tariffs : DEFAULT_TARIFFS).find(item => item.name.toLowerCase() === String(base.tariff || "Economy").toLowerCase()) || DEFAULT_TARIFFS[0];
    return {
      distanceKm,
      durationMin,
      tariff: tariff.name,
      price: calculateTariffPrice(tariff, distanceKm, durationMin),
      source: "fallback"
    };
  }

  async function estimateRoute(base = form) {
    let next;
    try {
      const data = await api("/api/maps/estimate", { method: "POST", body: JSON.stringify(orderPayload(base)) });
      next = data.estimate || data;
    } catch {
      next = fallbackEstimate(base);
    }
    if (!next.price) {
      const fallback = fallbackEstimate(base);
      next = { ...fallback, ...next, price: fallback.price, tariff: next.tariff || fallback.tariff, source: next.source || next.provider || fallback.source };
    }
    setEstimate(next);
    return next;
  }

  async function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("Геолокация недоступна. Введите адрес вручную.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const address = await reverseGeocode(lat, lng).catch(() => "");
        const next = {
          ...form,
          pickupText: address || "Моё местоположение",
          pickupLat: lat.toFixed(6),
          pickupLng: lng.toFixed(6)
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
      <ClientTopBar onMenu={() => setMenuOpen(true)} onAbout={() => setAboutOpen(true)} />
      <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} onAbout={() => { setMenuOpen(false); setAboutOpen(true); }} />
      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <Alert message={error} />
      {order && !FINISHED_STATUSES.includes(order.status) ? <ClientOrderCard order={order} onCancel={cancelOrder} cancelling={loading} /> : null}
      <RoutePlanner form={form} setForm={setForm} estimate={estimate} locating={locating} onLocate={locate} locationOk={locationOk} />

      <form className="order-form" onSubmit={createOrder}>
        <QuickActions onSelect={patch => setForm(current => ({ ...current, ...patch }))} />
        <section className="address-card legacy-address">
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
                  <i className="tariff-icon">{tariff.name === "Delivery" ? "📦" : tariff.name === "Business" ? "◆" : "🚕"}</i>
                  <b>{tariff.name}</b>
                  <span>{meta.label || "Тариф"}</span>
                  <strong>{price ? money(price) : "по расчёту"}</strong>
                  {active && <em>✓</em>}
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
      <MiniRoutePreview order={order} />
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
      <BottomNav type="driver" />
    </main>
  );
}

function FinancePanel({ stats }) {
  const revenue = Number(stats?.today?.revenue_total || 0);
  const commission = Number(stats?.today?.commission_total || 0);
  const cashback = Number(stats?.today?.cashback_total || 0);
  const debts = Number(stats?.drivers?.driver_debts_total || 0);
  const max = Math.max(revenue, commission, cashback, debts, 1);
  const rows = [
    ["Выручка", revenue],
    ["Комиссия", commission],
    ["Кэшбэк", cashback],
    ["Долги", debts]
  ];
  return (
    <section className="owner-panel finance-panel">
      <div className="card-head"><h2>Финансы</h2><span>Сегодня</span></div>
      {rows.map(([label, value]) => (
        <div className="finance-line" key={label}>
          <div><b>{label}</b><span>{money(value)}</span></div>
          <i style={{ width: `${Math.max(8, Math.round(value / max * 100))}%` }} />
        </div>
      ))}
    </section>
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

      <FinancePanel stats={stats} />

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
      <BottomNav type="owner" />
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

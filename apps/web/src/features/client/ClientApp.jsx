import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../core/icons.jsx";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
const LazyMapView = React.lazy(() => import("../map/MapView.jsx"));

function MapView(props) {
  return (
    <React.Suspense fallback={<div className="map-deferred-fallback" role="status">Подготавливаем карту…</div>}>
      <LazyMapView {...props} />
    </React.Suspense>
  );
}
import { extraClientAddressCatalog, extraClientRegionPresets } from "./clientAddressBook.js";
import {
  addFavoriteAddress,
  addClientWalletCard,
  cancelPublicOrder,
  checkAuthPhone,
  clearToken,
  confirmPasswordReset,
  createOrder,
  createRecurringBooking,
  createSupportMessage,
  deleteFavoriteAddress,
  deleteClientWalletCard,
  estimateTariff,
  getActiveRegions,
  getIntercityRoutes,
  getServiceSettings,
  getClientActiveOrder,
  getClientTripHistory,
  getClientWallet,
  getClientWalletCards,
  getOrderPaymentStatus,
  getCurrentUser,
  getDriverPreferences,
  getFavoriteAddresses,
  getNotifications,
  getRecurringBookings,
  getSupportHistory,
  getOrderStatusHistory,
  getReferralSummary,
  getTariffs,
  getToken,
  loginUser,
  markNotificationRead,
  markAllNotificationsRead,
  removeDriverPreference,
  rateOrder,
  registerUser,
  requestPasswordReset,
  respondPriceOffer,
  reverseAddress,
  searchAddresses,
  sendAuthSms,
  sendQuickMessage,
  setDriverPreference,
  setDefaultClientWalletCard,
  initiateOrderPayment,
  submitDriverApplication,
  createClientWalletTopup,
  updateRecurringBookingStatus,
  uploadDriverApplicationDocument,
  validatePromoCode,
  verifyAuthSms
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";
import { sanitizeAddressText } from "../../lib/text.js";
import { clientDriverMapPoint, mergeClientDriverLocation, recoverClientActiveOrder } from "./clientTripLifecycle.js";
import { useLiveDriverRoute } from "./useLiveDriverRoute.js";
import { sessionGuard } from "../../lib/sessionGuard.js";

const cardPaymentsEnabled = import.meta.env.VITE_CARD_PAYMENTS_ENABLED === "true";

const paymentOptions = [
  { id: "CASH", title: "Наличные", note: "Оплата после поездки" },
  ...(cardPaymentsEnabled ? [{ id: "CARD", title: "Картой", note: "Безопасная оплата после поездки" }] : []),
  { id: "CASHBACK", title: "Бонусами", note: "Вся сумма спишется с баланса кешбэка" }
];

const drawerMenuGroups = [
  {
    title: "Поездки",
    items: [
    { key: "home", label: "Главная", icon: "home", hint: "Выбор адреса" },
    { key: "regions", label: "Регион обслуживания", icon: "pin", hint: "Города и районы" },
    { key: "trips", label: "История поездок", icon: "history", hint: "Статусы и детали" },
    { key: "favorites", label: "Избранные адреса", icon: "heart", hint: "Дом, работа, места" },
    { key: "recurring", label: "Регулярные поездки", icon: "clock", hint: "Повторяющиеся маршруты" },
    { key: "drivers", label: "Мои водители", icon: "user", hint: "Избранные и заблокированные" }
    ]
  },
  {
    title: "Сервисы",
    items: [
    { key: "notifications", label: "Уведомления", icon: "bell", hint: "Статусы и сообщения" },
    { key: "wallet", label: "Кошелёк", icon: "card", hint: "Кешбэк и карты" },
    { key: "promo", label: "Промокоды", icon: "ticket", hint: "Проверка кода" },
    { key: "referral", label: "Пригласить друга", icon: "gift", hint: "Реферальная программа" },
    { key: "support", label: "Поддержка", icon: "support", hint: "Помощь по поездке" },
    { key: "driverApplication", label: "Стать водителем", icon: "trips", hint: "Заявка и документы" },
    { key: "faq", label: "FAQ", icon: "chat", hint: "Вопросы и ответы" },
    { key: "settings", label: "Настройки", icon: "settings", hint: "Аккаунт и приложение" },
    { key: "about", label: "О приложении", icon: "info", hint: "SmartTaxi" }
    ]
  },
  {
    title: "Документы",
    items: [
    { key: "legalTerms", label: "Пользовательское соглашение", icon: "shield", hint: "Правила сервиса" },
    { key: "legalPrivacy", label: "Политика конфиденциальности", icon: "lock", hint: "Данные и privacy" },
    { key: "legalInfo", label: "Юридическая информация", icon: "document", hint: "Реквизиты и оплата" },
    { key: "legalPayment", label: "Оплата и кешбэк", icon: "cash", hint: "Способы оплаты" },
    { key: "legalCancellation", label: "Отмена поездки", icon: "close", hint: "Правила отмены" },
    { key: "legalSafety", label: "Безопасность", icon: "shield", hint: "Помощь в поездке" }
    ]
  }
];

const PRICE_STEP_KZT = 100;

function offeredPriceBoundsKzt(estimatedPrice) {
  const estimate = Math.max(0, Math.round(Number(estimatedPrice) || 0));
  const minAllowed = Math.max(200, Math.ceil((estimate * 0.7) / 50) * 50);
  const maxAllowed = Math.max(
    minAllowed,
    Math.min(1_000_000, Math.floor((estimate * 1.5) / 50) * 50)
  );
  return { minAllowed, maxAllowed };
}

const carImages = {
  Economy: "/ui/fixed-price-tariff/car_economy_3d_v2.png",
  Comfort: "/ui/fixed-price-tariff/svg/car_comfort_white.svg",
  Business: "/ui/fixed-price-tariff/svg/car_comfort_white.svg",
  Delivery: "/ui/fixed-price-tariff/car_delivery_3d_v2.png"
};

const baseUi = "/ui/blue-white";
const authWelcomeUi = "/ui/auth-clean-photo";
const addressSelectionUi = "/ui/address-selection/icons";
const fixedTariffUi = "/ui/fixed-price-tariff/svg";
const searchDriverUi = "/ui/search-driver";
const driverFoundUi = "/ui/driver-found";
const tripDetailsUi = "/ui/trip-details";
const baseIcons = {
  logo: `${baseUi}/svg/smarttaxi_logo_text.svg`,
  authLogo: `${baseUi}/svg/smarttaxi_auth_logo.svg`,
  sMark: `${authWelcomeUi}/svg/brand/smarttaxi_s_mark.svg`,
  pin: `${baseUi}/svg/target_location.svg`,
  mark: `${baseUi}/svg/logo_mark_pin_car.svg`,
  menu: `${baseUi}/svg/menu.svg`,
  bell: `${baseUi}/svg/bell.svg`,
  pickup: `${baseUi}/svg/pickup_marker.svg`,
  destination: `${baseUi}/svg/destination_marker.svg`,
  target: `${baseUi}/svg/target_location.svg`,
  home: `${baseUi}/svg/home.svg`,
  work: `${baseUi}/svg/briefcase_work.svg`,
  favorite: `${baseUi}/svg/favorite_star.svg`,
  history: `${baseUi}/svg/history_clock.svg`,
  clock: `${baseUi}/svg/history_clock.svg`,
  trips: `${baseUi}/svg/trips_car.svg`,
  profile: `${baseUi}/svg/profile.svg`,
  user: `${baseUi}/svg/profile.svg`,
  card: `${baseUi}/svg/payment_card.svg`,
  check: `${baseUi}/svg/check_circle.svg`,
  info: `${baseUi}/svg/info_circle.svg`,
  edit: `${baseUi}/svg/edit_pencil.svg`,
  back: `${baseUi}/svg/back_arrow.svg`,
  support: `${baseUi}/svg/info_circle.svg`,
  addressPickup: `${addressSelectionUi}/pickup_pin.svg`,
  addressDestination: `${addressSelectionUi}/destination_pin.svg`,
  addressChevron: `${addressSelectionUi}/chevron_right.svg`,
  addressSwap: `${addressSelectionUi}/swap_vertical.svg`,
  addressMenu: `${addressSelectionUi}/menu.svg`,
  addressZoomPlus: `${addressSelectionUi}/zoom_plus.svg`,
  addressZoomMinus: `${addressSelectionUi}/zoom_minus.svg`,
  addressClock: `${addressSelectionUi}/clock_outline.svg`,
  tariffPassenger: `${fixedTariffUi}/passenger_count.svg`,
  tariffDelivery: `${fixedTariffUi}/delivery_box.svg`,
  tariffCash: `${fixedTariffUi}/cash_payment.svg`,
  tariffChevron: `${fixedTariffUi}/chevron_right.svg`,
  tariffCheck: `${fixedTariffUi}/selected_check.svg`,
  tariffRadio: `${fixedTariffUi}/unselected_radio.svg`
};
const authWelcomeAssets = {
  wordmark: `${authWelcomeUi}/svg/brand/smarttaxi_wordmark.svg`,
  sMark: `${authWelcomeUi}/svg/brand/smarttaxi_s_mark.svg`,
  heroPhoto: `${authWelcomeUi}/background/auth_hero_photo_soft.png`,
  bottomOverlay: `${authWelcomeUi}/background/white_bottom_gradient_overlay.png`,
  arrowRight: `${authWelcomeUi}/svg/icons/arrow_right.svg`,
  shield: `${authWelcomeUi}/svg/icons/shield.svg`
};

const searchDriverAssets = {
  carRoute: `${searchDriverUi}/png/transparent/search_car_and_route.png`,
  markerRadar: `${searchDriverUi}/png/transparent/map_marker_with_radar.png`,
  tariffCar: `${searchDriverUi}/png/transparent/tariff_car.png`,
  search: `${searchDriverUi}/svg/icons/search.svg`,
  shield: `${searchDriverUi}/svg/icons/shield.svg`,
  bell: `${searchDriverUi}/svg/icons/bell.svg`,
  car: `${searchDriverUi}/svg/icons/car_outline.svg`,
  pin: `${searchDriverUi}/svg/icons/pin_outline.svg`
};

const driverFoundAssets = {
  avatar: `${driverFoundUi}/svg/icons/default_avatar.svg`,
  route: `${driverFoundUi}/svg/icons/route_indicator_recommended.svg`,
  phone: `${driverFoundUi}/svg/icons/phone.svg`,
  chat: `${driverFoundUi}/svg/icons/chat.svg`,
  wallet: `${driverFoundUi}/svg/icons/wallet.svg`,
  priceTag: `${driverFoundUi}/svg/icons/price_tag.svg`,
  verified: `${driverFoundUi}/svg/icons/verified.svg`,
  pickupPin: `${driverFoundUi}/svg/map_markers/pickup_pin.svg`,
  etaBubble: `${driverFoundUi}/svg/map_markers/eta_bubble.svg`
};

const tripDetailsAssets = {
  avatar: `${driverFoundUi}/svg/icons/default_avatar.svg`,
  close: `${tripDetailsUi}/svg/icons/close.svg`,
  phone: `${tripDetailsUi}/svg/icons/phone.svg`,
  support: `${tripDetailsUi}/svg/icons/support.svg`,
  share: `${tripDetailsUi}/svg/icons/share.svg`,
  verified: `${tripDetailsUi}/svg/icons/verified.svg`,
  route: `${tripDetailsUi}/svg/icons/route.svg`,
  pickupPin: `${tripDetailsUi}/svg/map_markers/pickup_pin.svg`
};

const referenceRecentAddresses = [
  { title: "Районная больница «Атакент»", subtitle: "Атакент, ул. Ж. Ибраева", lat: 40.84210, lng: 68.51190, icon: "work" },
  { title: "Базар Атакент", subtitle: "Атакент, Центральный рынок", lat: 40.84473, lng: 68.51162, icon: "trips" },
  { title: "Акимат посёлка Атакент", subtitle: "Атакент, здание акимата", lat: 40.84550, lng: 68.50750, icon: "home" }
];

const clientRegionPresets = [
  {
    id: "LOCAL_ATAKENT",
    code: "ATAKENT",
    name: "Атакент",
    displayName: "Атакент",
    alias: "Ильич",
    subtitle: "Мактааральский район",
    centerLat: 40.844435,
    centerLng: 68.509021,
    currency: "KZT"
  },
  {
    id: "LOCAL_MYRZAKENT",
    code: "MYRZAKENT",
    name: "Мырзакент",
    displayName: "Мырзакент",
    alias: "Славянка",
    subtitle: "Мактааральский район",
    centerLat: 40.665495,
    centerLng: 68.549994,
    currency: "KZT"
  },
  {
    id: "LOCAL_ZHETYSAY",
    code: "ZHETYSAY",
    name: "Жетысай",
    displayName: "Жетысай",
    alias: "Джетысай",
    subtitle: "Жетысайский район",
    centerLat: 40.777134,
    centerLng: 68.324677,
    currency: "KZT"
  },
  {
    id: "LOCAL_SHYMKENT",
    code: "SHYMKENT",
    name: "Шымкент",
    displayName: "Шымкент",
    alias: "Чимкент",
    subtitle: "Город Шымкент",
    centerLat: 42.314696,
    centerLng: 69.588328,
    currency: "KZT"
  }
];

const clientAddressCatalog = [
  { region: "ATAKENT", title: "Моё местоположение", subtitle: "Атакент", lat: 40.844435, lng: 68.509021, icon: "target", selectionKind: "device-location", tags: ["текущее", "геолокация", "центр"] },
  { region: "ATAKENT", title: "Атакент (Ильич)", subtitle: "Центр посёлка", lat: 40.844435, lng: 68.509021, icon: "target", selectionKind: "region-center", tags: ["центр", "площадь", "илич", "ильич", "atakent"] },
  { region: "ATAKENT", title: "Базар Атакент", subtitle: "Атакент, Центральный рынок", lat: 40.84473, lng: 68.51162, icon: "trips", tags: ["базар", "рынок", "центральный"] },
  { region: "ATAKENT", title: "Атакент автовокзал", subtitle: "Атакент, остановка у центра", lat: 40.84621, lng: 68.50486, icon: "trips", tags: ["автовокзал", "вокзал", "остановка"] },
  { region: "ATAKENT", title: "Улица Абая", subtitle: "Атакент, район центральной улицы", lat: 40.84803, lng: 68.50768, icon: "pin", tags: ["абая", "абай", "abai", "ул абая"] },
  { region: "ATAKENT", title: "Улица Жамбыла", subtitle: "Атакент", lat: 40.84536, lng: 68.51574, icon: "pin", tags: ["жамбыл", "zhambyl"] },
  { region: "ATAKENT", title: "Улица Сатпаева", subtitle: "Атакент", lat: 40.83995, lng: 68.50884, icon: "pin", tags: ["сатпаев", "satpayev"] },
  { region: "ATAKENT", title: "Улица Толе би", subtitle: "Атакент", lat: 40.85072, lng: 68.51212, icon: "pin", tags: ["толе", "төле", "tole bi"] },
  { region: "ATAKENT", title: "Районная больница «Атакент»", subtitle: "Атакент, ул. Ж. Ибраева", lat: 40.84210, lng: 68.51190, icon: "work", tags: ["больница", "поликлиника", "аптека", "мед", "ибраева"] },
  { region: "ATAKENT", title: "ЖД станция Мактаарал", subtitle: "Атакент, железнодорожная станция", lat: 40.83980, lng: 68.49820, icon: "trips", tags: ["жд", "станция", "мактаарал", "поезд", "railway"] },
  { region: "ATAKENT", title: "Акимат посёлка Атакент", subtitle: "Атакент, здание акимата", lat: 40.84550, lng: 68.50750, icon: "work", tags: ["акимат", "администрация"] },

  { region: "MYRZAKENT", title: "Мырзакент (Славянка)", subtitle: "Центр посёлка", lat: 40.665495, lng: 68.549994, icon: "target", selectionKind: "region-center", tags: ["мырзакент", "славян", "славянка", "myrzakent", "slavyanka"] },
  { region: "MYRZAKENT", title: "Мырзакент базар", subtitle: "Мырзакент, центральный рынок", lat: 40.66492, lng: 68.54464, icon: "trips", tags: ["базар", "рынок"] },
  { region: "MYRZAKENT", title: "Автовокзал Мырзакент", subtitle: "Мырзакент, ориентир у центра", lat: 40.66848, lng: 68.53928, icon: "trips", tags: ["автовокзал", "вокзал", "остановка"] },
  { region: "MYRZAKENT", title: "Акимат Мактааральского района", subtitle: "Мырзакент, районный акимат", lat: 40.66690, lng: 68.55210, icon: "work", tags: ["акимат", "администрация", "район", "центр"] },
  { region: "MYRZAKENT", title: "Центральная районная больница", subtitle: "Мырзакент, ЦРБ Мактааральского района", lat: 40.66978, lng: 68.54742, icon: "work", tags: ["больница", "црб", "поликлиника", "мед", "аптека"] },

  { region: "ZHETYSAY", title: "Жетысай (Джетысай)", subtitle: "Центр города", lat: 40.777134, lng: 68.324677, icon: "target", selectionKind: "region-center", tags: ["жетысай", "жетисай", "джетысай", "zhetysay"] },
  { region: "ZHETYSAY", title: "Центральный базар Жетысай", subtitle: "Жетысай, центральный рынок", lat: 40.77980, lng: 68.32190, icon: "trips", tags: ["базар", "рынок"] },
  { region: "ZHETYSAY", title: "Автовокзал Жетысай", subtitle: "Жетысай, ориентир у центра", lat: 40.78191, lng: 68.31951, icon: "trips", tags: ["автовокзал", "вокзал"] },
  { region: "ZHETYSAY", title: "Акимат Жетысайского района", subtitle: "Жетысай, городской сквер", lat: 40.77650, lng: 68.32710, icon: "work", tags: ["акимат", "администрация", "сквер"] },
  { region: "ZHETYSAY", title: "Мечеть «Нур»", subtitle: "Жетысай", lat: 40.77420, lng: 68.32990, icon: "pin", tags: ["мечеть", "мешіт", "нур"] },
  { region: "ZHETYSAY", title: "Улица Мухтара Ауезова", subtitle: "Жетысай", lat: 40.77860, lng: 68.32860, icon: "pin", tags: ["ауезова", "auezov", "мухтара ауезова"] },

  { region: "SHYMKENT", title: "Шымкент (Чимкент)", subtitle: "Центр города", lat: 42.314696, lng: 69.588328, icon: "target", selectionKind: "region-center", tags: ["шымкент", "чимкент", "shymkent"] },
  { region: "SHYMKENT", title: "Mega Planet Shymkent", subtitle: "Шымкент, ТРЦ", lat: 42.31638, lng: 69.59307, icon: "work", tags: ["mega", "мега", "трц", "планет"] },
  { region: "SHYMKENT", title: "Арбат Шымкент", subtitle: "Шымкент, прогулочная зона", lat: 42.31803, lng: 69.596, icon: "favorite", tags: ["арбат", "центр"] },
  { region: "SHYMKENT", title: "Центральный парк", subtitle: "Шымкент", lat: 42.32151, lng: 69.59202, icon: "home", tags: ["парк", "центр"] },
  { region: "SHYMKENT", title: "Автовокзал Самал", subtitle: "Шымкент", lat: 42.28852, lng: 69.61765, icon: "trips", tags: ["самал", "автовокзал", "вокзал"] },
  { region: "SHYMKENT", title: "Колос", subtitle: "Шымкент, популярный ориентир", lat: 42.31356, lng: 69.59394, icon: "pin", tags: ["колос", "ориентир"] },
  { region: "SHYMKENT", title: "Нурсат", subtitle: "Шымкент, район Нурсат", lat: 42.34116, lng: 69.60894, icon: "pin", tags: ["нурсат", "район"] }
];

const fallbackRegion = {
  id: "ATAKENT_FALLBACK",
  code: "ATAKENT",
  name: "Атакент",
  centerLat: 40.844435,
  centerLng: 68.509021,
  currency: "KZT"
};

const mergedClientAddressCatalog = [...clientAddressCatalog, ...extraClientAddressCatalog];
const mergedClientRegionPresets = [...clientRegionPresets, ...extraClientRegionPresets];

const orderSteps = [
  ["SEARCHING_DRIVER", "Поиск"],
  ["DRIVER_FOUND", "Водитель"],
  ["DRIVER_GOING_TO_CLIENT", "Едет"],
  ["DRIVER_ARRIVED", "Прибыл"],
  ["WAITING_CLIENT", "Ожидание"],
  ["TRIP_STARTED", "В пути"],
  ["TRIP_COMPLETED", "Готово"],
  ["PAYMENT_PENDING", "Оплата"],
  ["PAID", "Оплачено"]
];

const errorMessages = {
  PICKUP_REGION_INACTIVE: "В этом месте сервис пока недоступен",
  DROPOFF_REGION_INACTIVE: "Точка назначения пока вне зоны подачи",
  INTERCITY_NOT_SUPPORTED: "Межгород пока не поддерживается",
  INTERCITY_ROUTE_UNAVAILABLE: "Это направление межгорода временно недоступно",
  ROUTE_UNAVAILABLE: "Не удалось построить маршрут",
  ADDRESS_SEARCH_UNAVAILABLE: "Поиск адресов временно недоступен",
  TARIFF_INACTIVE: "Этот тариф временно недоступен",
  TARIFF_REGION_MISMATCH: "Тариф недоступен для этого маршрута",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят другим водителем",
  CLIENT_HAS_ACTIVE_ORDER: "У вас уже есть активный заказ",
  INSUFFICIENT_CASHBACK: "На балансе недостаточно бонусов для полной оплаты поездки",
  UNAUTHORIZED: "Войдите, чтобы заказать поездку",
  FORBIDDEN: "У аккаунта нет прав пассажира",
  PROMO_CODE_REQUIRED: "Введите код промокода",
  PROMO_NOT_FOUND: "Такой промокод не найден или уже неактивен",
  PROMO_NOT_STARTED: "Этот промокод ещё не начал действовать",
  PROMO_EXPIRED: "Срок действия промокода истёк",
  PROMO_MIN_ORDER_NOT_MET: "Промокод действует от большей суммы заказа",
  PROMO_LIMIT_REACHED: "Лимит использований промокода исчерпан",
  PROMO_ALREADY_USED: "Вы уже использовали этот промокод",
  FAVORITE_ADDRESS_LIMIT: "Достигнут лимит избранных адресов"
};

function formatError(error) {
  return errorMessages[error?.code] || "Не удалось выполнить запрос. Проверьте соединение и попробуйте снова.";
}

function publicStatus(status) {
  const map = {
    NEW: "SEARCHING_DRIVER",
    SEARCHING: "SEARCHING_DRIVER",
    DRIVER_ASSIGNED: "DRIVER_FOUND",
    ACCEPTED: "DRIVER_FOUND",
    DRIVER_FOUND: "DRIVER_FOUND",
    DRIVER_GOING_TO_CLIENT: "DRIVER_GOING_TO_CLIENT",
    DRIVER_ARRIVED: "DRIVER_ARRIVED",
    WAITING_CLIENT: "WAITING_CLIENT",
    IN_PROGRESS: "TRIP_STARTED",
    TRIP_STARTED: "TRIP_STARTED",
    TRIP_COMPLETED: "TRIP_COMPLETED",
    PAYMENT_PENDING: "PAYMENT_PENDING",
    PAID: "PAID",
    RATED: "RATED",
    COMPLETED: "TRIP_COMPLETED",
    CANCELLED_BY_CLIENT: "CANCELLED_BY_CLIENT",
    CANCELLED_BY_DRIVER: "CANCELLED_BY_DRIVER",
    CANCELLED_BY_OPERATOR: "CANCELLED_BY_OPERATOR",
    NO_SHOW: "NO_SHOW",
    CANCELLED: "CANCELLED_BY_CLIENT",
    CANCELED: "CANCELLED_BY_CLIENT"
  };
  return map[status] || status || "SEARCHING_DRIVER";
}

function statusLabel(status) {
  const map = {
    NEW: "Поиск",
    SEARCHING: "Ищем водителя",
    SEARCHING_DRIVER: "Ищем водителя",
    DRIVER_FOUND: "Водитель найден",
    DRIVER_GOING_TO_CLIENT: "Водитель едет к вам",
    DRIVER_ASSIGNED: "Водитель назначен",
    DRIVER_ARRIVED: "Водитель подъехал",
    IN_PROGRESS: "Поездка началась",
    TRIP_STARTED: "Поездка началась",
    COMPLETED: "Поездка завершена",
    TRIP_COMPLETED: "Поездка завершена",
    PAYMENT_PENDING: "Ожидаем оплату",
    PAID: "Оплачено",
    RATED: "Поездка закрыта",
    CANCELLED: "Заказ отменён",
    CANCELED: "Заказ отменён",
    CANCELLED_BY_CLIENT: "Заказ отменён",
    CANCELLED_BY_DRIVER: "Заказ отменён водителем",
    CANCELLED_BY_ADMIN: "Заказ отменён оператором",
    CANCELLED_BY_OPERATOR: "Заказ отменён оператором",
    NO_SHOW: "Клиент не вышел"
  };
  return map[status] || status || "Статус заказа";
}

// `route` is the live driver->target leg when one is available, so the
// subtitle can carry a real ETA instead of a status sentence.
function clientLifecycleStage(status, order, route = null) {
  const label = statusLabel(status);
  const payment = paymentLabel(order?.payment_method);
  const map = {
    DRIVER_FOUND: {
      title: "Водитель найден",
      subtitle: driverEtaText(order, route),
      badge: label,
      canCancel: true,
      canContact: true,
      canStartNewTrip: false
    },
    DRIVER_GOING_TO_CLIENT: {
      title: "Водитель найден",
      subtitle: driverEtaText(order, route),
      badge: label,
      canCancel: true,
      canContact: true,
      canStartNewTrip: false
    },
    DRIVER_ARRIVED: {
      title: "Водитель на месте",
      subtitle: "Ожидает вас у точки подачи",
      badge: label,
      canCancel: true,
      canContact: true,
      canStartNewTrip: false
    },
    WAITING_CLIENT: {
      title: "Идёт ожидание",
      subtitle: "Водитель ждёт вас у точки подачи",
      badge: label,
      canCancel: true,
      canContact: true,
      canStartNewTrip: false
    },
    TRIP_STARTED: {
      title: "Поездка началась",
      subtitle: "Едем к месту назначения",
      badge: label,
      canCancel: false,
      canContact: true,
      canStartNewTrip: false
    },
    TRIP_COMPLETED: {
      title: "Поездка окончена",
      subtitle: `Проверьте сумму и оплату: ${payment}`,
      badge: label,
      canCancel: false,
      canContact: false,
      canStartNewTrip: false
    },
    PAYMENT_PENDING: {
      title: "Поездка окончена",
      subtitle: `Способ оплаты: ${payment}`,
      badge: label,
      canCancel: false,
      canContact: false,
      canStartNewTrip: false
    },
    PAID: {
      title: "Оставьте отзыв",
      subtitle: "Оцените поездку, чтобы завершить заказ",
      badge: label,
      canCancel: false,
      canContact: false,
      canStartNewTrip: false
    },
    RATED: {
      title: "Спасибо за оценку",
      subtitle: "Можно создать новую поездку",
      badge: label,
      canCancel: false,
      canContact: false,
      canStartNewTrip: true
    },
    NO_SHOW: {
      title: "Поездка не состоялась",
      subtitle: "Заказ закрыт как неявка клиента",
      badge: label,
      canCancel: false,
      canContact: false,
      canStartNewTrip: true
    }
  };
  return map[status] || {
    title: label,
    subtitle: "Следим за статусом поездки",
    badge: label,
    canCancel: false,
    canContact: Boolean(order?.driver_phone),
    canStartNewTrip: false
  };
}

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    short_id: order.short_id || order.shortId || order.id,
    pickup_text: sanitizeAddressText(order.pickup_text || order.pickupText || order.pickup || "Точка посадки", "Точка посадки"),
    dropoff_text: sanitizeAddressText(order.dropoff_text || order.dropoffText || order.dropoff || "Точка назначения", "Точка назначения"),
    payment_method: order.payment_method || order.paymentMethod,
    public_status: publicStatus(order.public_status || order.publicStatus || order.status)
  };
}

function normalizeAddress(address) {
  if (!address) return null;
  const lat = Number(address.lat);
  const lng = Number(address.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const title = String(address.label || address.title || "").trim();
  // Coordinates and road codes are transport data, not an address a rider
  // can recognise or a driver can use. The backend filters them too; this is
  // the last UI guard for stale deployments or a third-party response.
  const technicalAddress = /^(?:kz|ah|[а-яa-z]{1,3})[\s-]?\d+[а-яa-z]?$/i.test(title) ||
    /^(?:точка на карте|адрес не определ[её]н)$/i.test(title) ||
    /^[-+]?\d{1,3}\.\d+\s*[,;]\s*[-+]?\d{1,3}\.\d+$/.test(title);
  // Keep the web picker in parity with Flutter: a street without a house
  // number is too ambiguous for a driver. A named POI remains valid because
  // it does not use one of the street-only prefixes below.
  const bareStreet = /(?:^|[,;]\s*)(?:ул(?:ица)?\.?|проспект|переулок|бульвар|шоссе|көшесі|даңғылы)\s+/i.test(title);
  const genericSettlement = /^((?:атакент(?:\s*\(ильич\))?|мырзакент(?:\s*\(славянка\))?|жетысай(?:\s*\(джетысай\))?|шымкент(?:\s*\(чимкент\))?|киров(?:\s*\(кирово\))?|асыката(?:\s*\(асыката\))?|достык(?:\s*\(достык\))?|ынтымак(?:\s*\(ынтымак\))?|бирлик(?:\s*\(бирлик\))?|фирдоуси(?:\s*\(фердоуси\))?|жана жол(?:\s*\(жаңа жол\))?|мақтаарал(?:\s*\(мактаарал\))?|атамекен(?:\s*\(ата мекен\))?))(?:\s*,\s*\1)?$/i.test(title);
  // A service-region centroid is useful for framing a map, but it is not a
  // dispatchable address. It must never masquerade as a POI in the picker.
  const nonBookableCatalogPoint = address.selectionKind === "region-center" ||
    address.selectionKind === "device-location";
  if (!title || technicalAddress || genericSettlement || nonBookableCatalogPoint || (bareStreet && !/\d/.test(title))) return null;
  const base = address.subtitle || address.city || "";
  const regionName = address.region || address.regionCode || "";
  // Live-geocoded subtitles (routing.service.js) already bake the region
  // into the formatted string, but the curated local catalog entries only
  // carry separate city/region fields -- those used to fall back to
  // "city OR region", so the region name (which region of several
  // SmartTaxi operates in) never actually reached the screen for them.
  // Append it whenever it isn't already implied by what's shown.
  const combinedText = `${title} ${base}`.toLowerCase();
  const subtitle = regionName && !combinedText.includes(regionName.toLowerCase())
    ? [base, regionName].filter(Boolean).join(" • ")
    : base;
  return {
    title,
    subtitle: subtitle || "Адрес выбран",
    icon: address.icon || "pin",
    region: address.region || address.regionCode || address.city || "",
    regionCode: address.regionCode || address.region_code || "",
    regionId: address.regionId || address.region_id || "",
    tags: address.tags || [],
    lat,
    lng
  };
}

function pendingMapAddress(point, regionName) {
  return {
    title: "Определяем адрес",
    subtitle: regionName ? `Ищем ближайший дом или объект в «${regionName}»` : "Ищем ближайший дом или объект",
    lat: Number(point.lat),
    lng: Number(point.lng)
  };
}

function mapAddressCacheKey(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  // Five decimals is roughly a metre: precise enough for an entrance, while
  // still coalescing duplicate moveend/zoomend coordinates from the map.
  return `${lat.toFixed(5)}:${lng.toFixed(5)}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/і/g, "и")
    .replace(/[ұү]/g, "у")
    .replace(/ғ/g, "г")
    .replace(/қ/g, "к")
    .replace(/ә/g, "а")
    .replace(/һ/g, "х")
    .replace(/\s+/g, " ")
    .trim();
}

function regionCode(region) {
  const raw = String(region?.code || region?.name || "").toUpperCase();
  if (raw.includes("MYR") || raw.includes("МЫР") || raw.includes("СЛАВ")) return "MYRZAKENT";
  if (raw.includes("ZHET") || raw.includes("ЖЕТ")) return "ZHETYSAY";
  if (raw.includes("SHYM") || raw.includes("ШЫМ") || raw.includes("ЧИМ")) return "SHYMKENT";
  if (raw.includes("KIROV") || raw.includes("КИР")) return "KIROV";
  if (raw.includes("ASYK") || raw.includes("АСЫ")) return "ASYKATA";
  if (raw.includes("DOST") || raw.includes("ДОСТ")) return "DOSTYK";
  if (raw.includes("YNTY") || raw.includes("ЫНТ")) return "YNTYMAK";
  if (raw.includes("BIRL") || raw.includes("БИР") || raw.includes("БІР")) return "BIRLIK";
  if (raw.includes("FIRD") || raw.includes("ФИР") || raw.includes("ФЕР")) return "FIRDOUSI";
  if (raw.includes("ZHANA") || raw.includes("ЖАНА") || raw.includes("ЖАҢА")) return "ZHANA_ZHOL";
  if (raw.includes("MAKTA") || raw.includes("МАҚ") || raw.includes("МАК")) return "MAKTAARAL";
  if (raw.includes("ATAMEKEN") || raw.includes("АТАМЕКЕН") || raw.includes("АТА МЕКЕН")) return "ATAMEKEN";
  if (raw.includes("TURK") || raw.includes("ТУРК") || raw.includes("ТҮРК")) return "TURKISTAN";
  if (raw.includes("SARY") || raw.includes("САРЫ")) return "SARYAGASH";
  if (raw.includes("KAZYG") || raw.includes("ҚАЗ") || raw.includes("КАЗ")) return "KAZYGURT";
  if (raw.includes("ALMATY") || raw.includes("АЛМ")) return "ALMATY";
  if (raw.includes("ASTANA") || raw.includes("АСТ") || raw.includes("НУР")) return "ASTANA";
  return "ATAKENT";
}

function regionLabel(region) {
  const name = region?.displayName || region?.name || "Атакент";
  return region?.alias ? `${name} (${region.alias})` : name;
}

function regionShortLabel(region) {
  return region?.displayName || region?.name || "Атакент";
}

function mergeRegions(apiRegions = []) {
  const byCode = new Map();
  mergedClientRegionPresets.forEach(region => byCode.set(region.code, region));
  apiRegions.forEach(region => {
    const code = regionCode(region);
    const preset = byCode.get(code);
    byCode.set(code, {
      ...preset,
      ...region,
      code,
      displayName: preset?.displayName || region.name,
      alias: preset?.alias,
      subtitle: preset?.subtitle || region.subtitle
    });
  });
  return Array.from(byCode.values());
}

function localAddressesForRegion(region) {
  const code = regionCode(region);
  return mergedClientAddressCatalog.filter(item =>
    item.region === code && Boolean(normalizeAddress(item))
  );
}

function popularAddressesForRegion(region, limit = 3) {
  return localAddressesForRegion(region).filter(item => item.title !== "Моё местоположение").slice(0, limit);
}

function searchLocalClientAddresses(query, region, limit = 8) {
  const clean = normalizeText(query);
  const selectedCode = regionCode(region);
  const regionItems = localAddressesForRegion(region);
  if (!clean) return regionItems.slice(0, limit);
  const parts = clean.split(" ").filter(part => part.length > 1);
  const source = clean.length >= 3 ? mergedClientAddressCatalog : regionItems;
  return source
    .map(item => {
      const text = normalizeText([item.title, item.subtitle, ...(item.tags || [])].join(" "));
      const exact = text.includes(clean) ? 0 : 8;
      const partial = parts.reduce((score, part) => score + (text.includes(part) ? 0 : 2), 0);
      const regionPenalty = item.region === selectedCode ? 0 : 3;
      return { item, score: exact + partial + regionPenalty };
    })
    .filter(entry => entry.score < 8 + Math.max(parts.length, 1) * 2)
    .sort((left, right) => left.score - right.score)
    .map(entry => entry.item)
    .slice(0, limit);
}

function mergeAddressResults(primary, fallback, limit = 10) {
  const seen = new Set();
  return [...primary, ...fallback].filter(item => {
    const normalized = normalizeAddress(item);
    if (!normalized) return false;
    const key = `${normalizeText(normalized.title)}-${Number(normalized.lat).toFixed(5)}-${Number(normalized.lng).toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function tariffTitle(tariff) {
  return tariff?.displayName || tariff?.display_name || tariff?.title || tariff?.name || "Тариф";
}

function tariffMinPrice(tariff) {
  const value = Number(tariff?.minPrice ?? tariff?.min_price ?? tariff?.minimumPrice ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function tariffSubtitle(tariff) {
  const title = tariffTitle(tariff).toLowerCase();
  const name = String(tariff?.name || "").toLowerCase();
  if (title.includes("эконом") || name.includes("economy")) return "Быстро и доступно";
  if (title.includes("комфорт") || name.includes("comfort")) return "Больше удобства";
  if (title.includes("бизнес") || name.includes("business")) return "Премиальная поездка";
  if (title.includes("достав") || name.includes("delivery")) return "Передать посылку";
  return tariff?.description || "Городская поездка";
}

function regionCenter(region) {
  const lat = Number(region?.centerLat ?? region?.center_lat);
  const lng = Number(region?.centerLng ?? region?.center_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function backendRegionIdFor(regions, selectedRegionId, selectedRegion) {
  if (isUuid(selectedRegionId)) return selectedRegionId;
  const code = regionCode(selectedRegion);
  return regions.find(region => regionCode(region) === code && isUuid(region.id))?.id || "";
}

function pointInRegion(point, region) {
  const boundary = region?.boundary;
  if (!point) return false;
  if (!Array.isArray(boundary) || boundary.length < 3) {
    const center = regionCenter(region);
    if (!center) return false;
    const code = regionCode(region);
    const radiusKm = code === "SHYMKENT" ? 18 : code === "TURKISTAN" ? 16 : 8;
    return haversineKm(point, center) <= radiusKm;
  }
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

function isCuratedAddressInRegion(address, region) {
  if (!address) return false;
  const targetCode = regionCode(region);
  const addressCode = regionCode({ code: address.region || address.regionCode });
  if (targetCode !== addressCode) return false;
  return mergedClientAddressCatalog.some(item =>
    item.region === targetCode &&
    item.title === address.title &&
    Math.abs(Number(item.lat) - Number(address.lat)) < 0.00001 &&
    Math.abs(Number(item.lng) - Number(address.lng)) < 0.00001
  );
}

function isAddressInServiceRegion(address, region) {
return pointInRegion(address, region) || isCuratedAddressInRegion(address, region);
}

function regionForAddress(address, regions) {
  if (!address) return null;
  const advertisedCode = regionCode({ code: address.regionCode || address.region });
  if (advertisedCode) {
    const direct = regions.find(region => regionCode(region) === advertisedCode);
    if (direct) return direct;
  }
  return regions.find(region => isAddressInServiceRegion(address, region)) || null;
}

function distanceKmFromRoute(route) {
  if (!route?.distanceMeters) return null;
  return Math.max(0.1, Math.round((Number(route.distanceMeters) / 1000) * 10) / 10);
}

// OSRM returns a zero-length route for an identical pickup and destination.
// Treat only effectively identical pins as the same point (about one metre),
// leaving genuinely short rides available to book.
function isSameTripPoint(first, second) {
  if (!first || !second) return false;
  return Math.abs(Number(first.lat) - Number(second.lat)) < 0.00001 &&
    Math.abs(Number(first.lng) - Number(second.lng)) < 0.00001;
}

const sameTripPointMessage = "Точка назначения совпадает с точкой подачи. Выберите другой адрес.";

function durationMinFromRoute(route) {
  if (!route?.durationSeconds) return null;
  return Math.max(1, Math.ceil(Number(route.durationSeconds) / 60));
}

function formatTripKm(route, fallback = "5,2 км") {
  const distance = distanceKmFromRoute(route);
  return distance ? `${String(distance).replace(".", ",")} км` : fallback;
}

function formatTripMin(route, fallback = "12 мин") {
  const duration = durationMinFromRoute(route);
  return duration ? `${duration} мин` : fallback;
}

function formatRouteSummary(route, fallback = "Маршрут выбран") {
  const duration = durationMinFromRoute(route);
  const distance = distanceKmFromRoute(route);
  if (!duration && !distance) return fallback;
  return [
    duration ? `${duration} мин` : null,
    distance ? `${String(distance).replace(".", ",")} км` : null
  ].filter(Boolean).join(" · ");
}

function IconAsset({ name, className = "", alt = "" }) {
  const src = baseIcons[name] || baseIcons.mark;
  return <img className={`ui-asset-icon ${className}`} src={src} alt={alt} aria-hidden={alt ? undefined : true} />;
}

function cleanTariffKey(tariff) {
  const raw = `${tariff?.name || ""} ${tariffTitle(tariff)}`.toLowerCase();
  if (raw.includes("comfort") || raw.includes("комфорт")) return "Comfort";
  if (raw.includes("business") || raw.includes("бизнес")) return "Business";
  if (raw.includes("delivery") || raw.includes("достав")) return "Delivery";
  return "Economy";
}

const fixedTariffSpec = [
  {
    key: "Economy",
    title: "Эконом",
    subtitle: "Быстро и выгодно",
    fixedPriceKzt: 700,
    image: carImages.Economy,
    seats: 4,
    recommended: true
  },
  {
    key: "Comfort",
    title: "Комфорт",
    subtitle: "Больше комфорта",
    fixedPriceKzt: 1000,
    image: carImages.Comfort,
    seats: 4
  },
  {
    key: "Business",
    title: "Бизнес",
    subtitle: "Премиальная поездка",
    fixedPriceKzt: 2500,
    image: carImages.Business,
    seats: 4
  },
  {
    key: "Delivery",
    title: "Доставка",
    subtitle: "Посылки и небольшие грузы",
    fixedPriceKzt: 800,
    image: carImages.Delivery,
    delivery: true
  }
];

function haversineKm(from, to) {
  if (!from || !to) return 0;
  const toRad = value => (Number(value) * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function referenceTariffRows(tariffs, selectedTariff, estimate, route, tariffEstimates = {}) {
  const byKey = new Map();
  tariffs
    .forEach(item => byKey.set(cleanTariffKey(item), item));
  const mapped = fixedTariffSpec.map(row => {
    const apiTariff = byKey.get(row.key);
    const selected = apiTariff ? selectedTariff?.id === apiTariff.id : false;
    const backendEstimateMatches = selected && estimate?.estimatedPrice && cleanTariffKey(estimate?.tariff) === row.key;
    const serverEstimate = apiTariff ? tariffEstimates[apiTariff.id] : null;
    return {
      ...row,
      apiTariff,
      disabled: !apiTariff,
      selected,
      // A price is meaningful only when it came from the backend for this
      // route and tariff. Never present a base/minimum price as a trip quote.
      priceKzt: backendEstimateMatches ? estimate.estimatedPrice : serverEstimate?.estimatedPrice ?? null,
      eta: formatTripMin(route, "—"),
      km: formatTripKm(route, "—")
    };
  });
  if (!mapped.some(row => row.selected)) {
    const firstAvailable = mapped.find(row => row.apiTariff && !row.disabled);
    if (firstAvailable) firstAvailable.selected = true;
  }
  return mapped;
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
  const [intercityRoutes, setIntercityRoutes] = useState([]);
  const [intercityLoading, setIntercityLoading] = useState(false);
  const [tariffs, setTariffs] = useState([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsError, setTariffsError] = useState("");
  const [tariff, setTariff] = useState(null);
  const [tariffEstimates, setTariffEstimates] = useState({});
  const [offeredPriceKzt, setOfferedPriceKzt] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [order, setOrder] = useState(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [incomingMessage, setIncomingMessage] = useState(null);
  const seenNotificationIdsRef = useRef(new Set());
  const [mainMapCandidate, setMainMapCandidate] = useState(null);
  const [mainMapPickLoading, setMainMapPickLoading] = useState(false);
  const [mainMapCandidateReady, setMainMapCandidateReady] = useState(true);
  const [auth, setAuth] = useState({ phone: "", password: "" });
  const [authMode, setAuthMode] = useState("phone");
  const [registerForm, setRegisterForm] = useState({ name: "", phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
  const [resetForm, setResetForm] = useState({ phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
  const [rider, setRider] = useState({ name: "Пассажир", phone: "" });
  const [authenticated, setAuthenticated] = useState(false);
  const authSession = authenticated ? getToken() : "";
  const liveRoute = useLiveDriverRoute(order, authSession);
  const [favorites, setFavorites] = useState([]);
  const [favoritesState, setFavoritesState] = useState({ loading: false, error: "" });
  const socketRef = useRef(null);
  const mainMapReverseSeqRef = useRef(0);
  const mainMapReverseDebounceRef = useRef(0);
  const mainMapReverseCacheRef = useRef(new Map());
  const mainMapSkipInitialCenterRef = useRef(true);

  const localSelectedRegion = mergedClientRegionPresets.find(region => region.id === selectedRegionId);
  const selectedRegion = regions.find(region => region.id === selectedRegionId)
    || (localSelectedRegion ? regions.find(region => regionCode(region) === regionCode(localSelectedRegion)) || localSelectedRegion : null)
    || regions.find(region => regionCode(region) === "ATAKENT")
    || clientRegionPresets[0]
    || fallbackRegion;
  const selectedRegionName = selectedRegion?.name || fallbackRegion.name;
  const backendRegionId = backendRegionIdFor(regions, selectedRegionId, selectedRegion);
  const intercityDestinationRegions = useMemo(() => {
    const allowedIds = new Set(intercityRoutes.map(route => route.destinationRegionId));
    return [selectedRegion, ...regions.filter(region => allowedIds.has(region.id))]
      .filter(Boolean)
      .filter((region, index, list) => list.findIndex(item => item.id === region.id) === index);
  }, [selectedRegion, regions, intercityRoutes]);
  const mapCenter = pickup || destination || regionCenter(selectedRegion);
  const estimate = route?.estimate || null;
  const canShowTariffs = Boolean(pickup && destination);
  const canCreate = Boolean(authenticated && pickup && destination && tariff && route && estimate && !routeError);
  const authScreenActive = section === "profile" && (!authenticated || authMode === "success");

  useEffect(() => {
    if (section !== "home" || addressMode) return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [section, addressMode, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);

  useEffect(() => {
    if (pickup) {
      setMainMapCandidate(pickup);
      setMainMapCandidateReady(true);
      setMainMapPickLoading(false);
      return;
    }
    const center = regionCenter(selectedRegion) || regionCenter(fallbackRegion);
    if (!center) return;
    setMainMapCandidate(pendingMapAddress(center, selectedRegionName));
    setMainMapCandidateReady(false);
    setMainMapPickLoading(false);
    mainMapSkipInitialCenterRef.current = true;
  }, [pickup?.lat, pickup?.lng, selectedRegion?.id, selectedRegionName]);

  useEffect(() => () => window.clearTimeout(mainMapReverseDebounceRef.current), []);

  useEffect(() => {
    const session = getToken();
    if (!session) return undefined;
    let ignore = false;
    getCurrentUser()
      .then(payload => {
        if (ignore || getToken() !== session) return;
        const user = payload.user || {};
        if (user.role !== "CLIENT") {
        setAuthenticated(false);
        setRider({ name: "Пассажир", phone: "" });
        return;
      }
      setAuthenticated(true);
      setRider({
        name: [user.name, user.surname].filter(Boolean).join(" ") || user.login || "Пассажир",
        phone: user.phone || ""
      });
      })
      .catch(() => {
        if (!ignore && getToken() === session) setAuthenticated(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    // Reload and login must recover the server's current trip before the
    // rider tries ordering again. No trip data survives an account change.
    setOrder(null);
    orderRef.current = null;
    setIncomingMessage(null);
    seenNotificationIdsRef.current.clear();
    if (!authSession) return undefined;
    return recoverClientActiveOrder({
      session: authSession,
      getSession: getToken,
      fetchOrder: getClientActiveOrder,
      onRecover: restored => {
        // An order created while recovery was in flight is newer local state.
        if (orderRef.current) return;
        const next = normalizeOrder(restored);
        orderRef.current = next;
        setOrder(next);
        setSection("trips");
      },
      onError: () => setMessage("Не удалось восстановить текущую поездку. Проверьте подключение и обновите страницу.")
    });
  }, [authSession]);

  useEffect(() => {
    if (!backendRegionId || regionsLoading) {
      setIntercityRoutes([]);
      setIntercityLoading(false);
      return undefined;
    }
    let ignore = false;
    setIntercityLoading(true);
    getIntercityRoutes(backendRegionId)
      .then(data => {
        if (!ignore) setIntercityRoutes(Array.isArray(data?.routes) ? data.routes : []);
      })
      .catch(() => {
        // A failed availability lookup must fail closed: local trips still
        // work, but we do not offer an unverified intercity direction.
        if (!ignore) setIntercityRoutes([]);
      })
      .finally(() => !ignore && setIntercityLoading(false));
    return () => { ignore = true; };
  }, [backendRegionId, regionsLoading]);

  useEffect(() => {
    let ignore = false;
    setRegionsLoading(true);
    getActiveRegions()
      .then(data => {
        if (ignore) return;
        const list = mergeRegions(data.regions || []);
        setRegions(list);
        setSelectedRegionId(current => {
          if (!current) return list.find(region => regionCode(region) === "ATAKENT")?.id || list[0]?.id || "";
          const currentRegion = [...list, ...mergedClientRegionPresets].find(region => region.id === current);
          const matchedByCode = list.find(region => regionCode(region) === regionCode(currentRegion));
          return matchedByCode?.id || list.find(region => region.id === current)?.id || list[0]?.id || current;
        });
        setRegionsError("");
      })
      .catch(error => {
        if (ignore) return;
        const list = mergeRegions([]);
        setRegions(list);
        setSelectedRegionId(current => current || list[0]?.id || "");
        setRegionsError(formatError(error));
      })
      .finally(() => !ignore && setRegionsLoading(false));
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!selectedRegionId || !canShowTariffs || regionsLoading) {
      setTariffs([]);
      setTariff(null);
      return undefined;
    }
    if (!backendRegionId && !regionsError) {
      return undefined;
    }
    let ignore = false;
    setTariffsLoading(true);
    setTariffsError("");
    getTariffs(backendRegionId || selectedRegionId)
      .then(data => {
        if (ignore) return;
        const order = new Map(fixedTariffSpec.map((item, index) => [item.key, index]));
        const apiTariffs = (data.tariffs || [])
          .filter(item => order.has(cleanTariffKey(item)))
          .sort((a, b) => order.get(cleanTariffKey(a)) - order.get(cleanTariffKey(b)));
        setTariffs(apiTariffs);
        setTariff(current => apiTariffs.find(item => item.id === current?.id) || apiTariffs[0] || null);
        setTariffsError(apiTariffs.length ? "" : "Тарифы пока не настроены");
      })
      .catch(() => {
        if (ignore) return;
        setTariffs([]);
        setTariff(null);
        setTariffsError("Не удалось загрузить тарифы. Проверьте подключение к API.");
      })
      .finally(() => !ignore && setTariffsLoading(false));
    return () => { ignore = true; };
  }, [selectedRegionId, backendRegionId, canShowTariffs, regionsLoading, regionsError]);

  useEffect(() => {
    if (!pickup || !destination || !tariff) {
      setRoute(null);
      setRouteError("");
      return undefined;
    }
    if (isSameTripPoint(pickup, destination)) {
      setRoute(null);
      setTariffEstimates({});
      setOfferedPriceKzt(null);
      setRouteError(sameTripPointMessage);
      return undefined;
    }
    let ignore = false;
    setRouteLoading(true);
    setRouteError("");
    if (tariff?.isLocal) {
      setRoute(null);
      setRouteError("Сервер расчёта временно недоступен");
      setRouteLoading(false);
      return () => { ignore = true; };
    }
    estimateTariff({
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: destination.lat,
      dropoffLng: destination.lng,
      tariffId: tariff.id,
      tariff: tariff.name
    })
      .then(data => {
        if (ignore) return;
        const estimate = data?.estimate || data?.route?.estimate;
        if (!data?.route || !estimate) {
          setRoute(null);
          setRouteError("Не удалось построить маршрут и рассчитать поездку. Проверьте адреса и попробуйте ещё раз.");
          return;
        }
        setRoute({ ...data.route, estimate });
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
    if (!pickup || !destination || !tariffs.length) {
      setTariffEstimates({});
      return undefined;
    }
    if (isSameTripPoint(pickup, destination)) {
      setTariffEstimates({});
      return undefined;
    }
    let ignore = false;
    Promise.all(tariffs.map(async item => {
      try {
        const payload = await estimateTariff({
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffLat: destination.lat,
          dropoffLng: destination.lng,
          tariffId: item.id,
          tariff: item.name
        });
        return [item.id, payload?.estimate || payload?.route?.estimate || null];
      } catch {
        return [item.id, null];
      }
    })).then(entries => {
      if (!ignore) setTariffEstimates(Object.fromEntries(entries.filter(([, value]) => value)));
    });
    return () => { ignore = true; };
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, tariffs]);

  useEffect(() => {
    const estimatedPrice = Math.round(Number(estimate?.estimatedPrice || 0));
    setOfferedPriceKzt(estimatedPrice > 0 ? estimatedPrice : null);
  }, [estimate?.estimatedPrice, tariff?.id, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng]);

  useEffect(() => {
    if (!order?.id || !authSession) return undefined;
    let cancelled = false;
    let revision = 0;
    const isCurrent = () => !cancelled && getToken() === authSession;
    const socket = createSocket();
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("join_order", order.id));
    const updateOrder = payload => {
      const snapshot = payload?.order || payload;
      if (!isCurrent() || snapshot?.id !== order.id) return;
      revision++;
      setOrder(current => current?.id === order.id
        ? normalizeOrder({ ...current, ...snapshot }) : current);
    };
    const updateLocation = payload => {
      if (!isCurrent() || payload?.orderId !== order.id) return;
      revision++;
      setOrder(current => mergeClientDriverLocation(current, payload));
    };
    socket.on("driver_location_updated", updateLocation);
    socket.on("order_status_public", updateOrder);
    socket.on("order_updated", updateOrder);
    socket.on("order_accepted", updateOrder);
    socket.on("order.searching_driver", updateOrder);
    socket.on("order.driver_found", updateOrder);
    socket.on("order.driver_going_to_client", updateOrder);
    socket.on("order.driver_arrived", updateOrder);
    socket.on("order.waiting_client", updateOrder);
    socket.on("order.trip_started", updateOrder);
    socket.on("order.trip_completed", updateOrder);
    socket.on("order.payment_pending", updateOrder);
    socket.on("order.paid", updateOrder);
    socket.on("order.rated", updateOrder);
    socket.on("order.no_show", updateOrder);
    socket.on("order.cancelled", updateOrder);
    const poll = window.setInterval(() => {
      const startedAtRevision = revision;
      getOrderStatusHistory(order.id)
        .then(data => {
          if (isCurrent() && startedAtRevision === revision && data?.order?.id === order.id) {
            setOrder(current => current?.id === order.id
              ? normalizeOrder({ ...current, ...data.order }) : current);
          }
        })
        .catch(() => {});
    }, 7000);
    return () => {
      cancelled = true;
      socket.off("driver_location_updated", updateLocation);
      socket.off("order_status_public", updateOrder);
      socket.off("order_updated", updateOrder);
      socket.off("order_accepted", updateOrder);
      socket.off("order.searching_driver", updateOrder);
      socket.off("order.driver_found", updateOrder);
      socket.off("order.driver_going_to_client", updateOrder);
      socket.off("order.driver_arrived", updateOrder);
      socket.off("order.waiting_client", updateOrder);
      socket.off("order.trip_started", updateOrder);
      socket.off("order.trip_completed", updateOrder);
      socket.off("order.payment_pending", updateOrder);
      socket.off("order.paid", updateOrder);
      socket.off("order.rated", updateOrder);
      socket.off("order.no_show", updateOrder);
      socket.off("order.cancelled", updateOrder);
      window.clearInterval(poll);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [order?.id, authSession]);

  useEffect(() => {
    if (!order?.id || !getToken()) return undefined;
    let cancelled = false;
    async function poll() {
      try {
        const data = await getNotifications({ limit: 10 });
        const match = (data.notifications || []).find(item =>
          item.type === "QUICK_MESSAGE" &&
          item.order_id === order.id &&
          !item.read_at &&
          !seenNotificationIdsRef.current.has(item.id)
        );
        if (match && !cancelled) {
          seenNotificationIdsRef.current.add(match.id);
          setIncomingMessage({ id: match.id, body: match.body });
          markNotificationRead(match.id).catch(() => {});
        }
      } catch {
        // Transient poll failure — next tick retries, no need to surface it.
      }
    }
    poll();
    const interval = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [order?.id]);

  useEffect(() => {
    if (!incomingMessage) return undefined;
    const timer = window.setTimeout(() => setIncomingMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [incomingMessage]);

  useEffect(() => {
    if (section === "favorites" && authenticated) loadFavorites();
  }, [section, authenticated]);

  function selectSection(next) {
    if (next === "driver") {
      window.location.href = "/driver";
      return;
    }
    setSection(next);
    setDrawerOpen(false);
  }

  function authMessage(error) {
    const code = error?.code || "";
    const map = {
      INVALID_PHONE: "Введите корректный номер телефона",
      INVALID_CREDENTIALS: "Неверный телефон или пароль",
      USER_ALREADY_EXISTS: "Этот номер уже зарегистрирован",
      SMS_CODE_EXPIRED: "Код истёк. Получите новый SMS-код",
      INVALID_SMS_CODE: "Неверный SMS-код",
      SMS_CODE_ATTEMPTS_EXCEEDED: "Слишком много попыток. Получите новый код",
      SMS_VERIFICATION_EXPIRED: "Подтверждение истекло. Получите новый код",
      USER_NOT_FOUND: "Аккаунт с таким номером не найден"
    };
    return map[code] || "Не удалось выполнить действие. Проверьте соединение и попробуйте снова.";
  }

  async function submitAuthPhone(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const phone = normalizeKzPhone(auth.phone);
      const phoneState = await checkAuthPhone(phone);
      if (!phoneState.exists) {
        const data = await sendAuthSms(phoneState.phone || phone, "REGISTER");
        setRegisterForm(current => ({
          ...current,
          phone: data.phone || phoneState.phone || phone,
          smsSent: true,
          devCode: data.devCode || "",
          verificationToken: ""
        }));
        setAuthMode("registerCode");
        setMessage(import.meta.env.DEV && data.devCode ? `Код отправлен. Для локального теста: ${data.devCode}` : "Код подтверждения отправлен по SMS");
        return;
      }
      setAuth(current => ({ ...current, phone: phoneState.phone || current.phone }));
      setAuthMode("password");
      setMessage("");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const payload = await loginUser({ phone: normalizeKzPhone(auth.phone), password: auth.password });
      const user = payload.user || {};
      setAuthenticated(true);
      setRider({
        name: [user.name, user.surname].filter(Boolean).join(" ") || user.login || "Пассажир",
        phone: user.phone || auth.phone
      });
      setMessage("");
      setSection("home");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function sendRegistrationSms() {
    setLoading(true);
    setMessage("");
    try {
      const data = await sendAuthSms(normalizeKzPhone(registerForm.phone || auth.phone), "REGISTER");
      setRegisterForm(current => ({
        ...current,
        phone: data.phone || current.phone,
        smsSent: true,
        verificationToken: "",
        devCode: data.devCode || ""
      }));
      setMessage(import.meta.env.DEV && data.devCode ? `Код отправлен. Для локального теста: ${data.devCode}` : "Код подтверждения отправлен по SMS");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function verifyRegistrationSms(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (!registerForm.smsSent || !registerForm.code.trim()) {
        setMessage("Введите SMS-код");
        return;
      }
      const verified = await verifyAuthSms({
        phone: normalizeKzPhone(registerForm.phone),
        code: registerForm.code.trim(),
        purpose: "REGISTER"
      });
      setRegisterForm(current => ({ ...current, verificationToken: verified.verificationToken || "" }));
      setAuthMode("createPassword");
      setMessage("");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (registerForm.name.trim().length < 2) {
        setMessage("Введите имя");
        return;
      }
      if (registerForm.password.length < 6) {
        setMessage("Пароль должен быть не короче 6 символов");
        return;
      }
      if (registerForm.password !== registerForm.repeat) {
        setMessage("Пароли не совпадают");
        return;
      }
      const payload = await registerUser({
        name: registerForm.name.trim(),
        phone: normalizeKzPhone(registerForm.phone),
        verificationToken: registerForm.verificationToken,
        password: registerForm.password
      });
      const user = payload.user || {};
      setAuthenticated(true);
      setRider({
        name: user.name || registerForm.name || "Пассажир",
        phone: user.phone || registerForm.phone
      });
      setAuth({ phone: user.phone || registerForm.phone, password: "" });
      setAuthMode("success");
      setRegisterForm({ name: "", phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
      setMessage("Аккаунт создан");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function sendResetSms(event) {
    event?.preventDefault?.();
    setLoading(true);
    setMessage("");
    try {
      const data = await requestPasswordReset(normalizeKzPhone(resetForm.phone || auth.phone));
      setResetForm(current => ({
        ...current,
        phone: data.phone || current.phone || auth.phone,
        smsSent: true,
        verificationToken: "",
        devCode: data.devCode || ""
      }));
      setAuthMode("resetCode");
      setMessage(import.meta.env.DEV && data.devCode ? `Код отправлен. Для локального теста: ${data.devCode}` : "Код для восстановления отправлен по SMS");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function verifyResetSms(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (!resetForm.code.trim()) {
        setMessage("Введите SMS-код");
        return;
      }
      const verified = await verifyAuthSms({
        phone: normalizeKzPhone(resetForm.phone),
        code: resetForm.code.trim(),
        purpose: "RESET_PASSWORD"
      });
      setResetForm(current => ({ ...current, verificationToken: verified.verificationToken || "" }));
      setAuthMode("newPassword");
      setMessage("");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitResetPassword(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (resetForm.password.length < 6) {
        setMessage("Пароль должен быть не короче 6 символов");
        return;
      }
      if (resetForm.password !== resetForm.repeat) {
        setMessage("Пароли не совпадают");
        return;
      }
      const payload = await confirmPasswordReset({
        phone: normalizeKzPhone(resetForm.phone),
        verificationToken: resetForm.verificationToken,
        password: resetForm.password
      });
      const user = payload.user || {};
      setAuthenticated(true);
      setRider({
        name: [user.name, user.surname].filter(Boolean).join(" ") || user.login || "Пассажир",
        phone: user.phone || resetForm.phone
      });
      setAuth({ phone: user.phone || resetForm.phone, password: "" });
      setResetForm({ phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
      setAuthMode("success");
      setMessage("Пароль изменён");
    } catch (error) {
      setMessage(authMessage(error));
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
      if (regions.length && !matched) {
        setMessage("Мы пока не работаем по этому адресу. Выберите точку в зоне обслуживания.");
        return;
      }
      if (matched) setSelectedRegionId(matched.id);
      try {
        const data = await reverseAddress(point);
        const address = normalizeAddress(data.address);
        if (!address) throw new Error("address_not_resolved");
        setPickup({ ...address, markerKind: "current-location" });
        setMessage("Местоположение выбрано");
      } catch {
        setMessage("Не удалось определить адрес. Выберите ближайший дом или объект на карте.");
      }
    }, () => {
      setMessage("Разрешите доступ к геолокации или выберите адрес вручную");
    }, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    });
  }

  async function updateMainMapCandidate(point) {
    if (!Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lng)) || destination) return;
    if (mainMapSkipInitialCenterRef.current) {
      mainMapSkipInitialCenterRef.current = false;
      // The initial camera is not a user gesture, but it is still the one
      // place where the rider needs a truthful address before ordering. Let
      // the single debounced resolver below handle it; MapView deduplicates
      // the paired moveend/zoomend events, so this is never a request storm.
    }
    const candidatePoint = { lat: Number(point.lat), lng: Number(point.lng) };
    // Every new camera position invalidates the previous reverse lookup,
    // including cached points and points outside the operating region.
    const seq = ++mainMapReverseSeqRef.current;
    window.clearTimeout(mainMapReverseDebounceRef.current);
    if (!pointInRegion(candidatePoint, selectedRegion)) {
      setMainMapCandidate({
        title: "Точка вне зоны обслуживания",
        subtitle: `Выберите точку в зоне «${selectedRegionName}»`,
        ...candidatePoint
      });
      setMainMapCandidateReady(false);
      setMainMapPickLoading(false);
      setMessage("Эта точка находится за пределами зоны обслуживания.");
      return;
    }
    const fallback = pendingMapAddress(candidatePoint, selectedRegionName);
    const cacheKey = mapAddressCacheKey(candidatePoint);
    const cached = cacheKey ? mainMapReverseCacheRef.current.get(cacheKey) : null;
    if (cached) {
      setMainMapCandidate(cached);
      setMainMapCandidateReady(true);
      setMainMapPickLoading(false);
      return;
    }
    setMainMapCandidate(fallback);
    setMainMapCandidateReady(false);
    setMainMapPickLoading(true);
    window.clearTimeout(mainMapReverseDebounceRef.current);
    mainMapReverseDebounceRef.current = window.setTimeout(async () => {
      try {
        const data = await Promise.race([
          reverseAddress(point),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("reverse_timeout")), 5000))
        ]);
        const address = normalizeAddress(data.address);
        if (!address) throw new Error("address_not_resolved");
        if (seq === mainMapReverseSeqRef.current) {
          if (cacheKey) mainMapReverseCacheRef.current.set(cacheKey, address);
          setMainMapCandidate(address);
          setMainMapCandidateReady(true);
        }
      } catch {
        if (seq === mainMapReverseSeqRef.current) {
          setMainMapCandidate({ ...fallback, title: "Адрес не найден", subtitle: "Передвиньте карту к ближайшему дому или объекту" });
          setMainMapCandidateReady(false);
        }
      } finally {
        if (seq === mainMapReverseSeqRef.current) {
          setMainMapPickLoading(false);
        }
      }
    }, 260);
  }

  function markMainMapMoving() {
    if (destination || pickup) return;
    if (mainMapSkipInitialCenterRef.current) return;
    ++mainMapReverseSeqRef.current;
    window.clearTimeout(mainMapReverseDebounceRef.current);
    setMainMapCandidateReady(false);
    setMainMapPickLoading(true);
    setMessage("");
  }

  function commitMainMapPickup() {
    if (!pickup && (!mainMapCandidateReady || mainMapPickLoading)) {
      setMessage("Подождите, определяем точку на карте");
      return false;
    }
    if (!pickup && mainMapCandidate?.lat && mainMapCandidate?.lng) {
      setPickup(mainMapCandidate);
    }
    return true;
  }

  function openDestinationFromMain() {
    if (!commitMainMapPickup()) return;
    setAddressMode("destination");
  }

  async function loadFavorites() {
    setFavoritesState({ loading: true, error: "" });
    try {
      const data = await getFavoriteAddresses();
      setFavorites(data.favorites || data.addresses || []);
      setFavoritesState({ loading: false, error: "" });
    } catch (error) {
      setFavoritesState({ loading: false, error: formatError(error) });
    }
  }

  async function saveFavoriteAddress(address) {
    setFavoritesState(current => ({ ...current, error: "" }));
    try {
      await addFavoriteAddress({
        label: "OTHER",
        title: address.title || "Новый адрес",
        addressText: address.subtitle || address.title || "",
        lat: address.lat,
        lng: address.lng
      });
      await loadFavorites();
    } catch (error) {
      setFavoritesState({ loading: false, error: formatError(error) });
    }
  }

  async function deleteFavorite(favoriteId) {
    // deletingId guards against a fast double-click firing two deletes for
    // the same row before the list reloads and the button unmounts — the
    // button itself was never disabled while the request was in flight.
    if (favoritesState.deletingId) return;
    setFavoritesState(current => ({ ...current, error: "", deletingId: favoriteId }));
    try {
      await deleteFavoriteAddress(favoriteId);
      await loadFavorites();
    } catch (error) {
      setFavoritesState(current => ({ ...current, error: formatError(error) }));
    } finally {
      setFavoritesState(current => ({ ...current, deletingId: null }));
    }
  }

  function canUseDestination(address) {
    const destinationRegion = regionForAddress(address, regions);
    if (!destinationRegion) {
      setMessage("Этот адрес находится вне активных регионов SmartTaxi.");
      return false;
    }
    const destinationRegionId = backendRegionIdFor(regions, destinationRegion.id, destinationRegion);
    if (destinationRegionId === backendRegionId) return true;
    const route = intercityRoutes.find(item => item.destinationRegionId === destinationRegionId && item.isActive);
    if (route) return true;
    setMessage(intercityLoading
      ? "Проверяем доступность межгорода. Повторите через секунду."
      : `Межгород из «${selectedRegionName}» в «${destinationRegion.name}» пока недоступен.`);
    return false;
  }

  function chooseAddress(address) {
    const next = normalizeAddress(address);
    if (!next) return;
    if (addressMode === "pickup") {
      if (!isAddressInServiceRegion(next, selectedRegion)) {
        setMessage("Этот адрес находится за пределами выбранного региона. Выберите другую точку.");
        return;
      }
      setPickup(next);
    }
    if (addressMode === "destination") {
      if (!canUseDestination(next)) return;
      if (!pickup) {
        const center = regionCenter(selectedRegion) || regionCenter(fallbackRegion);
        if (center) setPickup({ title: "Моё местоположение", subtitle: selectedRegionName, ...center });
      }
      setDestination(next);
    }
    if (addressMode === "favorite") saveFavoriteAddress(next);
    setAddressMode("");
  }

  function selectServiceRegion(nextRegion) {
    if (!nextRegion?.id || nextRegion.id === selectedRegionId) {
      setSection("home");
      return;
    }
    const activeStatuses = [
      "SEARCHING_DRIVER", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT",
      "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "TRIP_COMPLETED", "PAYMENT_PENDING"
    ];
    if (order && activeStatuses.includes(publicStatus(order.public_status || order.status))) {
      setMessage("Регион нельзя изменить, пока есть активная поездка.");
      setSection("trips");
      return;
    }
    setSelectedRegionId(nextRegion.id);
    setPickup(null);
    setDestination(null);
    setRoute(null);
    setRouteError("");
    setTariff(null);
    setTariffEstimates({});
    setOfferedPriceKzt(null);
    setAddressMode("");
    setSection("home");
  }

  async function submitOrder() {
    if (loading) return;
    if (!authenticated || !getToken()) {
      setSection("profile");
      setMessage(errorMessages.UNAUTHORIZED);
      return;
    }
    const isCurrent = sessionGuard(getToken(), getToken, () => mountedRef.current);
    if (!pickup || !destination || !tariff || !route || !estimate) return;
    if (isSameTripPoint(pickup, destination)) {
      setRouteError(sameTripPointMessage);
      return;
    }
    const distanceKm = distanceKmFromRoute(route);
    const durationMin = durationMinFromRoute(route);
    if (!distanceKm || !durationMin) {
      setRouteError("Маршрут временно недоступен");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const orderPayload = {
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: destination.lat,
        dropoffLng: destination.lng,
        tariff: tariff.name || "Economy",
        distanceKm,
        durationMin,
        riderName: rider.name || "Пассажир",
        riderPhone: rider.phone || auth.phone,
        pickupText: pickup.title,
        dropoffText: destination.title,
        paymentMethod: payment.id,
        notes: ""
      };
      const estimatedPrice = Math.round(Number(estimate.estimatedPrice || 0));
      if (offeredPriceKzt && offeredPriceKzt !== estimatedPrice) {
        orderPayload.offeredPriceKzt = offeredPriceKzt;
      }
      if (!tariff.isLocal) orderPayload.tariffId = tariff.id;
      const active = await getClientActiveOrder();
      if (!isCurrent()) return;
      if (active.order) {
        setOrder(normalizeOrder(active.order));
        setSection("trips");
        setMessage("Открыли ваш активный заказ");
        return;
      }
      const data = await createOrder(orderPayload);
      if (!isCurrent()) return;
      setOrder(normalizeOrder(data.order));
      setSection("trips");
    } catch (error) {
      if (!isCurrent()) return;
      if (error?.code === "CLIENT_HAS_ACTIVE_ORDER" && error?.details?.orderId) {
        try {
          const active = await getOrderStatusHistory(error.details.orderId);
          if (!isCurrent()) return;
          setOrder(normalizeOrder(active.order));
          setSection("trips");
          setMessage("Открыли ваш активный заказ");
          return;
        } catch {
          if (isCurrent()) setMessage(errorMessages.CLIENT_HAS_ACTIVE_ORDER);
          return;
        }
      }
      setMessage(formatError(error));
    } finally {
      if (isCurrent()) setLoading(false);
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

  function startNewTrip() {
    setOrder(null);
    setDestination(null);
    setRoute(null);
    setRouteError("");
    setMessage("");
    setSection("home");
  }

  function logout() {
    clearToken();
    setLoading(false);
    setAuthenticated(false);
    setRider({ name: "Пассажир", phone: "" });
    setAuth({ phone: "", password: "" });
    setRegisterForm({ name: "", phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
    setResetForm({ phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
    setAuthMode("phone");
    setSection("profile");
    setDrawerOpen(false);
  }

  // Fires the instant any request comes back 401/SESSION_SUPERSEDED --
  // another device logged into this account and the backend invalidated
  // every token issued before that (see common/auth.js). Without this the
  // rider stays stuck on a stale screen silently failing every request
  // instead of being dropped back to the login screen.
  useEffect(() => {
    window.addEventListener("smarttaxi:session-expired", logout);
    return () => window.removeEventListener("smarttaxi:session-expired", logout);
  }, []);

  return (
    <PhoneFrame className="taxi-pwa passenger-pwa taxi-client-shell">
      {incomingMessage && (
        <div className="quick-message-toast" role="status" onClick={() => setIncomingMessage(null)}>
          <Icon name="chat" size={18} />
          <span>{incomingMessage.body}</span>
        </div>
      )}
      {!addressMode && !authScreenActive && (
        <>
          <ClientHeader
            routeReady={section === "home" && Boolean(pickup && destination)}
            addressSelectionMode={section === "home" && !destination}
            route={route}
            onMenu={() => setDrawerOpen(true)}
            onBell={() => setSection("support")}
            onBackRoute={() => {
              setDestination(null);
              setRoute(null);
              setRouteError("");
            }}
          />
          <ClientDrawer
            open={drawerOpen}
            active={section}
            rider={rider}
            authenticated={authenticated}
            onClose={() => setDrawerOpen(false)}
            onSelect={selectSection}
            onLogout={logout}
          />
        </>
      )}
      {addressMode ? (
        <AddressPicker
          mode={addressMode}
          region={selectedRegion}
          destinationRegions={intercityDestinationRegions}
          onBack={() => setAddressMode("")}
          onSelect={chooseAddress}
        />
      ) : (
        <main className="app-content passenger-content taxi-home-layout">
          {order && !["home", "trips"].includes(section) && [
            "SEARCHING_DRIVER", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED"
          ].includes(publicStatus(order.public_status || order.status)) && (
            <ActiveOrderBanner order={order} onClick={() => setSection("trips")} />
          )}
          {section === "home" && (
            <ReferenceHomeSection
              pickup={pickup}
              destination={destination}
              route={route}
              routeLoading={routeLoading}
              routeError={routeError}
              mapCenter={mapCenter}
              mainMapCandidate={mainMapCandidate}
              mainMapPickLoading={mainMapPickLoading}
              mainMapCandidateReady={mainMapCandidateReady}
              selectedRegion={selectedRegion}
              selectedRegionName={selectedRegionName}
              onUseLocation={useCurrentLocation}
              onPickup={() => setAddressMode("pickup")}
              onDestination={openDestinationFromMain}
              onMapPick={updateMainMapCandidate}
              onMapMoving={markMainMapMoving}
              onClearDestination={() => {
                setDestination(null);
                setRoute(null);
                setRouteError("");
              }}
              onSelectDestination={place => {
                const next = normalizeAddress(place);
                if (!next) return;
                if (!canUseDestination(next)) return;
                if (!pickup) {
                  const center = regionCenter(selectedRegion) || regionCenter(fallbackRegion);
                  setPickup({ title: "Моё местоположение", subtitle: selectedRegionName, ...center });
                }
                setDestination(next);
              }}
              onMenu={() => setDrawerOpen(true)}
              onBell={() => setSection("support")}
               onNavigate={setSection}
               activeSection={section}
               tariffs={tariffs}
              tariff={tariff}
              setTariff={setTariff}
              tariffsLoading={tariffsLoading}
              tariffsError={tariffsError}
              payment={payment}
              setPayment={setPayment}
               estimate={estimate}
              tariffEstimates={tariffEstimates}
              offeredPriceKzt={offeredPriceKzt}
              setOfferedPriceKzt={setOfferedPriceKzt}
              loading={loading}
              canCreate={canCreate}
              authenticated={authenticated}
              message={message}
              onSubmit={submitOrder}
            />
          )}
          {section === "trips" && <TripsSection authenticated={authenticated} order={order} pickup={pickup} destination={destination} route={route} liveRoute={liveRoute} estimate={estimate} loading={loading} onCancel={cancelOrder} onHome={startNewTrip} onSupport={() => setSection("support")} onOrderUpdate={next => setOrder(normalizeOrder(next))} />}
          {section === "profile" && <ProfileSection authenticated={authenticated} rider={rider} setRider={setRider} auth={auth} setAuth={setAuth} authMode={authMode} setAuthMode={setAuthMode} registerForm={registerForm} setRegisterForm={setRegisterForm} resetForm={resetForm} setResetForm={setResetForm} message={message} setMessage={setMessage} loading={loading} onPhoneSubmit={submitAuthPhone} onPasswordSubmit={submitPasswordLogin} onRegisterCodeSubmit={verifyRegistrationSms} onRegister={submitRegister} onSendSms={sendRegistrationSms} onResetRequest={sendResetSms} onResetCodeSubmit={verifyResetSms} onResetPassword={submitResetPassword} onLogout={logout} onAuthDone={() => { setAuthMode("phone"); setSection("home"); }} />}
          {section === "favorites" && (
            <FavoritesSection
              onHome={() => setSection("home")}
              authenticated={authenticated}
              favorites={favorites}
              favoritesState={favoritesState}
              onPickOnMap={() => setAddressMode("favorite")}
              onDelete={deleteFavorite}
              onLogin={() => setSection("profile")}
            />
          )}
          {section === "regions" && <RegionSection regions={regions} selectedRegionId={selectedRegion?.id || selectedRegionId} onSelect={selectServiceRegion} onHome={() => setSection("home")} />}
          {section === "notifications" && <NotificationsSection authenticated={authenticated} />}
          {section === "recurring" && <RecurringBookingsSection authenticated={authenticated} />}
          {section === "drivers" && <DriverPreferencesSection authenticated={authenticated} />}
          {section === "wallet" && <WalletSection authenticated={authenticated} />}
          {section === "promo" && <PromoSection regionId={backendRegionId || selectedRegionId} authenticated={authenticated} />}
          {section === "support" && <SupportSection activeOrderId={order?.id} authenticated={authenticated} />}
          {section === "driverApplication" && <DriverApplicationSection authenticated={authenticated} rider={rider} onLogin={() => setSection("profile")} />}
          {section === "referral" && <ReferralSection authenticated={authenticated} />}
          {section === "faq" && <FaqSection />}
          {section === "about" && <AboutSection />}
          {section === "settings" && <SettingsSection onLogout={logout} />}
          {section === "legalTerms" && <LegalSection type="terms" />}
          {section === "legalPrivacy" && <LegalSection type="privacy" />}
          {section === "legalInfo" && <LegalSection type="info" />}
          {section === "legalPayment" && <LegalSection type="payment" />}
          {section === "legalCancellation" && <LegalSection type="cancellation" />}
          {section === "legalSafety" && <LegalSection type="safety" />}
        </main>
      )}
    </PhoneFrame>
  );
}

function ClientHeader({ routeReady = false, addressSelectionMode = false, route, onMenu, onBell, onBackRoute }) {
  if (routeReady) {
    // The map-first tariff view owns its own top bar. Rendering the generic
    // application header as well created two stacked "Выбор тарифа" headers
    // and stole valuable map space on a phone.
    return null;
  }
  if (addressSelectionMode) {
    return null;
  }
  return (
    <header className="taxi-app-header premium-client-header reference-client-header address-mode">
      <button type="button" className="client-icon-button" onClick={onMenu} aria-label="Открыть меню">
        <IconAsset name="menu" />
      </button>
      <div className="reference-brand-chip" aria-label="SmartTaxi">
        <span>SmartTaxi</span>
      </div>
      <button type="button" className="client-icon-button notification" onClick={onBell} aria-label="Уведомления">
        <Icon name="bell" size={20} />
        <i />
      </button>
    </header>
  );
}

function ActiveOrderBanner({ order, onClick }) {
  const status = publicStatus(order.public_status || order.status);
  const title = status === "SEARCHING_DRIVER" ? "Ищем водителя" : "У вас активная поездка";
  const subtitle = order.pickup_text || order.pickupText || "Откройте статус, чтобы увидеть детали";
  return (
    <button type="button" className="active-order-banner" onClick={onClick}>
      <span><Icon name="car" size={19} /></span>
      <strong>{title}<small>{subtitle}</small></strong>
      <Icon name="chevron" size={19} />
    </button>
  );
}

function ClientDrawer({ open, active, rider, authenticated, onClose, onSelect, onLogout }) {
  const title = authenticated ? formatKzPhoneDisplay(rider.phone) : "Войти в аккаунт";
  const subtitle = authenticated ? rider.name || "Пассажир" : "или зарегистрироваться";

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div className={`client-drawer-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`client-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="client-drawer-brand-row">
          <div className="client-drawer-brand-lockup" aria-label="SmartTaxi">
            <span className="client-drawer-mark" aria-hidden="true">S</span>
            <span>
              <strong>Smart<span>Taxi</span></strong>
              <small>Ваш комфорт</small>
            </span>
          </div>
          <button type="button" className="client-drawer-close" onClick={onClose} aria-label="Закрыть меню">
            <Icon name="close" size={24} />
          </button>
        </div>
        <button type="button" className="client-drawer-account-row" onClick={() => onSelect("profile")}>
          <span className="client-drawer-account-avatar"><Icon name="user" size={21} /></span>
          <span className="client-drawer-account-copy">
            <small>{authenticated ? "Ваш профиль" : "SmartTaxi ID"}</small>
            <strong>{title}</strong>
            <em>{subtitle}</em>
          </span>
          <Icon name="chevron" size={22} />
        </button>
        <nav className="client-drawer-nav" aria-label="Меню клиента">
          {drawerMenuGroups.map((group, groupIndex) => (
            <div className="client-drawer-group" key={groupIndex}>
              <p className="client-drawer-group-title">{group.title}</p>
              {group.items.map(({ key, label, icon, hint }) => (
                <button type="button" key={key} className={active === key ? "active" : ""} onClick={() => onSelect(key)}>
                  <span className="drawer-menu-icon"><Icon name={icon} size={25} /></span>
                  <span className="drawer-menu-copy">
                    <b>{label}</b>
                    {hint && <small>{hint}</small>}
                  </span>
                  <Icon name="chevron" size={19} />
                </button>
              ))}
            </div>
          ))}
        </nav>
        {authenticated ? (
          <button type="button" className="drawer-logout" onClick={onLogout}>
            <span className="drawer-menu-icon"><Icon name="logout" size={25} /></span>
            <span className="drawer-menu-copy"><b>Выйти из аккаунта</b><small>Завершить сессию</small></span>
            <Icon name="chevron" size={19} />
          </button>
        ) : null}
      </aside>
    </>
  );
}

function ReferenceHomeSection(props) {
  const {
    pickup,
    destination,
    route,
    routeLoading,
    routeError,
    mapCenter,
    mainMapCandidate,
    mainMapPickLoading,
    mainMapCandidateReady,
    selectedRegion,
    selectedRegionName,
    onUseLocation,
    onPickup,
    onDestination,
    onSelectDestination,
    onMapPick,
    onMapMoving,
    onClearDestination,
    onMenu,
    onBell,
    onNavigate,
    tariffs,
    tariff,
    setTariff,
    tariffsLoading,
    tariffsError,
    payment,
    setPayment,
    estimate,
    tariffEstimates,
    offeredPriceKzt,
  setOfferedPriceKzt,
    loading,
    message,
    onSubmit
  } = props;

  const routeReady = Boolean(pickup && destination);
  const actionReady = Boolean(routeReady && tariff && route && estimate && !routeError);
  const rows = referenceTariffRows(tariffs, tariff, estimate, route, tariffEstimates);
  const hasAvailableTariffs = rows.some(row => !row.disabled);
  const selectedRow = rows.find(row => row.selected) || rows.find(row => row.apiTariff) || rows[0];
  const estimatedPrice = Math.round(Number(selectedRow?.priceKzt || estimate?.estimatedPrice || 0));
  const totalPrice = offeredPriceKzt || estimatedPrice || null;
  const offeredPriceBounds = offeredPriceBoundsKzt(estimatedPrice);
  const priceWasAdjusted = Boolean(totalPrice && estimatedPrice && totalPrice !== estimatedPrice);
  const activePickup = pickup || mainMapCandidate;
  const markerAddressTitle = activePickup?.title || "Моё местоположение";
  const destinationDisabled = !pickup && (mainMapPickLoading || !mainMapCandidateReady);
  const needsManualPickup = !pickup && !mainMapPickLoading && (!mainMapCandidateReady || !mainMapCandidate);
  const primaryActionLabel = !pickup && mainMapPickLoading
    ? "Определяем адрес"
    : needsManualPickup
      ? "Выбрать адрес подачи"
      : "Выбрать пункт назначения";
  const recentPlaces = popularAddressesForRegion(selectedRegion, 6)
    .filter(place => !normalizeText(place.title).includes("местоположение"))
    .slice(0, 3);
  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false);

  function changeOfferedPrice(direction) {
    if (!totalPrice) return;
    const { minAllowed, maxAllowed } = offeredPriceBounds;
    const next = Math.min(
      maxAllowed,
      Math.max(minAllowed, totalPrice + direction * PRICE_STEP_KZT)
    );
    setOfferedPriceKzt(next);
  }

  if (routeReady) {
    return (
      <section className="client-reference-screen reference-tariff-state tariff-v12-state tariff-v14-state">
        <div className="tariff-v14-map">
          <MapView
            pickup={pickup}
            destination={destination}
            route={route}
            center={pickup || mapCenter || regionCenter(selectedRegion)}
            compact
          />
        </div>
        <div className="tariff-v14-map-scrim" aria-hidden="true" />
        <header className="tariff-v14-topbar">
          <button type="button" onClick={onClearDestination} aria-label="Назад"><Icon name="back" size={24} /></button>
          <span>{formatTripMin(route, "—")} · {distanceKmFromRoute(route) ? `${distanceKmFromRoute(route)} км` : "маршрут"}</span>
        </header>
        <section className="tariff-v12-sheet tariff-v14-sheet">
          <div className="tariff-v14-grip" aria-hidden="true" />
          <ReferenceRouteCard pickup={pickup} destination={destination} onEdit={onDestination} />
          <header className="tariff-v14-section-title">
            <div>
              <h1>Выберите тариф</h1>
              {estimate?.isIntercity && (
                <span className="tariff-v14-intercity-pill">
                  Межгород · {estimate?.destinationRegion?.name || "другой регион"}
                </span>
              )}
            </div>
            <span>Фикс. цена</span>
          </header>
          {routeError && <p className="reference-state-error">{routeError}</p>}
          {tariffsError && <p className="reference-state-hint">{tariffsError}</p>}
          {tariffsLoading && !rows.length ? (
            <div className="reference-tariff-skeleton"><span /><span /><span /></div>
          ) : (
            <ReferenceTariffList
              rows={rows}
              setTariff={setTariff}
              route={route}
              offeredPriceKzt={totalPrice}
              minOfferedPriceKzt={offeredPriceBounds.minAllowed}
              maxOfferedPriceKzt={offeredPriceBounds.maxAllowed}
              onPriceChange={changeOfferedPrice}
            />
          )}
          <ReferencePaymentRow payment={payment} onOpen={() => setPaymentPickerOpen(true)} />
          {paymentPickerOpen && (
            <ReferencePaymentPicker
              payment={payment}
              onClose={() => setPaymentPickerOpen(false)}
              onSelect={nextPayment => {
                setPayment(nextPayment);
                setPaymentPickerOpen(false);
              }}
            />
          )}
          {message && <p className={message.includes("Вход") || message.includes("выбра") ? "reference-note success" : "reference-note"}>{message}</p>}
          <button type="button" className="tariff-v12-order" disabled={loading || routeLoading || !actionReady || !hasAvailableTariffs} onClick={onSubmit}>
            <span>{hasAvailableTariffs ? "Заказать за" : "Тарифы недоступны"}</span>
            <b>{totalPrice ? <Money value={totalPrice} /> : hasAvailableTariffs ? "Расчёт" : "API"}</b>
            <Icon name="chevron" size={24} />
          </button>
        </section>
      </section>
    );
  }

  return (
    <section className="client-reference-screen final10-exact-state final10-standard-home">
      <div className="final10-glow-a" aria-hidden="true" />
      <div className="final10-glow-b" aria-hidden="true" />
      <div className="final10-glow-c" aria-hidden="true" />

      <div className="final10-map-wrap">
        <MapView
          pickup={null}
          destination={destination}
          route={route}
          center={pickup || mapCenter || regionCenter(selectedRegion)}
          compact
          addressControls
          centerMarker
          onMapPick={onMapPick}
          onCenterChange={onMapPick}
          onCenterChanging={onMapMoving}
        />
        <div className="final10-map-fade-top" />
        <div className="final10-map-fade-bottom" />
      </div>

      <div className="final10-top-controls">
        <button type="button" className="final10-icon-btn tappable" onClick={onMenu} aria-label="Открыть меню">
          <svg width="19" height="19" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 9H26M6 16H26M6 23H26" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        </button>
      </div>

      <button type="button" className="final10-locate-btn tappable" onClick={onUseLocation} aria-label="Моё местоположение">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2L19.5 20.5C19.7 21 19.1 21.4 18.7 21.1L12 17L5.3 21.1C4.9 21.4 4.3 21 4.5 20.5L12 2Z" fill="currentColor" />
        </svg>
      </button>

      <section className="final10-panel" aria-label="Выбор адреса">
        <div className="final10-grabber" aria-hidden="true" />
        <header className="final10-sheet-heading">
          <small>Здравствуйте!</small>
          <h1>Куда едем?</h1>
        </header>
        <div className="final10-addr-group">
          <button type="button" className="final10-addr-row tappable tap-soft" onClick={onPickup}>
            <span className="final10-marker-col"><span className="final10-dot-from" /></span>
            <span className="final10-txt">
              <small>Откуда</small>
              <strong>{markerAddressTitle}</strong>
            </span>
            <Icon name="chevron" size={17} />
          </button>
          <span className="final10-connector-row" aria-hidden="true"><i /></span>
          <button type="button" className="final10-addr-row tappable tap-soft" onClick={onDestination} disabled={destinationDisabled}>
            <span className="final10-marker-col"><span className="final10-dot-to" /></span>
            <span className="final10-txt">
              <small>Куда</small>
              <strong className="placeholder">Введите адрес</strong>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        </div>

        <div className="final10-quick-row" aria-label="Быстрый выбор адреса">
          <button type="button" className="final10-chip tappable tap-soft" onClick={onDestination}>
            <Icon name="home" size={16} />
            <span>Дом</span>
          </button>
          <button type="button" className="final10-chip tappable tap-soft" onClick={onDestination}>
            <Icon name="work" size={16} />
            <span>Работа</span>
          </button>
          <button type="button" className="final10-chip tappable tap-soft" onClick={() => onNavigate?.("favorites")}>
            <Icon name="heart" size={16} />
            <span>Избранное</span>
          </button>
        </div>

        {needsManualPickup && mainMapCandidate?.subtitle && (
          <p className="final10-address-guidance" role="status">{mainMapCandidate.subtitle}</p>
        )}
        {routeLoading && <p className="final10-note">Определяем адрес и маршрут...</p>}
        {routeError && <p className="final10-note danger">{routeError}</p>}
        {message && <p className="final10-note">{message}</p>}

        <button type="button" className="final10-cta tappable tap-soft" onClick={needsManualPickup ? onPickup : onDestination} disabled={!pickup && mainMapPickLoading}>
          <span>{primaryActionLabel}</span>
          <b><Icon name="chevron" size={18} /></b>
        </button>
      </section>
    </section>
  );
}

function ReferenceRouteCard({ pickup, destination, onEdit }) {
  return (
    <section className="tariff-v14-route-card" aria-label="Маршрут поездки">
      <div className="tariff-v14-route-copy">
        <span className="tariff-v14-route-row pickup">
          <i aria-hidden="true" />
          <b>Откуда</b>
          <strong>{pickup?.title || "Точка подачи"}</strong>
        </span>
        <span className="tariff-v14-route-line" aria-hidden="true" />
        <span className="tariff-v14-route-row destination">
          <i aria-hidden="true" />
          <b>Куда</b>
          <strong>{destination?.title || "Пункт назначения"}</strong>
        </span>
      </div>
      <button type="button" onClick={onEdit}>Изменить</button>
    </section>
  );
}

function ReferenceTariffList({ rows, setTariff, route, offeredPriceKzt, minOfferedPriceKzt, maxOfferedPriceKzt, onPriceChange }) {
  // Passenger mobile deliberately presents the two product tariffs that are
  // currently bookable in its compact order flow: Economy and Delivery.
  // Keep the web counterpart on the same contract instead of surfacing extra
  // database tariffs that the app cannot select.
  const mobileTariffKeys = new Set(["Economy", "Delivery"]);
  const visibleRows = rows.filter(row => (
    row.apiTariff && !row.disabled && mobileTariffKeys.has(row.key)
  ));
  const selectedRow = visibleRows.find(row => row.selected) || visibleRows[0];
  if (!selectedRow) return null;
  return (
    <div className="tariff-v14-control">
      <div className="tariff-v14-grid" role="tablist" aria-label="Тарифы">
        {visibleRows.map(row => (
          <button
            type="button"
            key={row.key}
            role="tab"
            aria-selected={row.selected}
            className={`tariff-v14-card ${row.selected ? "selected" : ""}`}
            onClick={() => setTariff(row.apiTariff)}
          >
            <span className="tariff-v14-car"><img src={row.image} alt="" /></span>
            <span className="tariff-v14-card-copy">
              <b>{row.title}</b>
              <small>{row.key === "Delivery" ? "до 20 кг" : `${row.seats || 4} пассажира`}</small>
            </span>
            <span className="tariff-v14-card-fare">
              <strong>{row.priceKzt ? <Money value={row.priceKzt} /> : "Расчёт"}</strong>
              <small>{row.key === "Delivery" ? "доставка" : "за поездку"}</small>
            </span>
            <span className="tariff-v14-card-check" aria-hidden="true">{row.selected && <Icon name="check" size={13} />}</span>
          </button>
        ))}
      </div>
      <section className="tariff-v14-price" aria-label="Ваша цена">
        <span><small>Ваша цена</small><em>{route ? `${formatTripMin(route, "—")} в пути` : "маршрут"}</em></span>
        <div>
          <button type="button" aria-label="Уменьшить цену" disabled={!offeredPriceKzt || offeredPriceKzt <= minOfferedPriceKzt} onClick={() => onPriceChange(-1)}>−</button>
          <b>{offeredPriceKzt ? <Money value={offeredPriceKzt} /> : "Расчёт"}</b>
          <button type="button" aria-label="Увеличить цену" disabled={!offeredPriceKzt || offeredPriceKzt >= maxOfferedPriceKzt} onClick={() => onPriceChange(1)}>+</button>
        </div>
      </section>
    </div>
  );
  /* Legacy cards intentionally replaced by the compact tariff switch above.
  return (
    <div className="reference-tariff-list">
      {rows.map(row => (
        <button
          type="button"
          key={row.key}
          className={`reference-tariff-card ${row.selected ? "selected" : ""} ${row.disabled ? "disabled" : ""}`}
          onClick={() => row.apiTariff && setTariff(row.apiTariff)}
          disabled={row.disabled}
        >
          <span className="reference-car-thumb reference-tariff-car">
            <img src={row.image} alt={row.title} loading="lazy" className="reference-tariff-car-image" />
          </span>
          <span className="reference-tariff-copy">
            <span className="reference-tariff-title-row">
              <strong className="reference-tariff-title">{row.title}</strong>
              <span className="reference-tariff-meta inline">
                {row.seats ? (
                  <>
                    <IconAsset name="tariffPassenger" className="ui-asset-icon ui-asset-icon-xs" />
                    <small>{row.seats}</small>
                  </>
                ) : (
                  <>
                    <IconAsset name="tariffDelivery" className="ui-asset-icon ui-asset-icon-xs" />
                    <small>до 20 кг</small>
                  </>
                )}
              </span>
            </span>
            <span className="reference-tariff-meta">
              <small>Фиксированная цена</small>
            </span>
            <em>{row.subtitle}</em>
          </span>
          <span className="reference-tariff-actions">
            <span className="reference-tariff-price">
              {row.priceKzt ? <Money value={row.priceKzt} /> : "Расчёт"}
            </span>
            <span className="reference-tariff-radio" aria-hidden="true" />
          </span>
        </button>
        ))}
    </div>
  ); */
}

function ReferencePaymentRow({ payment, onOpen }) {
  const current = paymentOptions.find(option => option.id === payment?.id) || paymentOptions[0];
  const icon = current.id === "CARD" ? "card" : current.id === "CASHBACK" ? "gift" : "cash";
  return (
    <button type="button" className="reference-payment-row" onClick={onOpen} aria-haspopup="dialog">
      <span className="payment-icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="reference-payment-copy">
        <small>Способ оплаты</small>
        <strong>{current.title}</strong>
      </span>
      <span className="reference-payment-value">Изменить</span>
      <IconAsset name="tariffChevron" className="ui-asset-icon ui-asset-icon-sm" />
    </button>
  );
}

function ReferencePaymentPicker({ payment, onClose, onSelect }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector("button")?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        const buttons = [...dialog.querySelectorAll("button:not(:disabled)")];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    dialog?.addEventListener("keydown", onKeyDown);
    return () => {
      dialog?.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <div className="reference-payment-picker-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="reference-payment-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Способ оплаты"
        onClick={event => event.stopPropagation()}
      >
        <div className="reference-payment-picker-grip" aria-hidden="true" />
        <header>
          <div>
            <small>Поездка SmartTaxi</small>
            <h2>Как оплатить?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" size={20} /></button>
        </header>
        <div className="reference-payment-options">
          {paymentOptions.map(option => {
            const selected = option.id === payment?.id;
            const icon = option.id === "CARD" ? "card" : option.id === "CASHBACK" ? "gift" : "cash";
            return (
              <button
                type="button"
                key={option.id}
                className={selected ? "selected" : ""}
                aria-pressed={selected}
                onClick={() => onSelect(option)}
              >
                <span className="reference-payment-option-icon"><Icon name={icon} size={22} /></span>
                <span><b>{option.title}</b><small>{option.note}</small></span>
                <span className="reference-payment-option-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ReferenceBottomNav({ onNavigate, activeSection = "home" }) {
  const items = [
    { key: "home", icon: "home", title: "Главная", section: "home" },
    { key: "trips", icon: "clock", title: "Поездки", section: "trips" },
    { key: "favorite", icon: "favorite", title: "Избранное", section: "profile" },
    { key: "profile", icon: "user", title: "Профиль", section: "profile" }
  ];
  return (
    <nav className="reference-bottom-nav" aria-label="Навигация">
      {items.map(({ key, icon, title, section }) => (
        <button
          type="button"
          key={key}
          className={`reference-nav-item ${section === activeSection || (section === "profile" && activeSection === "favorite") ? "active" : ""}`}
          onClick={() => onNavigate(section)}
          aria-label={title}
        >
          <IconAsset name={icon} className="ui-asset-icon ui-asset-icon-sm" />
          <span className="reference-nav-label">{title}</span>
        </button>
      ))}
    </nav>
  );
}

function HomeSection(props) {
  const {
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

  const hasRouteError = Boolean(routeError);
  const showOrderOptions = Boolean(pickup && destination && !hasRouteError);
  const showOrderSheet = showOrderOptions || hasRouteError || Boolean(message);
  const sheetTitle = pickup && destination
    ? hasRouteError
      ? "Маршрут недоступен"
      : "Выберите тариф"
    : !pickup
      ? "Подача такси"
      : "Куда едем?";
  const sheetHelper = pickup && destination
    ? hasRouteError
      ? "Измените адрес назначения или выберите ближайшую точку на карте"
      : "Проверьте класс поездки, цену и оплату"
    : !pickup
      ? "Укажите место, где водитель должен вас забрать."
      : "Теперь выберите адрес назначения.";
  const ctaText = hasRouteError
    ? "Изменить адрес"
    : !pickup
    ? "Указать точку подачи"
    : !destination
      ? "Выбрать адрес назначения"
      : !authenticated
        ? "Войти и заказать"
        : !tariff
        ? "Выбрать тариф"
        : routeLoading
          ? "Считаем стоимость..."
          : estimate
            ? "Заказать"
            : "Рассчитать";

  const handleCta = () => {
    if (!pickup) {
      onPickup();
      return;
    }
    if (!destination) {
      onDestination();
      return;
    }
    if (hasRouteError) {
      onDestination();
      return;
    }
    onSubmit();
  };

  return (
    <section className={`client-home-screen ${showOrderOptions || hasRouteError ? "route-ready" : "route-draft"} ${showOrderSheet ? "has-order-sheet" : ""}`}>
      <MapView
        pickup={pickup}
        destination={destination}
        route={route}
        center={mapCenter}
        status={routeLoading ? "Прокладываем маршрут" : ""}
        onUseLocation={onUseLocation}
      />
      <section className="floating-route-panel">
        <RouteCard pickup={pickup} destination={destination} onPickup={onPickup} onDestination={onDestination} />
      </section>
      {showOrderSheet && (
        <section className={showOrderOptions || hasRouteError ? "premium-order-sheet" : "premium-order-sheet compact-order-sheet message-only-sheet"}>
          <div className="sheet-grip" />
          {(showOrderOptions || hasRouteError) && (
            <RouteSheetTitle title={sheetTitle} helper={sheetHelper} route={route} />
          )}
          {(showOrderOptions || hasRouteError) && (
            <SelectedRouteSummary pickup={pickup} destination={destination} onPickup={onPickup} onDestination={onDestination} />
          )}
          {message && <p className={message.includes("выбра") || message.includes("Вход") ? "state-note success" : "state-note danger"}>{message}</p>}
          {hasRouteError && <RouteUnavailableCard message={routeError} />}
          <TariffSelector tariffs={tariffs} tariff={tariff} setTariff={setTariff} loading={tariffsLoading} error={tariffsError} enabled={showOrderOptions} estimate={estimate} />
          {showOrderOptions && <PaymentSelector payment={payment} setPayment={setPayment} />}
          {(showOrderOptions || hasRouteError) && (
            <Button className="wide primary-brand client-main-cta" disabled={loading || routeLoading || (!hasRouteError && !canCreate && authenticated && pickup && destination)} onClick={handleCta}>
              {loading ? "Создаём заказ..." : ctaText}
              {canCreate && estimate?.estimatedPrice ? <> · <Money value={estimate.estimatedPrice} /></> : null}
            </Button>
          )}
        </section>
      )}
    </section>
  );
}

function RouteSheetTitle({ title, helper, route }) {
  const distance = distanceKmFromRoute(route);
  const duration = durationMinFromRoute(route);
  return (
    <div className="card-topline sheet-title-row">
      <div>
        <span>Поездка</span>
        <h1>{title}</h1>
        <p>{helper}</p>
      </div>
      {(distance || duration) && (
        <small className="route-meta-pill">
          {distance ? `${distance} км` : ""}{distance && duration ? " · " : ""}{duration ? `${duration} мин` : ""}
        </small>
      )}
    </div>
  );
}

function RouteUnavailableCard({ message }) {
  return (
    <section className="route-unavailable-card">
      <Icon name="route" size={21} />
      <div>
        <strong>{message || "Маршрут временно недоступен"}</strong>
        <span>Проверьте адрес назначения или уточните улицу, дом и ориентир.</span>
      </div>
    </section>
  );
}

function RouteCard({ pickup, destination, onPickup, onDestination }) {
  return (
    <section className="route-input-card premium-route-card taxi-command-card">
      <div className="home-sheet-grip" aria-hidden="true" />
      <button className="destination-command" type="button" onClick={onDestination}>
        <span className="destination-command-icon"><Icon name="search" size={19} /></span>
        <span className="destination-command-copy">
          <small>{destination ? "Куда" : "Введите адрес или место"}</small>
          <b>{destination?.title || "Куда едем?"}</b>
        </span>
        <span className="destination-command-action"><Icon name="chevron" size={18} /></span>
      </button>
      <button className="pickup-command" type="button" onClick={onPickup}>
        <span className="pickup-command-marker" aria-hidden="true">
          <span className="pickup-command-dot" />
        </span>
        <span>
          <small>Откуда</small>
          <b>{pickup?.title || "Моё местоположение"}</b>
        </span>
        <em aria-hidden="true"><Icon name="chevron" size={16} /></em>
      </button>
      {(pickup || destination) && (
        <div className="route-mini-status" aria-hidden="true">
          <span className={pickup ? "ready" : ""}>Подача</span>
          <i />
          <span className={destination ? "ready" : ""}>Назначение</span>
        </div>
      )}
    </section>
  );
}

function SelectedRouteSummary({ pickup, destination, onPickup, onDestination }) {
  return (
    <section className="selected-route-summary route-summary-card">
      <button type="button" className="route-summary-row pickup" onClick={onPickup}>
        <span className="route-summary-marker" aria-hidden="true"><i /></span>
        <span className="route-summary-copy">
          <em>Откуда</em>
          <strong>{pickup?.title || "Адрес подачи"}</strong>
        </span>
      </button>
      <button type="button" className="route-summary-row destination" onClick={onDestination}>
        <span className="route-summary-marker" aria-hidden="true"><i /></span>
        <span className="route-summary-copy">
          <em>Куда</em>
          <strong>{destination?.title || "Куда едем?"}</strong>
        </span>
      </button>
    </section>
  );
}

function TariffSelector({ tariffs, tariff, setTariff, loading, error, enabled, estimate }) {
  if (!enabled) {
    return null;
  }
  if (loading) return <section className="tariff-stage-card"><div className="skeleton-list"><span /><span /><span /></div></section>;
  if (error) return <p className="state-note danger">{error}</p>;
  if (!tariffs.length) return <p className="state-note">Тарифы пока не настроены</p>;
  return (
    <section className="premium-tariff-list">
      {tariffs.map(item => {
        const title = tariffTitle(item);
        const image = carImages[item.name] || carImages[title] || carImages.Economy;
        const selected = tariff?.id === item.id;
        const price = estimate?.tariff?.id === item.id || tariff?.id === item.id ? estimate?.estimatedPrice : null;
        const minPrice = tariffMinPrice(item);
        return (
          <button type="button" key={item.id} className={selected ? "selected" : ""} onClick={() => setTariff(item)} aria-pressed={selected}>
            <span className="tariff-car-plate">
              <img src={image} alt="" loading="lazy" />
            </span>
            <span className="tariff-main-copy">
              <span className="tariff-name">{title}</span>
              <small>{tariffSubtitle(item)}</small>
            </span>
            <span className="tariff-price-copy">
              <b>{price ? <Money value={price} /> : minPrice ? <>от <Money value={minPrice} /></> : "Выбрать"}</b>
              <small>{selected ? "выбрано" : "выбрать"}</small>
            </span>
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
          <Icon name={item.id === "CARD" ? "card" : "cash"} size={18} />
          <span>{item.title}</span>
        </button>
      ))}
    </section>
  );
}

function AddressPicker({ mode, region, destinationRegions = [], onBack, onSelect }) {
  const [query, setQuery] = useState("");
  const [mapSelectionActive, setMapSelectionActive] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mapPickLoading, setMapPickLoading] = useState(false);
  const [mapCandidate, setMapCandidate] = useState(null);
  const [mapCandidateReady, setMapCandidateReady] = useState(true);
  const [error, setError] = useState("");
  const selectableRegions = useMemo(() => {
    const source = mode === "destination" && destinationRegions.length ? destinationRegions : [region];
    return source.filter(Boolean).filter((item, index, list) => list.findIndex(candidate => candidate.id === item.id) === index);
  }, [mode, region, destinationRegions]);
  const [searchRegionId, setSearchRegionId] = useState(region?.id || "");
  const searchRegion = selectableRegions.find(item => item.id === searchRegionId) || selectableRegions[0] || region;
  const reverseSeqRef = useRef(0);
  const reverseDebounceRef = useRef(0);
  const reverseCacheRef = useRef(new Map());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const label = mode === "pickup" ? "Откуда?" : mode === "favorite" ? "Сохранить адрес" : "Куда едем?";
  const helper = mode === "pickup" ? "Выберите точку подачи" : mode === "favorite" ? "Выберите адрес для избранного" : selectableRegions.length > 1 ? "Город или межгород — выберите регион и точный адрес" : "Выберите точку назначения";
  const popular = useMemo(() => localAddressesForRegion(searchRegion).slice(0, 4), [searchRegion?.id, searchRegion?.code, searchRegion?.name]);
  const pickerCenter = regionCenter(searchRegion) || regionCenter(fallbackRegion);
  const hasTypedQuery = query.trim().length >= 2;
  // On the first address screen the catalogue already has useful nearby
  // places. Showing both its list and the large map-confirmation card leaves
  // the list with zero height on a phone viewport, so the header says “4”
  // while none of those four places can be tapped. Prioritise real address
  // results; the map-confirmation path remains available while the catalogue
  // is empty or after a typed search has no matches. An explicit map mode is
  // always available: popular places must not make the map impossible to use.
  const showMapSelection = mapSelectionActive || (!results.length && (!hasTypedQuery || !loading));

  useEffect(() => () => window.clearTimeout(reverseDebounceRef.current), []);

  useEffect(() => {
    if (!selectableRegions.some(item => item.id === searchRegionId)) {
      setSearchRegionId(selectableRegions[0]?.id || region?.id || "");
    }
  }, [selectableRegions, searchRegionId, region?.id]);

  useEffect(() => {
    reverseSeqRef.current += 1;
    window.clearTimeout(reverseDebounceRef.current);
    setMapCandidateReady(false);
    setMapCandidate(pendingMapAddress(pickerCenter, searchRegion?.name));
  }, [pickerCenter.lat, pickerCenter.lng, searchRegion?.name]);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setResults(popular);
      setError("");
      return undefined;
    }
    let ignore = false;
    setLoading(true);
    setError("");
    const immediateLocalMatches = searchLocalClientAddresses(clean, searchRegion, 10)
      .map(normalizeAddress)
      .filter(Boolean);
    setResults(immediateLocalMatches);
    const timer = window.setTimeout(() => {
      const localMatches = searchLocalClientAddresses(clean, searchRegion, 10);
      searchAddresses({ q: clean, region: searchRegion?.name, limit: 10 })
        .then(data => {
          if (ignore) return;
          const apiResults = (data.addresses || [])
            .map(item => ({ ...item, regionCode: item.regionCode || item.region_code || regionCode(searchRegion) }))
            .map(normalizeAddress)
            .filter(Boolean);
          setResults(mergeAddressResults(localMatches, apiResults, 10).map(normalizeAddress).filter(Boolean));
        })
        .catch(() => {
          if (ignore) return;
          setResults(localMatches.map(normalizeAddress).filter(Boolean));
          if (!localMatches.length) setError("Не нашли точный адрес. Укажите точку на карте.");
        })
        .finally(() => !ignore && setLoading(false));
    }, 280);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [query, searchRegion, popular]);

  async function updateMapCandidate(point) {
    if (!point?.lat || !point?.lng) return;
    // Invalidate old work before every early return, including cached points.
    // Otherwise a slower answer can replace the point the rider returned to.
    const seq = ++reverseSeqRef.current;
    window.clearTimeout(reverseDebounceRef.current);
    const fallback = pendingMapAddress(point, searchRegion?.name);
    const pointKey = mapAddressCacheKey(point);
    const cacheKey = pointKey ? `${searchRegion?.id || searchRegion?.name}:${pointKey}` : null;
    const cached = cacheKey ? reverseCacheRef.current.get(cacheKey) : null;
    if (cached) {
      setMapCandidate(cached);
      setMapCandidateReady(true);
      setMapPickLoading(false);
      setError("");
      return;
    }
    setMapCandidate(fallback);
    setMapCandidateReady(false);
    setMapPickLoading(true);
    setError("");
    reverseDebounceRef.current = window.setTimeout(async () => {
    try {
      const data = await Promise.race([
        reverseAddress(point),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("reverse_timeout")), 5000))
      ]);
      const address = normalizeAddress(data.address);
      if (!address || !isAddressInServiceRegion(address, searchRegion)) throw new Error("address_not_resolved");
      if (mountedRef.current && seq === reverseSeqRef.current) {
        if (cacheKey) reverseCacheRef.current.set(cacheKey, address);
        setMapCandidate(address);
        setMapCandidateReady(true);
      }
    } catch {
      if (mountedRef.current && seq === reverseSeqRef.current) {
        setMapCandidate({ ...fallback, title: "Адрес не найден", subtitle: "Передвиньте карту к ближайшему дому или объекту" });
        setMapCandidateReady(false);
      }
    } finally {
      if (mountedRef.current && seq === reverseSeqRef.current) {
        setMapPickLoading(false);
      }
    }
    }, 260);
  }

  function markMapCandidateMoving() {
    reverseSeqRef.current += 1;
    window.clearTimeout(reverseDebounceRef.current);
    setMapCandidateReady(false);
    setMapPickLoading(true);
    setError("");
  }

  function confirmMapCandidate() {
    if (!mapCandidate || !mapCandidateReady || mapPickLoading) return;
    onSelect(mapCandidate);
  }

  return (
    <main className="app-content address-map-selection-screen">
      <section className="address-picker-map-layer" aria-label="Карта выбора адреса">
        <MapView
          center={pickerCenter}
          compact
          addressControls
          centerMarker
          status={mapPickLoading ? "Определяем адрес" : ""}
          onMapPick={updateMapCandidate}
          onCenterChange={updateMapCandidate}
          onCenterChanging={markMapCandidateMoving}
        />
      </section>
      <button type="button" className="address-picker-back-button" onClick={onBack} aria-label="Назад">
        <Icon name="back" />
      </button>
      <section className={`address-picker-sheet ${mapSelectionActive ? "address-picker-sheet--map" : hasTypedQuery ? "address-picker-sheet--searching" : ""}`} aria-label="Выбор адреса">
        <div className="address-picker-grip" aria-hidden="true" />
        <header className="address-picker-title-row">
          <div>
            <span className="address-picker-eyebrow"><i />{mode === "pickup" ? "Точка подачи" : "Пункт назначения"}</span>
            <h1>{label}</h1>
            <p>{helper}</p>
          </div>
        </header>

        {mode === "destination" && selectableRegions.length > 1 && (
          <div className="address-picker-region-tabs" aria-label="Регион назначения">
            {selectableRegions.map(item => (
              <button
                type="button"
                key={item.id}
                className={item.id === searchRegion?.id ? "active" : ""}
                onClick={() => setSearchRegionId(item.id)}
              >
                {regionLabel(item)}
              </button>
            ))}
          </div>
        )}

        {!mapSelectionActive && <label className="address-picker-searchbar">
          <Icon name="search" size={20} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Введите улицу, дом или место" />
        </label>}

        <button type="button" className="address-picker-mode-toggle" onClick={() => setMapSelectionActive(value => !value)}>
          <Icon name={mapSelectionActive ? "search" : "pin"} size={18} />
          {mapSelectionActive ? "Вернуться к поиску" : "Выбрать точку на карте"}
        </button>

        {showMapSelection && (
          <button type="button" className="address-map-point-card" onClick={confirmMapCandidate} disabled={!mapCandidate || !mapCandidateReady || mapPickLoading}>
            <span className="address-map-point-icon">
              <IconAsset name="addressDestination" className="ui-asset-icon ui-asset-icon-md" />
            </span>
            <span>
              <strong>{mapPickLoading ? "Определяем точку..." : mapCandidate?.title || "Точка на карте"}</strong>
              <small>{mapPickLoading ? "Проверяем адрес по карте" : mapCandidate?.subtitle || "Передвиньте карту к нужному месту"}</small>
            </span>
            <IconAsset name="addressChevron" className="ui-asset-icon ui-asset-icon-sm" />
          </button>
        )}

        {!mapSelectionActive && loading && !results.length && <div className="address-picker-skeleton"><span /><span /><span /></div>}
        {!mapSelectionActive && error && <p className="address-picker-note danger">{error}</p>}
        {!mapSelectionActive && !loading && query.trim().length >= 2 && !error && !results.length && <p className="address-picker-note">Не нашли точный адрес. Передвиньте карту и подтвердите точку.</p>}

        {!mapSelectionActive && <section className="address-picker-results" aria-label={query.trim().length >= 2 ? "Результаты поиска" : "Популярные адреса"}>
          <header>
            <strong>{query.trim().length >= 2 ? "Найденные адреса" : "Популярные рядом"}</strong>
            <span>{results.length}</span>
          </header>
          <div>
            {results.map(place => (
              <button type="button" key={`${place.title}-${place.subtitle}-${place.lat}-${place.lng}`} onClick={() => onSelect(place)}>
                <span className="address-result-icon">
                  <IconAsset name={place.icon || "addressClock"} className="ui-asset-icon ui-asset-icon-md" />
                </span>
                <span>
                  <b>{place.title}</b>
                  <small>{place.subtitle}</small>
                </span>
                <IconAsset name="addressChevron" className="ui-asset-icon ui-asset-icon-sm" />
              </button>
            ))}
          </div>
        </section>}

        {showMapSelection && (
          <button type="button" className="address-picker-confirm" onClick={confirmMapCandidate} disabled={!mapCandidate || !mapCandidateReady || mapPickLoading}>
            <span>{mapPickLoading ? "Определяем адрес..." : mode === "pickup" ? "Подтвердить адрес" : "Выбрать адрес"}</span>
            <IconAsset name="addressChevron" className="ui-asset-icon ui-asset-icon-md" />
          </button>
        )}
      </section>
    </main>
  );
}

function RegionSection({ regions, selectedRegionId, onSelect, onHome }) {
  const activeRegions = regions.filter(region => region.isActive !== false);
  return (
    <section className="screen-grid region-selection-screen">
      <section className="screen-intro">
        <h1>Регион обслуживания</h1>
        <p>Выберите город или район, где будет выполняться поездка.</p>
      </section>
      <section className="app-card region-selection-card">
        <div className="client-card-heading"><b>Доступные регионы</b><small>{activeRegions.length}</small></div>
        <div className="region-selection-list">
          {activeRegions.map(region => {
            const selected = region.id === selectedRegionId;
            return (
              <button
                type="button"
                key={region.id}
                className={selected ? "selected" : ""}
                onClick={() => onSelect(region)}
                aria-pressed={selected}
              >
                <span className="region-selection-icon"><Icon name="pin" size={20} /></span>
                <span>
                  <strong>{regionLabel(region)}</strong>
                  <small>{region.subtitle || "Зона обслуживания SmartTaxi"}</small>
                </span>
                {selected ? <span className="region-selection-current">Выбран</span> : <Icon name="chevron" size={18} />}
              </button>
            );
          })}
        </div>
      </section>
      <Button className="wide primary-brand" onClick={onHome}>Вернуться к карте</Button>
    </section>
  );
}

function TripHistoryList({ authenticated, onHome }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [] });
  useEffect(() => {
    if (!authenticated) { setState({ loading: false, error: "", rows: [] }); return undefined; }
    let ignore = false;
    getClientTripHistory({ limit: 50 })
      .then(data => { if (!ignore) setState({ loading: false, error: "", rows: data.orders || [] }); })
      .catch(error => { if (!ignore) setState({ loading: false, error: formatError(error), rows: [] }); });
    return () => { ignore = true; };
  }, [authenticated]);
  if (!authenticated) return <EmptyState title="Войдите, чтобы увидеть поездки" text="История сохраняется в вашем аккаунте на всех устройствах." action="На главную" onAction={onHome} />;
  if (state.loading) return <p className="state-note">Загружаем историю поездок...</p>;
  if (state.error) return <EmptyState title="Не удалось загрузить историю" text={state.error} action="На главную" onAction={onHome} />;
  if (!state.rows.length) return <EmptyState title="Поездок пока нет" text="Выберите маршрут на главном экране, чтобы создать заказ." action="Заказать поездку" onAction={onHome} />;
  return (
    <section className="app-card trip-history-card">
      <div className="client-card-heading"><b>История поездок</b><small>{state.rows.length} шт.</small></div>
      <div className="client-data-list">{state.rows.map(item => <article className="client-recurring-card" key={item.id}><div><b>{item.pickup_text || item.pickupText || "Точка подачи"} → {item.dropoff_text || item.dropoffText || "Точка назначения"}</b><small>{formatClientDate(item.completed_at || item.updated_at || item.created_at)} · {publicStatus(item.public_status || item.status)}</small><em>{Number(item.final_price ?? item.price ?? item.price_kzt ?? 0).toLocaleString("ru-RU")} ₸ · {paymentLabel(item.payment_method)}</em></div><Icon name="chevron" size={18} /></article>)}</div>
      <Button className="wide primary-brand" onClick={onHome}>Заказать поездку</Button>
    </section>
  );
}

function TripsSection({ authenticated, order, pickup, destination, route, liveRoute, estimate, loading, onCancel, onHome, onSupport, onOrderUpdate }) {
  // Once a driver is assigned, prefer the live driver->target leg route over
  // the static pickup->dropoff price preview so the map/ETA track the
  // driver's actual position instead of freezing at order-creation time.
  const activeRoute = liveRoute || route;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingTags, setRatingTags] = useState([]);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingError, setRatingError] = useState("");
  const [cardPayment, setCardPayment] = useState(null);
  const [paymentTimedOut, setPaymentTimedOut] = useState(false);
  const [paymentRetry, setPaymentRetry] = useState(0);
  const mountedRef = useRef(true);
  const onOrderUpdateRef = useRef(onOrderUpdate);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { onOrderUpdateRef.current = onOrderUpdate; }, [onOrderUpdate]);
  useEffect(() => {
    setDetailsOpen(false);
    setRatingValue(5);
    setRatingTags([]);
    setRatingComment("");
    setRatingError("");
    setRatingSubmitting(false);
  }, [order?.id]);
  useEffect(() => {
    const awaitingPayment = ["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(publicStatus(order?.public_status || order?.status));
    if (!order?.id || !["CARD", "MIXED"].includes(order.payment_method) || !awaitingPayment) {
      setCardPayment(null);
      setPaymentTimedOut(false);
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let attempts = 0;
    setPaymentTimedOut(false);
    setCardPayment({ status: "INITIATING" });

    const applyPayment = (response) => {
      const payment = response?.payment || response;
      if (!payment || cancelled) return null;
      setCardPayment(payment);
      if (payment.orderStatus && payment.orderStatus !== order.status) {
        onOrderUpdateRef.current?.({
          ...order,
          status: payment.orderStatus,
          payment_status: payment.status === "PAID" ? "PAID" : order.payment_status
        });
      }
      return payment;
    };
    const stopPolling = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const poll = async () => {
      try {
        const payment = applyPayment(await getOrderPaymentStatus(order.id));
        if (!payment || payment.status !== "PROCESSING") {
          stopPolling();
          return;
        }
        attempts += 1;
        if (attempts >= 30) {
          stopPolling();
          if (!cancelled) setPaymentTimedOut(true);
        }
      } catch {
        // A transient network failure must not turn a still-processing payment
        // into a failed payment. The next poll will reconcile its real state.
      }
    };
    const initiate = async () => {
      try {
        const payment = applyPayment(await initiateOrderPayment(order.id));
        if (payment?.status === "PROCESSING") timer = window.setInterval(poll, 3000);
      } catch (error) {
        if (!cancelled) setCardPayment({
          status: "FAILED",
          failureReason: formatError(error) || "Не удалось начать оплату картой."
        });
      }
    };
    initiate();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [order?.id, order?.status, order?.public_status, order?.payment_method, paymentRetry]);

  if (!order) {
    return (
      <section className="screen-grid trip-stage-screen">
        <section className="screen-intro"><h1>Мои поездки</h1><p>Активные поездки и история заказов.</p></section>
        <TripHistoryList authenticated={authenticated} onHome={onHome} />
      </section>
    );
  }
  const status = publicStatus(order.public_status || order.status);
  const terminal = ["TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED", "NO_SHOW", "CANCELLED_BY_CLIENT", "CANCELLED_BY_DRIVER", "CANCELLED_BY_OPERATOR", "CANCELLED_BY_ADMIN", "CANCELED"].includes(status);
  const tripPickup = pickup || {
    title: order.pickup_text,
    lat: order.pickup_lat,
    lng: order.pickup_lng
  };
  const tripDestination = destination || {
    title: order.dropoff_text,
    lat: order.dropoff_lat,
    lng: order.dropoff_lng
  };
  const hasDriver = ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED"].includes(status) || order.driver_name;
  const cancelled = ["CANCELLED", "CANCELED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_DRIVER", "CANCELLED_BY_OPERATOR", "CANCELLED_BY_ADMIN"].includes(status);
  const driverName = order.driver_name || "Водитель SmartTaxi";
  const carLine = driverVehicleLine(order);
  const driverPoint = clientDriverMapPoint(order, liveRoute);
  const stage = clientLifecycleStage(status, order, activeRoute);
  const statusTone = tripStatusTone(status);
  const showRating = status === "PAID";
  const driverFoundScreen = ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT"].includes(status) && !terminal;

  async function submitRating(event) {
    event.preventDefault();
    if (!order?.id || ratingSubmitting) return;
    setRatingSubmitting(true);
    setRatingError("");
    try {
      const data = await rateOrder(order.id, {
        rating: ratingValue,
        tags: ratingTags,
        comment: ratingComment
      });
      // Always call this, even if TripsSection itself has since unmounted --
      // onOrderUpdate writes to the always-mounted ClientApp root's state,
      // not this component's, so it's safe (and correct: the rating really
      // did succeed) regardless of mountedRef below, which only guards this
      // component's own local state.
      onOrderUpdate?.(data.order);
    } catch (error) {
      if (mountedRef.current) setRatingError(formatError(error));
    } finally {
      if (mountedRef.current) setRatingSubmitting(false);
    }
  }

  function toggleRatingTag(tag) {
    setRatingTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]);
  }

  if (status === "SEARCHING_DRIVER") {
    return (
      <section className="trip-stage-screen trip-searching-screen">
        <TripMapCard pickup={tripPickup} destination={tripDestination} route={route} status="" mode="searching" />
        <section className="trip-search-card search-driver-sheet" data-order-id={order.id || ""}>
          <div className="search-driver-grip" aria-hidden="true" />
          <header className="search-driver-head">
            <div>
              <h1>Ищем водителя для вас</h1>
              <p>Предлагаем ваш заказ доступным водителям</p>
              <span className="search-driver-nearby-pill">Поиск активен</span>
            </div>
            <img className="search-driver-car-route" src={carImages.Economy} alt="" loading="eager" decoding="async" />
          </header>
          {order.driver_offer_status === "PENDING" && order.driver_offer_price_kzt != null && (
            <PriceOfferCard order={order} onOrderUpdate={onOrderUpdate} />
          )}
          <SearchRouteCard pickup={order.pickup_text || pickup?.title} dropoff={order.dropoff_text || destination?.title} />
          <SearchingOrderMeta order={order} estimate={estimate} route={route} />
          <SearchProgress />
          <SearchNotice />
          <button type="button" className="trip-cancel-button search-cancel-button" onClick={onCancel} disabled={loading}>
            {loading ? "Отменяем..." : "Отменить заказ"}
          </button>
        </section>
      </section>
    );
  }

  if (cancelled) {
    return (
      <section className="trip-stage-screen trip-cancelled-screen">
        <TripMapCard pickup={tripPickup} destination={tripDestination} route={route} status={statusLabel(status)} />
        <section className="trip-search-card trip-cancelled-card">
          <span className="cancelled-mark"><Icon name="close" size={20} /></span>
          <div>
            <h1>Заказ отменён</h1>
            <p>Поиск водителя остановлен. Можно изменить маршрут или создать новый заказ.</p>
          </div>
          <CompactRoute pickup={order.pickup_text || pickup?.title} dropoff={order.dropoff_text || destination?.title} />
          <button type="button" className="trip-home-button" onClick={onHome}>Новая поездка</button>
        </section>
      </section>
    );
  }

  if (driverFoundScreen) {
    return (
      <section className="trip-stage-screen trip-driver-found-screen driver-found-reference-screen">
        <TripMapCard pickup={tripPickup} destination={tripDestination} driver={driverPoint} route={activeRoute} status="" mode="driver-found" />
        <section className="driver-found-reference-sheet" data-order-id={order.id || ""}>
          <div className="driver-found-grip" aria-hidden="true" />
          <header className="driver-found-reference-head">
            <h1>Водитель найден</h1>
            <p>{driverEtaText(order, activeRoute)}</p>
          </header>

          <section className="driver-found-driver-card" aria-label="Водитель">
            <img className="driver-found-avatar" src={driverFoundAssets.avatar} alt="" />
            <div className="driver-found-driver-copy">
              <strong>{driverName}</strong>
              <span className="driver-found-rating-line">
                <Icon name="star" size={17} />
                <b>{driverRatingLabel(order)}</b>
                <i />
                <em>{driverTripsLabel(order)}</em>
              </span>
              <span className="driver-found-verified">
                <img src={driverFoundAssets.verified} alt="" />
                Ваш водитель
              </span>
            </div>
            {order.driver_phone ? (
              <a className="driver-found-call-round" href={`tel:${order.driver_phone}`} aria-label="Позвонить водителю">
                <img src={driverFoundAssets.phone} alt="" />
              </a>
            ) : (
              <span className="driver-found-call-round inactive" aria-label="Телефон водителя появится после назначения">
                <img src={driverFoundAssets.phone} alt="" />
              </span>
            )}
          </section>

          <DriverFoundRouteCard pickup={order.pickup_text || pickup?.title} dropoff={order.dropoff_text || destination?.title} />

          <section className="driver-found-info-list">
            <DriverFoundInfoRow icon={driverFoundAssets.wallet} label="Оплата" value={paymentLabel(order.payment_method)} />
            <DriverFoundInfoRow icon={driverFoundAssets.priceTag} label="Стоимость" value={<Money value={tripPrice(order, estimate)} />} />
          </section>

          <QuickMessagesBar orderId={order.id} />

          <div className="driver-found-actions">
            <button type="button" className="driver-found-details-button" onClick={() => setDetailsOpen(true)}>
              Детали поездки
            </button>
            {order.driver_phone ? (
              <a className="driver-found-contact-button" href={`tel:${order.driver_phone}`}>
                <img src={driverFoundAssets.chat} alt="" />
                Связаться
              </a>
            ) : (
              <span className="driver-found-contact-button inactive">
                <img src={driverFoundAssets.chat} alt="" />
                Телефон после назначения
              </span>
            )}
          </div>
        </section>
        <TripDetailsSheet
          open={detailsOpen}
          order={order}
          pickup={tripPickup}
          destination={tripDestination}
          status={status}
          driverName={driverName}
          carLine={carLine}
          estimate={estimate}
          onClose={() => setDetailsOpen(false)}
          onCancel={onCancel}
          onSupport={onSupport}
          canCancel={stage.canCancel}
          cancelDisabled={loading || !stage.canCancel}
        />
      </section>
    );
  }

  return (
    <section className={`trip-stage-screen trip-driver-found-screen driver-found-reference-screen lifecycle-reference-screen trip-status-${status.toLowerCase().replace(/_/g, "-")}`}>
      <TripMapCard pickup={tripPickup} destination={tripDestination} driver={driverPoint} route={activeRoute} status="" mode="driver-found" />
      <section className="driver-found-reference-sheet lifecycle-reference-sheet">
        <div className="driver-found-grip" aria-hidden="true" />
        <header className="driver-found-reference-head lifecycle-reference-head">
          <span className={`lifecycle-status-icon ${statusTone}`}>
            <Icon name={statusTone === "success" ? "check" : statusTone === "waiting" ? "clock" : "car"} size={24} />
          </span>
          <h1>{stage.title}</h1>
          <p>{stage.subtitle}</p>
        </header>
        <RideStatusRail status={status} />
        {hasDriver && (
          <section className="driver-found-driver-card lifecycle-driver-card" aria-label="Водитель">
            <img className="driver-found-avatar" src={driverFoundAssets.avatar} alt="" />
            <div className="driver-found-driver-copy">
              <strong>{driverName}</strong>
              <span className="driver-found-rating-line">
                <Icon name="star" size={17} />
                <b>{driverRatingLabel(order)}</b>
                <i />
                <em>{driverTripsLabel(order)}</em>
              </span>
              <span className="driver-found-verified">
                <img src={driverFoundAssets.verified} alt="" />
                Ваш водитель
              </span>
            </div>
            {stage.canContact && order.driver_phone ? (
              <a className="driver-found-call-round" href={`tel:${order.driver_phone}`} aria-label="Позвонить водителю">
                <img src={driverFoundAssets.phone} alt="" />
              </a>
            ) : (
              <span className="driver-found-call-round inactive" aria-label="Звонок недоступен">
                <img src={driverFoundAssets.phone} alt="" />
              </span>
            )}
          </section>
        )}
        <DriverFoundRouteCard pickup={order.pickup_text || pickup?.title} dropoff={order.dropoff_text || destination?.title} />
        <div className="trip-car-plate-row driver-found-car lifecycle-car-row">
          <span>{carLine}</span>
          <b>{orderTariffLabel(order, estimate)}</b>
        </div>
        <DriverFoundMeta order={order} estimate={estimate} />
        <RideStatusNote status={status} order={order} destination={tripDestination} route={activeRoute} />
        {["CARD", "MIXED"].includes(order.payment_method) && ["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(status) && (
          <CardPaymentState
            payment={cardPayment}
            timedOut={paymentTimedOut}
            onRetry={() => setPaymentRetry(value => value + 1)}
          />
        )}
        {!terminal && <QuickMessagesBar orderId={order.id} />}
        {showRating && (
          <TripRatingCard
            order={order}
            driverName={driverName}
            rating={ratingValue}
            setRating={setRatingValue}
            tags={ratingTags}
            onToggleTag={toggleRatingTag}
            comment={ratingComment}
            setComment={setRatingComment}
            submitting={ratingSubmitting}
            error={ratingError}
            onSubmit={submitRating}
          />
        )}
        {status === "RATED" && (
          <section className="trip-complete-card" aria-label="Поездка закрыта">
            <span><Icon name="check" size={24} /></span>
            <div>
              <strong>Спасибо за поездку</strong>
              <small>Отзыв сохранён. Можно заказать новую поездку.</small>
            </div>
          </section>
        )}
        <div className="driver-found-actions lifecycle-actions">
          <button type="button" className="driver-found-details-button" onClick={() => setDetailsOpen(true)}>
            Детали поездки
          </button>
          {stage.canContact && order.driver_phone && (
            <a className="driver-found-contact-button" href={`tel:${order.driver_phone}`}>
              <img src={driverFoundAssets.chat} alt="" />
              Связаться
            </a>
          )}
          {stage.canCancel && (
            <button type="button" className="driver-found-details-button lifecycle-cancel-button" onClick={onCancel} disabled={loading}>
              {loading ? "Отменяем..." : "Отменить"}
            </button>
          )}
          {stage.canStartNewTrip && (
            <button type="button" className="driver-found-contact-button lifecycle-new-trip-button" onClick={onHome}>
              Новая поездка
            </button>
          )}
        </div>
      </section>
      <TripDetailsSheet
        open={detailsOpen}
        order={order}
        pickup={tripPickup}
        destination={tripDestination}
        status={status}
        driverName={driverName}
        carLine={carLine}
        estimate={estimate}
        onClose={() => setDetailsOpen(false)}
        onCancel={onCancel}
        onSupport={onSupport}
        canCancel={stage.canCancel}
        cancelDisabled={loading || !stage.canCancel}
      />
    </section>
  );
}

function CardPaymentState({ payment, timedOut, onRetry }) {
  const status = payment?.status;
  if (status === "FAILED") {
    return (
      <section className="card-payment-state failed" aria-live="polite">
        <span className="card-payment-state-icon"><Icon name="close" size={19} /></span>
        <div>
          <strong>Оплата картой не прошла</strong>
          <small>{payment.failureReason || "Проверьте карту и повторите попытку."}</small>
        </div>
        <button type="button" onClick={onRetry}>Повторить</button>
      </section>
    );
  }
  if (timedOut) {
    return (
      <section className="card-payment-state pending" aria-live="polite">
        <span className="card-payment-state-icon"><Icon name="clock" size={19} /></span>
        <div>
          <strong>Оплата ещё обрабатывается</strong>
          <small>Проверим статус автоматически. Можно обновить попытку вручную.</small>
        </div>
        <button type="button" onClick={onRetry}>Проверить</button>
      </section>
    );
  }
  return (
    <section className="card-payment-state pending" aria-live="polite">
      <span className="card-payment-state-icon"><Icon name="card" size={19} /></span>
      <div>
        <strong>Обрабатываем оплату картой</strong>
        <small>Подтверждение появится здесь автоматически.</small>
      </div>
      <span className="card-payment-spinner" aria-label="Загрузка" />
    </section>
  );
}

function SearchProgress() {
  return (
    <ol className="search-progress-steps" aria-label="Статус поиска">
      <li className="active">
        <span><img src={searchDriverAssets.search} alt="" /></span>
        <b>Поиск водителя</b>
      </li>
      <li>
        <span><IconAsset name="user" className="ui-asset-icon ui-asset-icon-sm" /></span>
        <b>Водитель найден</b>
      </li>
      <li>
        <span><img src={searchDriverAssets.car} alt="" /></span>
        <b>Водитель едет к вам</b>
      </li>
      <li>
        <span><img src={searchDriverAssets.pin} alt="" /></span>
        <b>На месте</b>
      </li>
    </ol>
  );
}

function SearchRouteCard({ pickup, dropoff }) {
  return (
    <section className="search-route-card" aria-label="Маршрут заказа">
      <div className="search-route-line" aria-hidden="true">
        <span />
        <i />
        <b />
      </div>
      <div className="search-route-copy">
        <small>Откуда</small>
        <strong>{pickup || "Точка подачи"}</strong>
        <small>Куда</small>
        <strong>{dropoff || "Пункт назначения"}</strong>
      </div>
      <span className="search-route-change" aria-hidden="true">
        Маршрут
      </span>
    </section>
  );
}

function PriceOfferCard({ order, onOrderUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function respond(accept) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await respondPriceOffer(order.id, accept);
      // Always call this even if the card itself has since unmounted (e.g.
      // the offer expired via socket update mid-request) -- it writes to
      // the always-mounted ClientApp root, not this component.
      onOrderUpdate?.(data.order);
    } catch (submitError) {
      if (mountedRef.current) setError(formatError(submitError));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <section className="price-offer-card" aria-label="Предложение водителя по цене">
      <strong>Водитель предлагает {order.driver_offer_price_kzt} ₸</strong>
      <span>Вместо {order.price} ₸ за поездку</span>
      {error && <p className="state-note danger">{error}</p>}
      <div className="price-offer-actions">
        <button type="button" className="price-offer-decline" disabled={busy} onClick={() => respond(false)}>Отказаться</button>
        <button type="button" className="price-offer-accept" disabled={busy} onClick={() => respond(true)}>{busy ? "Отправляем..." : "Согласиться"}</button>
      </div>
    </section>
  );
}

const quickMessageOptions = [
  { code: "I_ARRIVED", label: "Я приехал" },
  { code: "WAITING_AT_ENTRANCE", label: "Жду у входа" },
  { code: "RUNNING_LATE_2MIN", label: "Опаздываю на 2 минуты" },
  { code: "PLEASE_COME_OUT", label: "Пожалуйста, выходите" },
  { code: "ON_MY_WAY", label: "Уже еду к вам" }
];

function QuickMessagesBar({ orderId }) {
  const [sendingKey, setSendingKey] = useState("");
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function send(code) {
    if (sendingKey) return;
    setSendingKey(code);
    setError("");
    try {
      await sendQuickMessage(orderId, code);
    } catch (submitError) {
      if (mountedRef.current) setError(formatError(submitError));
    } finally {
      if (mountedRef.current) setSendingKey("");
    }
  }

  return (
    <div>
      <div className="quick-message-bar" role="group" aria-label="Быстрые сообщения водителю">
        {quickMessageOptions.map(item => (
          <button type="button" key={item.code} disabled={Boolean(sendingKey)} onClick={() => send(item.code)}>
            {item.label}
          </button>
        ))}
      </div>
      {error && <p className="state-note danger">{error}</p>}
    </div>
  );
}

function SearchNotice() {
  return (
    <section className="search-notice-card" aria-label="Уведомление о поиске">
      <span className="search-notice-shield"><img src={searchDriverAssets.shield} alt="" /></span>
      <span>
        <strong>Мы уведомим вас,</strong>
        <small>как только водитель откликнется на заказ</small>
      </span>
      <span className="search-notice-bell" aria-hidden="true">
        <img src={searchDriverAssets.bell} alt="" />
        <i>1</i>
      </span>
    </section>
  );
}

function DriverFoundRouteCard({ pickup, dropoff }) {
  return (
    <section className="driver-found-route-card" aria-label="Маршрут поездки">
      <img className="driver-found-route-indicator" src={driverFoundAssets.route} alt="" />
      <div className="driver-found-route-copy">
        <small>Откуда</small>
        <strong>{pickup || "Точка подачи"}</strong>
        <small>Куда</small>
        <strong>{dropoff || "Пункт назначения"}</strong>
      </div>
    </section>
  );
}

function DriverFoundInfoRow({ icon, label, value }) {
  return (
    <div className="driver-found-info-row">
      <span className="driver-found-info-icon"><img src={icon} alt="" /></span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
      <Icon name="chevron" size={21} />
    </div>
  );
}

function orderTariffLabel(order, estimate) {
  const raw = order?.tariff || estimate?.tariff?.displayName || estimate?.tariff?.display_name || estimate?.tariff?.name || "Economy";
  const key = cleanTariffKey({ name: raw, displayName: raw });
  const labels = {
    Economy: "Эконом",
    Comfort: "Комфорт",
    Business: "Бизнес",
    Delivery: "Доставка"
  };
  return labels[key] || raw || "Эконом";
}

function paymentLabel(method) {
  if (method === "CARD") return "Картой";
  if (method === "KASPI") return "Kaspi";
  if (method === "CASHBACK") return "Бонусами";
  if (method === "MIXED") return "Бонусы + карта";
  return "Наличные";
}

function driverEtaText(order, route = null) {
  // The live driver->target leg first. `driver_eta_min` and its camelCase
  // siblings below are read from the order, and no endpoint has ever put
  // them there — grep the API and there is not one write — so this function
  // could only ever reach its two status sentences. The web passenger never
  // saw a minute figure while the Flutter app, calling the same endpoint,
  // showed one the whole time (_driverPickupMeta in passenger_shell.dart).
  const seconds = Number(route?.durationSeconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const heading = route?.phase === "to_dropoff" ? "На месте через" : "Приедет через";
    // OSRM was unreachable and the backend answered with a straight line
    // padded by 1.3 at a flat 28 km/h. Say so, the way the driver app does.
    return route?.fallback
      ? `${heading} ${minutes} мин · приблизительно`
      : `${heading} ${minutes} мин`;
  }
  const eta = Number(order?.driver_eta_min ?? order?.driverEtaMin ?? order?.etaMin ?? 0);
  if (Number.isFinite(eta) && eta > 0) return `Приедет через ${Math.ceil(eta)} мин`;
  if (publicStatus(order?.public_status || order?.status) === "DRIVER_GOING_TO_CLIENT") return "Водитель едет к точке подачи";
  return "Водитель подтвердил заказ";
}

function driverRatingLabel(order) {
  const rating = Number(order?.driver_rating);
  if (Number.isFinite(rating) && rating > 0) return rating.toFixed(1);
  return "Новый";
}

function driverTripsLabel(order) {
  const trips = Number(order?.driver_trips ?? order?.driverTrips ?? order?.driver_completed_orders ?? order?.driverCompletedOrders);
  if (!Number.isFinite(trips) || trips <= 0) return "новый";
  const last = Math.abs(Math.floor(trips)) % 10;
  const lastTwo = Math.abs(Math.floor(trips)) % 100;
  const suffix = last === 1 && lastTwo !== 11 ? "поездка" : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "поездки" : "поездок";
  return `${Math.floor(trips).toLocaleString("ru-RU")} ${suffix}`;
}

function driverVehicleLine(order) {
  const color = order?.driver_car_color || order?.driverCarColor || "";
  const model = order?.driver_car_model || order?.driverCarModel || "Автомобиль SmartTaxi";
  const plate = order?.driver_plate || order?.driverPlate || "";
  return [[color, model].filter(Boolean).join(" "), plate].filter(Boolean).join(" · ");
}

function tripStatusTone(status) {
  if (["TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED"].includes(status)) return "success";
  if (["DRIVER_ARRIVED", "WAITING_CLIENT"].includes(status)) return "waiting";
  if (status === "NO_SHOW") return "warning";
  return "active";
}

function tripPrice(order, estimate) {
  return Number(order?.price || estimate?.estimatedPrice || 0);
}

function waitingInfo(order) {
  const started = order?.waiting_started_at || order?.waitingStartedAt || order?.driver_arrived_at || order?.arrived_at;
  const freeUntil = order?.free_waiting_until || order?.freeWaitingUntil;
  const total = Number(order?.waiting_total ?? order?.waitingTotal ?? 0);
  const perMinute = Number(order?.waiting_price_per_minute ?? order?.waitingPricePerMinute ?? 0);
  const parts = [];
  if (started) parts.push("Ожидание началось");
  if (freeUntil) parts.push(`бесплатно до ${formatShortTime(freeUntil)}`);
  if (perMinute > 0) parts.push(`${perMinute} ₸/мин после бесплатного времени`);
  if (total > 0) parts.push(`начислено ${total} ₸`);
  return parts.length ? parts.join(" · ") : "Водитель ждёт у точки подачи. Пожалуйста, подойдите к машине.";
}

function formatShortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function paymentInstruction(order) {
  if (order?.payment_method === "KASPI") return "Переведите сумму водителю через Kaspi и покажите подтверждение.";
  return "Оплатите поездку наличными водителю.";
}

function RideStatusRail({ status }) {
  const steps = [
    { key: "DRIVER_FOUND", label: "Водитель" },
    { key: "DRIVER_ARRIVED", label: "Подача" },
    { key: "TRIP_STARTED", label: "В пути" },
    { key: "TRIP_COMPLETED", label: "Финиш" }
  ];
  const order = ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED"];
  const currentIndex = order.indexOf(status);
  if (status === "NO_SHOW") {
    return (
      <div className="ride-status-rail warning">
        <span className="done"><i />Водитель</span>
        <span className="done"><i />Подача</span>
        <span className="active"><i />Не состоялась</span>
      </div>
    );
  }
  return (
    <div className="ride-status-rail">
      {steps.map(step => {
        const stepIndex = order.indexOf(step.key);
        const active = status === step.key || (step.key === "DRIVER_FOUND" && status === "DRIVER_GOING_TO_CLIENT") || (step.key === "DRIVER_ARRIVED" && status === "WAITING_CLIENT") || (step.key === "TRIP_COMPLETED" && ["PAYMENT_PENDING", "PAID", "RATED"].includes(status));
        const done = currentIndex > stepIndex || ["PAYMENT_PENDING", "PAID", "RATED"].includes(status);
        return <span key={step.key} className={active ? "active" : done ? "done" : ""}><i />{step.label}</span>;
      })}
    </div>
  );
}

function RideStatusNote({ status, order, destination, route = null }) {
  const payment = paymentLabel(order.payment_method);
  const price = tripPrice(order);
  const destinationTitle = destination?.title || order.dropoff_text || "пункт назначения";
  let title = "Статус поездки";
  let text = "Следим за изменениями заказа.";
  let icon = "route";

  if (["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT"].includes(status)) {
    title = "Водитель принял заказ";
    text = driverEtaText(order, route);
    icon = "car";
  } else if (["DRIVER_ARRIVED", "WAITING_CLIENT"].includes(status)) {
    title = status === "WAITING_CLIENT" ? "Идёт ожидание" : "Водитель на месте";
    text = waitingInfo(order);
    icon = "clock";
  } else if (status === "TRIP_STARTED") {
    title = "Маршрут активен";
    text = `Едем к адресу: ${destinationTitle}`;
    icon = "route";
  } else if (["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(status)) {
    title = price ? `К оплате ${price.toLocaleString("ru-RU")} ₸` : "Оплата поездки";
    text = paymentInstruction(order);
    icon = "card";
  } else if (status === "PAID") {
    title = "Оплата подтверждена";
    text = "Оцените поездку, чтобы завершить заказ.";
    icon = "check";
  } else if (status === "RATED") {
    title = "Поездка закрыта";
    text = "Спасибо, что помогаете делать SmartTaxi лучше.";
    icon = "star";
  } else if (status === "NO_SHOW") {
    title = "Заказ закрыт";
    text = order.cancel_reason || order.no_show_reason || "Клиент не вышел к машине.";
    icon = "info";
  }

  return (
    <div className={`ride-status-note ${tripStatusTone(status)}`}>
      <span className="ride-status-note-icon"><Icon name={icon} size={18} /></span>
      <span>
        <small>{title}</small>
        <b>{text}</b>
        {["TRIP_COMPLETED", "PAYMENT_PENDING"].includes(status) && <em>{payment}</em>}
      </span>
    </div>
  );
}

const ratingTagOptions = [
  ["polite_driver", "Вежливый водитель"],
  ["clean_car", "Чистая машина"],
  ["fast_arrival", "Быстро приехал"],
  ["good_route", "Хороший маршрут"]
];

function TripRatingCard({
  order,
  driverName,
  rating,
  setRating,
  tags,
  onToggleTag,
  comment,
  setComment,
  submitting,
  error,
  onSubmit
}) {
  return (
    <form className="trip-rating-card" onSubmit={onSubmit}>
      <div className="trip-rating-head">
        <span className="trip-driver-avatar neutral success"><Icon name="user" size={22} /></span>
        <div>
          <small>Завершение поездки</small>
          <h2>Оцените поездку</h2>
          <p>{driverName || "Водитель SmartTaxi"} · заказ {order.short_id || order.id}</p>
        </div>
      </div>
      <div className="trip-rating-stars" role="group" aria-label="Оценка поездки">
        {[1, 2, 3, 4, 5].map(value => (
          <button
            type="button"
            key={value}
            className={value <= rating ? "selected" : ""}
            onClick={() => setRating(value)}
            aria-label={`${value} из 5`}
          >
            <Icon name="star" size={21} />
          </button>
        ))}
      </div>
      <div className="trip-rating-tags">
        {ratingTagOptions.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={tags.includes(key) ? "selected" : ""}
            onClick={() => onToggleTag(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="trip-rating-comment">
        <span>Комментарий</span>
        <textarea
          value={comment}
          onChange={event => setComment(event.target.value)}
          placeholder="Можно оставить пустым"
          rows={2}
          maxLength={500}
        />
      </label>
      {error && <p className="trip-rating-error">{error}</p>}
      <button type="submit" className="trip-rating-submit" disabled={submitting}>
        {submitting ? "Отправляем..." : "Отправить оценку"}
      </button>
    </form>
  );
}

function SearchingOrderMeta({ order, estimate, route }) {
  const tariffName = orderTariffLabel(order, estimate);
  const price = order.price ?? estimate?.estimatedPrice;
  const tariffKey = cleanTariffKey({ name: order.tariff || estimate?.tariff?.name || "Economy" });
  const image = carImages[tariffKey] || carImages.Economy;
  const orderMinutes = Number(order.duration_min ?? order.durationMin);
  const orderKm = Number(order.distance_km ?? order.distanceKm);
  const summary = [
    formatTripMin(route, Number.isFinite(orderMinutes) && orderMinutes > 0 ? `${Math.ceil(orderMinutes)} мин` : ""),
    formatTripKm(route, Number.isFinite(orderKm) && orderKm > 0 ? `${orderKm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км` : "")
  ].filter(Boolean).join(" · ");
  return (
    <section className="search-order-meta" aria-label="Тариф и оплата">
      <span className="search-tariff-car">
        <img src={image} alt="" loading="lazy" />
      </span>
      <span className="search-tariff-copy">
        <strong>{tariffName}</strong>
        {summary && <small>{summary}</small>}
        <em>Оплата: <b>{paymentLabel(order.payment_method)}</b></em>
      </span>
      <span className="search-tariff-price">
        <b><Money value={price} /></b>
        <small>Детали</small>
      </span>
    </section>
  );
}

function DriverFoundMeta({ order, estimate }) {
  return (
    <div className="driver-found-meta">
      <span>
        <small>Цена</small>
        <b><Money value={tripPrice(order, estimate)} /></b>
      </span>
      <span>
        <small>Оплата</small>
        <b>{paymentLabel(order.payment_method)}</b>
      </span>
    </div>
  );
}

function TripDetailsSheet({ open, order, pickup, destination, status, driverName, carLine, estimate, onClose, onCancel, onSupport, canCancel = false, cancelDisabled }) {
  const [notice, setNotice] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (open) setNotice("");
  }, [open, order?.id]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const pickupText = pickup?.title || order.pickup_text || "Моё местоположение";
  const pickupSubtext = pickup?.subtitle || "Атакент";
  const dropoffText = destination?.title || order.dropoff_text || "Пункт назначения";
  const dropoffSubtext = destination?.subtitle || "Атакент";
  const tariffName = orderTariffLabel(order, estimate);
  const carText = [order.driver_car_color || order.driverCarColor || "Белый", order.driver_car_model || order.driverCarModel || ""].filter(Boolean).join(" ") || carLine || "Белый KIA Rio";
  const plate = order.driver_plate || order.vehicle_plate || order.car_plate || "123 ABC 02";
  const eta = Number(order?.driver_eta_min ?? order?.driverEtaMin ?? order?.etaMin ?? 2);
  const etaMin = Number.isFinite(eta) && eta > 0 ? Math.ceil(eta) : 2;
  const approachKm = Number(order?.driver_distance_km ?? order?.driverDistanceKm ?? 0.4);
  const approachText = `${etaMin} мин · ${String((Number.isFinite(approachKm) && approachKm > 0 ? approachKm : 0.4).toFixed(1)).replace(".", ",")} км от вас`;
  const numericId = String(order.short_id || order.public_id || order.id || "").replace(/\D/g, "").slice(-4);
  const orderId = `#${numericId || "4587"}`;
  const driverDisplayName = order.driver_name ? driverName : "Водитель ещё не назначен";
  const driverVerified = order.driver_name ? "Водитель проверен" : "Назначаем водителя";
  const shareText = `SmartTaxi ${orderId}: ${pickupText} → ${dropoffText}. ${driverDisplayName}, ${carText}, ${plate}.`;

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "SmartTaxi", text: shareText });
        if (mountedRef.current) setNotice("Детали поездки отправлены");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        if (mountedRef.current) setNotice("Детали поездки скопированы");
        return;
      }
      setNotice("Скопируйте ID заказа: " + orderId);
    } catch {
      if (mountedRef.current) setNotice("Поделиться не удалось. Попробуйте позже.");
    }
  }

  function handleSupport() {
    onClose();
    onSupport?.();
  }

  return (
    <>
      <div className="trip-details-backdrop trip-details-reference-backdrop" onClick={onClose} />
      <section className="trip-details-sheet trip-details-reference-sheet" role="dialog" aria-modal="true" aria-label="Детали поездки">
        <div className="trip-details-grip" aria-hidden="true" />
        <header className="trip-details-reference-header">
          <h2>Детали поездки</h2>
          <button type="button" className="trip-details-close-button" onClick={onClose} aria-label="Закрыть">
            <img src={tripDetailsAssets.close} alt="" />
          </button>
        </header>

        <section className="trip-details-route-block" aria-label="Маршрут">
          <span className="trip-details-route-rail" aria-hidden="true"><i /><b /></span>
          <div className="trip-details-route-copy">
            <small>Откуда</small>
            <strong>{pickupText}</strong>
            <em>{pickupSubtext}</em>
            <small>Куда</small>
            <strong>{dropoffText}</strong>
            <em>{dropoffSubtext}</em>
          </div>
        </section>

        <section className="trip-details-driver-row" aria-label="Водитель">
          <img className="trip-details-avatar" src={tripDetailsAssets.avatar} alt="" />
          <div className="trip-details-driver-copy">
            <strong>{driverDisplayName}</strong>
            <span>
              <Icon name="star" size={17} />
              <b>{driverRatingLabel(order)}</b>
              <i />
              <em>{driverTripsLabel(order)}</em>
            </span>
            <small><img src={tripDetailsAssets.verified} alt="" />{driverVerified}</small>
          </div>
          {order.driver_phone ? (
            <a className="trip-details-phone-button" href={`tel:${order.driver_phone}`} aria-label="Позвонить водителю">
              <img src={tripDetailsAssets.phone} alt="" />
            </a>
          ) : (
            <span className="trip-details-phone-button inactive" aria-label="Телефон водителя появится после назначения">
              <img src={tripDetailsAssets.phone} alt="" />
            </span>
          )}
        </section>

        <section className="trip-details-car-row" aria-label="Автомобиль">
          <div>
            <strong>{carText}</strong>
            <b>{plate}</b>
          </div>
          <span>{tariffName}</span>
        </section>

        <section className="trip-details-clean-list" aria-label="Информация о поездке">
          <TripDetailsCleanRow label="Подача" value={<><b>{etaMin} мин</b><span> · {approachText.replace(`${etaMin} мин · `, "")}</span></>} />
          <TripDetailsCleanRow label="Оплата" value={paymentLabel(order.payment_method)} />
          <TripDetailsCleanRow label="Стоимость" value={<Money value={tripPrice(order, estimate)} />} />
          <TripDetailsCleanRow label="ID заказа" value={orderId} />
        </section>

        <div className="trip-details-secondary-actions">
          <button type="button" onClick={handleSupport}>
            <img src={tripDetailsAssets.support} alt="" />
            Поддержка
          </button>
          <button type="button" onClick={handleShare}>
            <img src={tripDetailsAssets.share} alt="" />
            Поделиться
          </button>
        </div>

        {notice && <p className={`trip-details-notice ${notice.includes("не удалось") ? "danger" : ""}`}>{notice}</p>}

        {canCancel && (
          <button type="button" className="trip-details-cancel-order" onClick={onCancel} disabled={cancelDisabled}>
            Отменить заказ
          </button>
        )}
      </section>
    </>
  );
}

function TripDetailsCleanRow({ label, value }) {
  return (
    <div className="trip-details-clean-row">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function TripMapCard({ pickup, destination, driver, route, status, mode = "" }) {
  return (
    <section className={`trip-map-card ${mode ? `trip-map-${mode}` : ""}`}>
      <MapView pickup={pickup} destination={destination} driver={driver} route={route} center={driver || pickup || destination} compact status={status} />
    </section>
  );
}

function TripSummaryLine({ order, estimate }) {
  return (
    <div className="trip-summary-line">
      <span><b><Money value={order.price || estimate?.estimatedPrice} /></b><small>Цена</small></span>
      <span><b>{orderTariffLabel(order, estimate)}</b><small>Тариф</small></span>
      <span><b>{paymentLabel(order.payment_method)}</b><small>Оплата</small></span>
    </div>
  );
}

function normalizeKzPhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  let local = digits;
  if (local.length > 10 && local.startsWith("8")) local = local.slice(1);
  if (local.length > 10 && local.startsWith("7")) local = local.slice(1);
  return `+7${local.slice(0, 10)}`;
}

function kzPhoneDigits(value = "") {
  return normalizeKzPhone(value).replace(/\D/g, "").slice(1);
}

function formatKzPhoneInput(value = "") {
  const local = kzPhoneDigits(value);
  const groups = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 8), local.slice(8, 10)].filter(Boolean);
  return groups.join(" ");
}

function isValidKzPhone(value = "") {
  return kzPhoneDigits(value).length === 10;
}

function maskKzPhone(value = "") {
  const local = kzPhoneDigits(value);
  if (local.length < 4) return "+7";
  return `+7 ${local.slice(0, 3)} *** ** ${local.slice(-2)}`;
}

function formatKzPhoneDisplay(value = "") {
  const local = kzPhoneDigits(value);
  if (!local) return "Телефон не указан";
  const parts = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 8), local.slice(8, 10)].filter(Boolean);
  return `+7 ${parts.join(" ")}`;
}

function formatAuthTimer(seconds) {
  return `0:${String(Math.max(0, seconds)).padStart(2, "0")}`;
}

function PremiumAuthFlow({
  auth,
  setAuth,
  authMode,
  setAuthMode,
  registerForm,
  setRegisterForm,
  resetForm,
  setResetForm,
  message,
  setMessage,
  loading,
  onPhoneSubmit,
  onPasswordSubmit,
  onRegisterCodeSubmit,
  onRegister,
  onSendSms,
  onResetRequest,
  onResetCodeSubmit,
  onResetPassword,
  onAuthDone
}) {
  const isPhone = authMode === "phone";
  const isPassword = authMode === "password";
  const isRegisterCode = authMode === "registerCode";
  const isCreatePassword = authMode === "createPassword";
  const isForgot = authMode === "forgot";
  const isResetCode = authMode === "resetCode";
  const isNewPassword = authMode === "newPassword";
  const isSuccess = authMode === "success";
  const currentPhone = isResetCode || isNewPassword || isForgot ? resetForm.phone : registerForm.phone || auth.phone;
  const phoneReady = isValidKzPhone(auth.phone);
  const resetPhoneReady = isValidKzPhone(resetForm.phone);
  const registerCodeReady = registerForm.code.trim().length === 6;
  const resetCodeReady = resetForm.code.trim().length === 6;
  const [resendSeconds, setResendSeconds] = useState(45);
  useEffect(() => {
    if (isRegisterCode || isResetCode) setResendSeconds(45);
  }, [isRegisterCode, isResetCode, currentPhone]);
  useEffect(() => {
    if ((!isRegisterCode && !isResetCode) || resendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setResendSeconds(seconds => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [isRegisterCode, isResetCode, resendSeconds]);
  const title = isPhone
    ? "Вход и регистрация"
    : isPassword
      ? "Введите пароль"
      : isRegisterCode || isResetCode
        ? "Введите код из SMS"
        : isCreatePassword
          ? "Придумайте пароль"
          : isForgot
            ? "Восстановление пароля"
            : isNewPassword
              ? "Новый пароль"
              : "Готово!";
  const subtitle = isPhone
    ? "Введите номер телефона, чтобы продолжить"
    : isPassword
      ? "Добро пожаловать обратно! Введите пароль для входа"
      : isRegisterCode
        ? `Код отправлен на ${maskKzPhone(registerForm.phone || auth.phone)}`
        : isResetCode
          ? `Код отправлен на ${maskKzPhone(resetForm.phone)}`
          : isCreatePassword
            ? "Пароль должен содержать не менее 6 символов"
            : isForgot
              ? "Введите номер телефона, и мы отправим SMS с кодом для сброса пароля"
              : isNewPassword
                ? "Придумайте новый пароль для своего аккаунта"
                : "Пароль успешно изменён. Теперь вы можете войти в свой аккаунт.";
  const registerPasswordReady = registerForm.password.length >= 6 && registerForm.password === registerForm.repeat && registerForm.name.trim().length >= 2;
  const resetPasswordReady = resetForm.password.length >= 6 && resetForm.password === resetForm.repeat;
  const canGoBack = !isPhone && !isSuccess;
  const goBack = () => {
    setMessage("");
    if (isPassword || isRegisterCode || isForgot) setAuthMode("phone");
    else if (isCreatePassword) setAuthMode("registerCode");
    else if (isResetCode) setAuthMode("forgot");
    else if (isNewPassword) setAuthMode("resetCode");
  };

  return (
    <section className={`premium-auth-screen ${isPhone ? "auth-reference-welcome-screen" : "auth-reference-step-screen"} ${isSuccess ? "auth-reference-success-screen" : ""}`} aria-label="Вход и регистрация SmartTaxi">
      <AuthStatusBar />
      <div className={`auth-topbar ${isPhone ? "welcome" : ""}`}>
        {canGoBack ? (
          <button type="button" className="auth-back-button" onClick={goBack} aria-label="Назад">
            <IconAsset name="back" />
          </button>
        ) : <span />}
        <span />
        <span />
      </div>

      {isPhone ? (
        <section className="auth-welcome-hero" aria-hidden="true">
          <div className="auth-photo-brand">
            <img className="auth-s-mark" src={authWelcomeAssets.sMark} alt="" />
            <img className="auth-brand-wordmark" src={authWelcomeAssets.wordmark} alt="" />
            <p>Ваш комфорт. Наша забота</p>
          </div>
        </section>
      ) : null}

      <section className={`auth-panel ${isSuccess ? "success" : ""}`}>
        {isSuccess ? (
          <>
            <div className="auth-success-mark"><IconAsset name="check" /></div>
            <h1>{title}</h1>
            <p>{message || "Доступ к аккаунту подтверждён."}</p>
            <Button className="wide primary-brand auth-primary-button" type="button" onClick={onAuthDone}>Войти</Button>
          </>
        ) : (
          <>
            <div className="auth-title-block">
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>

            {isPhone && (
              <form className="auth-form" onSubmit={onPhoneSubmit}>
                <PhoneField value={auth.phone} onChange={phone => setAuth(current => ({ ...current, phone }))} variant="welcome" />
                <Button className="wide primary-brand auth-primary-button" type="submit" disabled={loading || !phoneReady}>
                  <span>{loading ? "Проверяем..." : "Продолжить"}</span>
                  <img className="auth-button-arrow" src={authWelcomeAssets.arrowRight} alt="" />
                </Button>
                <div className="auth-sms-notice">
                  <img src={authWelcomeAssets.shield} alt="" />
                  <span>Мы отправим SMS с кодом подтверждения.<br />Это быстро и безопасно.</span>
                </div>
              </form>
            )}

            {isPassword && (
              <form className="auth-form" onSubmit={onPasswordSubmit}>
                <PasswordField label="Пароль" value={auth.password} onChange={password => setAuth(current => ({ ...current, password }))} autoComplete="current-password" />
                <button type="button" className="auth-link-button" onClick={() => {
                  setMessage("");
                  setResetForm(current => ({ ...current, phone: auth.phone }));
                  setAuthMode("forgot");
                }}>Забыли пароль?</button>
                <Button className="wide primary-brand auth-primary-button" type="submit" disabled={loading || auth.password.length < 6}>
                  {loading ? "Входим..." : "Войти"}
                </Button>
              </form>
            )}

            {isRegisterCode && (
              <form className="auth-form" onSubmit={onRegisterCodeSubmit}>
                <SmsCodeField value={registerForm.code} onChange={code => setRegisterForm(current => ({ ...current, code }))} />
                <button type="button" className="auth-link-button" onClick={() => { setResendSeconds(45); onSendSms(); }} disabled={loading || resendSeconds > 0}>
                  {loading ? "Отправляем..." : resendSeconds > 0 ? `Повторно через ${formatAuthTimer(resendSeconds)}` : "Отправить код ещё раз"}
                </button>
                <Button className="wide primary-brand auth-primary-button" type="submit" disabled={loading || !registerCodeReady}>
                  Подтвердить код
                </Button>
              </form>
            )}

            {isCreatePassword && (
              <form className="auth-form" onSubmit={onRegister}>
                <AuthTextField label="Имя" value={registerForm.name} onChange={name => setRegisterForm(current => ({ ...current, name }))} placeholder="Ваше имя" autoComplete="name" />
                <PasswordField label="Пароль" value={registerForm.password} onChange={password => setRegisterForm(current => ({ ...current, password }))} autoComplete="new-password" />
                <PasswordField label="Повторите пароль" value={registerForm.repeat} onChange={repeat => setRegisterForm(current => ({ ...current, repeat }))} autoComplete="new-password" />
                <PasswordChecklist password={registerForm.password} repeat={registerForm.repeat} />
                <Button className="wide primary-brand auth-primary-button" type="submit" disabled={loading || !registerPasswordReady}>
                  {loading ? "Создаём..." : "Создать аккаунт"}
                </Button>
              </form>
            )}

            {isForgot && (
              <form className="auth-form" onSubmit={onResetRequest}>
                <PhoneField value={resetForm.phone} onChange={phone => setResetForm(current => ({ ...current, phone }))} autoFocus />
                <Button className="wide primary-brand auth-primary-button" type="submit" disabled={loading || !resetPhoneReady}>
                  {loading ? "Отправляем..." : "Получить код"}
                </Button>
                <button type="button" className="auth-link-button" onClick={() => { setMessage(""); setAuthMode("password"); }}>Я вспомнил пароль</button>
              </form>
            )}

            {isResetCode && (
              <form className="auth-form" onSubmit={onResetCodeSubmit}>
                <SmsCodeField value={resetForm.code} onChange={code => setResetForm(current => ({ ...current, code }))} />
                <button type="button" className="auth-link-button" onClick={() => { setResendSeconds(45); onResetRequest(); }} disabled={loading || resendSeconds > 0}>
                  {loading ? "Отправляем..." : resendSeconds > 0 ? `Повторно через ${formatAuthTimer(resendSeconds)}` : "Отправить код повторно"}
                </button>
                <Button className="wide primary-brand auth-primary-button" type="submit" disabled={loading || !resetCodeReady}>
                  Подтвердить код
                </Button>
              </form>
            )}

            {isNewPassword && (
              <form className="auth-form" onSubmit={onResetPassword}>
                <PasswordField label="Новый пароль" value={resetForm.password} onChange={password => setResetForm(current => ({ ...current, password }))} autoComplete="new-password" />
                <PasswordField label="Повторите пароль" value={resetForm.repeat} onChange={repeat => setResetForm(current => ({ ...current, repeat }))} autoComplete="new-password" />
                <PasswordChecklist password={resetForm.password} repeat={resetForm.repeat} />
                <Button className="wide primary-brand auth-primary-button" type="submit" disabled={loading || !resetPasswordReady}>
                  {loading ? "Сохраняем..." : "Сохранить пароль"}
                </Button>
              </form>
            )}

            {message && <p className={`auth-message ${/создан|измен|отправлен|подтвержд/i.test(message) ? "success" : "danger"}`}>{message}</p>}
          </>
        )}
      </section>

      <div className="auth-legal">
        <span className="auth-legal-row">
          <span className="auth-legal-line" />
          <span>Продолжая, вы соглашаетесь с</span>
          <span className="auth-legal-line" />
        </span>
        <span className="auth-legal-links">
          <a className="auth-legal-link" href="/legal/terms.html" target="_blank" rel="noreferrer">Условиями использования</a>
          <span> и </span>
          <a className="auth-legal-link" href="/legal/privacy.html" target="_blank" rel="noreferrer">Политикой конфиденциальности</a>
        </span>
      </div>
    </section>
  );
}

function AuthStatusBar() {
  return (
    <div className="auth-status-bar" aria-hidden="true">
      <span>9:41</span>
      <span className="auth-status-icons"><i /><i /><i /></span>
    </div>
  );
}

function PhoneField({ value, onChange, autoFocus = false, variant = "default" }) {
  const formattedValue = formatKzPhoneInput(value);
  const complete = isValidKzPhone(value);
  const isWelcome = variant === "welcome";
  return (
    <label className={`auth-field ${complete ? "complete" : ""}`}>
      <span>Номер телефона</span>
      <div className={`auth-phone-input ${isWelcome ? "welcome" : ""}`}>
        {isWelcome ? null : <b>KZ</b>}
        <small>+7</small>
        <input value={formattedValue} onChange={event => onChange(normalizeKzPhone(event.target.value))} placeholder={isWelcome ? "Номер телефона" : "701 123 45 67"} inputMode="tel" autoComplete="tel" autoFocus={autoFocus} />
      </div>
    </label>
  );
}

function AuthTextField({ label, value, onChange, placeholder, autoComplete }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} />
    </label>
  );
}

function PasswordField({ label, value, onChange, autoComplete, placeholder = label }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-password-input">
        <Icon name="shield" size={18} />
        <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} type={visible ? "text" : "password"} autoComplete={autoComplete} />
        <button type="button" className="auth-eye-toggle" onClick={() => setVisible(current => !current)} aria-label={visible ? "Скрыть пароль" : "Показать пароль"}>
          {visible ? "Скрыть" : "Показать"}
        </button>
      </div>
    </label>
  );
}

function SmsCodeField({ value, onChange }) {
  const chars = value.padEnd(6, " ").slice(0, 6).split("");
  return (
    <label className="auth-field">
      <span>SMS-код</span>
      <input className="auth-hidden-code-input" value={value} onChange={event => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" aria-label="SMS-код" />
      <div className="auth-code-grid" aria-hidden="true">
        {chars.map((char, index) => <span key={index} className={value.length === index ? "active" : ""}>{char.trim()}</span>)}
      </div>
    </label>
  );
}

function PasswordChecklist({ password, repeat }) {
  const longEnough = password.length >= 6;
  const same = Boolean(repeat) && password === repeat;
  return (
    <div className="auth-checklist">
      <span className={longEnough ? "ok" : ""}><Icon name="check" size={14} /> Минимум 6 символов</span>
      <span className={same ? "ok" : ""}><Icon name="check" size={14} /> Пароли совпадают</span>
    </div>
  );
}

function ProfileSection({
  authenticated,
  rider,
  setRider,
  auth,
  setAuth,
  authMode,
  setAuthMode,
  registerForm,
  setRegisterForm,
  resetForm,
  setResetForm,
  message,
  setMessage,
  loading,
  onPhoneSubmit,
  onPasswordSubmit,
  onRegisterCodeSubmit,
  onRegister,
  onSendSms,
  onResetRequest,
  onResetCodeSubmit,
  onResetPassword,
  onLogout,
  onAuthDone
}) {
  if (!authenticated || authMode === "success") {
    return (
      <PremiumAuthFlow
        auth={auth}
        setAuth={setAuth}
        authMode={authMode}
        setAuthMode={setAuthMode}
        registerForm={registerForm}
        setRegisterForm={setRegisterForm}
        resetForm={resetForm}
        setResetForm={setResetForm}
        message={message}
        setMessage={setMessage}
        loading={loading}
        onPhoneSubmit={onPhoneSubmit}
        onPasswordSubmit={onPasswordSubmit}
        onRegisterCodeSubmit={onRegisterCodeSubmit}
        onRegister={onRegister}
        onSendSms={onSendSms}
        onResetRequest={onResetRequest}
        onResetCodeSubmit={onResetCodeSubmit}
        onResetPassword={onResetPassword}
        onAuthDone={onAuthDone}
      />
    );
  }
  const isRegister = authMode === "register";
  return (
    <section className={`screen-grid profile-screen ${authenticated ? "" : "auth-profile-screen"} ${!authenticated && isRegister ? "register-mode" : ""}`}>
      {authenticated ? (
        <section className="screen-intro"><h1>Профиль</h1><p>Аккаунт пассажира</p></section>
      ) : (
        <section className="auth-hero-panel">
          <SmartTaxiLogo large />
          <div>
            <strong>SmartTaxi</strong>
            <span>{isRegister ? "Создайте аккаунт для поездок" : "Войдите, чтобы заказать поездку"}</span>
          </div>
        </section>
      )}
      <section className="app-card account-card premium-profile-card">
        <div className={`profile-avatar-row ${authenticated ? "" : "auth-card-title"}`}>
          <SmartTaxiLogo />
          <div>
            <h2>{authenticated ? rider.name || "Пассажир" : isRegister ? "Создать аккаунт" : "Вход"}</h2>
            <span>{authenticated ? rider.phone || "Телефон не указан" : isRegister ? "Имя, телефон и пароль" : "Телефон и пароль"}</span>
          </div>
        </div>
        {!authenticated ? (
          <>
            <div className="auth-mode-switch" aria-label="Выбор входа">
              <button type="button" className={!isRegister ? "active" : ""} onClick={() => setAuthMode("login")}>Войти</button>
              <button type="button" className={isRegister ? "active" : ""} onClick={() => setAuthMode("register")}>Регистрация</button>
            </div>
            {isRegister ? (
              <form className="form-grid premium-login-form" onSubmit={onRegister}>
                <label>Имя<input value={registerForm.name} onChange={event => setRegisterForm({ ...registerForm, name: event.target.value })} placeholder="Ваше имя" autoComplete="name" /></label>
                <label>Телефон<input value={registerForm.phone} onChange={event => setRegisterForm({ ...registerForm, phone: event.target.value })} placeholder="+7" inputMode="tel" autoComplete="tel" /></label>
                <button type="button" className="auth-sms-button" onClick={onSendSms} disabled={loading || !registerForm.phone.trim()}>
                  {registerForm.smsSent ? "Отправить код ещё раз" : "Получить SMS-код"}
                </button>
                <label>SMS-код<input value={registerForm.code} onChange={event => setRegisterForm({ ...registerForm, code: event.target.value })} placeholder={registerForm.devCode || "6 цифр"} inputMode="numeric" autoComplete="one-time-code" /></label>
                <label>Пароль<input value={registerForm.password} onChange={event => setRegisterForm({ ...registerForm, password: event.target.value })} placeholder="Минимум 6 символов" type="password" autoComplete="new-password" /></label>
                <label>Повторите пароль<input value={registerForm.repeat} onChange={event => setRegisterForm({ ...registerForm, repeat: event.target.value })} placeholder="Повторите пароль" type="password" autoComplete="new-password" /></label>
                {message && <p className={message.includes("создан") ? "state-note success" : "state-note danger"}>{message}</p>}
                <Button className="wide primary-brand" type="submit" disabled={loading}>{loading ? "Создаём..." : "Создать аккаунт"}</Button>
              </form>
            ) : (
              <form className="form-grid premium-login-form" onSubmit={onSubmit}>
                <label>Телефон<input value={auth.phone} onChange={event => setAuth({ ...auth, phone: event.target.value })} placeholder="+7" inputMode="tel" autoComplete="tel" /></label>
                <label>Пароль<input value={auth.password} onChange={event => setAuth({ ...auth, password: event.target.value })} placeholder="Пароль" type="password" autoComplete="current-password" /></label>
                {message && <p className={message.includes("Вход") ? "state-note success" : "state-note danger"}>{message}</p>}
                <Button className="wide primary-brand" type="submit" disabled={loading}>{loading ? "Входим..." : "Войти"}</Button>
              </form>
            )}
          </>
        ) : (
          <div className="profile-actions-grid">
            <label>Имя<input value={rider.name} onChange={event => setRider({ ...rider, name: event.target.value })} /></label>
            <label>Телефон для заказа<input value={rider.phone} onChange={event => setRider({ ...rider, phone: event.target.value })} inputMode="tel" /></label>
            <article><Icon name="star" /><div><b>Избранные адреса</b><span>Добавляются из поездок</span></div></article>
            <article><Icon name="card" /><div><b>Способы оплаты</b><span>Наличные или Kaspi при заказе</span></div></article>
            <button type="button" className="danger" onClick={onLogout}><Icon name="logout" /> Выйти</button>
          </div>
        )}
      </section>
    </section>
  );
}

const supportTopics = [
  { code: "Проблема с поездкой", label: "Проблема с поездкой" },
  { code: "Водитель не приехал", label: "Водитель не приехал" },
  { code: "LOST_ITEM", label: "Забыл вещь" },
  { code: "Оплата", label: "Оплата" },
  { code: "Безопасность", label: "Безопасность" },
  { code: "Другое", label: "Другое" }
];

function ClientAccessGate({ title, text = "Войдите в аккаунт, чтобы открыть этот раздел." }) {
  return (
    <section className="screen-grid drawer-linked-screen">
      <section className="screen-intro"><h1>{title}</h1><p>{text}</p></section>
      <section className="app-card drawer-linked-card"><p className="state-note">Для просмотра персональных данных требуется вход в SmartTaxi.</p></section>
    </section>
  );
}

function NotificationsSection({ authenticated }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [], unread: 0 });
  const load = async () => {
    if (!authenticated) return;
    setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const data = await getNotifications({ limit: 50 });
      setState({ loading: false, error: "", rows: data.notifications || [], unread: Number(data.unreadCount || 0) });
    } catch (error) {
      setState(current => ({ ...current, loading: false, error: formatError(error) }));
    }
  };
  useEffect(() => { load(); }, [authenticated]);
  if (!authenticated) return <ClientAccessGate title="Уведомления" text="Статусы поездок, сообщения и важные события." />;
  async function read(notification) {
    if (notification.read_at) return;
    try {
      await markNotificationRead(notification.id);
      setState(current => ({ ...current, rows: current.rows.map(row => row.id === notification.id ? { ...row, read_at: new Date().toISOString() } : row), unread: Math.max(0, current.unread - 1) }));
    } catch (error) { setState(current => ({ ...current, error: formatError(error) })); }
  }
  async function readAll() {
    try {
      await markAllNotificationsRead();
      setState(current => ({ ...current, rows: current.rows.map(row => ({ ...row, read_at: row.read_at || new Date().toISOString() })), unread: 0 }));
    } catch (error) { setState(current => ({ ...current, error: formatError(error) })); }
  }
  return (
    <section className="screen-grid drawer-linked-screen client-data-screen">
      <section className="screen-intro"><h1>Уведомления</h1><p>Статусы заказов, ответы поддержки и сервисные сообщения.</p></section>
      <section className="app-card drawer-linked-card">
        <div className="client-data-toolbar"><b>{state.unread ? `Новых: ${state.unread}` : "Все прочитано"}</b><button type="button" onClick={readAll} disabled={!state.unread}>Прочитать все</button></div>
        {state.loading ? <p className="state-note">Загружаем уведомления...</p> : state.error ? <p className="state-note danger">{state.error}</p> : !state.rows.length ? <p className="state-note">Здесь появятся статусы поездок и важные сообщения.</p> : (
          <div className="client-data-list">{state.rows.map(item => <button type="button" key={item.id} className={`client-notification-row ${item.read_at ? "read" : "unread"}`} onClick={() => read(item)}><Icon name="bell" size={19} /><span><b>{item.title || "SmartTaxi"}</b><small>{item.body || ""}</small><em>{formatClientDate(item.created_at)}</em></span>{!item.read_at && <i />}</button>)}</div>
        )}
      </section>
    </section>
  );
}

function RecurringBookingsSection({ authenticated }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [], templates: [], templateId: "", days: [1, 2, 3, 4, 5], time: "08:00", price: "", changing: "", saving: false });
  const load = async () => {
    if (!authenticated) return;
    setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const [data, history] = await Promise.all([getRecurringBookings(), getClientTripHistory({ limit: 50 })]);
      const templates = (history.orders || []).filter(item => (item.driver_id || item.driverId) && Number(item.pickup_lat ?? item.pickupLat) && Number(item.dropoff_lat ?? item.dropoffLat));
      setState(current => ({ ...current, loading: false, error: "", rows: data.bookings || [], templates, templateId: current.templateId || templates[0]?.id || "", price: current.price || String(Math.round(Number(templates[0]?.final_price ?? templates[0]?.price ?? 0)) || "") }));
    }
    catch (error) { setState(current => ({ ...current, loading: false, error: formatError(error) })); }
  };
  useEffect(() => { load(); }, [authenticated]);
  if (!authenticated) return <ClientAccessGate title="Регулярные поездки" text="Настройте постоянные маршруты с выбранным водителем." />;
  async function change(booking, status) {
    setState(current => ({ ...current, changing: booking.id, error: "" }));
    try {
      const data = await updateRecurringBookingStatus(booking.id, status);
      setState(current => ({ ...current, changing: "", rows: current.rows.map(row => row.id === booking.id ? (data.booking || { ...row, status }) : row) }));
    } catch (error) { setState(current => ({ ...current, changing: "", error: formatError(error) })); }
  }
  function toggleDay(day) {
    setState(current => ({ ...current, days: current.days.includes(day) ? current.days.filter(value => value !== day) : [...current.days, day].sort() }));
  }
  async function create(event) {
    event.preventDefault();
    const template = state.templates.find(item => item.id === state.templateId);
    if (!template || !state.days.length || state.saving) return;
    const read = (snake, camel) => template[snake] ?? template[camel];
    const payload = {
      driverId: read("driver_id", "driverId"),
      pickupText: read("pickup_text", "pickupText"),
      pickupLat: Number(read("pickup_lat", "pickupLat")),
      pickupLng: Number(read("pickup_lng", "pickupLng")),
      dropoffText: read("dropoff_text", "dropoffText"),
      dropoffLat: Number(read("dropoff_lat", "dropoffLat")),
      dropoffLng: Number(read("dropoff_lng", "dropoffLng")),
      daysOfWeek: state.days,
      timeOfDay: state.time,
      priceKzt: Number(state.price)
    };
    if (!payload.driverId || !payload.pickupText || !payload.dropoffText || !Number.isInteger(payload.priceKzt) || payload.priceKzt <= 0) { setState(current => ({ ...current, error: "Проверьте цену и выберите завершённую поездку с водителем." })); return; }
    setState(current => ({ ...current, saving: true, error: "" }));
    try {
      const data = await createRecurringBooking(payload);
      setState(current => ({ ...current, saving: false, rows: [data.booking, ...current.rows] }));
    } catch (error) { setState(current => ({ ...current, saving: false, error: formatError(error) })); }
  }
  return (
    <section className="screen-grid drawer-linked-screen client-data-screen">
      <section className="screen-intro"><h1>Регулярные поездки</h1><p>Ваши постоянные маршруты. Их можно поставить на паузу или отменить.</p></section>
      <section className="app-card drawer-linked-card">
        {state.loading ? <p className="state-note">Загружаем маршруты...</p> : <>{state.error && <p className="state-note danger">{state.error}</p>}{state.templates.length > 0 && <form className="client-mini-form recurring-create-form" onSubmit={create}><b>Новый регулярный маршрут</b><label>Основа: завершённая поездка<select value={state.templateId} onChange={event => setState(current => ({ ...current, templateId: event.target.value }))}>{state.templates.map(item => <option value={item.id} key={item.id}>{item.pickup_text || item.pickupText} → {item.dropoff_text || item.dropoffText}</option>)}</select></label><div className="client-form-row"><label>Время<input type="time" value={state.time} onChange={event => setState(current => ({ ...current, time: event.target.value }))} /></label><label>Цена, ₸<input inputMode="numeric" value={state.price} onChange={event => setState(current => ({ ...current, price: event.target.value.replace(/[^\d]/g, "") }))} /></label></div><div className="weekday-picker">{[[1,"Пн"],[2,"Вт"],[3,"Ср"],[4,"Чт"],[5,"Пт"]].map(([day,label]) => <button type="button" className={state.days.includes(day) ? "selected" : ""} onClick={() => toggleDay(day)} key={day}>{label}</button>)}</div><Button className="primary-brand" disabled={state.saving || !state.days.length}>{state.saving ? "Создаём…" : "Предложить водителю"}</Button></form>}{!state.rows.length ? <p className="state-note">Регулярных поездок пока нет. Для создания выберите завершённую поездку с водителем.</p> : <div className="client-data-list">{state.rows.map(item => {
          const active = item.status === "ACTIVE";
          const changing = state.changing === item.id;
          return <article className="client-recurring-card" key={item.id}><div><b>{item.pickupText || item.pickup_text} → {item.dropoffText || item.dropoff_text}</b><small>{item.daysLabel || item.days_label || "По расписанию"} · {item.timeOfDay || item.time_of_day || "Время не задано"}</small><em>{item.driverName || item.driver_name || "Назначенный водитель"} · {recurringStatusLabel(item.status)}</em></div><div className="client-inline-actions">{item.status !== "CANCELLED" && <button type="button" disabled={changing} onClick={() => change(item, active ? "PAUSED" : "ACTIVE")}>{changing ? "…" : active ? "Пауза" : "Возобновить"}</button>}{item.status !== "CANCELLED" && <button type="button" className="danger" disabled={changing} onClick={() => change(item, "CANCELLED")}>Отменить</button>}</div></article>;
        })}</div>}</>}
      </section>
    </section>
  );
}

function DriverPreferencesSection({ authenticated }) {
  const [state, setState] = useState({ loading: true, error: "", rows: [], candidates: [], removing: "", selectedDriverId: "", selectedType: "FAVORITE", saving: false });
  const load = async () => {
    if (!authenticated) return;
    setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const [preferences, history] = await Promise.all([getDriverPreferences(), getClientTripHistory({ limit: 50 })]);
      const known = new Map();
      (history.orders || []).forEach(order => {
        const id = order.driver_id || order.driverId;
        if (id) known.set(id, { id, name: order.driver_name || order.driverName || "Водитель", car: driverVehicleLine(order) });
      });
      const rows = preferences.preferences || [];
      const selectedDriverId = [...known.keys()].find(id => !rows.some(row => (row.driverId || row.driver_id) === id)) || "";
      setState(current => ({ ...current, loading: false, error: "", rows, candidates: [...known.values()], removing: "", selectedDriverId }));
    }
    catch (error) { setState(current => ({ ...current, loading: false, error: formatError(error) })); }
  };
  useEffect(() => { load(); }, [authenticated]);
  if (!authenticated) return <ClientAccessGate title="Мои водители" text="Избранные и заблокированные водители сохраняются в аккаунте." />;
  async function remove(item) {
    const driverId = item.driverId || item.driver_id;
    if (!driverId) return;
    setState(current => ({ ...current, removing: driverId, error: "" }));
    try { await removeDriverPreference(driverId); setState(current => ({ ...current, removing: "", rows: current.rows.filter(row => (row.driverId || row.driver_id) !== driverId) })); }
    catch (error) { setState(current => ({ ...current, removing: "", error: formatError(error) })); }
  }
  async function savePreference(event) {
    event.preventDefault();
    if (!state.selectedDriverId || state.saving) return;
    setState(current => ({ ...current, saving: true, error: "" }));
    try {
      await setDriverPreference({ driverId: state.selectedDriverId, type: state.selectedType });
      await load();
    } catch (error) { setState(current => ({ ...current, saving: false, error: formatError(error) })); }
  }
  return (
    <section className="screen-grid drawer-linked-screen client-data-screen">
      <section className="screen-intro"><h1>Мои водители</h1><p>Водители, которых вы добавили в избранное или исключили из подбора.</p></section>
      <section className="app-card drawer-linked-card">
        {state.loading ? <p className="state-note">Загружаем список...</p> : <>{state.error && <p className="state-note danger">{state.error}</p>}{state.candidates.length > 0 && <form className="client-mini-form" onSubmit={savePreference}><label>Водитель из прошлых поездок<select value={state.selectedDriverId} onChange={event => setState(current => ({ ...current, selectedDriverId: event.target.value }))}>{state.candidates.map(driver => <option value={driver.id} key={driver.id}>{driver.name}{driver.car ? ` · ${driver.car}` : ""}</option>)}</select></label><label>Настройка<select value={state.selectedType} onChange={event => setState(current => ({ ...current, selectedType: event.target.value }))}><option value="FAVORITE">Добавить в избранное</option><option value="BLOCKED">Не предлагать этого водителя</option></select></label><Button className="primary-brand" disabled={state.saving || !state.selectedDriverId}>{state.saving ? "Сохраняем…" : "Сохранить"}</Button></form>}{!state.rows.length ? <p className="state-note">Здесь появятся ваши предпочтения после оценки или настройки водителя в поездке.</p> : <div className="client-data-list">{state.rows.map(item => { const id = item.driverId || item.driver_id; const blocked = (item.type || "").toUpperCase() === "BLOCKED"; return <article className="client-recurring-card" key={id}><div><b>{item.driverName || item.driver_name || "Водитель"}</b><small>{item.driverCarModel || item.driver_car_model || "Автомобиль не указан"} {item.driverPlate || item.driver_plate || ""}</small><em className={blocked ? "danger-text" : "success-text"}>{blocked ? "Не предлагать этого водителя" : "Избранный водитель"}</em></div><button type="button" className="client-text-button" disabled={state.removing === id} onClick={() => remove(item)}>{state.removing === id ? "Удаляем…" : "Убрать"}</button></article>; })}</div>}</>}
      </section>
    </section>
  );
}

function WalletSection({ authenticated }) {
  const [state, setState] = useState({ loading: true, error: "", wallet: null, cards: [], topup: "1000", cardNumber: "", holderName: "", saving: false });
  const load = async () => {
    if (!authenticated) return;
    setState(current => ({ ...current, loading: true, error: "" }));
    try {
      const [wallet, cards] = await Promise.all([getClientWallet(), getClientWalletCards()]);
      setState(current => ({ ...current, loading: false, error: "", wallet, cards: cards.cards || [] }));
    } catch (error) { setState(current => ({ ...current, loading: false, error: formatError(error) })); }
  };
  useEffect(() => { load(); }, [authenticated]);
  if (!authenticated) return <ClientAccessGate title="Кошелёк" text="Кешбэк, привязанные карты и заявки на пополнение." />;
  async function requestTopup(event) {
    event.preventDefault();
    const amount = Number(state.topup);
    if (!Number.isInteger(amount) || amount < 500) { setState(current => ({ ...current, error: "Минимальная сумма пополнения — 500 ₸" })); return; }
    setState(current => ({ ...current, saving: true, error: "" }));
    try { await createClientWalletTopup(amount); setState(current => ({ ...current, saving: false, error: "", topup: "", topupNotice: "Заявка на пополнение создана. Статус появится после обработки Kaspi Pay." })); }
    catch (error) { setState(current => ({ ...current, saving: false, error: formatError(error) })); }
  }
  async function addCard(event) {
    event.preventDefault();
    if (!state.cardNumber.trim()) return;
    setState(current => ({ ...current, saving: true, error: "" }));
    try { const data = await addClientWalletCard({ cardNumber: state.cardNumber, holderName: state.holderName }); setState(current => ({ ...current, saving: false, cards: [...current.cards, data.card], cardNumber: "", holderName: "" })); }
    catch (error) { setState(current => ({ ...current, saving: false, error: formatError(error) })); }
  }
  async function defaultCard(id) {
    try { const data = await setDefaultClientWalletCard(id); setState(current => ({ ...current, cards: data.cards || current.cards })); }
    catch (error) { setState(current => ({ ...current, error: formatError(error) })); }
  }
  async function removeCard(id) {
    try { await deleteClientWalletCard(id); setState(current => ({ ...current, cards: current.cards.filter(card => card.id !== id) })); }
    catch (error) { setState(current => ({ ...current, error: formatError(error) })); }
  }
  return (
    <section className="screen-grid drawer-linked-screen client-data-screen">
      <section className="screen-intro"><h1>Кошелёк</h1><p>Кешбэк SmartTaxi, карты и заявки на пополнение.</p></section>
      <section className="app-card drawer-linked-card wallet-client-card">
        {state.loading ? <p className="state-note">Загружаем кошелёк...</p> : <><div className="wallet-balance"><span>Доступный кешбэк</span><b>{Number(state.wallet?.balanceKzt || 0).toLocaleString("ru-RU")} ₸</b><small>Используется при оплате поездки</small></div>{state.error && <p className="state-note danger">{state.error}</p>}{state.topupNotice && <p className="state-note success">{state.topupNotice}</p>}<form className="client-mini-form" onSubmit={requestTopup}><label>Пополнить кошелёк, ₸<input inputMode="numeric" value={state.topup} onChange={event => setState(current => ({ ...current, topup: event.target.value.replace(/[^\d]/g, "") }))} /></label><Button className="primary-brand" disabled={state.saving}>{state.saving ? "Обрабатываем…" : "Создать заявку"}</Button></form><div className="client-card-heading"><b>Привязанные карты</b><small>Номер хранится только в маскированном виде</small></div>{state.cards.length ? <div className="client-data-list">{state.cards.map(card => <article className="client-recurring-card" key={card.id}><div><b>{card.maskedCardNumber}</b><small>{card.holderName || "Карта SmartTaxi"}</small><em>{card.isDefault ? "Основная карта" : ""}</em></div><div className="client-inline-actions">{!card.isDefault && <button type="button" onClick={() => defaultCard(card.id)}>Сделать основной</button>}<button type="button" className="danger" onClick={() => removeCard(card.id)}>Удалить</button></div></article>)}</div> : <p className="state-note">Карт пока нет.</p>}<form className="client-mini-form" onSubmit={addCard}><label>Номер карты<input inputMode="numeric" autoComplete="cc-number" value={state.cardNumber} onChange={event => setState(current => ({ ...current, cardNumber: event.target.value.replace(/[^\d ]/g, "") }))} placeholder="0000 0000 0000 0000" /></label><label>Имя владельца<input autoComplete="cc-name" value={state.holderName} onChange={event => setState(current => ({ ...current, holderName: event.target.value }))} placeholder="Как на карте" /></label><Button className="primary-brand" disabled={state.saving || !state.cardNumber.trim()}>Добавить карту</Button></form></>}
      </section>
    </section>
  );
}

function formatClientDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-KZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function recurringStatusLabel(status) {
  return ({ ACTIVE: "Активна", PAUSED: "На паузе", PENDING_DRIVER: "Ожидает водителя", CANCELLED: "Отменена" })[status] || status || "";
}

function DriverApplicationSection({ authenticated, rider, onLogin }) {
  const [form, setForm] = useState(() => ({
    fullName: rider?.name || "",
    phone: rider?.phone || "",
    carModel: "",
    carColor: "",
    plateNumber: "",
    year: "",
    comment: ""
  }));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [application, setApplication] = useState(null);
  const [documentType, setDocumentType] = useState("ID_CARD_FRONT");
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm(current => ({
      ...current,
      fullName: current.fullName || rider?.name || "",
      phone: current.phone || rider?.phone || ""
    }));
  }, [rider?.name, rider?.phone]);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    const phoneDigits = String(form.phone).replace(/\D/g, "");
    if (form.fullName.trim().length < 2) return setError("Укажите имя и фамилию.");
    if (phoneDigits.length < 6) return setError("Укажите корректный номер телефона.");
    if (form.carModel.trim().length < 2) return setError("Укажите модель автомобиля.");
    if (form.plateNumber.trim().length < 2) return setError("Укажите госномер автомобиля.");
    if (!termsAccepted) return setError("Подтвердите согласие с правилами SmartTaxi.");
    setLoading(true);
    try {
      const result = await submitDriverApplication({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        carModel: form.carModel.trim(),
        carColor: form.carColor.trim(),
        plateNumber: form.plateNumber.trim(),
        year: form.year.trim() ? Number(form.year) : undefined,
        comment: form.comment.trim()
      });
      setApplication(result.application);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !application?.id) return;
    setError("");
    setUploading(true);
    try {
      const result = await uploadDriverApplicationDocument({ applicationId: application.id, file, type: documentType });
      setDocuments(current => [...current, result.document]);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setUploading(false);
    }
  }

  if (!authenticated) {
    return (
      <section className="client-simple-section driver-application-section">
        <h1>Стать водителем</h1>
        <p>Войдите в аккаунт, чтобы заполнить заявку водителя и видеть её статус.</p>
        <button type="button" className="app-button primary-brand" onClick={onLogin}>Войти</button>
      </section>
    );
  }

  if (application) {
    return (
      <section className="client-simple-section driver-application-section">
        <span className="driver-application-success" aria-hidden="true">✓</span>
        <h1>Заявка отправлена</h1>
        <p>Мы проверим данные и свяжемся с вами. Пока можно приложить документы — JPG, PNG или PDF до 8 МБ.</p>
        <div className="driver-document-upload">
          <select value={documentType} onChange={event => setDocumentType(event.target.value)} aria-label="Тип документа">
            <option value="ID_CARD_FRONT">Удостоверение личности — лицевая сторона</option>
            <option value="ID_CARD_BACK">Удостоверение личности — обратная сторона</option>
            <option value="DRIVER_LICENSE_FRONT">Водительское удостоверение — лицевая сторона</option>
            <option value="DRIVER_LICENSE_BACK">Водительское удостоверение — обратная сторона</option>
            <option value="VEHICLE_REGISTRATION">Техпаспорт автомобиля</option>
            <option value="INSURANCE_POLICY">Страховка</option>
            <option value="PROFILE_PHOTO">Фото водителя</option>
            <option value="OTHER">Другой документ</option>
          </select>
          <label className={`app-button primary-brand ${uploading ? "disabled" : ""}`}>
            {uploading ? "Загружаем…" : "Добавить документ"}
            <input type="file" accept="image/jpeg,image/png,application/pdf" disabled={uploading} onChange={upload} hidden />
          </label>
        </div>
        {documents.length > 0 && <ul className="driver-document-list">{documents.map(document => <li key={document.id}>{document.originalFilename || "Документ загружен"}</li>)}</ul>}
        {error && <p className="state-note danger">{error}</p>}
      </section>
    );
  }

  return (
    <section className="client-simple-section driver-application-section">
      <h1>Стать водителем</h1>
      <p>Заполните данные автомобиля. После проверки менеджер свяжется с вами, а документы можно будет добавить сразу после отправки.</p>
      <ol className="driver-application-steps"><li>Заполните анкету.</li><li>Добавьте документы.</li><li>Пройдите проверку.</li></ol>
      <form className="driver-application-form" onSubmit={submit}>
        <label>ФИО<input value={form.fullName} onChange={event => update("fullName", event.target.value)} autoComplete="name" /></label>
        <label>Телефон<input value={form.phone} onChange={event => update("phone", event.target.value)} inputMode="tel" autoComplete="tel" /></label>
        <label>Модель автомобиля<input value={form.carModel} onChange={event => update("carModel", event.target.value)} /></label>
        <label>Цвет автомобиля<input value={form.carColor} onChange={event => update("carColor", event.target.value)} /></label>
        <label>Госномер<input value={form.plateNumber} onChange={event => update("plateNumber", event.target.value)} /></label>
        <label>Год выпуска<input value={form.year} onChange={event => update("year", event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></label>
        <label>Комментарий<textarea value={form.comment} onChange={event => update("comment", event.target.value)} rows="3" /></label>
        <label className="driver-terms"><input type="checkbox" checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} />Я принимаю правила сервиса и требования безопасности SmartTaxi.</label>
        {error && <p className="state-note danger">{error}</p>}
        <button className="app-button primary-brand" type="submit" disabled={loading}>{loading ? "Отправляем…" : "Отправить заявку"}</button>
      </form>
    </section>
  );
}

function SupportSection({ activeOrderId, authenticated }) {
  const [topicCode, setTopicCode] = useState(supportTopics[0].code);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState({ loading: true, rows: [] });
  const [supportPhone, setSupportPhone] = useState("");
  const activeTopic = supportTopics.find(item => item.code === topicCode) || supportTopics[0];
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    let ignore = false;
    getServiceSettings()
      .then(settings => {
        // Seed/demo numbers are never a valid support action; see
        // configuredServicePhone, which the safety screen shares.
        if (!ignore) setSupportPhone(configuredServicePhone(settings?.supportPhone));
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);
  useEffect(() => {
    if (!authenticated) { setHistory({ loading: false, rows: [] }); return undefined; }
    let ignore = false;
    getSupportHistory()
      .then(data => { if (!ignore) setHistory({ loading: false, rows: data.tickets || data.messages || data.requests || [] }); })
      .catch(() => { if (!ignore) setHistory({ loading: false, rows: [] }); });
    return () => { ignore = true; };
  }, [authenticated, sent]);

  async function submit() {
    if (!text.trim() || sending) return;
    if (!authenticated) {
      setError(errorMessages.UNAUTHORIZED);
      return;
    }
    setSending(true);
    setError("");
    try {
      await createSupportMessage({
        topic: topicCode,
        message: text.trim(),
        orderId: activeOrderId || undefined
      });
      if (!mountedRef.current) return;
      setSent(true);
      setText("");
    } catch (submitError) {
      if (mountedRef.current) setError(formatError(submitError));
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }

  return (
    <section className="screen-grid menu-screen">
      <section className="screen-intro"><h1>Поддержка</h1><p>{supportPhone ? "Выберите тему обращения. Если вопрос срочный, позвоните оператору напрямую." : "Выберите тему обращения — ответ появится в истории обращений."}</p></section>
      <section className="app-card premium-support-card">
        <div className="support-topic-row">
          {supportTopics.map(item => <button type="button" key={item.code} className={topicCode === item.code ? "selected" : ""} onClick={() => { setTopicCode(item.code); setSent(false); }}>{item.label}</button>)}
        </div>
        <label className="admin-textarea-field support-textarea">
          <span>{activeTopic.label}</span>
          <textarea value={text} onChange={event => { setText(event.target.value); setSent(false); setError(""); }} placeholder="Напишите сообщение..." rows={5} />
        </label>
        {supportPhone && <div className="support-action-row">
          <a className="menu-secondary-link" href={`tel:${supportPhone}`}><Icon name="phone" size={18} /> Позвонить</a>
        </div>}
        {error && <p className="state-note danger">{error}</p>}
        {sent && <p className="state-note success">Обращение отправлено. Ответ появится здесь же после обработки оператором.</p>}
        <Button className="wide primary-brand" disabled={!text.trim() || sending} onClick={submit}>{sending ? "Отправляем..." : "Отправить обращение"}</Button>
        {authenticated && !history.loading && history.rows.length > 0 && <div className="support-history-list"><b>Мои обращения</b>{history.rows.slice(0, 10).map(item => <div key={item.id} className="support-history-row"><span><strong>{item.topic || item.subject || "Обращение"}</strong><small>{item.message || item.text || item.body || ""}</small></span><em>{formatClientDate(item.createdAt || item.created_at)}</em></div>)}</div>}
      </section>
    </section>
  );
}

function SettingsSection({ onLogout }) {
  return (
    <section className="screen-grid menu-screen">
      <section className="screen-intro"><h1>Настройки</h1><p>Параметры аккаунта и приложения.</p></section>
      <section className="app-card settings-list-premium">
        <SettingsRow icon="user" title="Аккаунт" text="Имя и телефон в профиле" />
        <SettingsRow icon="support" title="Уведомления" text="Статусы поездки и ответы поддержки" />
        <SettingsRow icon="shield" title="Безопасность" text="Пароль аккаунта" />
        <SettingsRow icon="settings" title="Тема" text="Светлая синяя" />
        <SettingsRow icon="document" title="Версия" text="Client MVP, web build" />
        <button type="button" className="settings-danger" onClick={onLogout}><Icon name="logout" /> Выйти</button>
      </section>
    </section>
  );
}

function SettingsRow({ icon, title, text, muted = false }) {
  return <div className={`settings-row-premium ${muted ? "muted" : ""}`}><Icon name={icon} /><span><b>{title}</b><small>{text}</small></span></div>;
}

function FavoritesSection({ onHome, authenticated, favorites, favoritesState, onPickOnMap, onDelete, onLogin }) {
  const favoriteIcon = { HOME: "home", WORK: "work" };

  if (!authenticated) {
    return (
      <section className="screen-grid drawer-linked-screen">
        <section className="screen-intro"><h1>Избранное</h1><p>Сохранённые места для быстрых повторных поездок.</p></section>
        <section className="app-card drawer-linked-card">
          <p className="state-note">Войдите в аккаунт, чтобы сохранять избранные адреса.</p>
          <Button className="wide primary-brand" onClick={onLogin}>Войти</Button>
        </section>
      </section>
    );
  }

  return (
    <section className="screen-grid drawer-linked-screen">
      <section className="screen-intro"><h1>Избранное</h1><p>Сохранённые места для быстрых повторных поездок.</p></section>
      <section className="app-card drawer-linked-card">
        {favoritesState.loading ? (
          <p className="state-note">Загружаем избранные адреса...</p>
        ) : favoritesState.error ? (
          <p className="state-note danger">{favoritesState.error}</p>
        ) : !favorites.length ? (
          <p className="state-note">Избранных адресов пока нет. Добавьте дом, работу или любимое место.</p>
        ) : (
          favorites.map(favorite => (
            <div className="favorite-row-premium" key={favorite.id}>
              <SettingsRow icon={favoriteIcon[favorite.label?.toUpperCase()] || "star"} title={favorite.title || "Адрес"} text={favorite.addressText || favorite.address_text || ""} />
              <button
                type="button"
                className="admin-danger-button compact"
                disabled={Boolean(favoritesState.deletingId)}
                onClick={() => onDelete(favorite.id)}
              >
                {favoritesState.deletingId === favorite.id ? "Удаление..." : "Удалить"}
              </button>
            </div>
          ))
        )}
        <Button className="wide primary-brand" onClick={onPickOnMap}>Выбрать адрес на карте</Button>
        <Button variant="secondary" className="wide" onClick={onHome}>На главную</Button>
      </section>
    </section>
  );
}

function PromoSection({ regionId, authenticated }) {
  const [code, setCode] = useState("");
  const [priceKzt, setPriceKzt] = useState("1500");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const normalized = code.trim().toUpperCase();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function check() {
    if (!normalized || checking) return;
    if (!authenticated) {
      setError(errorMessages.UNAUTHORIZED);
      setResult(null);
      return;
    }
    if (!regionId) {
      setError("Выберите регион на главном экране, чтобы проверить промокод");
      setResult(null);
      return;
    }
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const data = await validatePromoCode({
        code: normalized,
        regionId,
        orderPriceKzt: Number(priceKzt) || 0
      });
      if (mountedRef.current) setResult(data.promo);
    } catch (submitError) {
      if (mountedRef.current) setError(formatError(submitError));
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  }

  return (
    <section className="screen-grid drawer-linked-screen">
      <section className="screen-intro"><h1>Промокоды</h1><p>Проверка скидок для поездки.</p></section>
      <section className="app-card drawer-linked-card promo-card">
        <label className="admin-text-field">
          <span>Код промокода</span>
          <input value={code} onChange={event => { setCode(event.target.value); setResult(null); setError(""); }} placeholder="Например SMART" autoCapitalize="characters" />
        </label>
        <label className="admin-text-field">
          <span>Ожидаемая стоимость поездки, ₸</span>
          <input value={priceKzt} onChange={event => { setPriceKzt(event.target.value.replace(/[^\d]/g, "")); setResult(null); }} inputMode="numeric" />
        </label>
        {error && <p className="state-note danger">{error}</p>}
        {result && (
          <p className="state-note success">
            Код {result.code} действует: скидка {result.discountAmountKzt} ₸, итоговая цена {result.finalPriceKzt} ₸.
          </p>
        )}
        <Button className="wide primary-brand" disabled={!normalized || checking} onClick={check}>{checking ? "Проверяем..." : "Проверить код"}</Button>
      </section>
    </section>
  );
}

function ReferralSection({ authenticated }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);
  useEffect(() => () => window.clearTimeout(copiedTimeoutRef.current), []);

  useEffect(() => {
    if (!authenticated) {
      setState({ loading: false, error: "", data: null });
      return;
    }
    let ignore = false;
    setState({ loading: true, error: "", data: null });
    getReferralSummary()
      .then(data => { if (!ignore) setState({ loading: false, error: "", data }); })
      .catch(error => { if (!ignore) setState({ loading: false, error: formatError(error), data: null }); });
    return () => { ignore = true; };
  }, [authenticated]);

  const code = state.data?.code || "";
  const invitedCount = state.data?.invitedCount ?? 0;
  const rewardTotalKzt = state.data?.totalBonusEarned ?? 0;

  async function share() {
    const text = `Приезжай в SmartTaxi по моему коду ${code} и получи скидку на первую поездку!`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* user cancelled share */ }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
  }

  if (!authenticated) {
    return (
      <section className="screen-grid drawer-linked-screen">
        <section className="screen-intro"><h1>Пригласить друга</h1><p>Делитесь SmartTaxi и получайте бонусы за друзей.</p></section>
        <section className="app-card drawer-linked-card">
          <p className="state-note">Войдите в аккаунт, чтобы получить свой реферальный код.</p>
        </section>
      </section>
    );
  }

  return (
    <section className="screen-grid drawer-linked-screen">
      <section className="screen-intro"><h1>Пригласить друга</h1><p>Делитесь SmartTaxi и получайте бонусы за друзей.</p></section>
      <section className="app-card drawer-linked-card">
        {state.loading ? (
          <p className="state-note">Загружаем ваш код...</p>
        ) : state.error ? (
          <p className="state-note danger">{state.error}</p>
        ) : (
          <>
            <div className="referral-code-block">
              <span>Ваш код</span>
              <strong>{code || "—"}</strong>
            </div>
            <div className="admin-card-facts">
              <InfoLineClient label="Приглашено друзей" value={String(invitedCount)} />
              <InfoLineClient label="Начислено бонусов" value={`${rewardTotalKzt} ₸`} />
            </div>
            {copied && <p className="state-note success">Скопировано в буфер обмена</p>}
            <Button className="wide primary-brand" disabled={!code} onClick={share}>Поделиться кодом</Button>
          </>
        )}
      </section>
    </section>
  );
}

function InfoLineClient({ label, value }) {
  return <div className="info-line-client"><span>{label}</span><b>{value}</b></div>;
}

// A phone number the owner has actually configured, or "" for a seed value.
//
// Same rule as the support screen applies, and for the same reason: a demo
// number must never become a tappable emergency action. Hoisted out of that
// screen so the safety section can reuse it rather than grow a second copy
// that drifts. The Flutter client's usableServicePhone() is the sibling of
// this, and is stricter - it also rejects ascending and descending runs.
function configuredServicePhone(raw) {
  const phone = String(raw || "").trim();
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "";
  const isPlaceholder = /^(\d)+$/.test(digits) || /0{6,}|123456|765432/.test(digits);
  return isPlaceholder ? "" : phone;
}

function LegalSection({ type }) {
  // The operator's own emergency number, shown only on the safety screen and
  // only once it is real.
  //
  // The API has served sosPhone all along and the admin console lets the owner
  // set it, but no web screen ever asked for it - the support screen reads
  // supportPhone and nothing reads this. So a rider in the Flutter app got a
  // tap-to-call SOS while the same rider on the web PWA, which the handoff
  // calls a first-class alternative, got a paragraph. It is invisible today
  // because the configured value is +77000000000, which every client correctly
  // suppresses; it would have appeared the day the owner set a real number.
  const [sosPhone, setSosPhone] = useState("");
  useEffect(() => {
    if (type !== "safety") return undefined;
    let ignore = false;
    getServiceSettings()
      .then(settings => {
        if (!ignore) setSosPhone(configuredServicePhone(settings?.sosPhone));
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, [type]);

  const meta = {
    terms: {
      title: "Пользовательское соглашение",
      text: "Правила использования сервиса SmartTaxi, оформления заказов, отмены поездок и ответственности сторон.",
      documentHref: "/legal/terms.html",
      documentLabel: "Открыть соглашение",
      points: [
        ["Заказ", "Создаётся только после выбора маршрута, тарифа и способа оплаты."],
        ["Цена", "Рассчитывается backend-сервисом по тарифу и маршруту."],
        ["Обязанности пользователя", "Указывать корректные адреса, телефон и не создавать ложные заказы."],
        ["Отмена", "Отмена доступна только в разрешённых статусах поездки."]
      ]
    },
    privacy: {
      title: "Политика конфиденциальности",
      text: "Как SmartTaxi обрабатывает номер телефона, адреса поездок, статусы заказов и технические данные приложения.",
      documentHref: "/legal/privacy.html",
      documentLabel: "Открыть политику",
      points: [
        ["Данные", "Номер телефона, адреса, статусы заказов и технические события приложения."],
        ["Цель обработки", "Вход, расчёт цены, поиск водителя, поддержка и безопасность сервиса."],
        ["Доступ", "Доступ к данным должен ограничиваться ролями оператора, администратора и поддержки."],
        ["Перед запуском", "Документ должен быть проверен юристом и дополнен реквизитами владельца."]
      ]
    },
    info: {
      title: "Юридическая информация",
      text: "Основные сведения о сервисе, оплате Cash/Kaspi, безопасности и контактах оператора.",
      documentHref: "",
      documentLabel: "",
      points: [
        ["Статус", "SmartTaxi является цифровым сервисом для оформления поездок."],
        ["Оплата", "В текущей версии доступны только Наличные и Kaspi. Банковские карты не подключены."],
        ["Реквизиты", "До публичного запуска нужно заполнить ИП/ТОО, БИН/ИИН, адрес, email и телефон поддержки."],
        ["Юридическая проверка", "Финальные документы должен проверить юрист по законодательству Казахстана."]
      ]
    },
    payment: {
      title: "Оплата и кешбэк",
      text: "Способы оплаты поездки, кешбэк и привязанные карты SmartTaxi.",
      documentHref: "",
      documentLabel: "",
      points: [
        ["Способы оплаты", "При оформлении поездки доступны наличные и Kaspi. Способ выбирается до создания заказа."],
        ["Кешбэк", "Кешбэк за завершённые поездки отображается в кошельке и применяется по правилам активного тарифа."],
        ["Карты", "Привязанная карта хранится в маскированном виде. Веб-клиент не списывает с неё средства самостоятельно."],
        ["Пополнение", "Заявка на пополнение фиксируется в системе и ожидает подтверждения платёжным провайдером."]
      ]
    },
    cancellation: {
      title: "Отмена поездки",
      text: "Условия отмены активного заказа и связанные изменения его статуса.",
      documentHref: "",
      documentLabel: "",
      points: [
        ["Когда доступна", "Отменить заказ можно на экране текущей поездки, пока сервер разрешает отмену для её статуса."],
        ["Статус", "После отмены обновлённый статус сразу синхронизируется с водителем и операторами."],
        ["Стоимость", "Возможные условия компенсации или списания определяются правилами сервиса и видны до подтверждения."],
        ["Помощь", "Если отмена недоступна или возникла проблема, отправьте обращение в поддержку из приложения."]
      ]
    },
    safety: {
      title: "Безопасность поездки",
      text: "Инструменты для безопасной поездки и связи с поддержкой SmartTaxi.",
      documentHref: "",
      documentLabel: "",
      points: [
        ["Данные водителя", "После назначения отображаются имя, автомобиль и статус движения водителя."],
        ["Маршрут", "На карте показывается актуальный маршрут и положение машины при активной поездке."],
        ["Поддержка", "По вопросам безопасности выберите соответствующую тему в поддержке или позвоните оператору."],
        ["Экстренный случай", "При непосредственной угрозе сначала обратитесь в экстренные службы Казахстана по номеру 112."]
      ]
    }
  }[type] || {};
  return (
    <section className="screen-grid drawer-linked-screen legal-screen">
      <section className="screen-intro"><h1>{meta.title}</h1><p>{meta.text}</p></section>
      <section className="app-card drawer-linked-card legal-card">
        {meta.documentHref && <a className="menu-secondary-link legal-open-link" href={meta.documentHref} target="_blank" rel="noreferrer"><Icon name="document" size={18} /> {meta.documentLabel}</a>}
        {meta.points.map(([title, text]) => <SettingsRow key={title} icon="shield" title={title} text={text} />)}
        {type === "safety" && (
          <>
            {/* 112 was already the advice here, as prose. On a phone browser
                advice to call a number should be the call. */}
            <a className="menu-secondary-link legal-open-link" href="tel:112">
              <Icon name="support" size={18} /> Экстренные службы — 112
            </a>
            {sosPhone && (
              <a className="menu-secondary-link legal-open-link" href={`tel:${sosPhone}`}>
                <Icon name="support" size={18} /> Служба безопасности SmartTaxi — {sosPhone}
              </a>
            )}
          </>
        )}
        <p className="legal-disclaimer">Важно: этот раздел не является юридической консультацией. Перед публикацией сервиса документы и реквизиты должны быть утверждены владельцем и юристом.</p>
      </section>
    </section>
  );
}

function FaqSection() {
  const items = [
    ["Как заказать поездку?", "Выберите точку подачи, адрес назначения, тариф и нажмите кнопку заказа."],
    ["Как считается цена?", "Система строит маршрут, учитывает длительность и применяет активный тариф поездки."],
    ["Когда появится водитель?", "Информация о водителе появится только после принятия заказа."],
    ["Как отменить заказ?", "Откройте текущую поездку и нажмите кнопку отмены, если статус позволяет отмену."]
  ];
  return (
    <section className="screen-grid menu-screen">
      <section className="screen-intro"><h1>FAQ</h1><p>Короткие ответы по поездкам.</p></section>
      <section className="faq-list-premium">
        {items.map(([title, text]) => <details key={title} className="app-card"><summary>{title}</summary><p>{text}</p></details>)}
      </section>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="screen-grid menu-screen">
      <section className="screen-intro"><h1>О SmartTaxi</h1><p>Сервис поездок для клиентов и водителей.</p></section>
      <section className="app-card about-card-premium">
        <SmartTaxiLogo large />
        <h2>SmartTaxi</h2>
        <p>SmartTaxi помогает быстро выбрать адрес на карте, увидеть цену до заказа и безопасно пройти весь путь поездки.</p>
        <SettingsRow icon="cash" title="Оплата" text="Наличные или Kaspi. Карты не подключены." />
        <SettingsRow icon="shield" title="Безопасность" text="Статусы поездки, поддержка и юридические документы в меню" />
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

function StatusBadge({ label, tone = "brand" }) {
  return <span className={`status-badge-clean ${tone}`}>{label}</span>;
}

function EmptyState({ title, text, action, onAction }) {
  return <section className="app-card empty-state-clean"><span className="empty-mark"><Icon name="car" size={24} /></span><b>{title}</b><p>{text}</p>{action && <Button className="wide primary-brand" onClick={onAction}>{action}</Button>}</section>;
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, VehicleIcon } from "../../core/icons.jsx";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import MapView from "../map/MapView.jsx";
import { extraClientAddressCatalog, extraClientRegionPresets } from "./clientAddressBook.js";
import {
  addFavoriteAddress,
  cancelPublicOrder,
  checkAuthPhone,
  clearToken,
  confirmPasswordReset,
  createOrder,
  createSupportMessage,
  deleteFavoriteAddress,
  driverToPickupRoute,
  estimateTariff,
  getActiveRegions,
  getClientActiveOrder,
  getCurrentUser,
  getFavoriteAddresses,
  getNotifications,
  getOrderStatusHistory,
  getReferralSummary,
  getTariffs,
  getToken,
  loginUser,
  markNotificationRead,
  rateOrder,
  registerUser,
  requestPasswordReset,
  respondPriceOffer,
  reverseAddress,
  searchAddresses,
  sendAuthSms,
  sendQuickMessage,
  validatePromoCode,
  verifyAuthSms
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";

// Statuses where a driver is assigned and actually moving toward the
// passenger or the dropoff — mirrors the backend's TO_PICKUP/TO_DROPOFF
// leg statuses (order-dispatch.service.js), minus the terminal ones.
const LIVE_ROUTE_ORDER_STATUSES = ["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED"];

const paymentOptions = [
  { id: "CASH", title: "Наличные", note: "Оплата после поездки" },
  { id: "KASPI", title: "Kaspi", note: "Перевод по заказу" }
];

const drawerMenuGroups = [
  [
    { key: "home", label: "Главная", icon: "home", hint: "Выбор адреса" },
    { key: "trips", label: "История поездок", icon: "history", hint: "Статусы и детали" },
    { key: "favorites", label: "Избранное", icon: "heart", hint: "Дом, работа, места" }
  ],
  [
    { key: "promo", label: "Промокоды", icon: "ticket", hint: "Проверка кода" },
    { key: "referral", label: "Пригласить друга", icon: "gift", hint: "Реферальная программа" },
    { key: "support", label: "Поддержка", icon: "support", hint: "Помощь по поездке" },
    { key: "faq", label: "FAQ", icon: "chat", hint: "Вопросы и ответы" },
    { key: "settings", label: "Настройки", icon: "settings", hint: "Аккаунт и приложение" },
    { key: "about", label: "О приложении", icon: "info", hint: "SmartTaxi" }
  ],
  [
    { key: "legalTerms", label: "Пользовательское соглашение", icon: "shield", hint: "Правила сервиса" },
    { key: "legalPrivacy", label: "Политика конфиденциальности", icon: "lock", hint: "Данные и privacy" },
    { key: "legalInfo", label: "Юридическая информация", icon: "document", hint: "Реквизиты и оплата" }
  ]
];

const carImages = {
  Economy: "/ui/fixed-price-tariff/svg/car_econom_white.svg",
  Comfort: "/ui/fixed-price-tariff/svg/car_comfort_white.svg",
  Business: "/ui/fixed-price-tariff/svg/car_comfort_white.svg",
  Delivery: "/ui/fixed-price-tariff/svg/car_delivery_white.svg"
};

const goldUi = "/ui/gold-white";
const authWelcomeUi = "/ui/auth-clean-photo";
const addressSelectionUi = "/ui/address-selection/icons";
const fixedTariffUi = "/ui/fixed-price-tariff/svg";
const searchDriverUi = "/ui/search-driver";
const driverFoundUi = "/ui/driver-found";
const tripDetailsUi = "/ui/trip-details";
const goldIcons = {
  logo: `${goldUi}/svg/smarttaxi_logo_text.svg`,
  authLogo: `${goldUi}/svg/smarttaxi_auth_logo.svg`,
  sMark: `${authWelcomeUi}/svg/brand/smarttaxi_s_mark.svg`,
  pin: `${goldUi}/svg/target_location.svg`,
  mark: `${goldUi}/svg/logo_mark_pin_car.svg`,
  menu: `${goldUi}/svg/menu.svg`,
  bell: `${goldUi}/svg/bell.svg`,
  pickup: `${goldUi}/svg/pickup_marker.svg`,
  destination: `${goldUi}/svg/destination_marker.svg`,
  target: `${goldUi}/svg/target_location.svg`,
  home: `${goldUi}/svg/home.svg`,
  work: `${goldUi}/svg/briefcase_work.svg`,
  favorite: `${goldUi}/svg/favorite_star.svg`,
  history: `${goldUi}/svg/history_clock.svg`,
  clock: `${goldUi}/svg/history_clock.svg`,
  trips: `${goldUi}/svg/trips_car.svg`,
  profile: `${goldUi}/svg/profile.svg`,
  user: `${goldUi}/svg/profile.svg`,
  card: `${goldUi}/svg/payment_card.svg`,
  check: `${goldUi}/svg/check_circle_gold.svg`,
  info: `${goldUi}/svg/info_circle.svg`,
  edit: `${goldUi}/svg/edit_pencil.svg`,
  back: `${goldUi}/svg/back_arrow.svg`,
  support: `${goldUi}/svg/info_circle.svg`,
  addressPickup: `${addressSelectionUi}/pickup_pin_gold.svg`,
  addressDestination: `${addressSelectionUi}/destination_pin_black_gold.svg`,
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
  tariffCheck: `${fixedTariffUi}/selected_check_gold.svg`,
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
  search: `${searchDriverUi}/svg/icons/search_gold.svg`,
  shield: `${searchDriverUi}/svg/icons/shield_gold.svg`,
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
  pickupPin: `${driverFoundUi}/svg/map_markers/pickup_pin_gold.svg`,
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
  pickupPin: `${tripDetailsUi}/svg/map_markers/pickup_pin_gold.svg`
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
  { region: "ATAKENT", title: "Моё местоположение", subtitle: "Атакент", lat: 40.844435, lng: 68.509021, icon: "target", tags: ["текущее", "геолокация", "центр"] },
  { region: "ATAKENT", title: "Атакент (Ильич)", subtitle: "Центр посёлка", lat: 40.844435, lng: 68.509021, icon: "target", tags: ["центр", "площадь", "илич", "ильич", "atakent"] },
  { region: "ATAKENT", title: "Базар Атакент", subtitle: "Атакент, Центральный рынок", lat: 40.84473, lng: 68.51162, icon: "trips", tags: ["базар", "рынок", "центральный"] },
  { region: "ATAKENT", title: "Атакент автовокзал", subtitle: "Атакент, остановка у центра", lat: 40.84621, lng: 68.50486, icon: "trips", tags: ["автовокзал", "вокзал", "остановка"] },
  { region: "ATAKENT", title: "Улица Абая", subtitle: "Атакент, район центральной улицы", lat: 40.84803, lng: 68.50768, icon: "pin", tags: ["абая", "абай", "abai", "ул абая"] },
  { region: "ATAKENT", title: "Улица Жамбыла", subtitle: "Атакент", lat: 40.84536, lng: 68.51574, icon: "pin", tags: ["жамбыл", "zhambyl"] },
  { region: "ATAKENT", title: "Улица Сатпаева", subtitle: "Атакент", lat: 40.83995, lng: 68.50884, icon: "pin", tags: ["сатпаев", "satpayev"] },
  { region: "ATAKENT", title: "Улица Толе би", subtitle: "Атакент", lat: 40.85072, lng: 68.51212, icon: "pin", tags: ["толе", "төле", "tole bi"] },
  { region: "ATAKENT", title: "Районная больница «Атакент»", subtitle: "Атакент, ул. Ж. Ибраева", lat: 40.84210, lng: 68.51190, icon: "work", tags: ["больница", "поликлиника", "аптека", "мед", "ибраева"] },
  { region: "ATAKENT", title: "ЖД станция Мактаарал", subtitle: "Атакент, железнодорожная станция", lat: 40.83980, lng: 68.49820, icon: "trips", tags: ["жд", "станция", "мактаарал", "поезд", "railway"] },
  { region: "ATAKENT", title: "Акимат посёлка Атакент", subtitle: "Атакент, здание акимата", lat: 40.84550, lng: 68.50750, icon: "work", tags: ["акимат", "администрация"] },

  { region: "MYRZAKENT", title: "Мырзакент (Славянка)", subtitle: "Центр посёлка", lat: 40.665495, lng: 68.549994, icon: "target", tags: ["мырзакент", "славян", "славянка", "myrzakent", "slavyanka"] },
  { region: "MYRZAKENT", title: "Мырзакент базар", subtitle: "Мырзакент, центральный рынок", lat: 40.66492, lng: 68.54464, icon: "trips", tags: ["базар", "рынок"] },
  { region: "MYRZAKENT", title: "Автовокзал Мырзакент", subtitle: "Мырзакент, ориентир у центра", lat: 40.66848, lng: 68.53928, icon: "trips", tags: ["автовокзал", "вокзал", "остановка"] },
  { region: "MYRZAKENT", title: "Акимат Мактааральского района", subtitle: "Мырзакент, районный акимат", lat: 40.66690, lng: 68.55210, icon: "work", tags: ["акимат", "администрация", "район", "центр"] },
  { region: "MYRZAKENT", title: "Центральная районная больница", subtitle: "Мырзакент, ЦРБ Мактааральского района", lat: 40.66978, lng: 68.54742, icon: "work", tags: ["больница", "црб", "поликлиника", "мед", "аптека"] },

  { region: "ZHETYSAY", title: "Жетысай (Джетысай)", subtitle: "Центр города", lat: 40.777134, lng: 68.324677, icon: "target", tags: ["жетысай", "жетисай", "джетысай", "zhetysay"] },
  { region: "ZHETYSAY", title: "Центральный базар Жетысай", subtitle: "Жетысай, центральный рынок", lat: 40.77980, lng: 68.32190, icon: "trips", tags: ["базар", "рынок"] },
  { region: "ZHETYSAY", title: "Автовокзал Жетысай", subtitle: "Жетысай, ориентир у центра", lat: 40.78191, lng: 68.31951, icon: "trips", tags: ["автовокзал", "вокзал"] },
  { region: "ZHETYSAY", title: "Акимат Жетысайского района", subtitle: "Жетысай, городской сквер", lat: 40.77650, lng: 68.32710, icon: "work", tags: ["акимат", "администрация", "сквер"] },
  { region: "ZHETYSAY", title: "Мечеть «Нур»", subtitle: "Жетысай", lat: 40.77420, lng: 68.32990, icon: "pin", tags: ["мечеть", "мешіт", "нур"] },
  { region: "ZHETYSAY", title: "Улица Мухтара Ауезова", subtitle: "Жетысай", lat: 40.77860, lng: 68.32860, icon: "pin", tags: ["ауезова", "auezov", "мухтара ауезова"] },

  { region: "SHYMKENT", title: "Шымкент (Чимкент)", subtitle: "Центр города", lat: 42.314696, lng: 69.588328, icon: "target", tags: ["шымкент", "чимкент", "shymkent"] },
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
  ROUTE_UNAVAILABLE: "Не удалось построить маршрут",
  ADDRESS_SEARCH_UNAVAILABLE: "Поиск адресов временно недоступен",
  TARIFF_INACTIVE: "Этот тариф временно недоступен",
  TARIFF_REGION_MISMATCH: "Тариф недоступен для этого маршрута",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят другим водителем",
  CLIENT_HAS_ACTIVE_ORDER: "У вас уже есть активный заказ",
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

function clientLifecycleStage(status, order) {
  const label = statusLabel(status);
  const payment = paymentLabel(order?.payment_method);
  const map = {
    DRIVER_FOUND: {
      title: "Водитель найден",
      subtitle: driverEtaText(order),
      badge: label,
      canCancel: true,
      canContact: true,
      canStartNewTrip: false
    },
    DRIVER_GOING_TO_CLIENT: {
      title: "Водитель найден",
      subtitle: driverEtaText(order),
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
    icon: address.icon || "pin",
    region: address.region || address.regionCode || address.city || "",
    tags: address.tags || [],
    lat,
    lng
  };
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
  return mergedClientAddressCatalog.filter(item => item.region === code);
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

function distanceKmFromRoute(route) {
  if (!route?.distanceMeters) return null;
  return Math.max(0.1, Math.round((Number(route.distanceMeters) / 1000) * 10) / 10);
}

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
  const src = goldIcons[name] || goldIcons.mark;
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

function tariffFixedPrice(tariff, fallback) {
  const candidates = [
    tariff?.fixedPriceKzt,
    tariff?.fixed_price_kzt,
    tariff?.minimumPrice,
    tariff?.minPrice,
    tariff?.min_price,
    tariff?.basePrice,
    tariff?.base_price,
    fallback
  ];
  const value = candidates.map(Number).find(item => Number.isFinite(item) && item > 0);
  return value || fallback;
}

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

function referenceTariffRows(tariffs, selectedTariff, estimate, route) {
  const byKey = new Map();
  tariffs
    .forEach(item => byKey.set(cleanTariffKey(item), item));
  const mapped = fixedTariffSpec.map(row => {
    const apiTariff = byKey.get(row.key);
    const selected = apiTariff ? selectedTariff?.id === apiTariff.id : false;
    const fixedPrice = tariffFixedPrice(apiTariff, row.fixedPriceKzt);
    const backendEstimateMatches = selected && estimate?.estimatedPrice && cleanTariffKey(estimate?.tariff) === row.key;
    return {
      ...row,
      apiTariff,
      disabled: !apiTariff,
      selected,
      priceKzt: backendEstimateMatches ? estimate.estimatedPrice : fixedPrice,
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
  const [tariffs, setTariffs] = useState([]);
  const [tariffsLoading, setTariffsLoading] = useState(false);
  const [tariffsError, setTariffsError] = useState("");
  const [tariff, setTariff] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [liveRoute, setLiveRoute] = useState(null);
  const lastLiveRouteFetchAtRef = useRef(0);
  const liveRouteRequestIdRef = useRef(0);
  const [order, setOrder] = useState(null);
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
  const [favorites, setFavorites] = useState([]);
  const [favoritesState, setFavoritesState] = useState({ loading: false, error: "" });
  const socketRef = useRef(null);
  const mainMapReverseSeqRef = useRef(0);
  const mainMapReverseDebounceRef = useRef(0);
  const mainMapSkipInitialCenterRef = useRef(true);

  const localSelectedRegion = mergedClientRegionPresets.find(region => region.id === selectedRegionId);
  const selectedRegion = regions.find(region => region.id === selectedRegionId)
    || (localSelectedRegion ? regions.find(region => regionCode(region) === regionCode(localSelectedRegion)) || localSelectedRegion : null)
    || regions.find(region => regionCode(region) === "ATAKENT")
    || clientRegionPresets[0]
    || fallbackRegion;
  const selectedRegionName = selectedRegion?.name || fallbackRegion.name;
  const backendRegionId = backendRegionIdFor(regions, selectedRegionId, selectedRegion);
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
    setMainMapCandidate({
      title: "Моё местоположение",
      subtitle: selectedRegionName || "Атакент",
      ...center
    });
    setMainMapCandidateReady(true);
    setMainMapPickLoading(false);
    mainMapSkipInitialCenterRef.current = true;
  }, [pickup?.lat, pickup?.lng, selectedRegion?.id, selectedRegionName]);

  useEffect(() => () => window.clearTimeout(mainMapReverseDebounceRef.current), []);

  useEffect(() => {
    if (!getToken()) return undefined;
    let ignore = false;
    getCurrentUser()
      .then(payload => {
        if (ignore) return;
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
        if (!ignore) setAuthenticated(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

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
        setRoute(data.route ? { ...data.route, estimate: data.estimate || data.route.estimate } : null);
      })
      .catch(error => {
        if (ignore) return;
        setRoute(null);
        setRouteError(formatError(error));
      })
      .finally(() => !ignore && setRouteLoading(false));
    return () => { ignore = true; };
  }, [pickup, destination, tariff]);

  // While a driver is assigned and actually en route (to pickup, then to
  // dropoff once the trip starts), re-fetch the real driver-to-target route
  // instead of leaving the map stuck on the original pickup->dropoff price
  // preview. Throttled the same ~8s as the driver app's own live route poll.
  const orderDriverLat = order?.driver_lat ?? order?.driverLat;
  useEffect(() => {
    if (!order?.id || !getToken() || !LIVE_ROUTE_ORDER_STATUSES.includes(order.status)) {
      setLiveRoute(null);
      return undefined;
    }
    const now = Date.now();
    if (now - lastLiveRouteFetchAtRef.current < 8000) return undefined;
    lastLiveRouteFetchAtRef.current = now;
    const requestId = ++liveRouteRequestIdRef.current;
    let cancelled = false;
    driverToPickupRoute(order.id)
      .then(data => {
        if (cancelled || requestId !== liveRouteRequestIdRef.current) return;
        setLiveRoute(data?.route || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [order?.id, order?.status, orderDriverLat]);

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
      getOrderStatusHistory(order.id)
        .then(data => {
          if (data?.order?.id === order.id) {
            setOrder(current => normalizeOrder({ ...current, ...data.order }));
          }
        })
        .catch(() => {});
    }, 7000);
    return () => {
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
  }, [order?.id]);

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
      if (matched) setSelectedRegionId(matched.id);
      try {
        const data = await reverseAddress(point);
        const address = normalizeAddress(data.address) || { title: "Моё местоположение", subtitle: "Точка определена", ...point };
        setPickup(address);
        setMessage("Местоположение выбрано");
      } catch {
        setPickup({ title: "Моё местоположение", subtitle: "Точка определена", ...point });
        setMessage("Местоположение выбрано");
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
    if (!point?.lat || !point?.lng || destination) return;
    if (mainMapSkipInitialCenterRef.current) {
      mainMapSkipInitialCenterRef.current = false;
      return;
    }
    const fallback = {
      title: point?.preview?.title || "Точка на карте",
      subtitle: selectedRegionName ? `${selectedRegionName} · ${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}` : `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`,
      ...point
    };
    const seq = mainMapReverseSeqRef.current + 1;
    mainMapReverseSeqRef.current = seq;
    setMainMapCandidate(fallback);
    setMainMapCandidateReady(false);
    setMainMapPickLoading(true);
    window.clearTimeout(mainMapReverseDebounceRef.current);
    mainMapReverseDebounceRef.current = window.setTimeout(async () => {
      try {
        const data = await Promise.race([
          reverseAddress(point),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("reverse_timeout")), 1800))
        ]);
        const address = normalizeAddress(data.address) || fallback;
        if (seq === mainMapReverseSeqRef.current) setMainMapCandidate(address);
      } catch {
        if (seq === mainMapReverseSeqRef.current) setMainMapCandidate(fallback);
      } finally {
        if (seq === mainMapReverseSeqRef.current) {
          setMainMapCandidateReady(true);
          setMainMapPickLoading(false);
        }
      }
    }, 260);
  }

  function markMainMapMoving() {
    if (destination || pickup) return;
    if (mainMapSkipInitialCenterRef.current) return;
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
    setFavoritesState(current => ({ ...current, error: "" }));
    try {
      await deleteFavoriteAddress(favoriteId);
      await loadFavorites();
    } catch (error) {
      setFavoritesState(current => ({ ...current, error: formatError(error) }));
    }
  }

  function chooseAddress(address) {
    const next = normalizeAddress(address);
    if (!next) return;
    if (addressMode === "pickup") setPickup(next);
    if (addressMode === "destination") {
      if (!pickup) {
        const center = regionCenter(selectedRegion) || regionCenter(fallbackRegion);
        if (center) setPickup({ title: "Моё местоположение", subtitle: selectedRegionName, ...center });
      }
      setDestination(next);
    }
    if (addressMode === "favorite") saveFavoriteAddress(next);
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
      if (!tariff.isLocal) orderPayload.tariffId = tariff.id;
      const active = await getClientActiveOrder();
      if (active.order) {
        setOrder(normalizeOrder(active.order));
        setSection("trips");
        setMessage("Открыли ваш активный заказ");
        return;
      }
      const data = await createOrder(orderPayload);
      setOrder(normalizeOrder(data.order));
      setSection("trips");
    } catch (error) {
      if (error?.code === "CLIENT_HAS_ACTIVE_ORDER" && error?.details?.orderId) {
        try {
          const active = await getOrderStatusHistory(error.details.orderId);
          setOrder(normalizeOrder(active.order));
          setSection("trips");
          setMessage("Открыли ваш активный заказ");
          return;
        } catch {
          setMessage(errorMessages.CLIENT_HAS_ACTIVE_ORDER);
          return;
        }
      }
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
    setAuthenticated(false);
    setRider({ name: "Пассажир", phone: "" });
    setAuth({ phone: "", password: "" });
    setRegisterForm({ name: "", phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
    setResetForm({ phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
    setAuthMode("phone");
    setSection("profile");
    setDrawerOpen(false);
  }

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
          onBack={() => setAddressMode("")}
          onSelect={chooseAddress}
        />
      ) : (
        <main className="app-content passenger-content taxi-home-layout">
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
              loading={loading}
              canCreate={canCreate}
              authenticated={authenticated}
              message={message}
              onSubmit={submitOrder}
            />
          )}
          {section === "trips" && <TripsSection order={order} pickup={pickup} destination={destination} route={route} liveRoute={liveRoute} estimate={estimate} loading={loading} onCancel={cancelOrder} onHome={startNewTrip} onSupport={() => setSection("support")} onOrderUpdate={next => setOrder(normalizeOrder(next))} />}
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
          {section === "promo" && <PromoSection regionId={backendRegionId || selectedRegionId} authenticated={authenticated} />}
          {section === "support" && <SupportSection activeOrderId={order?.id} authenticated={authenticated} />}
          {section === "referral" && <ReferralSection authenticated={authenticated} />}
          {section === "faq" && <FaqSection />}
          {section === "about" && <AboutSection />}
          {section === "settings" && <SettingsSection onLogout={logout} />}
          {section === "legalTerms" && <LegalSection type="terms" />}
          {section === "legalPrivacy" && <LegalSection type="privacy" />}
          {section === "legalInfo" && <LegalSection type="info" />}
        </main>
      )}
    </PhoneFrame>
  );
}

function ClientHeader({ routeReady = false, addressSelectionMode = false, route, onMenu, onBell, onBackRoute }) {
  if (routeReady) {
    return (
      <header className="taxi-app-header premium-client-header reference-client-header tariff-mode">
        <button type="button" className="client-icon-button" onClick={onBackRoute} aria-label="Назад">
          <IconAsset name="back" />
        </button>
        <div className="reference-title-stack">
          <strong>Выбор тарифа</strong>
          <small>{route ? formatRouteSummary(route) : "Расчёт маршрута"}</small>
        </div>
        <button type="button" className="client-icon-button" aria-label="Информация">
          <IconAsset name="info" />
        </button>
      </header>
    );
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

function ClientDrawer({ open, active, rider, authenticated, onClose, onSelect, onLogout }) {
  const title = authenticated ? formatKzPhoneDisplay(rider.phone) : "Войти в аккаунт";
  const subtitle = authenticated ? rider.name || "Пассажир" : "или зарегистрироваться";
  return (
    <>
      <div className={`client-drawer-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <aside className={`client-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="client-drawer-brand-row">
          <div className="client-drawer-brand-lockup" aria-label="SmartTaxi">
            <img className="client-drawer-mark" src={goldIcons.sMark} alt="" aria-hidden="true" />
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
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <Icon name="chevron" size={22} />
        </button>
        <nav className="client-drawer-nav" aria-label="Меню клиента">
          {drawerMenuGroups.map((group, groupIndex) => (
            <div className="client-drawer-group" key={groupIndex}>
              {group.map(({ key, label, icon, hint }) => (
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
        ) : (
          <button type="button" className="drawer-login-action" onClick={() => onSelect("profile")}>
            <span className="drawer-menu-icon"><Icon name="user" size={25} /></span>
            <span className="drawer-menu-copy"><b>Войти</b><small>Телефон и пароль</small></span>
            <Icon name="chevron" size={19} />
          </button>
        )}
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
    onMenu,
    onBell,
    tariffs,
    tariff,
    setTariff,
    tariffsLoading,
    tariffsError,
    payment,
    setPayment,
    estimate,
    loading,
    message,
    onSubmit
  } = props;

  const routeReady = Boolean(pickup && destination);
  const actionReady = Boolean(routeReady && tariff && route && estimate && !routeError);
  const rows = referenceTariffRows(tariffs, tariff, estimate, route);
  const hasAvailableTariffs = rows.some(row => !row.disabled);
  const selectedRow = rows.find(row => row.selected) || rows.find(row => row.apiTariff) || rows[0];
  const totalPrice = selectedRow?.priceKzt || estimate?.estimatedPrice || null;
  const activePickup = pickup || mainMapCandidate;
  const markerAddressTitle = activePickup?.title || "Моё местоположение";
  const markerAddressSubtitle = activePickup?.subtitle || selectedRegionName || "Атакент";
  const markerTagText = activePickup?.title && activePickup.title !== "Моё местоположение"
    ? activePickup.title
    : markerAddressSubtitle;
  const destinationDisabled = !pickup && (mainMapPickLoading || !mainMapCandidateReady);
  const recentPlaces = popularAddressesForRegion(selectedRegion, 6)
    .filter(place => !normalizeText(place.title).includes("местоположение"))
    .slice(0, 3);

  if (routeReady) {
    return (
      <section className="client-reference-screen reference-tariff-state">
        <div className="reference-map-ghost" aria-hidden="true">
          <MapView pickup={pickup} destination={destination} route={route} center={mapCenter} compact />
        </div>
        <section className="reference-route-card">
          <div className="reference-route-line" aria-hidden="true">
            <span />
            <i />
            <b />
          </div>
          <div className="reference-route-copy">
            <span>Откуда</span>
            <strong>{pickup?.title || "Моё местоположение"}</strong>
            <small>{pickup?.subtitle || selectedRegionName || "Атакент"}</small>
            <span>Куда</span>
            <strong>{destination?.title || "ТРЦ Атакент Молл"}</strong>
            <small>{destination?.subtitle || "Атакент, ул. Абая 1А"}</small>
          </div>
          <button type="button" className="reference-edit-route" onClick={onDestination}>
            <IconAsset name="edit" />
            <span>Изменить</span>
          </button>
        </section>

        <section className="reference-route-metrics" aria-label="Информация о маршруте">
          <span>
            <Icon name="route" size={20} />
            <b>{formatTripKm(route, "—")}</b>
            <small>Расстояние</small>
          </span>
          <span>
            <Icon name="clock" size={20} />
            <b>{formatTripMin(route, "—")}</b>
            <small>В пути</small>
          </span>
          <span>
            <IconAsset name="tariffPassenger" className="ui-asset-icon ui-asset-icon-md" />
            <b>3–5 мин</b>
            <small>Подача</small>
          </span>
        </section>

        <section className="reference-tariffs-block">
          <div className="reference-section-title">
            <strong>Выберите тариф</strong>
            {routeLoading ? <span>Считаем маршрут</span> : <span>{route ? formatRouteSummary(route) : "Маршрут не рассчитан"}</span>}
          </div>
          {routeError && <p className="reference-state-error">{routeError}</p>}
          {tariffsError && <p className="reference-state-hint">{tariffsError}</p>}
          {tariffsLoading && !rows.length ? (
            <div className="reference-tariff-skeleton"><span /><span /><span /></div>
          ) : (
            <ReferenceTariffList rows={rows} selectedTariff={tariff} setTariff={setTariff} route={route} />
          )}
        </section>

        <ReferencePaymentRow payment={payment} setPayment={setPayment} />

        {message && <p className={message.includes("Вход") || message.includes("выбра") ? "reference-note success" : "reference-note"}>{message}</p>}

        <section className="reference-sticky-order">
          <div className="reference-total">
            <span>Итого</span>
            <strong>{totalPrice ? <Money value={totalPrice} /> : "—"}</strong>
            <small>{totalPrice ? "Включая подачу" : hasAvailableTariffs ? "После расчёта" : "Тарифы недоступны"}</small>
          </div>
          <button type="button" className="reference-order-button" disabled={loading || routeLoading || !actionReady || !hasAvailableTariffs} onClick={onSubmit}>
            <span>{hasAvailableTariffs ? `Заказать ${selectedRow?.title || "такси"}` : "Тарифы недоступны"}</span>
            <b>{totalPrice ? <Money value={totalPrice} /> : hasAvailableTariffs ? "Расчёт" : "API"}</b>
            <Icon name="chevron" size={24} />
          </button>
        </section>
      </section>
    );
  }

  return (
    <section className="client-reference-screen final10-exact-state">
      <div className="final10-glow-a" aria-hidden="true" />
      <div className="final10-glow-b" aria-hidden="true" />
      <div className="final10-glow-c" aria-hidden="true" />

      <div className="final10-map-wrap" aria-hidden="true">
        <div className="final10-map-placeholder">
          <svg viewBox="0 0 390 490" preserveAspectRatio="none">
            <rect x="0" y="0" width="390" height="490" fill="#0D111C" />
            <rect x="16" y="26" width="120" height="140" rx="10" fill="#151B2A" />
            <rect x="252" y="16" width="122" height="100" rx="10" fill="#151B2A" />
            <rect x="248" y="148" width="126" height="140" rx="10" fill="#151B2A" />
            <rect x="16" y="270" width="140" height="78" rx="10" fill="#151B2A" />
            <rect x="26" y="360" width="330" height="110" rx="16" fill="#0F241F" />
            <path d="M50 378L330 448M330 378L50 448" stroke="#1E4038" strokeWidth="1.2" />
            <rect x="0" y="198" width="390" height="14" fill="#1A2233" />
            <rect x="176" y="0" width="14" height="490" fill="#1A2233" />
            <path d="M60 40Q150 100 176 198T195 400" stroke="#E2793D" strokeWidth="2.4" strokeDasharray="1 8" strokeLinecap="round" fill="none" opacity=".8" />
            <circle cx="60" cy="40" r="5" fill="#E2793D" />
            <text x="52" y="192" fontFamily="Inter, sans-serif" fontSize="9.5" fill="#5C6478">ул. Ленина</text>
            <text x="196" y="110" fontFamily="Inter, sans-serif" fontSize="9.5" fill="#5C6478" transform="rotate(90 196 110)">ул. Мира</text>
            <g opacity=".85">
              <rect x="222" y="192" width="9" height="5.5" rx="2" fill="#F3F6FC" />
              <rect x="100" y="272" width="9" height="5.5" rx="2" fill="#F3F6FC" opacity=".7" />
              <rect x="260" y="330" width="9" height="5.5" rx="2" fill="#F3F6FC" opacity=".55" />
            </g>
            <g opacity=".8">
              <rect x="30" y="40" width="4" height="4" fill="#FFD98A" />
              <rect x="42" y="40" width="4" height="4" fill="#FFD98A" opacity=".5" />
              <rect x="30" y="50" width="4" height="4" fill="#FFD98A" opacity=".7" />
              <rect x="270" y="34" width="4" height="4" fill="#FFD98A" opacity=".6" />
              <rect x="282" y="44" width="4" height="4" fill="#FFD98A" opacity=".4" />
              <rect x="266" y="168" width="4" height="4" fill="#FFD98A" opacity=".5" />
              <rect x="278" y="178" width="4" height="4" fill="#FFD98A" opacity=".7" />
            </g>
          </svg>
        </div>
        <MapView
          pickup={null}
          destination={destination}
          route={route}
          center={activePickup || mapCenter || regionCenter(selectedRegion)}
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
        <div className="final10-wordmark" aria-label="SmartTaxi"><span className="final10-dot" />Smart<span>Taxi</span></div>
        <button type="button" className="final10-icon-btn tappable" onClick={onBell} aria-label="Уведомления">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 8.5c0-3.6-2.7-6.5-6-6.5s-6 2.9-6 6.5c0 4.6-1.6 6.4-2.4 7.2-.5.5-.1 1.3.6 1.3h15.6c.7 0 1.1-.8.6-1.3-.8-.8-2.4-2.6-2.4-7.2Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M9.5 19.5a2.6 2.6 0 0 0 5 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
          <span className="final10-bell-dot" />
        </button>
      </div>

      <div className="final10-nearby-pill exact"><span />12 машин · 2 мин</div>
      <button type="button" className="final10-locate-btn tappable" onClick={onUseLocation} aria-label="Моё местоположение">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2L19.5 20.5C19.7 21 19.1 21.4 18.7 21.1L12 17L5.3 21.1C4.9 21.4 4.3 21 4.5 20.5L12 2Z" fill="currentColor" />
        </svg>
      </button>

      <div className="final10-marker-wrap" aria-hidden="true">
        <div className="final10-radar" />
        <div className="final10-pin-visual">
          <svg className="final10-badge-svg" viewBox="0 0 64 64" fill="none">
            <rect x="2" y="2" width="60" height="60" rx="20" fill="url(#final10BadgeGrad)" />
            <rect x="6" y="6" width="52" height="52" rx="16" fill="#FFFFFF" fillOpacity=".88" />
            <path d="M10 22C10 14 16.5 8 24 6.5" stroke="#FFFFFF" strokeOpacity=".55" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <rect x="14" y="24" width="7" height="7" fill="#63A0FF" opacity=".55" />
            <rect x="23" y="24" width="7" height="7" fill="#1D6FFF" opacity=".9" />
            <rect x="18" y="33" width="7" height="7" fill="#63A0FF" opacity=".35" />
            <text x="42" y="35" textAnchor="middle" dominantBaseline="central" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="29" fill="url(#final10BadgeGrad)">S</text>
            <defs>
              <linearGradient id="final10BadgeGrad" x1="4" y1="2" x2="60" y2="60" gradientUnits="userSpaceOnUse">
                <stop stopColor="#63A0FF" />
                <stop offset="1" stopColor="#0B4FD1" />
              </linearGradient>
            </defs>
          </svg>
          <svg className="final10-tail-svg" viewBox="0 0 64 22" preserveAspectRatio="none">
            <path d="M26 0H38V6L32 22L26 6Z" fill="url(#final10TailGrad)" />
            <defs>
              <linearGradient id="final10TailGrad" x1="32" y1="0" x2="32" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1D6FFF" />
                <stop offset="1" stopColor="#0B4FD1" />
              </linearGradient>
            </defs>
          </svg>
          <div className="final10-ground-shadow" />
        </div>
        <div className={`final10-address-tag ${mainMapPickLoading ? "loading" : ""}`}>{markerTagText}</div>
      </div>

      <section className="final10-panel" aria-label="Выбор адреса">
        <div className="final10-grabber" aria-hidden="true" />
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
              <small>Куда едем</small>
              <strong className="placeholder">Выберите пункт назначения</strong>
            </span>
            <Icon name="chevron" size={17} />
          </button>
        </div>

        {routeLoading && <p className="final10-note">Определяем адрес и маршрут...</p>}
        {routeError && <p className="final10-note danger">{routeError}</p>}
        {message && <p className="final10-note">{message}</p>}

        <button type="button" className="final10-cta tappable tap-soft" onClick={onDestination} disabled={destinationDisabled}>
          <span>{destinationDisabled ? "Определяем точку" : "Указать куда"}</span>
          <b>{destinationDisabled ? "Подождите" : "Далее"} <Icon name="chevron" size={16} /></b>
        </button>
        <div className="final10-trust-row exact" aria-hidden="true">
          <Icon name="shield" size={13} />
          Проверенные водители · Безопасные поездки
        </div>
      </section>
    </section>
  );
}

function ReferenceTariffList({ rows, setTariff, route }) {
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
  );
}

function ReferencePaymentRow({ payment, setPayment }) {
  const current = paymentOptions.find(option => option.id === payment?.id) || paymentOptions[0];
  const next = current.id === "CASH" ? paymentOptions[1] : paymentOptions[0];
  const value = current.id === "KASPI" ? "Перевод Kaspi" : "После поездки";
  return (
    <button type="button" className="reference-payment-row" onClick={() => setPayment(next)}>
      <span className="payment-icon">
        <IconAsset name="tariffCash" className="ui-asset-icon ui-asset-icon-md" />
      </span>
      <span className="reference-payment-copy">
        <small>Способ оплаты</small>
        <strong>{current.title}</strong>
      </span>
      <span className="reference-payment-value">{value}</span>
      <IconAsset name="tariffChevron" className="ui-asset-icon ui-asset-icon-sm" />
    </button>
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
            <Button className="wide primary-gold client-main-cta" disabled={loading || routeLoading || (!hasRouteError && !canCreate && authenticated && pickup && destination)} onClick={handleCta}>
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
  const [mapPickLoading, setMapPickLoading] = useState(false);
  const [mapCandidate, setMapCandidate] = useState(null);
  const [mapCandidateReady, setMapCandidateReady] = useState(true);
  const [error, setError] = useState("");
  const reverseSeqRef = useRef(0);
  const reverseDebounceRef = useRef(0);
  const label = mode === "pickup" ? "Откуда?" : mode === "favorite" ? "Сохранить адрес" : "Куда едем?";
  const helper = mode === "pickup" ? "Выберите точку подачи" : mode === "favorite" ? "Выберите адрес для избранного" : "Выберите точку назначения";
  const popular = useMemo(() => localAddressesForRegion(region).slice(0, 4), [region?.id, region?.code, region?.name]);
  const pickerCenter = regionCenter(region) || regionCenter(fallbackRegion);

  useEffect(() => () => window.clearTimeout(reverseDebounceRef.current), []);

  useEffect(() => {
    setMapCandidateReady(true);
    setMapCandidate({
      title: "Точка на карте",
      subtitle: region?.name || "Передвиньте карту к нужному месту",
      ...pickerCenter
    });
  }, [pickerCenter.lat, pickerCenter.lng, region?.name]);

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
    const immediateLocalMatches = searchLocalClientAddresses(clean, region, 10)
      .map(normalizeAddress)
      .filter(Boolean);
    setResults(immediateLocalMatches);
    const timer = window.setTimeout(() => {
      const localMatches = searchLocalClientAddresses(clean, region, 10);
      searchAddresses({ q: clean, region: region?.name, limit: 10 })
        .then(data => {
          if (ignore) return;
          const apiResults = (data.addresses || []).map(normalizeAddress).filter(Boolean);
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
  }, [query, region, popular]);

  async function updateMapCandidate(point) {
    if (!point?.lat || !point?.lng) return;
    const fallback = {
      title: point?.preview?.title || "Точка на карте",
      subtitle: region?.name ? `${region.name} · ${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}` : `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`,
      ...point
    };
    const seq = reverseSeqRef.current + 1;
    reverseSeqRef.current = seq;
    setMapCandidate(fallback);
    setMapCandidateReady(false);
    setMapPickLoading(true);
    setError("");
    window.clearTimeout(reverseDebounceRef.current);
    reverseDebounceRef.current = window.setTimeout(async () => {
    try {
      const data = await Promise.race([
        reverseAddress(point),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("reverse_timeout")), 1800))
      ]);
      const address = normalizeAddress(data.address) || {
        title: "Точка на карте",
        subtitle: `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`,
        ...point
      };
      if (seq === reverseSeqRef.current) setMapCandidate(address);
    } catch {
      if (seq === reverseSeqRef.current) setMapCandidate(fallback);
    } finally {
      if (seq === reverseSeqRef.current) {
        setMapCandidateReady(true);
        setMapPickLoading(false);
      }
    }
    }, 260);
  }

  function markMapCandidateMoving() {
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
      <section className="address-picker-sheet" aria-label="Выбор адреса">
        <div className="address-picker-grip" aria-hidden="true" />
        <header className="address-picker-title-row">
          <div>
            <h1>{label}</h1>
            <p>{helper}</p>
          </div>
        </header>

        <label className="address-picker-searchbar">
          <Icon name="search" size={20} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Введите улицу, дом или место" />
        </label>

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

        {loading && !results.length && <div className="address-picker-skeleton"><span /><span /><span /></div>}
        {error && <p className="address-picker-note danger">{error}</p>}
        {!loading && query.trim().length >= 2 && !error && !results.length && <p className="address-picker-note">Не нашли точный адрес. Передвиньте карту и подтвердите точку.</p>}

        <section className="address-picker-results" aria-label={query.trim().length >= 2 ? "Результаты поиска" : "Популярные адреса"}>
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
        </section>

        <button type="button" className="address-picker-confirm" onClick={confirmMapCandidate} disabled={!mapCandidate || !mapCandidateReady || mapPickLoading}>
          <span>{mapPickLoading ? "Определяем адрес..." : mode === "pickup" ? "Подтвердить адрес" : "Выбрать адрес"}</span>
          <IconAsset name="addressChevron" className="ui-asset-icon ui-asset-icon-md" />
        </button>
      </section>
    </main>
  );
}

function TripsSection({ order, pickup, destination, route, liveRoute, estimate, loading, onCancel, onHome, onSupport, onOrderUpdate }) {
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
  useEffect(() => {
    setDetailsOpen(false);
    setRatingValue(5);
    setRatingTags([]);
    setRatingComment("");
    setRatingError("");
    setRatingSubmitting(false);
  }, [order?.id]);

  if (!order) {
    return (
      <section className="screen-grid trip-stage-screen">
        <section className="screen-intro"><h1>Мои поездки</h1><p>Активные поездки и история заказов.</p></section>
        <EmptyState title="Поездок пока нет" text="Выберите маршрут на главном экране, чтобы создать заказ." action="Заказать поездку" onAction={onHome} />
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
  const driverPoint = driverMapPoint(order);
  const stage = clientLifecycleStage(status, order);
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
      onOrderUpdate?.(data.order);
    } catch (error) {
      setRatingError(formatError(error));
    } finally {
      setRatingSubmitting(false);
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
              <p>Это займёт всего 1–3 минуты</p>
              <span className="search-driver-nearby-pill">3 водителя рядом</span>
            </div>
            <img className="search-driver-car-route" src={searchDriverAssets.carRoute} alt="" loading="eager" decoding="async" />
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
            <p>{driverEtaText(order)}</p>
          </header>

          <section className="driver-found-driver-card" aria-label="Водитель">
            <img className="driver-found-avatar" src={driverFoundAssets.avatar} alt="" />
            <div className="driver-found-driver-copy">
              <strong>{hasDriver ? driverName : "Арман С."}</strong>
              <span className="driver-found-rating-line">
                <Icon name="star" size={17} />
                <b>{driverRatingLabel(order)}</b>
                <i />
                <em>{driverTripsLabel(order)}</em>
              </span>
              <span className="driver-found-verified">
                <img src={driverFoundAssets.verified} alt="" />
                Водитель проверен
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
                Водитель проверен
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
        <RideStatusNote status={status} order={order} destination={tripDestination} />
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

  async function respond(accept) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await respondPriceOffer(order.id, accept);
      onOrderUpdate?.(data.order);
    } catch (submitError) {
      setError(formatError(submitError));
    } finally {
      setBusy(false);
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

  async function send(code) {
    if (sendingKey) return;
    setSendingKey(code);
    setError("");
    try {
      await sendQuickMessage(orderId, code);
    } catch (submitError) {
      setError(formatError(submitError));
    } finally {
      setSendingKey("");
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
  return method === "KASPI" ? "Kaspi" : "Наличные";
}

function driverEtaText(order) {
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

function driverMapPoint(order) {
  const lat = Number(order?.driver_lat ?? order?.driverLat);
  const lng = Number(order?.driver_lng ?? order?.driverLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function nearbySearchDrivers() {
  return [
    { id: "nearby-1", label: "2 мин", x: 23, y: 31, angle: -18, delay: 0 },
    { id: "nearby-2", label: "3 мин", x: 72, y: 26, angle: 24, delay: 0.35 },
    { id: "nearby-3", label: "4 мин", x: 67, y: 67, angle: -8, delay: 0.7 }
  ];
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

function RideStatusNote({ status, order, destination }) {
  const payment = paymentLabel(order.payment_method);
  const price = tripPrice(order);
  const destinationTitle = destination?.title || order.dropoff_text || "пункт назначения";
  let title = "Статус поездки";
  let text = "Следим за изменениями заказа.";
  let icon = "route";

  if (["DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT"].includes(status)) {
    title = "Водитель принял заказ";
    text = driverEtaText(order);
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

function SearchNearbyDrivers() {
  return (
    <div className="search-nearby-drivers" aria-label="Водители поблизости">
      {nearbySearchDrivers().map(driver => (
        <span
          key={driver.id}
          className="search-nearby-driver"
          style={{
            "--driver-x": `${driver.x}%`,
            "--driver-y": `${driver.y}%`,
            "--driver-angle": `${driver.angle}deg`,
            "--driver-delay": `${driver.delay}s`
          }}
        >
          <i aria-hidden="true"><img src={searchDriverAssets.car} alt="" /></i>
          <b>{driver.label}</b>
        </span>
      ))}
    </div>
  );
}

function SearchingOrderMeta({ order, estimate, route }) {
  const tariffName = orderTariffLabel(order, estimate);
  const price = order.price || estimate?.estimatedPrice;
  const image = carImages[tariffName] || carImages[estimate?.tariff?.name] || searchDriverAssets.tariffCar;
  return (
    <section className="search-order-meta" aria-label="Тариф и оплата">
      <span className="search-tariff-car">
        <img src={image} alt="" loading="lazy" />
      </span>
      <span className="search-tariff-copy">
        <strong>{tariffName}</strong>
        <small>{formatTripMin(route, "4 мин")} · {formatTripKm(route, "2,7 км")}</small>
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

  useEffect(() => {
    if (open) setNotice("");
  }, [open, order?.id]);

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
        setNotice("Детали поездки отправлены");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setNotice("Детали поездки скопированы");
        return;
      }
      setNotice("Скопируйте ID заказа: " + orderId);
    } catch {
      setNotice("Поделиться не удалось. Попробуйте позже.");
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
      {mode === "searching" && (
        <>
          <SearchNearbyDrivers />
          <span className="search-map-radar-marker" aria-hidden="true">
            <i />
            <i />
            <i />
            <img src={searchDriverAssets.markerRadar} alt="" />
          </span>
        </>
      )}
      {mode === "driver-found" && (
        <div className="driver-found-map-layer" aria-hidden="true">
          <span className="driver-found-map-pickup"><img src={driverFoundAssets.pickupPin} alt="" /></span>
          <svg className="driver-found-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M 25 76 L 48 72 Q 52 71 52 62 L 52 54 Q 52 49 58 49 L 73 49 Q 77 49 77 43 L 77 20" />
          </svg>
          <span className="driver-found-map-eta">
            <img src={driverFoundAssets.etaBubble} alt="" />
          </span>
          <span className="driver-found-map-car">
            <VehicleIcon />
            <i />
          </span>
        </div>
      )}
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
            <Button className="wide primary-gold auth-primary-button" type="button" onClick={onAuthDone}>Войти</Button>
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
                <Button className="wide primary-gold auth-primary-button" type="submit" disabled={loading || !phoneReady}>
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
                <Button className="wide primary-gold auth-primary-button" type="submit" disabled={loading || auth.password.length < 6}>
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
                <Button className="wide primary-gold auth-primary-button" type="submit" disabled={loading || !registerCodeReady}>
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
                <Button className="wide primary-gold auth-primary-button" type="submit" disabled={loading || !registerPasswordReady}>
                  {loading ? "Создаём..." : "Создать аккаунт"}
                </Button>
              </form>
            )}

            {isForgot && (
              <form className="auth-form" onSubmit={onResetRequest}>
                <PhoneField value={resetForm.phone} onChange={phone => setResetForm(current => ({ ...current, phone }))} autoFocus />
                <Button className="wide primary-gold auth-primary-button" type="submit" disabled={loading || !resetPhoneReady}>
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
                <Button className="wide primary-gold auth-primary-button" type="submit" disabled={loading || !resetCodeReady}>
                  Подтвердить код
                </Button>
              </form>
            )}

            {isNewPassword && (
              <form className="auth-form" onSubmit={onResetPassword}>
                <PasswordField label="Новый пароль" value={resetForm.password} onChange={password => setResetForm(current => ({ ...current, password }))} autoComplete="new-password" />
                <PasswordField label="Повторите пароль" value={resetForm.repeat} onChange={repeat => setResetForm(current => ({ ...current, repeat }))} autoComplete="new-password" />
                <PasswordChecklist password={resetForm.password} repeat={resetForm.repeat} />
                <Button className="wide primary-gold auth-primary-button" type="submit" disabled={loading || !resetPasswordReady}>
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
                <Button className="wide primary-gold" type="submit" disabled={loading}>{loading ? "Создаём..." : "Создать аккаунт"}</Button>
              </form>
            ) : (
              <form className="form-grid premium-login-form" onSubmit={onSubmit}>
                <label>Телефон<input value={auth.phone} onChange={event => setAuth({ ...auth, phone: event.target.value })} placeholder="+7" inputMode="tel" autoComplete="tel" /></label>
                <label>Пароль<input value={auth.password} onChange={event => setAuth({ ...auth, password: event.target.value })} placeholder="Пароль" type="password" autoComplete="current-password" /></label>
                {message && <p className={message.includes("Вход") ? "state-note success" : "state-note danger"}>{message}</p>}
                <Button className="wide primary-gold" type="submit" disabled={loading}>{loading ? "Входим..." : "Войти"}</Button>
              </form>
            )}
          </>
        ) : (
          <div className="profile-actions-grid">
            <label>Имя<input value={rider.name} onChange={event => setRider({ ...rider, name: event.target.value })} /></label>
            <label>Телефон для заказа<input value={rider.phone} onChange={event => setRider({ ...rider, phone: event.target.value })} inputMode="tel" /></label>
            <article><Icon name="star" /> Избранные адреса <span>Добавляются из поездок</span></article>
            <article><Icon name="card" /> Способы оплаты <span>Наличные или Kaspi при заказе</span></article>
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

function SupportSection({ activeOrderId, authenticated }) {
  const [topicCode, setTopicCode] = useState(supportTopics[0].code);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const activeTopic = supportTopics.find(item => item.code === topicCode) || supportTopics[0];

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
      setSent(true);
      setText("");
    } catch (submitError) {
      setError(formatError(submitError));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="screen-grid menu-screen">
      <section className="screen-intro"><h1>Поддержка</h1><p>Выберите тему обращения. Если вопрос срочный, позвоните оператору напрямую.</p></section>
      <section className="app-card premium-support-card">
        <div className="support-topic-row">
          {supportTopics.map(item => <button type="button" key={item.code} className={topicCode === item.code ? "selected" : ""} onClick={() => { setTopicCode(item.code); setSent(false); }}>{item.label}</button>)}
        </div>
        <label className="admin-textarea-field support-textarea">
          <span>{activeTopic.label}</span>
          <textarea value={text} onChange={event => { setText(event.target.value); setSent(false); setError(""); }} placeholder="Напишите сообщение..." rows={5} />
        </label>
        <div className="support-action-row">
          <a className="menu-secondary-link" href="tel:+77011234567"><Icon name="phone" size={18} /> Позвонить</a>
          <a className="menu-secondary-link" href="mailto:support@smarttaxi.kz"><Icon name="document" size={18} /> Email</a>
        </div>
        {error && <p className="state-note danger">{error}</p>}
        {sent && <p className="state-note success">Обращение отправлено. Ответ появится здесь же после обработки оператором.</p>}
        <Button className="wide primary-gold" disabled={!text.trim() || sending} onClick={submit}>{sending ? "Отправляем..." : "Отправить обращение"}</Button>
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
          <Button className="wide primary-gold" onClick={onLogin}>Войти</Button>
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
              <button type="button" className="admin-danger-button compact" onClick={() => onDelete(favorite.id)}>Удалить</button>
            </div>
          ))
        )}
        <Button className="wide primary-gold" onClick={onPickOnMap}>Выбрать адрес на карте</Button>
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
      setResult(data.promo);
    } catch (submitError) {
      setError(formatError(submitError));
    } finally {
      setChecking(false);
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
        <Button className="wide primary-gold" disabled={!normalized || checking} onClick={check}>{checking ? "Проверяем..." : "Проверить код"}</Button>
      </section>
    </section>
  );
}

function ReferralSection({ authenticated }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [copied, setCopied] = useState(false);

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
    window.setTimeout(() => setCopied(false), 2000);
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
            <Button className="wide primary-gold" disabled={!code} onClick={share}>Поделиться кодом</Button>
          </>
        )}
      </section>
    </section>
  );
}

function InfoLineClient({ label, value }) {
  return <div className="info-line-client"><span>{label}</span><b>{value}</b></div>;
}

function LegalSection({ type }) {
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
    }
  }[type] || {};
  return (
    <section className="screen-grid drawer-linked-screen legal-screen">
      <section className="screen-intro"><h1>{meta.title}</h1><p>{meta.text}</p></section>
      <section className="app-card drawer-linked-card legal-card">
        {meta.documentHref && <a className="menu-secondary-link legal-open-link" href={meta.documentHref} target="_blank" rel="noreferrer"><Icon name="document" size={18} /> {meta.documentLabel}</a>}
        {meta.points.map(([title, text]) => <SettingsRow key={title} icon="shield" title={title} text={text} />)}
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

function StatusBadge({ label, tone = "gold" }) {
  return <span className={`status-badge-clean ${tone}`}>{label}</span>;
}

function EmptyState({ title, text, action, onAction }) {
  return <section className="app-card empty-state-clean"><span className="empty-mark"><Icon name="route" size={24} /></span><b>{title}</b><p>{text}</p>{action && <Button className="wide primary-gold" onClick={onAction}>{action}</Button>}</section>;
}

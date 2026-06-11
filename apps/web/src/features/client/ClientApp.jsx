import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, VehicleIcon } from "../../core/icons.jsx";
import { Button, Money, PhoneFrame } from "../../core/ui.jsx";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import MapView from "../map/MapView.jsx";
import { extraClientAddressCatalog, extraClientRegionPresets } from "./clientAddressBook.js";
import {
  cancelPublicOrder,
  checkAuthPhone,
  clearToken,
  createOrder,
  estimateTariff,
  getActiveRegions,
  getCurrentUser,
  getOrderStatusHistory,
  getTariffs,
  getToken,
  loginUser,
  registerUser,
  reverseAddress,
  searchAddresses,
  sendAuthSms,
  verifyAuthSms
} from "../../lib/mvpApi.js";
import { createSocket } from "../../lib/socket.js";

const paymentOptions = [
  { id: "CASH", title: "Наличные", note: "Оплата после поездки" },
  { id: "KASPI", title: "Kaspi", note: "Перевод по заказу" }
];

const menuItems = [
  ["home", "Главная", "home"],
  ["trips", "Мои поездки", "clock"],
  ["profile", "Профиль", "user"],
  ["driver", "Стать водителем", "shield"],
  ["support", "Поддержка", "support"],
  ["faq", "FAQ", "chat"],
  ["about", "О нас", "star"],
  ["settings", "Настройки", "settings"]
];

const carImages = {
  Economy: "/cars/premium/economy_white_sedan_cropped.png",
  Comfort: "/cars/premium/comfort_white_sedan_cropped.png",
  Business: "/cars/premium/business_white_sedan_cropped.png",
  Delivery: "/cars/premium/business_white_sedan_cropped.png"
};

const goldUi = "/ui/gold-white";
const goldIcons = {
  logo: `${goldUi}/svg/smarttaxi_logo_text.svg`,
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
  support: `${goldUi}/svg/info_circle.svg`
};

const referenceRecentAddresses = [
  { title: "ТРЦ Атакент Молл", subtitle: "Атакент, ул. Абая 1А", lat: 40.84803, lng: 68.50768, icon: "work" },
  { title: "Базар Атакент", subtitle: "Атакент, Центральный рынок", lat: 40.84473, lng: 68.51162, icon: "trips" },
  { title: "Школа №3", subtitle: "Атакент, ул. Школьная 12", lat: 40.84276, lng: 68.51344, icon: "home" }
];

const clientRegionPresets = [
  {
    id: "LOCAL_ATAKENT",
    code: "ATAKENT",
    name: "Атакент",
    displayName: "Атакент",
    alias: "Ильич",
    subtitle: "Мақтааральский район",
    centerLat: 40.844435,
    centerLng: 68.509021,
    currency: "KZT"
  },
  {
    id: "LOCAL_MYRZAKENT",
    code: "MYRZAKENT",
    name: "Мырзакент",
    displayName: "Мырзакент",
    alias: "Славян",
    subtitle: "Мақтааральский район",
    centerLat: 40.666108,
    centerLng: 68.54309,
    currency: "KZT"
  },
  {
    id: "LOCAL_ZHETYSAY",
    code: "ZHETYSAY",
    name: "Жетысай",
    displayName: "Жетысай",
    alias: "Жетисай",
    subtitle: "Жетысайский район",
    centerLat: 40.884303,
    centerLng: 68.212621,
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
  { region: "ATAKENT", title: "ТРЦ Атакент Молл", subtitle: "Атакент, ул. Абая 1А", lat: 40.84803, lng: 68.50768, icon: "work", tags: ["трц", "молл", "магазин", "абая", "abai"] },
  { region: "ATAKENT", title: "Базар Атакент", subtitle: "Атакент, Центральный рынок", lat: 40.84473, lng: 68.51162, icon: "trips", tags: ["базар", "рынок", "центральный"] },
  { region: "ATAKENT", title: "Школа №3", subtitle: "Атакент, ул. Школьная 12", lat: 40.84276, lng: 68.51344, icon: "home", tags: ["школа", "мектеп", "3", "школьная"] },
  { region: "ATAKENT", title: "Автовокзал Атакент", subtitle: "Атакент, остановка у центра", lat: 40.84621, lng: 68.50486, icon: "trips", tags: ["автовокзал", "вокзал", "остановка"] },
  { region: "ATAKENT", title: "Улица Абая", subtitle: "Атакент, район центральной улицы", lat: 40.84803, lng: 68.50768, icon: "pin", tags: ["абая", "абай", "abai", "ул абая"] },
  { region: "ATAKENT", title: "Улица Жамбыла", subtitle: "Атакент", lat: 40.84536, lng: 68.51574, icon: "pin", tags: ["жамбыл", "zhambyl"] },
  { region: "ATAKENT", title: "Улица Сатпаева", subtitle: "Атакент", lat: 40.83995, lng: 68.50884, icon: "pin", tags: ["сатпаев", "satpayev"] },
  { region: "ATAKENT", title: "Улица Толе би", subtitle: "Атакент", lat: 40.85072, lng: 68.51212, icon: "pin", tags: ["толе", "төле", "tole bi"] },
  { region: "ATAKENT", title: "Атакент центр", subtitle: "Атакент, центральная площадь", lat: 40.844435, lng: 68.509021, icon: "target", tags: ["центр", "площадь", "илич", "ильич"] },
  { region: "ATAKENT", title: "Остановка Центр", subtitle: "Атакент, центральная остановка", lat: 40.84544, lng: 68.50872, icon: "trips", tags: ["остановка", "центр", "маршрутка"] },
  { region: "ATAKENT", title: "Акимат Атакент", subtitle: "Атакент, центр", lat: 40.84518, lng: 68.50971, icon: "work", tags: ["акимат", "администрация"] },
  { region: "ATAKENT", title: "Мечеть Атакент", subtitle: "Атакент, центральная мечеть", lat: 40.84386, lng: 68.51432, icon: "pin", tags: ["мечеть", "мешіт", "намаз"] },
  { region: "ATAKENT", title: "Больница Атакент", subtitle: "Атакент, медпункт", lat: 40.84686, lng: 68.51602, icon: "work", tags: ["больница", "поликлиника", "аптека", "мед"] },

  { region: "MYRZAKENT", title: "Мырзакент (Славян)", subtitle: "Центр посёлка", lat: 40.666108, lng: 68.54309, icon: "target", tags: ["мырзакент", "славян", "славянка", "myrzakent", "slavyan"] },
  { region: "MYRZAKENT", title: "Базар Мырзакент", subtitle: "Мырзакент (Славян), рынок", lat: 40.66718, lng: 68.5452, icon: "trips", tags: ["базар", "рынок", "славян"] },
  { region: "MYRZAKENT", title: "Автовокзал Мырзакент", subtitle: "Мырзакент (Славян)", lat: 40.66533, lng: 68.54092, icon: "trips", tags: ["автовокзал", "вокзал", "остановка"] },
  { region: "MYRZAKENT", title: "Школа Мырзакент", subtitle: "Мырзакент (Славян)", lat: 40.66822, lng: 68.54183, icon: "home", tags: ["школа", "мектеп"] },
  { region: "MYRZAKENT", title: "Мечеть Мырзакент", subtitle: "Мырзакент (Славян)", lat: 40.66491, lng: 68.54611, icon: "pin", tags: ["мечеть", "мешіт"] },
  { region: "MYRZAKENT", title: "Акимат Мырзакент", subtitle: "Мырзакент (Славян), центр", lat: 40.66662, lng: 68.54222, icon: "work", tags: ["акимат", "администрация", "центр"] },
  { region: "MYRZAKENT", title: "Поликлиника Мырзакент", subtitle: "Мырзакент (Славян)", lat: 40.66762, lng: 68.54418, icon: "work", tags: ["больница", "поликлиника", "мед", "аптека"] },

  { region: "ZHETYSAY", title: "Жетысай (Жетисай)", subtitle: "Центр города", lat: 40.884303, lng: 68.212621, icon: "target", tags: ["жетысай", "жетисай", "zhetysay"] },
  { region: "ZHETYSAY", title: "Базар Жетысай", subtitle: "Жетысай, центральный рынок", lat: 40.88531, lng: 68.21506, icon: "trips", tags: ["базар", "рынок"] },
  { region: "ZHETYSAY", title: "Автовокзал Жетысай", subtitle: "Жетысай", lat: 40.88191, lng: 68.20951, icon: "trips", tags: ["автовокзал", "вокзал"] },
  { region: "ZHETYSAY", title: "Акимат Жетысай", subtitle: "Жетысай, центр", lat: 40.88494, lng: 68.21107, icon: "work", tags: ["акимат", "администрация"] },
  { region: "ZHETYSAY", title: "Мечеть Жетысай", subtitle: "Жетысай", lat: 40.887, lng: 68.21604, icon: "pin", tags: ["мечеть", "мешіт"] },
  { region: "ZHETYSAY", title: "Больница Жетысай", subtitle: "Жетысай", lat: 40.88288, lng: 68.21649, icon: "work", tags: ["больница", "поликлиника", "мед"] },
  { region: "ZHETYSAY", title: "Центральная площадь Жетысай", subtitle: "Жетысай, центр", lat: 40.884303, lng: 68.212621, icon: "pin", tags: ["центр", "площадь"] },

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
    .replace(/ң/g, "н")
    .replace(/ғ/g, "г")
    .replace(/ү/g, "у")
    .replace(/ұ/g, "у")
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
  return tariff?.description || "Поездка по региону";
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

const localTariffProfiles = {
  smallTown: {
    Economy: { minPrice: 500, basePrice: 350, pricePerKm: 110, pricePerMinute: 18 },
    Comfort: { minPrice: 750, basePrice: 500, pricePerKm: 140, pricePerMinute: 22 },
    Business: { minPrice: 1200, basePrice: 800, pricePerKm: 210, pricePerMinute: 35 },
    Delivery: { minPrice: 450, basePrice: 300, pricePerKm: 80, pricePerMinute: 12 }
  },
  city: {
    Economy: { minPrice: 800, basePrice: 500, pricePerKm: 130, pricePerMinute: 22 },
    Comfort: { minPrice: 1200, basePrice: 750, pricePerKm: 170, pricePerMinute: 28 },
    Business: { minPrice: 1800, basePrice: 1200, pricePerKm: 240, pricePerMinute: 42 },
    Delivery: { minPrice: 700, basePrice: 450, pricePerKm: 100, pricePerMinute: 18 }
  },
  regional: {
    Economy: { minPrice: 900, basePrice: 600, pricePerKm: 145, pricePerMinute: 24 },
    Comfort: { minPrice: 1300, basePrice: 850, pricePerKm: 185, pricePerMinute: 32 },
    Business: { minPrice: 2200, basePrice: 1500, pricePerKm: 260, pricePerMinute: 48 },
    Delivery: { minPrice: 800, basePrice: 500, pricePerKm: 115, pricePerMinute: 20 }
  }
};

const localTariffNames = {
  Economy: "Эконом",
  Comfort: "Комфорт",
  Business: "Бизнес",
  Delivery: "Доставка"
};

function localTariffProfile(region) {
  const code = regionCode(region);
  if (code === "SHYMKENT") return localTariffProfiles.city;
  if (["TURKISTAN", "SARYAGASH", "KAZYGURT"].includes(code)) return localTariffProfiles.regional;
  return localTariffProfiles.smallTown;
}

function localTariffsForRegion(region) {
  const code = regionCode(region);
  const profile = localTariffProfile(region);
  return Object.entries(profile).map(([name, values]) => ({
    id: `LOCAL_${code}_${name.toUpperCase()}`,
    name,
    displayName: localTariffNames[name],
    description: tariffSubtitle({ name, displayName: localTariffNames[name] }),
    currency: "KZT",
    isLocal: true,
    regionId: region?.id || `LOCAL_${code}`,
    regionCode: code,
    ...values
  }));
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

function buildLocalRoutePreview({ pickup, destination, tariff }) {
  const straightKm = haversineKm(pickup, destination);
  const distanceKm = Math.max(0.8, straightKm * 1.22);
  const durationMin = Math.max(3, Math.ceil((distanceKm / 28) * 60));
  const price = Math.max(
    tariffMinPrice(tariff) || 0,
    Math.round((Number(tariff?.basePrice || 0) + distanceKm * Number(tariff?.pricePerKm || 0) + durationMin * Number(tariff?.pricePerMinute || 0)) / 50) * 50
  );
  return {
    provider: "local-smarttaxi",
    distanceMeters: Math.round(distanceKm * 1000),
    durationSeconds: Math.round(durationMin * 60),
    polyline: null,
    estimate: {
      estimatedPrice: price,
      currency: "KZT",
      tariffId: tariff?.id,
      tariffName: tariffTitle(tariff)
    }
  };
}

function referenceTariffRows(tariffs, selectedTariff, estimate, route) {
  const byKey = new Map();
  tariffs.forEach(item => byKey.set(cleanTariffKey(item), item));
  const rows = [
    { key: "Economy", title: "Эконом", subtitle: "Быстрая подача", price: 1200, image: carImages.Economy, seats: 4, recommended: true },
    { key: "Comfort", title: "Комфорт", subtitle: "Просторные авто", price: 1700, image: carImages.Comfort, seats: 4 },
    { key: "Business", title: "Бизнес", subtitle: "Премиальные авто", price: 2500, image: carImages.Business, seats: 4 },
    { key: "Delivery", title: "Доставка", subtitle: "До 20 кг", price: 800, image: carImages.Delivery, seats: null, delivery: true }
  ];
  const mapped = rows.map((row, index) => {
    const apiTariff = byKey.get(row.key);
    const selected = apiTariff ? selectedTariff?.id === apiTariff.id : false;
    const basePrice = apiTariff ? tariffMinPrice(apiTariff) || row.price : row.price;
    return {
      ...row,
      apiTariff,
      disabled: false,
      selected,
      displayPrice: selected && estimate?.estimatedPrice ? estimate.estimatedPrice : basePrice,
      eta: formatTripMin(route, `${12 + index * 2} мин`),
      km: formatTripKm(route, `${(5.2 + index * 0.2).toFixed(1).replace(".", ",")} км`)
    };
  });
  if (!mapped.some(row => row.selected)) {
    const firstAvailable = mapped.find(row => row.apiTariff && !row.disabled) || mapped[0];
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
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
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
  const [authMode, setAuthMode] = useState("login");
  const [registerForm, setRegisterForm] = useState({ name: "", phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
  const [rider, setRider] = useState({ name: "Пассажир", phone: "" });
  const [authenticated, setAuthenticated] = useState(false);
  const socketRef = useRef(null);

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
        const apiTariffs = (data.tariffs || []).filter(item => ["Economy", "Comfort", "Business", "Delivery", "Эконом", "Комфорт", "Бизнес", "Доставка"].includes(item.name) || ["Эконом", "Комфорт", "Бизнес", "Доставка"].includes(item.displayName || item.display_name));
        const nextTariffs = apiTariffs.length ? apiTariffs : localTariffsForRegion(selectedRegion);
        setTariffs(nextTariffs);
        setTariff(current => nextTariffs.find(item => item.id === current?.id) || nextTariffs[0] || null);
        setTariffsError(apiTariffs.length ? "" : "Локальные цены региона");
      })
      .catch(() => {
        if (ignore) return;
        const nextTariffs = localTariffsForRegion(selectedRegion);
        setTariffs(nextTariffs);
        setTariff(current => nextTariffs.find(item => item.id === current?.id) || nextTariffs[0] || null);
        setTariffsError("Локальные цены региона");
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
      setRoute(buildLocalRoutePreview({ pickup, destination, tariff }));
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
        const localRoute = buildLocalRoutePreview({ pickup, destination, tariff });
        if (localRoute?.estimate?.estimatedPrice) {
          setRoute(localRoute);
          setRouteError("");
        } else {
          setRoute(null);
          setRouteError(formatError(error));
        }
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
    socket.on("order.searching_driver", updateOrder);
    socket.on("order.driver_found", updateOrder);
    socket.on("order.driver_going_to_client", updateOrder);
    socket.on("order.driver_arrived", updateOrder);
    socket.on("order.waiting_client", updateOrder);
    socket.on("order.trip_started", updateOrder);
    socket.on("order.trip_completed", updateOrder);
    socket.on("order.payment_pending", updateOrder);
    socket.on("order.paid", updateOrder);
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
      socket.off("order.no_show", updateOrder);
      socket.off("order.cancelled", updateOrder);
      window.clearInterval(poll);
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
      const phoneState = await checkAuthPhone(auth.phone);
      if (!phoneState.exists) {
        setAuthMode("register");
        setRegisterForm(current => ({ ...current, phone: phoneState.phone || auth.phone }));
        setMessage("Телефон не найден. Подтвердите номер через SMS и создайте пароль.");
        return;
      }
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

  async function sendRegistrationSms() {
    setLoading(true);
    setMessage("");
    try {
      const data = await sendAuthSms(registerForm.phone, "REGISTER");
      setRegisterForm(current => ({
        ...current,
        phone: data.phone || current.phone,
        smsSent: true,
        devCode: data.devCode || ""
      }));
      setMessage(data.devCode ? `Код отправлен. Для локального теста: ${data.devCode}` : "Код подтверждения отправлен по SMS");
    } catch (error) {
      setMessage(formatError(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (registerForm.password !== registerForm.repeat) {
        setMessage("Пароли не совпадают");
        return;
      }
      let verificationToken = registerForm.verificationToken;
      if (!verificationToken) {
        if (!registerForm.smsSent || !registerForm.code.trim()) {
          setMessage("Сначала получите SMS-код и введите его.");
          return;
        }
        const verified = await verifyAuthSms({
          phone: registerForm.phone.trim(),
          code: registerForm.code.trim(),
          purpose: "REGISTER"
        });
        verificationToken = verified.verificationToken;
        setRegisterForm(current => ({ ...current, verificationToken }));
      }
      const payload = await registerUser({
        name: registerForm.name.trim(),
        phone: registerForm.phone.trim(),
        verificationToken,
        password: registerForm.password
      });
      const user = payload.user || {};
      setAuthenticated(true);
      setRider({
        name: user.name || registerForm.name || "Пассажир",
        phone: user.phone || registerForm.phone
      });
      setAuth({ phone: user.phone || registerForm.phone, password: "" });
      setAuthMode("login");
      setRegisterForm({ name: "", phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
      setMessage("Аккаунт создан");
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
    if (addressMode === "destination") {
      if (!pickup) {
        const center = regionCenter(selectedRegion) || regionCenter(fallbackRegion);
        if (center) setPickup({ title: "Моё местоположение", subtitle: selectedRegionName, ...center });
      }
      setDestination(next);
    }
    setAddressMode("");
  }

  function chooseRegion(region) {
    if (!region) return;
    const center = regionCenter(region);
    setSelectedRegionId(region.id);
    setRegionPickerOpen(false);
    setDestination(null);
    setRoute(null);
    setRouteError("");
    if (center) {
      setPickup({ title: "Моё местоположение", subtitle: regionLabel(region), ...center });
    }
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
      const data = await createOrder(orderPayload);
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
    setRegisterForm({ name: "", phone: "", code: "", password: "", repeat: "", smsSent: false, verificationToken: "", devCode: "" });
    setAuthMode("login");
    setSection("profile");
    setDrawerOpen(false);
  }

  return (
    <PhoneFrame className="taxi-pwa passenger-pwa taxi-client-shell">
      {!addressMode && (
        <>
          <ClientHeader
            regionName={regionShortLabel(selectedRegion)}
            routeReady={section === "home" && Boolean(pickup && destination)}
            route={route}
            onMenu={() => setDrawerOpen(true)}
            onBell={() => setSection("support")}
            onRegion={() => setRegionPickerOpen(true)}
            onBackRoute={() => {
              setDestination(null);
              setRoute(null);
              setRouteError("");
            }}
          />
          <RegionSheet
            open={regionPickerOpen}
            regions={regions}
            selectedRegionId={selectedRegionId}
            loading={regionsLoading}
            error={regionsError}
            onClose={() => setRegionPickerOpen(false)}
            onSelect={chooseRegion}
          />
          <ClientDrawer
            open={drawerOpen}
            active={section}
            rider={rider}
            regionName={regionLabel(selectedRegion)}
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
              selectedRegion={selectedRegion}
              selectedRegionName={selectedRegionName}
              onUseLocation={useCurrentLocation}
              onPickup={() => setAddressMode("pickup")}
              onDestination={() => setAddressMode("destination")}
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
          {section === "trips" && <TripsSection order={order} pickup={pickup} destination={destination} route={route} estimate={estimate} loading={loading} onCancel={cancelOrder} onHome={() => setSection("home")} />}
          {section === "profile" && <ProfileSection authenticated={authenticated} rider={rider} setRider={setRider} auth={auth} setAuth={setAuth} authMode={authMode} setAuthMode={setAuthMode} registerForm={registerForm} setRegisterForm={setRegisterForm} message={message} loading={loading} onSubmit={submitLogin} onRegister={submitRegister} onSendSms={sendRegistrationSms} onLogout={logout} />}
          {section === "support" && <SupportSection />}
          {section === "faq" && <FaqSection />}
          {section === "about" && <AboutSection regions={regions} />}
          {section === "settings" && <SettingsSection regionName={selectedRegionName} onLogout={logout} />}
        </main>
      )}
    </PhoneFrame>
  );
}

function ClientHeader({ regionName, routeReady = false, route, onMenu, onBell, onRegion, onBackRoute }) {
  if (routeReady) {
    return (
      <header className="taxi-app-header premium-client-header reference-client-header tariff-mode">
        <button type="button" className="client-icon-button" onClick={onBackRoute} aria-label="Назад">
          <IconAsset name="back" />
        </button>
        <div className="reference-title-stack">
          <strong>Выбор тарифа</strong>
          <small>{formatTripMin(route)} · {formatTripKm(route)}</small>
        </div>
        <button type="button" className="client-icon-button" aria-label="Информация">
          <IconAsset name="info" />
        </button>
      </header>
    );
  }
  return (
    <header className="taxi-app-header premium-client-header reference-client-header address-mode">
      <button type="button" className="client-icon-button" onClick={onMenu} aria-label="Открыть меню">
        <IconAsset name="menu" />
      </button>
      <button type="button" className="reference-region-chip" onClick={onRegion} aria-label="Регион">
        <Icon name="pin" size={18} />
        <span>{regionName || "Атакент"}</span>
        <Icon name="chevron" size={15} />
      </button>
      <button type="button" className="client-icon-button notification" onClick={onBell} aria-label="Уведомления">
        <Icon name="bell" size={20} />
        <i />
      </button>
    </header>
  );
}

function RegionSheet({ open, regions, selectedRegionId, loading, error, onClose, onSelect }) {
  const [query, setQuery] = useState("");
  const clean = normalizeText(query);
  const list = (regions.length ? regions : mergedClientRegionPresets).filter(region => {
    if (!clean) return true;
    return normalizeText([region.name, region.displayName, region.alias, region.subtitle, region.code].filter(Boolean).join(" ")).includes(clean);
  });
  return (
    <>
      <div className={`client-drawer-backdrop region-sheet-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <section className={`client-region-sheet ${open ? "open" : ""}`} aria-hidden={!open}>
        <header>
          <div>
            <strong>Выберите регион</strong>
            <span>Регион нужен для тарифов, адресов и подачи водителя.</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" size={20} /></button>
        </header>
        <label className="client-region-search">
          <Icon name="search" size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти город или район" />
        </label>
        {loading && <p className="region-sheet-note">Загружаем регионы...</p>}
        {error && <p className="region-sheet-note muted">Локальный список регионов включён.</p>}
        <div className="client-region-list">
          {list.map(region => {
            const selected = region.id === selectedRegionId;
            return (
              <button type="button" key={region.id} className={selected ? "selected" : ""} onClick={() => onSelect(region)}>
                <span className="region-dot"><Icon name="pin" size={18} /></span>
                <span>
                  <strong>{regionLabel(region)}</strong>
                  <small>{region.subtitle || "SmartTaxi region"}</small>
                </span>
                {selected ? <Icon name="check" size={19} /> : <Icon name="chevron" size={17} />}
              </button>
            );
          })}
        </div>
      </section>
    </>
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

function ReferenceHomeSection(props) {
  const {
    pickup,
    destination,
    route,
    routeLoading,
    routeError,
    mapCenter,
    selectedRegion,
    selectedRegionName,
    onUseLocation,
    onPickup,
    onDestination,
    onClearDestination,
    onSelectDestination,
    onNavigate,
    activeSection = "home",
    tariffs,
    tariff,
    setTariff,
    tariffsLoading,
    tariffsError,
    payment,
    setPayment,
    estimate,
    loading,
    authenticated,
    message,
    onSubmit
  } = props;

  const routeReady = Boolean(pickup && destination);
  const actionReady = Boolean(routeReady && tariff && route && estimate && !routeError);
  const rows = referenceTariffRows(tariffs, tariff, estimate, route);
  const selectedRow = rows.find(row => row.selected) || rows.find(row => row.apiTariff) || rows[0];
  const totalPrice = estimate?.estimatedPrice || selectedRow?.displayPrice || 1200;
  const recentPlaces = popularAddressesForRegion(selectedRegion, 3);

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
            <span>Изменить<br />маршрут</span>
          </button>
        </section>

        <ReferencePaymentRow payment={payment} setPayment={setPayment} />

        <section className="reference-tariffs-block">
          <div className="reference-section-title">
            <strong>Выберите тариф</strong>
            {routeLoading ? <span>Считаем маршрут</span> : <span>{formatTripMin(route)} · {formatTripKm(route)}</span>}
          </div>
          {routeError && <p className="reference-state-error">{routeError}</p>}
          {tariffsError && <p className="reference-state-hint">{tariffsError}</p>}
          {tariffsLoading && !rows.length ? (
            <div className="reference-tariff-skeleton"><span /><span /><span /></div>
          ) : (
            <ReferenceTariffList rows={rows} selectedTariff={tariff} setTariff={setTariff} route={route} />
          )}
        </section>

        {message && <p className={message.includes("Вход") || message.includes("Регион") ? "reference-note success" : "reference-note"}>{message}</p>}

        <section className="reference-sticky-order">
          <div className="reference-total">
            <span>Итого</span>
            <strong><Money value={totalPrice} /></strong>
            <small>Включая подачу</small>
          </div>
          <button type="button" className="reference-order-button" disabled={loading || routeLoading || !actionReady} onClick={onSubmit}>
            <span>{`Заказать ${selectedRow?.title || "Эконом"}`}</span>
            <b><Money value={totalPrice} /></b>
            <Icon name="chevron" size={24} />
          </button>
        </section>
      </section>
    );
  }

  return (
    <section className="client-reference-screen reference-address-state">
      <div className="reference-map-ambient" aria-hidden="true">
        <MapView pickup={pickup} destination={destination} route={route} center={mapCenter || regionCenter(selectedRegion)} compact />
      </div>

      <section className="reference-address-card">
        <button type="button" className="reference-address-row" onClick={onPickup}>
          <span className="reference-point-icon"><IconAsset name="pickup" className="ui-asset-icon ui-asset-icon-lg" /></span>
          <span className="reference-address-text">
            <small>Откуда</small>
            <strong>{pickup?.title || "Моё местоположение"}</strong>
          </span>
          <em className="reference-address-action" onClick={event => { event.stopPropagation(); onUseLocation(); }}>
            <IconAsset name="target" className="ui-asset-icon ui-asset-icon-md" />
          </em>
        </button>
        <button type="button" className="reference-address-row destination" onClick={onDestination}>
          <span className="reference-point-icon"><IconAsset name="destination" className="ui-asset-icon ui-asset-icon-lg" /></span>
          <span className="reference-address-text">
            <small>Куда едем?</small>
            <strong>{destination?.title || "Выберите пункт назначения"}</strong>
          </span>
          <em className="reference-address-action">
            <Icon name="chevron" size={23} />
          </em>
        </button>
      </section>

      <section className="reference-recents reference-recent-section">
        <header className="reference-section-head">
          <strong>Недавние адреса</strong>
          <button type="button" onClick={onDestination}>Все</button>
        </header>
        <div className="reference-recent-list">
          {recentPlaces.map(place => (
            <button type="button" key={place.title} className="reference-recent-row" onClick={() => onSelectDestination(place)}>
              <span className="reference-recent-icon"><IconAsset name={place.icon} className="ui-asset-icon ui-asset-icon-md" /></span>
              <span>
                <strong>{place.title}</strong>
                <small>{place.subtitle}</small>
              </span>
              <IconAsset name="favorite" className="ui-asset-icon ui-asset-icon-sm star" />
            </button>
          ))}
        </div>
      </section>

      {message && <p className={message.includes("Регион") || message.includes("выбрано") ? "reference-note success" : "reference-note"}>{message}</p>}
      <ReferenceBottomNav onNavigate={onNavigate} activeSection={activeSection} />
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
            <img src={row.image} alt="" loading="lazy" className="reference-tariff-car-image" />
          </span>
          <span className="reference-tariff-copy">
            <span className="reference-tariff-title-row">
              <strong className="reference-tariff-title">{row.title}</strong>
              {row.recommended ? <span className="reference-tariff-recommended">Популярный</span> : null}
            </span>
            <span className="reference-tariff-meta">
              {row.seats ? (
                <>
                  <Icon name="user" size={13} />
                  <small>{row.seats} места</small>
                </>
              ) : (
                <>
                  <Icon name="gift" size={13} />
                  <small>Доставка</small>
                </>
              )}
            </span>
            <em>{row.subtitle}</em>
            <i>{row.eta || formatTripMin(route)} · {row.km || formatTripKm(route)}</i>
          </span>
          <span className="reference-tariff-actions">
            <span className="reference-tariff-price"><Money value={row.displayPrice} /></span>
            <span className="reference-tariff-radio" aria-hidden="true" />
          </span>
        </button>
        ))}
    </div>
  );
}

function ReferencePaymentRow({ payment, setPayment }) {
  const nextPayment = payment?.id === "CASH" ? paymentOptions[1] : paymentOptions[0];
  return (
    <button type="button" className="reference-payment-row" onClick={() => setPayment(nextPayment)}>
      <span className="payment-icon">
        <IconAsset name="card" className="ui-asset-icon ui-asset-icon-md" />
      </span>
      <span className="reference-payment-copy">
        <small>Способ оплаты</small>
        <strong>{payment?.title || "Наличные"}</strong>
      </span>
      <span className="reference-payment-value">{payment?.note || "Оплата после поездки"}</span>
      <Icon name="chevron" size={18} />
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
      ? "Измените адрес назначения или выберите точку ближе к выбранному региону"
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
          {message && <p className={message.includes("Регион") || message.includes("выбра") || message.includes("Вход") ? "state-note success" : "state-note danger"}>{message}</p>}
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
        <span>Проверьте адрес назначения или уточните улицу, дом и регион.</span>
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
  if (!tariffs.length) return <p className="state-note">В выбранном регионе нет активных тарифов</p>;
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
  const [error, setError] = useState("");
  const label = mode === "pickup" ? "Откуда" : "Куда";
  const popular = useMemo(() => localAddressesForRegion(region).slice(0, 8), [region?.id, region?.code, region?.name]);
  const pickerCenter = regionCenter(region) || regionCenter(fallbackRegion);

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
          if (!localMatches.length) setError("Не нашли адрес. Уточните улицу, дом или ориентир.");
        })
        .finally(() => !ignore && setLoading(false));
    }, 280);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [query, region, popular]);

  async function pickPointOnMap(point) {
    setMapPickLoading(true);
    setError("");
    try {
      const data = await reverseAddress(point);
      const address = normalizeAddress(data.address) || {
        title: "Точка на карте",
        subtitle: `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`,
        ...point
      };
      onSelect(address);
    } catch {
      onSelect({
        title: "Точка на карте",
        subtitle: `${Number(point.lat).toFixed(5)}, ${Number(point.lng).toFixed(5)}`,
        ...point
      });
    } finally {
      setMapPickLoading(false);
    }
  }

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
      <section className="address-map-picker-card">
        <MapView pickup={pickerCenter} center={pickerCenter} compact status={mapPickLoading ? "Определяем адрес..." : "Нажмите на карту"} onMapPick={pickPointOnMap} />
      </section>
      {loading && !results.length && <div className="skeleton-list"><span /><span /><span /></div>}
      {error && <p className="state-note danger">{error}</p>}
      {!loading && query.trim().length < 2 && (
        <section className="address-start-hint">
          <IconAsset name="target" className="ui-asset-icon ui-asset-icon-md" />
          <div>
            <strong>Популярные места рядом</strong>
            <span>Можно искать улицу, дом, школу, базар, мечеть или местное название.</span>
          </div>
        </section>
      )}
      {!loading && query.trim().length >= 2 && !error && !results.length && <p className="state-note">Не нашли точный адрес. Уточните улицу, дом или ориентир.</p>}
      <section className="address-list-clean premium-address-list">
        {results.map(place => (
          <button type="button" key={`${place.title}-${place.subtitle}-${place.lat}-${place.lng}`} onClick={() => onSelect(place)}>
            <span className="address-result-icon">
              <IconAsset name={place.icon || "pin"} className="ui-asset-icon ui-asset-icon-md" />
            </span>
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

function TripsSection({ order, pickup, destination, route, estimate, loading, onCancel, onHome }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!order) {
    return (
      <section className="screen-grid trip-stage-screen">
        <section className="screen-intro"><h1>Мои поездки</h1><p>Активные поездки и история заказов.</p></section>
        <EmptyState title="Поездок пока нет" text="Выберите маршрут на главном экране, чтобы создать заказ." action="Заказать поездку" onAction={onHome} />
      </section>
    );
  }
  const status = publicStatus(order.public_status || order.status);
  const terminal = ["TRIP_COMPLETED", "PAYMENT_PENDING", "PAID", "RATED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_DRIVER", "CANCELLED_BY_OPERATOR", "CANCELLED_BY_ADMIN", "CANCELED"].includes(status);
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
  const driverName = order.driver_name || "Водитель SmartTaxi";
  const carLine = [order.driver_car_model || "Автомобиль", order.driver_plate].filter(Boolean).join(" · ");

  if (status === "SEARCHING_DRIVER") {
    return (
      <section className="trip-stage-screen trip-searching-screen">
        <TripMapCard pickup={tripPickup} destination={tripDestination} route={route} status="Ищем водителя" />
        <section className="trip-search-card">
          <span className="trip-radar" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <h1>Ищем водителя</h1>
            <p>Проверяем свободные машины рядом и передаём заказ водителям вашего региона.</p>
          </div>
          <TripSummaryLine order={order} estimate={estimate} />
          <CompactRoute pickup={order.pickup_text || pickup?.title} dropoff={order.dropoff_text || destination?.title} />
          <button type="button" className="trip-cancel-button" onClick={onCancel} disabled={loading}>
            {loading ? "Отменяем..." : "Отменить поиск"}
          </button>
        </section>
      </section>
    );
  }

  return (
    <section className="trip-stage-screen trip-driver-found-screen">
      <TripMapCard pickup={tripPickup} destination={tripDestination} route={route} status={statusLabel(status)} />
      <section className="trip-driver-card">
        <div className="trip-driver-topline">
          <span className="trip-driver-avatar"><VehicleIcon /></span>
          <div>
            <small>{hasDriver ? "Водитель найден" : "Детали поездки"}</small>
            <h1>{hasDriver ? driverName : statusLabel(status)}</h1>
          </div>
          <StatusBadge label={statusLabel(status)} tone={terminal ? "muted" : "gold"} />
        </div>
        {hasDriver && (
          <div className="trip-car-plate-row">
            <span>{carLine}</span>
            <b>{order.driver_rating ? Number(order.driver_rating).toFixed(1) : "5.0"}</b>
          </div>
        )}
        <StatusStepper status={status} />
        <CompactRoute pickup={order.pickup_text || pickup?.title} dropoff={order.dropoff_text || destination?.title} />
        <TripSummaryLine order={order} estimate={estimate} />
        <div className="trip-action-row">
          <button type="button" className="trip-details-button" onClick={() => setDetailsOpen(true)}>
            <Icon name="info" size={18} /> Детали поездки
          </button>
          {order.driver_phone && <a className="trip-call-button" href={`tel:${order.driver_phone}`}><Icon name="phone" size={18} /> Позвонить</a>}
          {!terminal && <button type="button" className="trip-cancel-button secondary" onClick={onCancel} disabled={loading}>{loading ? "Отменяем..." : "Отменить"}</button>}
          {terminal && <button type="button" className="trip-home-button" onClick={onHome}>Новая поездка</button>}
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
        cancelDisabled={loading || terminal}
      />
    </section>
  );
}

function TripDetailsSheet({ open, order, pickup, destination, status, driverName, carLine, estimate, onClose, onCancel, cancelDisabled }) {
  if (!open) return null;
  return (
    <>
      <div className="trip-details-backdrop" onClick={onClose} />
      <section className="trip-details-sheet" role="dialog" aria-modal="true" aria-label="Детали поездки">
        <header>
          <div>
            <span>Заказ {order.short_id || order.id}</span>
            <h2>Детали поездки</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" size={20} /></button>
        </header>
        <CompactRoute pickup={pickup?.title || order.pickup_text} dropoff={destination?.title || order.dropoff_text} />
        <div className="trip-details-grid">
          <span><small>Статус</small><b>{statusLabel(status)}</b></span>
          <span><small>Цена</small><b><Money value={order.price || estimate?.estimatedPrice} /></b></span>
          <span><small>Оплата</small><b>{order.payment_method === "KASPI" ? "Kaspi" : "Наличные"}</b></span>
          <span><small>Тариф</small><b>{order.tariff || estimate?.tariff?.displayName || "Economy"}</b></span>
        </div>
        <div className="trip-driver-mini">
          <span className="trip-driver-avatar"><VehicleIcon /></span>
          <div>
            <small>Водитель</small>
            <b>{order.driver_name ? driverName : "Водитель ещё не назначен"}</b>
            <em>{order.driver_name ? carLine || "Автомобиль SmartTaxi" : "Появится после принятия заказа"}</em>
          </div>
        </div>
        <div className="trip-details-actions">
          {order.driver_phone && <a className="trip-call-button" href={`tel:${order.driver_phone}`}><Icon name="phone" size={18} /> Связаться с водителем</a>}
          <button type="button" className="trip-cancel-button secondary" onClick={onCancel} disabled={cancelDisabled}>
            Отменить поездку
          </button>
        </div>
      </section>
    </>
  );
}

function TripMapCard({ pickup, destination, route, status }) {
  return (
    <section className="trip-map-card">
      <MapView pickup={pickup} destination={destination} route={route} center={pickup || destination} compact status={status} />
    </section>
  );
}

function TripSummaryLine({ order, estimate }) {
  return (
    <div className="trip-summary-line">
      <span><b><Money value={order.price || estimate?.estimatedPrice} /></b><small>Цена</small></span>
      <span><b>{order.tariff || estimate?.tariff?.displayName || "Economy"}</b><small>Тариф</small></span>
      <span><b>{order.payment_method === "KASPI" ? "Kaspi" : "Наличные"}</b><small>Оплата</small></span>
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
  message,
  loading,
  onSubmit,
  onRegister,
  onSendSms,
  onLogout
}) {
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
        <SettingsRow icon="support" title="Уведомления" text="Статусы поездки и ответы поддержки" />
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
  return <section className="app-card empty-state-clean"><span className="empty-mark"><Icon name="route" size={24} /></span><b>{title}</b><p>{text}</p>{action && <Button className="wide primary-gold" onClick={onAction}>{action}</Button>}</section>;
}

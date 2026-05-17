import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, clearToken, getToken, login } from "./lib/api";
import { createSocket } from "./lib/socket";
import FinalClient from "./FinalClient.jsx";
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
const MAP_CENTER = { lat: 42.3167, lng: 69.5958 };
const GOLD_ROUTE = "#F5C542";
const LOCAL_PLACES = [
  { title: "Центр Атакента", subtitle: "Главная точка города", lat: 42.3167, lng: 69.5958 },
  { title: "Вокзал", subtitle: "Ж/д и автостанция", lat: 42.3184, lng: 69.6041 },
  { title: "Рынок", subtitle: "Центральный рынок", lat: 42.3139, lng: 69.5916 },
  { title: "Больница", subtitle: "Городская больница", lat: 42.3206, lng: 69.5894 },
  { title: "Акимат", subtitle: "Центр обслуживания", lat: 42.3161, lng: 69.5974 },
  { title: "Kaspi", subtitle: "Банк и платежи", lat: 42.3154, lng: 69.599 },
  { title: "Школа", subtitle: "Ближайшая школа", lat: 42.3212, lng: 69.6006 },
  { title: "Автостанция", subtitle: "Межгород", lat: 42.3198, lng: 69.6068 },
  { title: "Мечеть", subtitle: "Центральная мечеть", lat: 42.3129, lng: 69.5964 },
  { title: "Парк", subtitle: "Городской парк", lat: 42.3147, lng: 69.6022 },
  { title: "улица Шамо, 58", subtitle: "Атакент", lat: 42.3158, lng: 69.5948 },
  { title: "улица Шамо, 58А", subtitle: "Атакент", lat: 42.3159, lng: 69.5952 },
  { title: "улица Шамо, 56", subtitle: "Атакент", lat: 42.3155, lng: 69.5942 }
];
const DARK_MAP_STYLE = [];
let googleMapsPromise;
let googleMapsFailureReason = "";
function getGoogleMapsBrowserKey() { return ""; }
function setGoogleMapsFailure(reason) { googleMapsFailureReason = reason || "GOOGLE_MAPS_FAILED"; }
function money(value) { return `${Number(value || 0).toLocaleString("ru-RU")} ₸`; }
function normalizeError(error) { return error?.message || "Что-то пошло не так."; }
function fieldNumber(value) { if (value === "" || value === undefined || value === null) return undefined; const next = Number(value); return Number.isFinite(next) ? next : undefined; }
function loadGoogleMaps() { return Promise.reject(new Error("GOOGLE_MAPS_DISABLED")); }
function coordsFromForm(form, prefix) { const lat = fieldNumber(form[`${prefix}Lat`]); const lng = fieldNumber(form[`${prefix}Lng`]); return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null; }
function haversineDistanceKm(a, b) { return 3.2; }

function AppHeader(){return null}
function Alert(){return null}
function LoadingState(){return null}
function EmptyState(){return null}
function LoginCard(){return null}
function Driver(){return <main className="mobile-app"><h1>Driver</h1></main>}
function Owner(){return <main className="owner-app"><h1>Owner</h1></main>}
function App(){ const path = window.location.pathname; if(path.startsWith("/driver")) return <Driver/>; if(path.startsWith("/owner")) return <Owner/>; return <FinalClient/>; }
createRoot(document.getElementById("root")).render(<App />);

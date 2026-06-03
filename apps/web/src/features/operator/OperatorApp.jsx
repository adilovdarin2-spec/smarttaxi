import React, { useEffect, useMemo, useState } from "react";
import { Icon, SmartLogo } from "../../core/icons.jsx";
import { Button, Money } from "../../core/ui.jsx";
import { getAdminOrders } from "../../lib/mvpApi.js";
import MapView from "../map/MapView.jsx";

const tabs = [
  ["all", "Все"],
  ["NEW", "Новые"],
  ["ACTIVE", "В работе"],
  ["COMPLETED", "Завершённые"],
  ["CANCELLED", "Отменённые"]
];

const sidebar = ["Заказы", "Клиенты", "Водители", "История"];
const activeStatuses = new Set(["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"]);

function statusLabel(status) {
  return {
    NEW: "Поиск",
    DRIVER_ASSIGNED: "Принят",
    DRIVER_ARRIVED: "Прибыл",
    IN_PROGRESS: "В пути",
    COMPLETED: "Завершён",
    CANCELLED: "Отменён"
  }[status] || status || "Статус";
}

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    pickup: {
      title: order.pickup_text || "Точка посадки",
      lat: order.pickup_lat,
      lng: order.pickup_lng
    },
    destination: {
      title: order.dropoff_text || "Точка назначения",
      lat: order.dropoff_lat,
      lng: order.dropoff_lng
    }
  };
}

export default function OperatorApp() {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const payload = await getAdminOrders();
      const list = (payload.orders || payload.items || []).map(normalizeOrder).filter(Boolean);
      setOrders(list);
      setSelectedId(current => current || list[0]?.id || "");
    } catch (loadError) {
      setError(loadError?.message || "Не удалось загрузить заказы");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter(order => {
      if (tab === "ACTIVE" && !activeStatuses.has(order.status)) return false;
      if (!["all", "ACTIVE"].includes(tab) && order.status !== tab) return false;
      if (!needle) return true;
      return [
        order.short_id,
        order.id,
        order.pickup_text,
        order.dropoff_text,
        order.client_phone,
        order.driver_name,
        order.region_name
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [orders, query, tab]);

  const selected = visible.find(order => order.id === selectedId) || visible[0] || null;

  return (
    <main className="operator-shell">
      <aside className="operator-sidebar">
        <SmartLogo compact />
        <b>SmartTaxi</b>
        {sidebar.map((item, index) => <button type="button" key={item} className={index === 0 ? "active" : ""}>{item}</button>)}
      </aside>
      <section className="operator-workspace">
        <header className="operator-header">
          <div>
            <small>Оператор</small>
            <h1>Контроль заказов</h1>
          </div>
          <label><Icon name="search" /><input placeholder="Поиск заказа, телефона или адреса" value={query} onChange={event => setQuery(event.target.value)} /></label>
        </header>
        <section className="operator-tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</section>
        <div className="operator-grid">
          <section className="ticket-list">
            {loading && <span className="admin-skeleton-row" />}
            {!loading && !visible.length && <div className="admin-empty-note"><strong>Заказов нет</strong><span>Новые поездки появятся после создания заказа клиентом.</span></div>}
            {visible.map(order => (
              <button type="button" key={order.id} className={selected?.id === order.id ? "active" : ""} onClick={() => setSelectedId(order.id)}>
                <b>{order.short_id || order.id}</b>
                <span>{order.pickup_text} → {order.dropoff_text}</span>
                <small>{statusLabel(order.status)} · {order.client_phone || "клиент"}</small>
              </button>
            ))}
          </section>
          <section className="ticket-detail">
            {selected ? (
              <>
                <MapView pickup={selected.pickup} destination={selected.destination} status="Заказ на карте" compact />
                <h2>{selected.short_id || selected.id}</h2>
                <p>{selected.pickup_text} → {selected.dropoff_text}</p>
                <div className="admin-card-facts">
                  <span className="admin-info-line"><strong>Статус</strong>{statusLabel(selected.status)}</span>
                  <span className="admin-info-line"><strong>Регион</strong>{selected.region_name || "Не указан"}</span>
                  <span className="admin-info-line"><strong>Тариф</strong>{selected.tariff || "Не указан"}</span>
                  <span className="admin-info-line"><strong>Цена</strong><Money value={selected.price} /></span>
                  <span className="admin-info-line"><strong>Клиент</strong>{selected.client_phone || "Не указан"}</span>
                  <span className="admin-info-line"><strong>Водитель</strong>{selected.driver_name || "Не назначен"}</span>
                </div>
                <label className="admin-textarea-field">
                  <span>Локальная заметка</span>
                  <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Запишите важную информацию по заказу" />
                </label>
                <div className="button-row">
                  <Button onClick={loadOrders} disabled={loading}>{loading ? "Обновляем..." : "Обновить"}</Button>
                  <Button variant="secondary" onClick={() => setNote("")}>Очистить заметку</Button>
                </div>
              </>
            ) : (
              <div className="admin-empty-note"><strong>Выберите заказ</strong><span>Детали появятся справа.</span></div>
            )}
            {error && <p className="inline-status">{error}</p>}
          </section>
        </div>
      </section>
    </main>
  );
}

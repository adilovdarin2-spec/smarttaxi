import React, { useMemo, useState } from "react";
import { DRIVER_ORDERS, OPERATOR_TICKETS } from "../../core/data.js";
import { Icon, SmartLogo } from "../../core/icons.jsx";
import { Button } from "../../core/ui.jsx";
import MapView from "../map/MapView.jsx";

const tabs = [
  ["new", "Новые"],
  ["work", "В работе"],
  ["done", "Завершённые"],
  ["problem", "Проблемы"]
];

export default function OperatorApp() {
  const [tab, setTab] = useState("new");
  const [selected, setSelected] = useState(OPERATOR_TICKETS[0]);
  const [assigned, setAssigned] = useState("");
  const [closed, setClosed] = useState(false);
  const list = useMemo(() => OPERATOR_TICKETS.filter(item => tab === "problem" ? item.title.includes("Проблем") : item.status === tab), [tab]);
  return (
    <main className="operator-shell">
      <header className="operator-header"><SmartLogo compact /><div><small>Операторская панель</small><h1>Заявки Smart Taxi</h1></div><label><Icon name="search" /><input placeholder="Поиск заказа или телефона" /></label></header>
      <section className="operator-tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</section>
      <div className="operator-grid">
        <section className="ticket-list">
          {(list.length ? list : OPERATOR_TICKETS).map(ticket => <button type="button" key={ticket.id} className={selected.id === ticket.id ? "active" : ""} onClick={() => setSelected(ticket)}><b>{ticket.id}</b><span>{ticket.title}</span><small>{ticket.client} · {ticket.time}</small></button>)}
        </section>
        <section className="ticket-detail">
          <MapView pickup={{}} destination={{}} status="Заявка на карте" compact />
          <h2>{selected.id}</h2>
          <p>{selected.title}</p>
          <div className="assign-list">
            {DRIVER_ORDERS.map((order, index) => <button key={order.id} type="button" onClick={() => { setAssigned(`Водитель ${index + 1} назначен на ${selected.id}`); setClosed(false); }}><Icon name="user" /><span>Водитель {index + 1}<small>{order.distance} от клиента</small></span><b>Назначить</b></button>)}
          </div>
          {assigned && <p className="inline-status">{assigned}</p>}
          {closed && <p className="inline-status">Заявка закрыта в UI-режиме.</p>}
          <div className="button-row"><Button onClick={() => setAssigned(`Ближайший водитель назначен на ${selected.id}`)}>Назначить водителя</Button><Button variant="secondary" onClick={() => setAssigned(`Ответ отправлен клиенту ${selected.client}`)}>Ответить в чат</Button><Button variant="danger" onClick={() => setClosed(true)}>Закрыть заявку</Button></div>
        </section>
      </div>
    </main>
  );
}

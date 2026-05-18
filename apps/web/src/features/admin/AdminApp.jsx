import React, { useState } from "react";
import { ADMIN_STATS, DRIVER_ORDERS } from "../../core/data.js";
import { Icon, SmartLogo } from "../../core/icons.jsx";
import { Button, Money, StatCard } from "../../core/ui.jsx";

const sections = ["Dashboard", "Пользователи", "Водители", "Операторы", "Поездки", "Финансы", "Тарифы", "Промокоды", "Настройки", "Логи"];

export default function AdminApp() {
  const [active, setActive] = useState("Dashboard");
  function exportCsv() {
    const csv = ["section,value", ...ADMIN_STATS.map(([label, value]) => `${label},${value}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "smart-taxi-admin-ui.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <SmartLogo />
        <h1>Smart Taxi</h1>
        {sections.map(item => <button type="button" key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}>{item}</button>)}
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-header"><div><small>Админ панель</small><h2>{active}</h2></div><Button variant="secondary" onClick={exportCsv}>Экспорт</Button></header>
        <div className="admin-grid">{ADMIN_STATS.map(([label, value], index) => <StatCard key={label} label={label} value={value} icon={index % 2 ? "user" : "admin"} />)}</div>
        <div className="dashboard-columns">
          <article className="admin-card wide">
            <h3>График поездок</h3>
            <svg className="chart" viewBox="0 0 420 160"><path d="M10 130 70 90 120 115 175 62 230 88 290 42 350 70 410 30" /><g>{[70,120,175,230,290,350].map(x => <circle key={x} cx={x} cy={x === 175 ? 62 : x === 290 ? 42 : 90} r="5" />)}</g></svg>
          </article>
          <article className="admin-card">
            <h3>Последние поездки</h3>
            {DRIVER_ORDERS.map(order => <p key={order.id}><b>{order.id}</b><span>{order.pickup} → {order.dropoff}</span><strong><Money value={order.price} /></strong></p>)}
          </article>
          <article className="admin-card">
            <h3>Водители</h3>
            {["FREE", "BUSY", "OFFLINE", "BLOCKED"].map(status => <p key={status}><Icon name="user" /><span>Водитель {status}</span><b className={`status ${status.toLowerCase()}`}>{status}</b></p>)}
          </article>
        </div>
      </section>
    </main>
  );
}

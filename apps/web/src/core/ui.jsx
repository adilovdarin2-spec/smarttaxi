import React from "react";
import { Icon, SmartLogo } from "./icons.jsx";

export function Money({ value }) {
  return <>{Number(value || 0).toLocaleString("ru-RU")} ₸</>;
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  return <button className={`app-button ${variant} ${className}`} type="button" {...props}>{children}</button>;
}

export function AppHeader({ title, onBack, right, subtitle }) {
  return (
    <header className="screen-header">
      {onBack ? <button className="round-button" type="button" onClick={onBack} aria-label="Назад"><Icon name="back" /></button> : <span />}
      <div>
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {right || <span />}
    </header>
  );
}

export function BottomNav({ active, onSelect }) {
  const items = [
    ["home", "Главная", "home"],
    ["clock", "История", "history"],
    ["logo", "", "bonus"],
    ["chat", "Сообщения", "support"],
    ["user", "Профиль", "profile"]
  ];
  return (
    <nav className="bottom-nav" aria-label="Навигация">
      {items.map(([icon, label, key]) => (
        <button key={key} type="button" className={`${active === key ? "active" : ""} ${icon === "logo" ? "center" : ""}`} onClick={() => onSelect(key)}>
          {icon === "logo" ? <SmartLogo compact /> : <Icon name={icon} />}
          {label && <span>{label}</span>}
        </button>
      ))}
    </nav>
  );
}

export function MenuRow({ icon, title, value, onClick, danger = false }) {
  return (
    <button className={`menu-row ${danger ? "danger" : ""}`} type="button" onClick={onClick}>
      <Icon name={icon} />
      <span>{title}</span>
      {value && <b>{value}</b>}
      <Icon name="back" />
    </button>
  );
}

export function StatCard({ label, value, icon = "admin" }) {
  return (
    <article className="stat-card">
      <Icon name={icon} />
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

export function PhoneFrame({ children, className = "" }) {
  return <main className={`phone-frame ${className}`}>{children}</main>;
}

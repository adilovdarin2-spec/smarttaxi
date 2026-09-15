import React from "react";

// The admin panel's shared primitives. They used to live in the middle of
// AdminApp.jsx; they are here so a page can be written in its own file
// without either duplicating the design system or importing back into the
// module that renders it.

export function PageHeader({ title, subtitle, action, children }) {
  return (
    <section className="admin-section-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="admin-section-actions">
        {children}
        {action}
      </div>
    </section>
  );
}

export function SegmentedFilter({ value, onChange, items }) {
  return (
    <div className="admin-segmented-filter">
      {items.map(([key, label]) => (
        <button key={key} type="button" className={value === key ? "active" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

export function DataCard({ title, text, action, children }) {
  return (
    <section className="admin-data-card">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function LoadingState() {
  return (
    <section className="admin-data-card">
      <div className="admin-skeleton-row" />
      <div className="admin-skeleton-row short" />
      <div className="admin-skeleton-row" />
    </section>
  );
}

export function StatePanel({ title, text, action, onAction }) {
  return (
    <section className="admin-state-panel">
      <div className="admin-state-mark" />
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button type="button" className="admin-secondary-button" onClick={onAction}>
          {action}
        </button>
      )}
    </section>
  );
}

export function Badge({ tone = "muted", children }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}

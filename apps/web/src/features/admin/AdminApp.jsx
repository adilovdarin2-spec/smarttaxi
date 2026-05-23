import React, { useCallback, useEffect, useMemo, useState } from "react";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import {
  clearToken,
  getAdminAudit,
  getAdminDashboard,
  getAdminDriverApplications,
  getAdminDrivers,
  getAdminOrders,
  getAdminRegions,
  getAdminSettings
} from "../../lib/mvpApi.js";

const adminRoles = new Set(["OWNER", "OPERATOR", "FINANCE"]);

const navigation = [
  { key: "dashboard", label: "Dashboard", eyebrow: "Состояние системы" },
  { key: "regions", label: "Regions", eyebrow: "Активные зоны" },
  { key: "drivers", label: "Drivers", eyebrow: "Водители" },
  { key: "applications", label: "Driver Applications", eyebrow: "Заявки" },
  { key: "orders", label: "Orders", eyebrow: "Поездки" },
  { key: "tariffs", label: "Tariffs", eyebrow: "Тарифы" },
  { key: "finance", label: "Finance", eyebrow: "Финансы" },
  { key: "settings", label: "Settings", eyebrow: "Настройки" },
  { key: "audit", label: "Audit", eyebrow: "Журнал" },
  { key: "support", label: "Support", eyebrow: "Поддержка" }
];

const pageTitles = Object.fromEntries(navigation.map(item => [item.key, item]));

function asArray(payload, key) {
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

function statusLabel(status) {
  return {
    NEW: "Поиск",
    DRIVER_ASSIGNED: "Принят",
    DRIVER_ARRIVED: "Прибыл",
    IN_PROGRESS: "В пути",
    COMPLETED: "Завершён",
    CANCELLED: "Отменён",
    FREE: "На линии",
    BUSY: "Занят",
    OFFLINE: "Не на линии",
    BREAK: "Перерыв",
    APPROVED: "Одобрена",
    REJECTED: "Отклонена",
    NEEDS_INFO: "Нужны данные",
    PENDING: "На проверке"
  }[status] || status || "—";
}

function readError(error) {
  if (error?.code === "FORBIDDEN" || error?.message?.includes("Forbidden")) {
    return "Нет доступа к панели управления";
  }
  if (error?.code === "NOT_FOUND") return "Раздел будет подключён на следующем этапе";
  return error?.message || "Не удалось загрузить данные";
}

export default function AdminApp() {
  const [active, setActive] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [user, setUser] = useState(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [pageState, setPageState] = useState({
    loading: false,
    error: "",
    payload: null
  });

  const canAccess = user && adminRoles.has(user.role);
  const currentPage = pageTitles[active] || pageTitles.dashboard;

  const loadDashboard = useCallback(async () => {
    setBootLoading(true);
    setAccessError("");
    try {
      const data = await getAdminDashboard();
      const resolvedUser = data.user || data.dashboard?.user || null;
      setDashboard(data);
      setUser(resolvedUser);
      if (!resolvedUser) {
        setAccessError("Войдите под владельцем, оператором или финансовым пользователем.");
      } else if (!adminRoles.has(resolvedUser.role)) {
        setAccessError("Нет доступа к панели управления");
      }
    } catch (error) {
      setAccessError(readError(error));
    } finally {
      setBootLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (page) => {
    if (["dashboard", "tariffs", "finance", "support"].includes(page)) {
      setPageState({ loading: false, error: "", payload: null });
      return;
    }

    const loaders = {
      regions: getAdminRegions,
      drivers: getAdminDrivers,
      applications: getAdminDriverApplications,
      orders: getAdminOrders,
      audit: getAdminAudit,
      settings: getAdminSettings
    };

    const loader = loaders[page];
    if (!loader) {
      setPageState({ loading: false, error: "", payload: null });
      return;
    }

    setPageState({ loading: true, error: "", payload: null });
    try {
      const payload = await loader();
      setPageState({ loading: false, error: "", payload });
    } catch (error) {
      setPageState({ loading: false, error: readError(error), payload: null });
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (canAccess) loadPage(active);
  }, [active, canAccess, loadPage]);

  const filteredPayload = useMemo(() => {
    const payload = pageState.payload;
    const needle = query.trim().toLowerCase();
    if (!needle || !payload) return payload;

    const filter = (items) => items.filter(item =>
      JSON.stringify(item).toLowerCase().includes(needle)
    );

    if (payload.regions) return { ...payload, regions: filter(payload.regions) };
    if (payload.drivers) return { ...payload, drivers: filter(payload.drivers) };
    if (payload.applications) return { ...payload, applications: filter(payload.applications) };
    if (payload.orders) return { ...payload, orders: filter(payload.orders) };
    if (payload.logs) return { ...payload, logs: filter(payload.logs) };
    return payload;
  }, [pageState.payload, query]);

  function selectPage(key) {
    setActive(key);
    setQuery("");
    setDrawerOpen(false);
  }

  function logout() {
    clearToken();
    window.location.href = "/";
  }

  if (bootLoading) {
    return (
      <main className="admin-control-shell">
        <section className="admin-access-card">
          <SmartTaxiLogo large />
          <h1>Загружаем панель</h1>
          <p>Проверяем сессию и доступ к административным разделам.</p>
          <div className="admin-skeleton-row" />
        </section>
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className="admin-control-shell">
        <section className="admin-access-card">
          <SmartTaxiLogo large />
          <h1>Нет доступа к панели управления</h1>
          <p>{accessError || "Для входа нужен аккаунт владельца, оператора или финансового пользователя."}</p>
          <button type="button" className="admin-primary-button" onClick={logout}>
            Вернуться ко входу
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={`admin-control-shell ${drawerOpen ? "drawer-open" : ""}`}>
      <aside className="admin-control-sidebar" aria-label="Навигация панели">
        <div className="admin-brand">
          <SmartTaxiLogo />
          <div>
            <strong>SmartTaxi</strong>
            <span>Control Center</span>
          </div>
        </div>
        <nav>
          {navigation.map(item => (
            <button
              type="button"
              key={item.key}
              className={active === item.key ? "active" : ""}
              onClick={() => selectPage(item.key)}
            >
              <span>{item.label}</span>
              <small>{item.eyebrow}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="admin-control-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-menu-button"
            onClick={() => setDrawerOpen(value => !value)}
            aria-label="Открыть меню"
          >
            <span />
            <span />
            <span />
          </button>
          <div>
            <small>{currentPage.eyebrow}</small>
            <h1>{currentPage.label}</h1>
          </div>
          <div className="admin-user-chip">
            <strong>{user.name || user.phone || "Администратор"}</strong>
            <span>{user.role}</span>
          </div>
        </header>

        <div className="admin-mobile-overlay" onClick={() => setDrawerOpen(false)} />

        <section className="admin-page-toolbar">
          <label>
            <span>Поиск</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Найти в текущем разделе"
            />
          </label>
          <button type="button" className="admin-secondary-button" onClick={() => active === "dashboard" ? loadDashboard() : loadPage(active)}>
            Обновить
          </button>
        </section>

        {active === "dashboard" ? (
          <DashboardPage dashboard={dashboard} health={dashboard?.health} />
        ) : pageState.loading ? (
          <LoadingState />
        ) : pageState.error ? (
          <StatePanel
            title="Не удалось загрузить данные"
            text={pageState.error}
            action="Повторить"
            onAction={() => loadPage(active)}
          />
        ) : (
          <AdminPage active={active} payload={filteredPayload} />
        )}
      </section>
    </main>
  );
}

function DashboardPage({ dashboard, health }) {
  const cards = Array.isArray(dashboard?.cards) ? dashboard.cards : [];
  return (
    <div className="admin-page-stack">
      <section className="admin-health-card">
        <div>
          <small>Статус сервера</small>
          <h2>{health?.status === "ok" ? "Система доступна" : "Статус уточняется"}</h2>
          <p>{health?.time ? `Последняя проверка: ${formatDate(health.time)}` : "Данные проверки появятся после ответа сервера."}</p>
        </div>
        <span className={`admin-status-dot ${health?.status === "ok" ? "success" : "warning"}`} />
      </section>

      {cards.length ? (
        <section className="admin-metric-grid">
          {cards.map(card => (
            <article className="admin-metric-card" key={card.key || card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.hint}</small>
            </article>
          ))}
        </section>
      ) : (
        <StatePanel
          title={dashboard?.setup?.title || "Нет данных для отображения"}
          text={dashboard?.setup?.text || "Dashboard покажет показатели после подключения серверных данных."}
        />
      )}
    </div>
  );
}

function AdminPage({ active, payload }) {
  if (active === "regions") return <RegionsPage regions={asArray(payload, "regions")} />;
  if (active === "drivers") return <DriversPage drivers={asArray(payload, "drivers")} />;
  if (active === "applications") return <ApplicationsPage applications={asArray(payload, "applications")} />;
  if (active === "orders") return <OrdersPage orders={asArray(payload, "orders")} />;
  if (active === "audit") return <AuditPage logs={asArray(payload, "logs")} />;
  if (active === "settings") return <SettingsPage settings={payload?.settings} />;
  if (active === "tariffs") {
    return (
      <StatePanel
        title="Управление тарифами будет доработано в Stage 6"
        text="Здесь появятся базовая цена, цена за километр, цена за минуту, минимальная цена, комиссия и проверка итоговой стоимости."
      />
    );
  }
  if (active === "finance") {
    return (
      <StatePanel
        title="Финансовые отчёты будут доработаны в Stage 7"
        text="Раздел будет показывать выручку, комиссию сервиса, долг водителя и отчёты по регионам после отдельного этапа."
      />
    );
  }
  if (active === "support") {
    return (
      <StatePanel
        title="Раздел поддержки будет подключён на следующем этапе"
        text="Сейчас панель готова к списку обращений, фильтрам и карточке обращения без выдуманных заявок."
      />
    );
  }
  return <StatePanel title="Раздел будет подключён на следующем этапе" text="Нет данных для отображения." />;
}

function RegionsPage({ regions }) {
  if (!regions.length) return <StatePanel title="Нет регионов" text="Нет данных для отображения." />;
  return (
    <DataCard title="Активные регионы" text="Список загружен из серверных данных.">
      <div className="admin-table">
        {regions.map(region => (
          <div className="admin-table-row" key={region.id || region.code}>
            <strong>{region.name}</strong>
            <span>{region.code || "—"}</span>
            <Badge tone={region.isActive || region.is_active ? "success" : "muted"}>
              {region.isActive || region.is_active ? "Активен" : "Отключён"}
            </Badge>
            <span>{region.currency || "KZT"}</span>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function DriversPage({ drivers }) {
  if (!drivers.length) return <StatePanel title="Нет водителей" text="Нет данных для отображения." />;
  return (
    <DataCard title="Водители" text="Показаны только реальные записи сервиса.">
      <div className="admin-table">
        {drivers.map(driver => (
          <div className="admin-table-row drivers" key={driver.id}>
            <strong>{driver.name}</strong>
            <span>{driver.phone}</span>
            <span>{driver.car_model || driver.carModel || "Авто не указано"}</span>
            <Badge tone={driver.is_blocked ? "danger" : driver.status === "FREE" ? "success" : "muted"}>
              {driver.is_blocked ? "Заблокирован" : statusLabel(driver.status)}
            </Badge>
            <span>{driver.region_name || "Регион не выбран"}</span>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function ApplicationsPage({ applications }) {
  if (!applications.length) {
    return <StatePanel title="Нет заявок водителей" text="Новые заявки появятся здесь после отправки из мобильного приложения." />;
  }
  return (
    <DataCard title="Заявки водителей" text="Рассмотрение заявок будет расширено на следующем этапе.">
      <div className="admin-table">
        {applications.map(item => (
          <div className="admin-table-row applications" key={item.id}>
            <strong>{item.full_name}</strong>
            <span>{item.phone}</span>
            <span>{item.car_model}</span>
            <Badge tone={item.status === "PENDING" ? "warning" : item.status === "APPROVED" ? "success" : "danger"}>
              {statusLabel(item.status)}
            </Badge>
            <span>{formatDate(item.created_at)}</span>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function OrdersPage({ orders }) {
  if (!orders.length) return <StatePanel title="Нет заказов" text="Нет данных для отображения." />;
  return (
    <DataCard title="Заказы" text="Список загружен из регионально проверенных заказов.">
      <div className="admin-table">
        {orders.map(order => (
          <div className="admin-table-row orders" key={order.id}>
            <strong>{order.short_id || order.id}</strong>
            <span>{order.pickup_text} → {order.dropoff_text}</span>
            <Badge tone={order.status === "COMPLETED" ? "success" : order.status === "CANCELLED" ? "danger" : "warning"}>
              {statusLabel(order.status)}
            </Badge>
            <span>{formatMoney(order.price)}</span>
            <span>{formatDate(order.created_at)}</span>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function AuditPage({ logs }) {
  if (!logs.length) return <StatePanel title="Журнал пока пуст" text="Audit события появятся после действий пользователей." />;
  return (
    <DataCard title="Audit" text="Последние системные события сервиса.">
      <div className="admin-table">
        {logs.map(log => (
          <div className="admin-table-row audit" key={log.id}>
            <strong>{log.action}</strong>
            <span>{log.actor_name || log.actor_role || "Система"}</span>
            <span>{log.entity_type || "—"}</span>
            <span>{formatDate(log.created_at)}</span>
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function SettingsPage({ settings }) {
  if (!settings) return <StatePanel title="Настройки недоступны" text="Не удалось загрузить настройки сервиса." />;
  return (
    <DataCard title="Настройки сервиса" text="Редактирование будет вынесено в отдельный безопасный этап.">
      <div className="admin-settings-grid">
        <InfoLine label="Название" value={settings.serviceName} />
        <InfoLine label="Город" value={settings.city} />
        <InfoLine label="Валюта" value={`${settings.currency || "KZT"} ${settings.currencySymbol || "₸"}`} />
        <InfoLine label="Комиссия по умолчанию" value={`${settings.defaultCommissionPercent || 0}%`} />
        <InfoLine label="Телефон поддержки" value={settings.supportPhone} />
        <InfoLine label="Экстренный номер" value={settings.sosPhone} />
      </div>
    </DataCard>
  );
}

function DataCard({ title, text, children }) {
  return (
    <section className="admin-data-card">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function LoadingState() {
  return (
    <section className="admin-data-card">
      <div className="admin-skeleton-row" />
      <div className="admin-skeleton-row short" />
      <div className="admin-skeleton-row" />
    </section>
  );
}

function StatePanel({ title, text, action, onAction }) {
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

function Badge({ tone = "muted", children }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}

function InfoLine({ label, value }) {
  return (
    <div className="admin-info-line">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

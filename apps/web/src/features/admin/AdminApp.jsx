import React, { useCallback, useEffect, useMemo, useState } from "react";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import {
  blockAdminDriver,
  clearToken,
  createAdminRegion,
  getAdminAudit,
  getAdminDashboard,
  getAdminDriverApplications,
  getAdminDriverDetail,
  getAdminDrivers,
  getAdminOrders,
  getAdminRegions,
  getAdminSettings,
  toggleAdminRegion,
  unblockAdminDriver,
  updateAdminDriverApplication,
  updateAdminDriverRegion,
  updateAdminRegion
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

function isActiveRegion(region) {
  return Boolean(region?.isActive ?? region?.is_active);
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
    BLOCKED: "Заблокирован",
    REJECTED: "Отклонена",
    NEEDS_INFO: "Нужны данные",
    PENDING: "На проверке",
    UNAPPROVED: "Нет доступа"
  }[status] || status || "—";
}

function badgeTone(status) {
  if (["APPROVED", "FREE", "COMPLETED"].includes(status)) return "success";
  if (["BLOCKED", "REJECTED", "CANCELLED"].includes(status)) return "danger";
  if (["BUSY", "PENDING", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(status)) return "warning";
  return "muted";
}

function readError(error) {
  if (error?.code === "FORBIDDEN" || error?.message?.includes("Forbidden")) {
    return "Нет доступа к панели управления";
  }
  if (error?.code === "NOT_FOUND") return "Раздел будет подключён на следующем этапе";
  if (error?.details?.length) return error.details.map(item => item.message).join("; ");
  return error?.message || "Не удалось загрузить данные";
}

function normalizeRegionForm(region) {
  return {
    name: region?.name || "",
    code: region?.code || "",
    currency: region?.currency || "KZT",
    centerLat: String(region?.centerLat ?? region?.center_lat ?? ""),
    centerLng: String(region?.centerLng ?? region?.center_lng ?? ""),
    boundary: JSON.stringify(region?.boundary || [[0, 0], [0, 1], [1, 1], [0, 0]], null, 2),
    isActive: isActiveRegion(region)
  };
}

export default function AdminApp() {
  const [active, setActive] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [user, setUser] = useState(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [pageState, setPageState] = useState({ loading: false, error: "", payload: null });
  const [modal, setModal] = useState(null);
  const [actionState, setActionState] = useState({ loading: false, error: "", message: "" });
  const [regionStatus, setRegionStatus] = useState("all");
  const [driverStatus, setDriverStatus] = useState("all");
  const [applicationStatus, setApplicationStatus] = useState("PENDING");
  const [driverDetail, setDriverDetail] = useState({ loading: false, error: "", payload: null });

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

  const refreshDriverDetail = useCallback(async (driverId) => {
    if (!driverId) return;
    setDriverDetail({ loading: true, error: "", payload: null });
    try {
      const payload = await getAdminDriverDetail(driverId);
      setDriverDetail({ loading: false, error: "", payload });
    } catch (error) {
      setDriverDetail({ loading: false, error: readError(error), payload: null });
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

  const regions = asArray(pageState.payload, "regions");

  function selectPage(key) {
    setActive(key);
    setQuery("");
    setDrawerOpen(false);
    setActionState({ loading: false, error: "", message: "" });
  }

  function logout() {
    clearToken();
    window.location.href = "/";
  }

  async function runAction(work, successMessage) {
    setActionState({ loading: true, error: "", message: "" });
    try {
      await work();
      setActionState({ loading: false, error: "", message: successMessage || "Готово" });
    } catch (error) {
      setActionState({ loading: false, error: readError(error), message: "" });
    }
  }

  async function saveRegion(form, existing) {
    await runAction(async () => {
      const boundary = JSON.parse(form.boundary);
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        currency: form.currency.trim(),
        centerLat: Number(form.centerLat),
        centerLng: Number(form.centerLng),
        boundary,
        isActive: form.isActive
      };
      if (existing?.id) await updateAdminRegion(existing.id, payload);
      else await createAdminRegion(payload);
      setModal(null);
      await loadPage("regions");
      await loadDashboard();
    }, "Регион сохранён");
  }

  async function switchRegion(region) {
    await runAction(async () => {
      await toggleAdminRegion(region.id, !isActiveRegion(region));
      await loadPage("regions");
      await loadDashboard();
    }, isActiveRegion(region) ? "Регион отключён" : "Регион активирован");
  }

  function openDriver(driver) {
    setModal({ type: "driver", driver });
    refreshDriverDetail(driver.id);
  }

  async function setDriverBlocked(driver, isBlocked, reason = "") {
    await runAction(async () => {
      if (isBlocked) await blockAdminDriver(driver.id, reason);
      else await unblockAdminDriver(driver.id);
      await loadPage("drivers");
      await refreshDriverDetail(driver.id);
      await loadDashboard();
    }, isBlocked ? "Водитель заблокирован" : "Водитель разблокирован");
  }

  async function setDriverRegion(driverId, regionId, status, reason = "") {
    await runAction(async () => {
      await updateAdminDriverRegion(driverId, { regionId, status, reason });
      await refreshDriverDetail(driverId);
      await loadPage("drivers");
      await loadDashboard();
    }, status === "APPROVED" ? "Доступ к региону одобрен" : "Регион заблокирован");
  }

  async function reviewApplication(application, status, comment = "") {
    await runAction(async () => {
      await updateAdminDriverApplication(application.id, { status, comment });
      setModal(null);
      await loadPage("applications");
      await loadDashboard();
    }, status === "APPROVED" ? "Заявка одобрена" : "Заявка обновлена");
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

        {actionState.error && <InlineMessage danger text={actionState.error} />}
        {actionState.message && <InlineMessage text={actionState.message} />}

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
          <AdminPage
            active={active}
            payload={filteredPayload}
            regionStatus={regionStatus}
            setRegionStatus={setRegionStatus}
            driverStatus={driverStatus}
            setDriverStatus={setDriverStatus}
            applicationStatus={applicationStatus}
            setApplicationStatus={setApplicationStatus}
            onAddRegion={() => setModal({ type: "region", region: null })}
            onEditRegion={region => setModal({ type: "region", region })}
            onToggleRegion={switchRegion}
            onOpenDriver={openDriver}
            onBlockDriver={setDriverBlocked}
            onOpenApplication={application => setModal({ type: "application", application })}
          />
        )}
      </section>

      {modal?.type === "region" && (
        <RegionEditor
          region={modal.region}
          onClose={() => setModal(null)}
          onSave={saveRegion}
          busy={actionState.loading}
        />
      )}
      {modal?.type === "driver" && (
        <DriverDetailPanel
          initialDriver={modal.driver}
          detail={driverDetail}
          busy={actionState.loading}
          onClose={() => setModal(null)}
          onRefresh={() => refreshDriverDetail(modal.driver.id)}
          onBlock={setDriverBlocked}
          onSetRegion={setDriverRegion}
        />
      )}
      {modal?.type === "application" && (
        <ApplicationPanel
          application={modal.application}
          regions={regions}
          busy={actionState.loading}
          onClose={() => setModal(null)}
          onReview={reviewApplication}
        />
      )}
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

function AdminPage(props) {
  const { active, payload } = props;
  if (active === "regions") return <RegionsPage regions={asArray(payload, "regions")} {...props} />;
  if (active === "drivers") return <DriversPage drivers={asArray(payload, "drivers")} {...props} />;
  if (active === "applications") return <ApplicationsPage applications={asArray(payload, "applications")} {...props} />;
  if (active === "orders") return <OrdersPage orders={asArray(payload, "orders")} />;
  if (active === "audit") return <AuditPage logs={asArray(payload, "logs")} />;
  if (active === "settings") return <SettingsPage settings={payload?.settings} />;
  if (active === "tariffs") {
    return (
      <StatePanel
        title="Управление тарифами будет доработано на отдельном этапе"
        text="Здесь появятся базовая цена, цена за километр, цена за минуту, минимальная цена, комиссия и проверка итоговой стоимости."
      />
    );
  }
  if (active === "finance") {
    return (
      <StatePanel
        title="Финансовые отчёты будут доработаны на отдельном этапе"
        text="Раздел будет показывать выручку, комиссию сервиса, долг водителя и отчёты по регионам после отдельной реализации."
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

function PageHeader({ title, subtitle, action, children }) {
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

function RegionsPage({ regions, regionStatus, setRegionStatus, onAddRegion, onEditRegion, onToggleRegion }) {
  const visible = regions.filter(region => {
    if (regionStatus === "active") return isActiveRegion(region);
    if (regionStatus === "inactive") return !isActiveRegion(region);
    return true;
  });

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="Регионы"
        subtitle="Управление зонами работы SmartTaxi"
        action={<button type="button" className="admin-primary-button" onClick={onAddRegion}>Добавить регион</button>}
      >
        <SegmentedFilter
          value={regionStatus}
          onChange={setRegionStatus}
          items={[
            ["all", "Все"],
            ["active", "Активные"],
            ["inactive", "Отключённые"]
          ]}
        />
      </PageHeader>

      {!visible.length ? (
        <StatePanel
          title="Регионы пока не настроены"
          text="Добавьте первый регион, чтобы сервис мог принимать заказы."
          action="Добавить регион"
          onAction={onAddRegion}
        />
      ) : (
        <section className="admin-card-grid regions">
          {visible.map(region => (
            <article className="admin-region-card" key={region.id}>
              <header>
                <div>
                  <strong>{region.name}</strong>
                  <span>{region.code || "Код не указан"}</span>
                </div>
                <Badge tone={isActiveRegion(region) ? "success" : "muted"}>
                  {isActiveRegion(region) ? "Активен" : "Отключён"}
                </Badge>
              </header>
              <div className="admin-card-facts">
                <InfoLine label="Валюта" value={region.currency || "KZT"} />
                <InfoLine label="Центр" value={`${region.centerLat ?? region.center_lat}, ${region.centerLng ?? region.center_lng}`} />
                <InfoLine label="Граница" value={region.boundary ? "Polygon JSON задан" : "Граница не задана"} />
              </div>
              <footer>
                <button type="button" className="admin-secondary-button" onClick={() => onEditRegion(region)}>Редактировать</button>
                <button type="button" className={isActiveRegion(region) ? "admin-danger-button" : "admin-secondary-button"} onClick={() => onToggleRegion(region)}>
                  {isActiveRegion(region) ? "Отключить" : "Активировать"}
                </button>
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function DriversPage({ drivers, driverStatus, setDriverStatus, onOpenDriver, onBlockDriver }) {
  const visible = drivers.filter(driver => {
    if (driverStatus === "blocked") return driver.is_blocked;
    if (driverStatus === "online") return !driver.is_blocked && driver.status === "FREE";
    if (driverStatus === "busy") return !driver.is_blocked && driver.status === "BUSY";
    if (driverStatus === "offline") return !driver.is_blocked && driver.status !== "FREE" && driver.status !== "BUSY";
    return true;
  });

  return (
    <div className="admin-page-stack">
      <PageHeader title="Водители" subtitle="Контроль водителей, статусов и доступа к регионам">
        <SegmentedFilter
          value={driverStatus}
          onChange={setDriverStatus}
          items={[
            ["all", "Все"],
            ["online", "На линии"],
            ["busy", "Заняты"],
            ["offline", "Не на линии"],
            ["blocked", "Заблокированы"]
          ]}
        />
      </PageHeader>

      {!visible.length ? (
        <StatePanel title="Нет водителей" text="Нет данных для отображения." />
      ) : (
        <DataCard title="Водители" text="Откройте карточку водителя, чтобы управлять региональным доступом.">
          <div className="admin-table premium">
            {visible.map(driver => (
              <div className="admin-table-row drivers" key={driver.id}>
                <strong>{driver.name}</strong>
                <span>{driver.phone}</span>
                <span>{[driver.car_model, driver.car_color, driver.plate].filter(Boolean).join(" · ") || "Авто не указано"}</span>
                <Badge tone={driver.is_blocked ? "danger" : badgeTone(driver.status)}>
                  {driver.is_blocked ? "Заблокирован" : statusLabel(driver.status)}
                </Badge>
                <span>{driver.region_name || "Регион не выбран"}</span>
                <div className="admin-row-actions">
                  <button type="button" className="admin-secondary-button compact" onClick={() => onOpenDriver(driver)}>Детали</button>
                  <button
                    type="button"
                    className={driver.is_blocked ? "admin-secondary-button compact" : "admin-danger-button compact"}
                    onClick={() => onBlockDriver(driver, !driver.is_blocked)}
                  >
                    {driver.is_blocked ? "Разблокировать" : "Заблокировать"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DataCard>
      )}
    </div>
  );
}

function ApplicationsPage({ applications, applicationStatus, setApplicationStatus, onOpenApplication }) {
  const visible = applications.filter(item => applicationStatus === "ALL" || item.status === applicationStatus);

  return (
    <div className="admin-page-stack">
      <PageHeader title="Заявки водителей" subtitle="Проверка новых водителей перед выходом на линию">
        <SegmentedFilter
          value={applicationStatus}
          onChange={setApplicationStatus}
          items={[
            ["PENDING", "Ожидают"],
            ["APPROVED", "Одобрены"],
            ["REJECTED", "Отклонены"],
            ["ALL", "Все"]
          ]}
        />
      </PageHeader>

      {!visible.length ? (
        <StatePanel title="Нет заявок водителей" text="Новые заявки появятся здесь после отправки из мобильного приложения." />
      ) : (
        <section className="admin-card-grid applications">
          {visible.map(item => (
            <article className="admin-application-card" key={item.id}>
              <header>
                <div>
                  <strong>{item.full_name}</strong>
                  <span>{item.phone}</span>
                </div>
                <Badge tone={badgeTone(item.status)}>{statusLabel(item.status)}</Badge>
              </header>
              <div className="admin-card-facts">
                <InfoLine label="Автомобиль" value={item.car_model} />
                <InfoLine label="Цвет" value={item.car_color || "Не указан"} />
                <InfoLine label="Госномер" value={item.plate_number} />
                <InfoLine label="Создана" value={formatDate(item.created_at)} />
              </div>
              <footer>
                <button type="button" className="admin-secondary-button" onClick={() => onOpenApplication(item)}>Открыть</button>
              </footer>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function OrdersPage({ orders }) {
  if (!orders.length) return <StatePanel title="Нет заказов" text="Нет данных для отображения." />;
  return (
    <DataCard title="Заказы" text="Список загружен из регионально проверенных заказов.">
      <div className="admin-table premium">
        {orders.map(order => (
          <div className="admin-table-row orders" key={order.id}>
            <strong>{order.short_id || order.id}</strong>
            <span>{order.pickup_text} → {order.dropoff_text}</span>
            <Badge tone={badgeTone(order.status)}>{statusLabel(order.status)}</Badge>
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
      <div className="admin-table premium">
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

function RegionEditor({ region, onClose, onSave, busy }) {
  const [form, setForm] = useState(() => normalizeRegionForm(region));
  const [error, setError] = useState("");

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      JSON.parse(form.boundary);
      if (!form.name.trim()) throw new Error("Введите название региона");
      if (!form.code.trim()) throw new Error("Введите код региона");
      if (!Number.isFinite(Number(form.centerLat)) || !Number.isFinite(Number(form.centerLng))) {
        throw new Error("Введите корректные координаты центра");
      }
      await onSave(form, region);
    } catch (submitError) {
      setError(submitError.message || "Проверьте данные региона");
    }
  }

  return (
    <ModalFrame title={region ? "Редактировать регион" : "Добавить регион"} onClose={onClose}>
      <form className="admin-form-grid" onSubmit={submit}>
        <Field label="Название" value={form.name} onChange={value => setField("name", value)} />
        <Field label="Код" value={form.code} onChange={value => setField("code", value.toUpperCase())} />
        <Field label="Валюта" value={form.currency} onChange={value => setField("currency", value.toUpperCase())} />
        <div className="admin-form-row">
          <Field label="centerLat" value={form.centerLat} onChange={value => setField("centerLat", value)} />
          <Field label="centerLng" value={form.centerLng} onChange={value => setField("centerLng", value)} />
        </div>
        <label className="admin-textarea-field">
          <span>Boundary JSON</span>
          <textarea value={form.boundary} onChange={event => setField("boundary", event.target.value)} rows={8} />
        </label>
        <label className="admin-toggle-line">
          <input type="checkbox" checked={form.isActive} onChange={event => setField("isActive", event.target.checked)} />
          <span>Регион активен</span>
        </label>
        {error && <InlineMessage danger text={error} />}
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="submit" className="admin-primary-button" disabled={busy}>{busy ? "Сохраняем..." : "Сохранить"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}

function DriverDetailPanel({ initialDriver, detail, busy, onClose, onRefresh, onBlock, onSetRegion }) {
  const [reasonByRegion, setReasonByRegion] = useState({});
  const driver = detail.payload?.driver || initialDriver;
  const regions = detail.payload?.regions || [];
  const activeOrder = detail.payload?.activeOrder;

  return (
    <ModalFrame title="Карточка водителя" onClose={onClose} wide>
      {detail.loading ? <LoadingState /> : detail.error ? (
        <StatePanel title="Не удалось загрузить данные" text={detail.error} action="Повторить" onAction={onRefresh} />
      ) : (
        <div className="admin-detail-stack">
          <section className="admin-detail-hero">
            <div>
              <h2>{driver.name}</h2>
              <p>{driver.phone}</p>
            </div>
            <Badge tone={driver.is_blocked ? "danger" : badgeTone(driver.status)}>
              {driver.is_blocked ? "Заблокирован" : statusLabel(driver.status)}
            </Badge>
          </section>

          <div className="admin-settings-grid">
            <InfoLine label="Автомобиль" value={[driver.car_model, driver.car_color].filter(Boolean).join(" · ")} />
            <InfoLine label="Госномер" value={driver.plate} />
            <InfoLine label="Текущий регион" value={driver.region_name || "Регион не выбран"} />
            <InfoLine label="Активный заказ" value={activeOrder ? `${activeOrder.shortId || activeOrder.id} · ${statusLabel(activeOrder.status)}` : "Нет активного заказа"} />
          </div>

          <section className="admin-detail-actions">
            <button type="button" className={driver.is_blocked ? "admin-secondary-button" : "admin-danger-button"} disabled={busy} onClick={() => onBlock(driver, !driver.is_blocked)}>
              {driver.is_blocked ? "Разблокировать" : "Заблокировать"}
            </button>
          </section>

          <DataCard title="Региональный доступ" text="Одобрение и блокировка работают по каждому региону отдельно.">
            {!regions.length ? (
              <StatePanel title="Нет регионов" text="Сначала настройте регионы сервиса." />
            ) : (
              <div className="admin-approval-list">
                {regions.map(region => (
                  <article className="admin-approval-card" key={region.regionId}>
                    <header>
                      <div>
                        <strong>{region.regionName}</strong>
                        <span>{region.regionCode}</span>
                      </div>
                      <Badge tone={badgeTone(region.status)}>{statusLabel(region.status)}</Badge>
                    </header>
                    {region.blockReason && <p>Причина блокировки: {region.blockReason}</p>}
                    {!region.regionIsActive && <p>Регион отключён</p>}
                    <input
                      value={reasonByRegion[region.regionId] || ""}
                      onChange={event => setReasonByRegion(current => ({ ...current, [region.regionId]: event.target.value }))}
                      placeholder="Причина блокировки"
                    />
                    <footer>
                      <button type="button" className="admin-secondary-button compact" disabled={busy} onClick={() => onSetRegion(driver.id, region.regionId, "APPROVED")}>
                        Одобрить
                      </button>
                      <button type="button" className="admin-danger-button compact" disabled={busy} onClick={() => onSetRegion(driver.id, region.regionId, "BLOCKED", reasonByRegion[region.regionId] || "")}>
                        Заблокировать
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </DataCard>
        </div>
      )}
    </ModalFrame>
  );
}

function ApplicationPanel({ application, regions, busy, onClose, onReview }) {
  const [reason, setReason] = useState("");
  return (
    <ModalFrame title="Заявка водителя" onClose={onClose}>
      <div className="admin-detail-stack">
        <section className="admin-detail-hero">
          <div>
            <h2>{application.full_name}</h2>
            <p>{application.phone}</p>
          </div>
          <Badge tone={badgeTone(application.status)}>{statusLabel(application.status)}</Badge>
        </section>
        <div className="admin-settings-grid">
          <InfoLine label="Автомобиль" value={application.car_model} />
          <InfoLine label="Цвет" value={application.car_color || "Не указан"} />
          <InfoLine label="Госномер" value={application.plate_number} />
          <InfoLine label="Год" value={application.year || "Не указан"} />
          <InfoLine label="Создана" value={formatDate(application.created_at)} />
          <InfoLine label="Доступные регионы" value={regions.length ? `${regions.length}` : "Регионы не настроены"} />
        </div>
        <label className="admin-textarea-field">
          <span>Комментарий или причина отказа</span>
          <textarea value={reason} onChange={event => setReason(event.target.value)} rows={4} />
        </label>
        <InlineMessage text="Региональный доступ назначается в карточке водителя после создания профиля." />
        <div className="admin-modal-actions">
          <button type="button" className="admin-danger-button" disabled={busy} onClick={() => onReview(application, "REJECTED", reason)}>
            Отклонить
          </button>
          <button type="button" className="admin-secondary-button" disabled={busy} onClick={() => onReview(application, "NEEDS_INFO", reason)}>
            Запросить данные
          </button>
          <button type="button" className="admin-primary-button" disabled={busy} onClick={() => onReview(application, "APPROVED", reason)}>
            Одобрить
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({ title, onClose, children, wide = false }) {
  return (
    <div className="admin-modal-backdrop" role="presentation">
      <section className={`admin-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function SegmentedFilter({ value, onChange, items }) {
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

function Field({ label, value, onChange }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input value={value} onChange={event => onChange(event.target.value)} />
    </label>
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

function InlineMessage({ text, danger = false }) {
  return <div className={`admin-inline-message ${danger ? "danger" : ""}`}>{text}</div>;
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

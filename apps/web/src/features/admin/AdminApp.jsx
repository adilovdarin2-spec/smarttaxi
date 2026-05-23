import React, { useCallback, useEffect, useMemo, useState } from "react";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import {
  adjustAdminDriverDebt,
  blockAdminDriver,
  clearToken,
  createAdminRegion,
  createAdminTariff,
  exportAdminFinanceTransactionsCsv,
  getAdminAudit,
  getAdminDashboard,
  getAdminDriverApplications,
  getAdminDriverDetail,
  getAdminDrivers,
  getAdminFinanceDriverDebts,
  getAdminFinanceReports,
  getAdminFinanceSummary,
  getAdminFinanceTransactions,
  getAdminOrders,
  getAdminRegions,
  getAdminSettings,
  getAdminTariffAnalytics,
  getAdminTariffs,
  previewAdminTariffPrice,
  setAdminTariffStatus,
  toggleAdminRegion,
  unblockAdminDriver,
  updateAdminDriverApplication,
  updateAdminDriverRegion,
  updateAdminRegion,
  updateAdminTariff
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

function formatOptionalMoney(value) {
  if (value === null || value === undefined) return "—";
  return formatMoney(value);
}

function formatMetric(value, suffix) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("ru-RU")} ${suffix}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")}%`;
}

function formatMultiplier(value) {
  return `x${Number(value || 1).toLocaleString("ru-RU")}`;
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

function isTariffActive(tariff) {
  return Boolean(tariff?.isActive ?? tariff?.is_active);
}

function dateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function dateRangeParams(preset, customFrom, customTo) {
  const today = new Date();
  const from = new Date(today);
  if (preset === "today") {
    return { dateFrom: dateInputValue(today), dateTo: dateInputValue(today) };
  }
  if (preset === "7d") {
    from.setDate(today.getDate() - 6);
    return { dateFrom: dateInputValue(from), dateTo: dateInputValue(today) };
  }
  if (preset === "custom") {
    return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
  }
  from.setDate(today.getDate() - 29);
  return { dateFrom: dateInputValue(from), dateTo: dateInputValue(today) };
}

function tariffDateParams(preset, customFrom, customTo) {
  return dateRangeParams(preset, customFrom, customTo);
}

function financeTypeLabel(type) {
  return {
    ORDER_COMPLETED: "Поездка завершена",
    ORDER_CANCELLED: "Поездка отменена",
    DRIVER_DEBT_CREATED: "Долг водителя",
    DRIVER_DEBT_ADJUSTED: "Корректировка долга",
    MANUAL_ADJUSTMENT: "Ручная корректировка"
  }[type] || type || "—";
}

function paymentMethodLabel(method) {
  return {
    CASH: "Наличные",
    KASPI_TRANSFER: "Kaspi перевод",
    UNKNOWN: "Требует проверки"
  }[method] || method || "—";
}

function financeGroupLabel(groupBy) {
  return {
    day: "День",
    region: "Регион",
    driver: "Водитель",
    tariff: "Тариф",
    paymentMethod: "Способ оплаты"
  }[groupBy] || groupBy || "—";
}

function tariffAnalyticsKey(tariff) {
  return tariff?.tariffId || tariff?.id;
}

function normalizeTariffForm(tariff, defaultRegionId = "") {
  return {
    regionId: tariff?.regionId || tariff?.region_id || defaultRegionId,
    name: tariff?.name || "",
    displayName: tariff?.displayName || tariff?.display_name || "",
    description: tariff?.description || "",
    basePrice: String(tariff?.basePrice ?? tariff?.base_price ?? ""),
    pricePerKm: String(tariff?.pricePerKm ?? tariff?.price_per_km ?? ""),
    pricePerMinute: String(tariff?.pricePerMinute ?? tariff?.price_per_minute ?? ""),
    minimumPrice: String(tariff?.minimumPrice ?? tariff?.min_price ?? ""),
    serviceCommissionPercent: String(tariff?.serviceCommissionPercent ?? tariff?.service_commission_percent ?? 15),
    surgeMultiplier: String(tariff?.surgeMultiplier ?? tariff?.surge_multiplier ?? 1),
    freeWaitingMinutes: String(tariff?.freeWaitingMinutes ?? tariff?.free_waiting_minutes ?? 0),
    waitingPricePerMinute: String(tariff?.waitingPricePerMinute ?? tariff?.waiting_price_per_minute ?? 0),
    cancellationFee: String(tariff?.cancellationFee ?? tariff?.cancellation_fee ?? 0),
    sortOrder: String(tariff?.sortOrder ?? tariff?.sort_order ?? 0),
    isActive: tariff ? isTariffActive(tariff) : true
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
  const [tariffStatus, setTariffStatus] = useState("all");
  const [tariffRegion, setTariffRegion] = useState("all");
  const [tariffDatePreset, setTariffDatePreset] = useState("30d");
  const [tariffDateFrom, setTariffDateFrom] = useState("");
  const [tariffDateTo, setTariffDateTo] = useState("");
  const [financeRegion, setFinanceRegion] = useState("all");
  const [financeDriver, setFinanceDriver] = useState("all");
  const [financeTariff, setFinanceTariff] = useState("all");
  const [financeGroupBy, setFinanceGroupBy] = useState("day");
  const [financeSection, setFinanceSection] = useState("overview");
  const [financeDatePreset, setFinanceDatePreset] = useState("30d");
  const [financeDateFrom, setFinanceDateFrom] = useState("");
  const [financeDateTo, setFinanceDateTo] = useState("");
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
    if (["dashboard", "support"].includes(page)) {
      setPageState({ loading: false, error: "", payload: null });
      return;
    }

    const loaders = {
      regions: getAdminRegions,
      drivers: getAdminDrivers,
      applications: getAdminDriverApplications,
      orders: getAdminOrders,
      tariffs: async () => {
        const selectedRegionId = tariffRegion !== "all" ? tariffRegion : undefined;
        const dateParams = tariffDateParams(tariffDatePreset, tariffDateFrom, tariffDateTo);
        const [tariffs, regions, analytics] = await Promise.allSettled([
          getAdminTariffs(),
          getAdminRegions(),
          getAdminTariffAnalytics({ regionId: selectedRegionId, ...dateParams })
        ]);
        if (tariffs.status === "rejected") throw tariffs.reason;
        if (regions.status === "rejected") throw regions.reason;
        return {
          tariffs: tariffs.value.tariffs || [],
          regions: regions.value.regions || [],
          analytics: analytics.status === "fulfilled" ? analytics.value.analytics || [] : [],
          analyticsTotals: analytics.status === "fulfilled" ? analytics.value.totals || null : null,
          analyticsDateRange: analytics.status === "fulfilled" ? analytics.value.dateRange || dateParams : dateParams,
          analyticsError: analytics.status === "rejected" ? "Не удалось загрузить аналитику тарифов" : ""
        };
      },
      finance: async () => {
        const selectedRegionId = financeRegion !== "all" ? financeRegion : undefined;
        const selectedDriverId = financeDriver !== "all" ? financeDriver : undefined;
        const selectedTariffId = financeTariff !== "all" ? financeTariff : undefined;
        const dateParams = dateRangeParams(financeDatePreset, financeDateFrom, financeDateTo);
        const commonFilters = {
          regionId: selectedRegionId,
          driverId: selectedDriverId,
          tariffId: selectedTariffId,
          ...dateParams
        };
        const [regions, drivers, tariffs, summary, driverDebts, reports, transactions] = await Promise.all([
          getAdminRegions(),
          getAdminDrivers(),
          getAdminTariffs(),
          getAdminFinanceSummary({ regionId: selectedRegionId, ...dateParams }),
          getAdminFinanceDriverDebts({ regionId: selectedRegionId, driverId: selectedDriverId, ...dateParams }),
          getAdminFinanceReports({ ...commonFilters, groupBy: financeGroupBy }),
          getAdminFinanceTransactions({ ...commonFilters, limit: 100 })
        ]);
        return {
          regions: regions.regions || [],
          drivers: drivers.drivers || [],
          tariffs: tariffs.tariffs || [],
          summary: summary.summary || null,
          driverDebts: driverDebts.driverDebts || [],
          reports: reports.rows || [],
          reportTotals: reports.totals || null,
          reportGroupBy: reports.groupBy || financeGroupBy,
          transactions: transactions.items || transactions.transactions || [],
          transactionTotal: transactions.total || 0,
          transactionLimit: transactions.limit || 100,
          transactionOffset: transactions.offset || 0,
          dateRange: summary.dateRange || dateParams
        };
      },
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
  }, [financeDateFrom, financeDatePreset, financeDateTo, financeDriver, financeGroupBy, financeRegion, financeTariff, tariffDateFrom, tariffDatePreset, tariffDateTo, tariffRegion]);

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
    if (payload.tariffs) return { ...payload, tariffs: filter(payload.tariffs), regions: payload.regions || [] };
    if (payload.transactions || payload.driverDebts) {
      return {
        ...payload,
        transactions: filter(payload.transactions || []),
        driverDebts: filter(payload.driverDebts || []),
        regions: payload.regions || []
      };
    }
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

  async function saveTariff(form, existing) {
    await runAction(async () => {
      const payload = {
        regionId: form.regionId,
        name: form.name.trim(),
        displayName: form.displayName.trim(),
        description: form.description.trim(),
        basePrice: Number(form.basePrice),
        pricePerKm: Number(form.pricePerKm),
        pricePerMinute: Number(form.pricePerMinute),
        minimumPrice: Number(form.minimumPrice),
        serviceCommissionPercent: Number(form.serviceCommissionPercent),
        surgeMultiplier: Number(form.surgeMultiplier),
        freeWaitingMinutes: Number(form.freeWaitingMinutes),
        waitingPricePerMinute: Number(form.waitingPricePerMinute),
        cancellationFee: Number(form.cancellationFee),
        sortOrder: Number(form.sortOrder),
        isActive: form.isActive
      };
      if (existing?.id) await updateAdminTariff(existing.id, payload);
      else await createAdminTariff(payload);
      setModal(null);
      await loadPage("tariffs");
    }, "Тариф сохранён");
  }

  async function switchTariff(tariff) {
    await runAction(async () => {
      await setAdminTariffStatus(tariff.id, !isTariffActive(tariff));
      await loadPage("tariffs");
    }, isTariffActive(tariff) ? "Тариф отключён" : "Тариф активирован");
  }

  async function runTariffPreview(tariff, input) {
    return previewAdminTariffPrice({
      regionId: tariff.regionId,
      tariffId: tariff.id,
      distanceKm: Number(input.distanceKm),
      durationMin: Number(input.durationMin),
      waitingMinutes: Number(input.waitingMinutes)
    });
  }

  async function saveDebtAdjustment(driver, form) {
    await runAction(async () => {
      await adjustAdminDriverDebt(driver.driverId || driver.id, {
        amount: Number(form.amount),
        reason: form.reason.trim(),
        regionId: form.regionId || undefined,
        metadata: { sourceView: "admin_finance" }
      });
      setModal(null);
      await loadPage("finance");
      await loadDashboard();
    }, "Корректировка долга сохранена");
  }

  async function exportFinanceCsv() {
    await runAction(async () => {
      const selectedRegionId = financeRegion !== "all" ? financeRegion : undefined;
      const selectedDriverId = financeDriver !== "all" ? financeDriver : undefined;
      const selectedTariffId = financeTariff !== "all" ? financeTariff : undefined;
      const dateParams = dateRangeParams(financeDatePreset, financeDateFrom, financeDateTo);
      const csv = await exportAdminFinanceTransactionsCsv({
        regionId: selectedRegionId,
        driverId: selectedDriverId,
        tariffId: selectedTariffId,
        ...dateParams,
        limit: 200
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "smarttaxi-finance-transactions.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, "CSV экспорт подготовлен");
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
            tariffStatus={tariffStatus}
            setTariffStatus={setTariffStatus}
            tariffRegion={tariffRegion}
            setTariffRegion={setTariffRegion}
            tariffDatePreset={tariffDatePreset}
            setTariffDatePreset={setTariffDatePreset}
            tariffDateFrom={tariffDateFrom}
            setTariffDateFrom={setTariffDateFrom}
            tariffDateTo={tariffDateTo}
            setTariffDateTo={setTariffDateTo}
            financeRegion={financeRegion}
            setFinanceRegion={setFinanceRegion}
            financeDriver={financeDriver}
            setFinanceDriver={setFinanceDriver}
            financeTariff={financeTariff}
            setFinanceTariff={setFinanceTariff}
            financeGroupBy={financeGroupBy}
            setFinanceGroupBy={setFinanceGroupBy}
            financeSection={financeSection}
            setFinanceSection={setFinanceSection}
            financeDatePreset={financeDatePreset}
            setFinanceDatePreset={setFinanceDatePreset}
            financeDateFrom={financeDateFrom}
            setFinanceDateFrom={setFinanceDateFrom}
            financeDateTo={financeDateTo}
            setFinanceDateTo={setFinanceDateTo}
            onAddRegion={() => setModal({ type: "region", region: null })}
            onEditRegion={region => setModal({ type: "region", region })}
            onToggleRegion={switchRegion}
            onOpenDriver={openDriver}
            onBlockDriver={setDriverBlocked}
            onOpenApplication={application => setModal({ type: "application", application })}
            onAddTariff={() => setModal({ type: "tariff", tariff: null })}
            onEditTariff={tariff => setModal({ type: "tariff", tariff })}
            onToggleTariff={switchTariff}
            onPreviewTariff={tariff => setModal({ type: "tariffPreview", tariff })}
            canAdjustFinance={user?.role === "OWNER" || user?.role === "FINANCE"}
            onAdjustDebt={driver => setModal({ type: "debtAdjustment", driver })}
            onExportFinanceCsv={exportFinanceCsv}
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
      {modal?.type === "tariff" && (
        <TariffEditor
          tariff={modal.tariff}
          regions={asArray(pageState.payload, "regions")}
          onClose={() => setModal(null)}
          onSave={saveTariff}
          busy={actionState.loading}
        />
      )}
      {modal?.type === "tariffPreview" && (
        <TariffPreviewPanel
          tariff={modal.tariff}
          onClose={() => setModal(null)}
          onPreview={runTariffPreview}
        />
      )}
      {modal?.type === "debtAdjustment" && (
        <DebtAdjustmentPanel
          driver={modal.driver}
          regions={asArray(pageState.payload, "regions")}
          onClose={() => setModal(null)}
          onSave={saveDebtAdjustment}
          busy={actionState.loading}
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
  if (active === "tariffs") return <TariffsPage tariffs={asArray(payload, "tariffs")} regions={asArray(payload, "regions")} {...props} />;
  if (active === "finance") return <FinancePage payload={payload} regions={asArray(payload, "regions")} {...props} />;
  if (active === "audit") return <AuditPage logs={asArray(payload, "logs")} />;
  if (active === "settings") return <SettingsPage settings={payload?.settings} />;
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

function TariffsPage({
  tariffs,
  regions,
  payload,
  tariffStatus,
  setTariffStatus,
  tariffRegion,
  setTariffRegion,
  tariffDatePreset,
  setTariffDatePreset,
  tariffDateFrom,
  setTariffDateFrom,
  tariffDateTo,
  setTariffDateTo,
  onAddTariff,
  onEditTariff,
  onToggleTariff,
  onPreviewTariff
}) {
  const analytics = asArray(payload, "analytics");
  const analyticsByTariff = useMemo(() => new Map(analytics.map(item => [tariffAnalyticsKey(item), item])), [analytics]);
  const totals = payload?.analyticsTotals || analytics.reduce((acc, item) => ({
    orderCount: acc.orderCount + Number(item.orderCount || 0),
    completedOrderCount: acc.completedOrderCount + Number(item.completedOrderCount || 0),
    cancelledOrderCount: acc.cancelledOrderCount + Number(item.cancelledOrderCount || 0),
    grossTotal: acc.grossTotal + Number(item.grossTotal || 0),
    serviceCommissionTotal: acc.serviceCommissionTotal + Number(item.serviceCommissionTotal || 0),
    driverEarningTotal: acc.driverEarningTotal + Number(item.driverEarningTotal || 0)
  }), {
    orderCount: 0,
    completedOrderCount: 0,
    cancelledOrderCount: 0,
    grossTotal: 0,
    serviceCommissionTotal: 0,
    driverEarningTotal: 0,
    averageFinalPrice: null
  });
  const dateRange = payload?.analyticsDateRange;
  const visible = tariffs.filter(tariff => {
    if (tariffStatus === "active" && !isTariffActive(tariff)) return false;
    if (tariffStatus === "inactive" && isTariffActive(tariff)) return false;
    if (tariffRegion !== "all" && tariff.regionId !== tariffRegion) return false;
    return true;
  });
  const analyticsRows = visible.map(tariff => analyticsByTariff.get(tariff.id) || {
    tariffId: tariff.id,
    tariffName: tariff.name,
    displayName: tariff.displayName || tariff.name,
    regionName: tariff.regionName,
    orderCount: 0,
    completedOrderCount: 0,
    cancelledOrderCount: 0,
    averageFinalPrice: null,
    averageDistanceKm: null,
    averageDurationMin: null,
    serviceCommissionTotal: 0,
    driverEarningTotal: 0
  });
  const hasAnalyticsOrders = analyticsRows.some(item => item.orderCount > 0);

  return (
    <div className="admin-page-stack">
      <PageHeader title="Тарифы" subtitle="Настройка цен, комиссии и условий поездок по регионам">
        <select className="admin-control-select" value={tariffRegion} onChange={event => setTariffRegion(event.target.value)}>
          <option value="all">Все регионы</option>
          {regions.map(region => (
            <option value={region.id} key={region.id}>{region.name}</option>
          ))}
        </select>
        <SegmentedFilter
          value={tariffStatus}
          onChange={setTariffStatus}
          items={[
            ["all", "Все"],
            ["active", "Активные"],
            ["inactive", "Отключённые"]
          ]}
        />
        <button type="button" className="admin-primary-button" onClick={onAddTariff}>Добавить тариф</button>
      </PageHeader>

      <DataCard title="Аналитика тарифов" text="Расчёт по реальным заказам и сохранённой цене поездки.">
        <div className="admin-date-filter-row">
          <SegmentedFilter
            value={tariffDatePreset}
            onChange={setTariffDatePreset}
            items={[
              ["today", "Сегодня"],
              ["7d", "7 дней"],
              ["30d", "30 дней"],
              ["custom", "Период"]
            ]}
          />
          {tariffDatePreset === "custom" && (
            <div className="admin-date-inputs">
              <input type="date" value={tariffDateFrom} onChange={event => setTariffDateFrom(event.target.value)} aria-label="Дата начала" />
              <input type="date" value={tariffDateTo} onChange={event => setTariffDateTo(event.target.value)} aria-label="Дата окончания" />
            </div>
          )}
          {dateRange && <small>Период: {dateRange.dateFrom} — {dateRange.dateTo}</small>}
        </div>
        {payload?.analyticsError && <InlineMessage danger text={payload.analyticsError} />}
        <section className="admin-analytics-grid">
          <article className="admin-analytics-card">
            <span>Заказы</span>
            <strong>{totals.orderCount}</strong>
            <small>Все статусы за период</small>
          </article>
          <article className="admin-analytics-card">
            <span>Завершено</span>
            <strong>{totals.completedOrderCount}</strong>
            <small>{totals.cancelledOrderCount} отменено</small>
          </article>
          <article className="admin-analytics-card">
            <span>Средняя цена</span>
            <strong>{formatOptionalMoney(totals.averageFinalPrice)}</strong>
            <small>Только завершённые поездки</small>
          </article>
          <article className="admin-analytics-card">
            <span>Комиссия сервиса</span>
            <strong>{formatMoney(totals.serviceCommissionTotal)}</strong>
            <small>Доход водителей: {formatMoney(totals.driverEarningTotal)}</small>
          </article>
        </section>
        {!hasAnalyticsOrders ? (
          <div className="admin-empty-note">
            <strong>По этому тарифу пока нет завершённых заказов</strong>
            <span>Аналитика появится после первых поездок.</span>
          </div>
        ) : (
          <div className="admin-table premium tariff-analytics">
            {analyticsRows.map(item => (
              <div className="admin-table-row tariff-analytics" key={item.tariffId}>
                <strong>{item.displayName || item.tariffName}</strong>
                <span>{item.regionName || "Регион не выбран"}</span>
                <span>{item.completedOrderCount} завершено · {item.cancelledOrderCount} отменено</span>
                <span>{formatOptionalMoney(item.averageFinalPrice)}</span>
                <span>{formatMetric(item.averageDistanceKm, "км")} · {formatMetric(item.averageDurationMin, "мин")}</span>
                <span>{formatMoney(item.serviceCommissionTotal)} комиссия</span>
                <span>{formatMoney(item.driverEarningTotal)} водителю</span>
              </div>
            ))}
          </div>
        )}
      </DataCard>

      {!regions.length ? (
        <StatePanel title="Сначала настройте регионы" text="Тарифы привязываются к активным рабочим регионам SmartTaxi." />
      ) : !visible.length ? (
        <StatePanel
          title="Тарифы пока не настроены"
          text="Добавьте тариф для выбранного региона, чтобы клиенты могли создавать заказы."
          action="Добавить тариф"
          onAction={onAddTariff}
        />
      ) : (
        <section className="admin-card-grid tariffs">
          {visible.map(tariff => {
            const metric = analyticsByTariff.get(tariff.id) || {};
            return (
            <article className="admin-tariff-card" key={tariff.id}>
              <header>
                <div>
                  <strong>{tariff.displayName || tariff.name}</strong>
                  <span>{tariff.regionName || "Регион не выбран"} · {tariff.name}</span>
                </div>
                <Badge tone={isTariffActive(tariff) ? "success" : "muted"}>
                  {isTariffActive(tariff) ? "Активен" : "Отключён"}
                </Badge>
              </header>
              {tariff.description && <p>{tariff.description}</p>}
              <div className="admin-card-facts tariff">
                <InfoLine label="База" value={formatMoney(tariff.basePrice)} />
                <InfoLine label="За км" value={formatMoney(tariff.pricePerKm)} />
                <InfoLine label="За минуту" value={formatMoney(tariff.pricePerMinute)} />
                <InfoLine label="Минимум" value={formatMoney(tariff.minimumPrice)} />
                <InfoLine label="Комиссия" value={formatPercent(tariff.serviceCommissionPercent)} />
                <InfoLine label="Спрос" value={formatMultiplier(tariff.surgeMultiplier)} />
                <InfoLine label="Ожидание" value={`${tariff.freeWaitingMinutes || 0} мин бесплатно · ${formatMoney(tariff.waitingPricePerMinute)}/мин`} />
                <InfoLine label="Сортировка" value={tariff.sortOrder || 0} />
                <InfoLine label="Заказы" value={metric.orderCount ?? 0} />
                <InfoLine label="Средняя цена" value={formatOptionalMoney(metric.averageFinalPrice)} />
                <InfoLine label="Комиссия" value={formatMoney(metric.serviceCommissionTotal || 0)} />
                <InfoLine label="Доход водителя" value={formatMoney(metric.driverEarningTotal || 0)} />
              </div>
              {!metric.completedOrderCount && <small className="admin-honest-note">По этому тарифу пока нет завершённых заказов. Аналитика появится после первых поездок.</small>}
              <footer>
                <button type="button" className="admin-secondary-button compact" onClick={() => onPreviewTariff({ ...tariff, analytics: metric })}>Предпросмотр</button>
                <button type="button" className="admin-secondary-button compact" onClick={() => onEditTariff(tariff)}>Редактировать</button>
                <button type="button" className={isTariffActive(tariff) ? "admin-danger-button compact" : "admin-secondary-button compact"} onClick={() => onToggleTariff(tariff)}>
                  {isTariffActive(tariff) ? "Отключить" : "Активировать"}
                </button>
              </footer>
            </article>
          );})}
        </section>
      )}
    </div>
  );
}

function FinancePage({
  payload,
  regions,
  financeRegion,
  setFinanceRegion,
  financeDriver,
  setFinanceDriver,
  financeTariff,
  setFinanceTariff,
  financeGroupBy,
  setFinanceGroupBy,
  financeSection,
  setFinanceSection,
  financeDatePreset,
  setFinanceDatePreset,
  financeDateFrom,
  setFinanceDateFrom,
  financeDateTo,
  setFinanceDateTo,
  canAdjustFinance,
  onAdjustDebt,
  onExportFinanceCsv
}) {
  const summary = payload?.summary || {};
  const driverDebts = asArray(payload, "driverDebts");
  const transactions = asArray(payload, "transactions");
  const reports = asArray(payload, "reports");
  const drivers = asArray(payload, "drivers");
  const tariffs = asArray(payload, "tariffs");
  const totals = payload?.reportTotals || {};
  const dateRange = payload?.dateRange;
  const cards = [
    ["Общая выручка", formatMoney(summary.grossTotal), `${summary.completedOrderCount || 0} завершённых заказов`],
    ["Комиссия сервиса", formatMoney(summary.serviceCommissionTotal), "Сумма по завершённым поездкам"],
    ["Доход водителей", formatMoney(summary.driverEarningTotal), "После комиссии сервиса"],
    ["Долг водителей", formatMoney(summary.driverDebtTotal), "Наличные и Kaspi переводы"],
    ["Завершённые заказы", summary.completedOrderCount || 0, "Финансовые операции поездок"],
    ["Отменённые заказы", summary.cancelledOrderCount || 0, "Без дохода, если нет штрафа"]
  ];

  return (
    <div className="admin-page-stack">
      <PageHeader title="Финансы" subtitle="Выручка, комиссия сервиса и задолженность водителей">
        <SegmentedFilter
          value={financeSection}
          onChange={setFinanceSection}
          items={[
            ["overview", "Обзор"],
            ["reports", "Отчёты"],
            ["debts", "Долги"],
            ["transactions", "Операции"]
          ]}
        />
      </PageHeader>

      <DataCard title="Фильтры" text="Финансовые данные строятся только из реального журнала операций.">
        <div className="admin-finance-filter-grid">
          <label className="admin-field compact">
            <span>Регион</span>
            <select className="admin-control-select" value={financeRegion} onChange={event => setFinanceRegion(event.target.value)}>
              <option value="all">Все регионы</option>
              {regions.map(region => (
                <option value={region.id} key={region.id}>{region.name}</option>
              ))}
            </select>
          </label>
          <label className="admin-field compact">
            <span>Водитель</span>
            <select className="admin-control-select" value={financeDriver} onChange={event => setFinanceDriver(event.target.value)}>
              <option value="all">Все водители</option>
              {drivers.map(driver => (
                <option value={driver.id} key={driver.id}>{driver.name} · {driver.phone}</option>
              ))}
            </select>
          </label>
          <label className="admin-field compact">
            <span>Тариф</span>
            <select className="admin-control-select" value={financeTariff} onChange={event => setFinanceTariff(event.target.value)}>
              <option value="all">Все тарифы</option>
              {tariffs.map(tariff => (
                <option value={tariff.id} key={tariff.id}>{tariff.displayName || tariff.name}</option>
              ))}
            </select>
          </label>
          <label className="admin-field compact">
            <span>Группировка отчёта</span>
            <select className="admin-control-select" value={financeGroupBy} onChange={event => setFinanceGroupBy(event.target.value)}>
              {["day", "region", "driver", "tariff", "paymentMethod"].map(group => (
                <option value={group} key={group}>{financeGroupLabel(group)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-date-filter-row">
          <SegmentedFilter
            value={financeDatePreset}
            onChange={setFinanceDatePreset}
            items={[
              ["today", "Сегодня"],
              ["7d", "7 дней"],
              ["30d", "30 дней"],
              ["custom", "Период"]
            ]}
          />
          {financeDatePreset === "custom" && (
            <div className="admin-date-inputs">
              <input type="date" value={financeDateFrom} onChange={event => setFinanceDateFrom(event.target.value)} aria-label="Дата начала" />
              <input type="date" value={financeDateTo} onChange={event => setFinanceDateTo(event.target.value)} aria-label="Дата окончания" />
            </div>
          )}
          {dateRange && <small>Период: {dateRange.dateFrom} — {dateRange.dateTo}</small>}
        </div>
      </DataCard>

      {financeSection === "overview" && (
        <DataCard title="Обзор" text="Ключевые показатели за выбранный период.">
          <section className="admin-analytics-grid finance">
            {cards.map(card => (
              <article className="admin-analytics-card finance" key={card[0]}>
                <span>{card[0]}</span>
                <strong>{card[1]}</strong>
                <small>{card[2]}</small>
              </article>
            ))}
          </section>
        </DataCard>
      )}

      {financeSection === "reports" && (
        <DataCard title="Финансовый отчёт" text={`Группировка: ${financeGroupLabel(payload?.reportGroupBy || financeGroupBy)}.`}>
          {!reports.length ? (
            <div className="admin-empty-note">
              <strong>За выбранный период финансовых данных нет</strong>
              <span>Отчёт появится после первых операций в финансовом журнале.</span>
            </div>
          ) : (
            <div className="admin-table premium">
              {reports.map(row => (
                <div className="admin-table-row finance-report" key={row.key}>
                  <strong>{row.label}</strong>
                  <span>{formatMoney(row.grossTotal)}</span>
                  <span>{formatMoney(row.serviceCommissionTotal)} комиссия</span>
                  <span>{formatMoney(row.driverEarningTotal)} водителям</span>
                  <span>{formatMoney(row.driverDebtDeltaTotal)} долг</span>
                  <span>{row.completedOrderCount} завершено · {row.cancelledOrderCount} отменено</span>
                  <span>{row.transactionCount} операций</span>
                </div>
              ))}
              <div className="admin-table-row finance-report total">
                <strong>Итого</strong>
                <span>{formatMoney(totals.grossTotal)}</span>
                <span>{formatMoney(totals.serviceCommissionTotal)} комиссия</span>
                <span>{formatMoney(totals.driverEarningTotal)} водителям</span>
                <span>{formatMoney(totals.driverDebtDeltaTotal)} долг</span>
                <span>{totals.completedOrderCount || 0} завершено · {totals.cancelledOrderCount || 0} отменено</span>
                <span>{totals.transactionCount || 0} операций</span>
              </div>
            </div>
          )}
        </DataCard>
      )}

      {financeSection === "debts" && (
        <DataCard title="Долги водителей" text="Корректировки сохраняются отдельными строками финансового журнала.">
          {!canAdjustFinance && <InlineMessage text="Недостаточно прав для корректировки" />}
          {!driverDebts.length ? (
            <div className="admin-empty-note">
              <strong>Долгов водителей пока нет</strong>
              <span>Данные появятся после завершённых поездок с оплатой наличными или Kaspi переводом.</span>
            </div>
          ) : (
            <div className="admin-table premium">
              {driverDebts.map(driver => (
                <div className="admin-table-row finance-debt" key={driver.driverId}>
                  <strong>{driver.driverName || "Водитель"}</strong>
                  <span>{driver.phone || "Телефон не указан"}</span>
                  <span>{driver.car || "Авто не указано"}</span>
                  <span>{driver.completedOrders || 0} поездок</span>
                  <strong>{formatMoney(driver.debtTotal)}</strong>
                  <span>{formatDate(driver.lastTransactionAt)}</span>
                  <button
                    type="button"
                    className="admin-secondary-button compact"
                    disabled={!canAdjustFinance}
                    onClick={() => onAdjustDebt(driver)}
                  >
                    Корректировать долг
                  </button>
                </div>
              ))}
            </div>
          )}
        </DataCard>
      )}

      {financeSection === "transactions" && (
        <DataCard
          title="История операций"
          text={`${payload?.transactionTotal || 0} операций по текущим фильтрам.`}
          action={<button type="button" className="admin-secondary-button compact" onClick={onExportFinanceCsv}>Экспорт CSV</button>}
        >
          {!transactions.length ? (
            <div className="admin-empty-note">
              <strong>Нет финансовых операций</strong>
              <span>Данные появятся после завершённых поездок или ручных корректировок.</span>
            </div>
          ) : (
            <div className="admin-table premium">
              {transactions.map(transaction => (
                <div className="admin-table-row finance-transaction" key={transaction.id}>
                  <strong>{financeTypeLabel(transaction.type)}</strong>
                  <span>{transaction.orderShortId || "Заказ не указан"}</span>
                  <span>{transaction.driverName || "Водитель не назначен"}</span>
                  <span>{transaction.regionName || "Регион не указан"}</span>
                  <span>{transaction.tariffName || "Тариф не указан"}</span>
                  <span>{formatMoney(transaction.grossAmount)}</span>
                  <span>{formatMoney(transaction.serviceCommission)} комиссия</span>
                  <span>{formatMoney(transaction.driverEarning)} водителю</span>
                  <span>{formatMoney(transaction.driverDebtDelta)} долг</span>
                  <Badge tone={transaction.paymentMethod === "UNKNOWN" ? "warning" : "success"}>{paymentMethodLabel(transaction.paymentMethod)}</Badge>
                  <Badge tone={transaction.status === "POSTED" ? "success" : "muted"}>{transaction.status}</Badge>
                  <span>{transaction.metadata?.reason || "—"}</span>
                  <span>{formatDate(transaction.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </DataCard>
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

function TariffEditor({ tariff, regions, onClose, onSave, busy }) {
  const [form, setForm] = useState(() => normalizeTariffForm(tariff, regions[0]?.id || ""));
  const [error, setError] = useState("");

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      if (!form.regionId) throw new Error("Выберите регион");
      if (!form.name.trim()) throw new Error("Введите название тарифа");
      const numericFields = [
        "basePrice",
        "pricePerKm",
        "pricePerMinute",
        "minimumPrice",
        "serviceCommissionPercent",
        "surgeMultiplier",
        "freeWaitingMinutes",
        "waitingPricePerMinute",
        "cancellationFee",
        "sortOrder"
      ];
      numericFields.forEach(field => {
        const value = Number(form[field]);
        if (!Number.isFinite(value) || value < 0) throw new Error("Проверьте числовые поля");
      });
      if (Number(form.serviceCommissionPercent) > 100) throw new Error("Комиссия должна быть от 0 до 100%");
      if (Number(form.surgeMultiplier) < 1) throw new Error("Коэффициент спроса должен быть не меньше 1");
      await onSave(form, tariff);
    } catch (submitError) {
      setError(submitError.message || "Проверьте данные тарифа");
    }
  }

  return (
    <ModalFrame title={tariff ? "Редактировать тариф" : "Добавить тариф"} onClose={onClose} wide>
      <form className="admin-form-grid" onSubmit={submit}>
        <label className="admin-field">
          <span>Регион</span>
          <select className="admin-control-select" value={form.regionId} onChange={event => setField("regionId", event.target.value)}>
            <option value="">Выберите регион</option>
            {regions.map(region => (
              <option value={region.id} key={region.id}>{region.name}</option>
            ))}
          </select>
        </label>
        <div className="admin-form-row">
          <Field label="Системное имя" value={form.name} onChange={value => setField("name", value)} />
          <Field label="Название для клиента" value={form.displayName} onChange={value => setField("displayName", value)} />
        </div>
        <label className="admin-textarea-field">
          <span>Описание</span>
          <textarea value={form.description} onChange={event => setField("description", event.target.value)} rows={3} />
        </label>
        <div className="admin-form-row">
          <Field label="Базовая цена" type="number" value={form.basePrice} onChange={value => setField("basePrice", value)} />
          <Field label="Цена за км" type="number" value={form.pricePerKm} onChange={value => setField("pricePerKm", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Цена за минуту" type="number" value={form.pricePerMinute} onChange={value => setField("pricePerMinute", value)} />
          <Field label="Минимальная цена" type="number" value={form.minimumPrice} onChange={value => setField("minimumPrice", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Комиссия сервиса %" type="number" value={form.serviceCommissionPercent} onChange={value => setField("serviceCommissionPercent", value)} />
          <Field label="Коэффициент спроса" type="number" value={form.surgeMultiplier} onChange={value => setField("surgeMultiplier", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Бесплатное ожидание, мин" type="number" value={form.freeWaitingMinutes} onChange={value => setField("freeWaitingMinutes", value)} />
          <Field label="Ожидание за минуту" type="number" value={form.waitingPricePerMinute} onChange={value => setField("waitingPricePerMinute", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Штраф отмены" type="number" value={form.cancellationFee} onChange={value => setField("cancellationFee", value)} />
          <Field label="Порядок" type="number" value={form.sortOrder} onChange={value => setField("sortOrder", value)} />
        </div>
        <label className="admin-toggle-line">
          <input type="checkbox" checked={form.isActive} onChange={event => setField("isActive", event.target.checked)} />
          <span>Тариф активен</span>
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

function TariffPreviewPanel({ tariff, onClose, onPreview }) {
  const [form, setForm] = useState({ distanceKm: "5", durationMin: "14", waitingMinutes: "0" });
  const [state, setState] = useState({ loading: false, error: "", result: null });

  async function calculate(event) {
    event.preventDefault();
    setState({ loading: true, error: "", result: null });
    try {
      const result = await onPreview(tariff, form);
      setState({ loading: false, error: "", result: result.preview });
    } catch (error) {
      setState({ loading: false, error: readError(error), result: null });
    }
  }

  const preview = state.result;
  const analytics = tariff.analytics || {};
  return (
    <ModalFrame title="Предпросмотр цены" onClose={onClose}>
      <form className="admin-form-grid" onSubmit={calculate}>
        <div className="admin-detail-hero">
          <div>
            <h2>{tariff.displayName || tariff.name}</h2>
            <p>{tariff.regionName || "Регион не выбран"}</p>
          </div>
          <Badge tone={isTariffActive(tariff) ? "success" : "muted"}>{isTariffActive(tariff) ? "Активен" : "Отключён"}</Badge>
        </div>
        <div className="admin-preview-grid compact">
          <InfoLine label="Завершённых заказов" value={analytics.completedOrderCount ?? 0} />
          <InfoLine label="Средняя цена" value={formatOptionalMoney(analytics.averageFinalPrice)} />
          <InfoLine label="Средний маршрут" value={`${formatMetric(analytics.averageDistanceKm, "км")} · ${formatMetric(analytics.averageDurationMin, "мин")}`} />
          <InfoLine label="Комиссия за период" value={formatMoney(analytics.serviceCommissionTotal || 0)} />
        </div>
        {!analytics.completedOrderCount && (
          <div className="admin-empty-note">
            <strong>По этому тарифу пока нет завершённых заказов</strong>
            <span>Предпросмотр цены работает отдельно от аналитики и использует текущие правила тарифа.</span>
          </div>
        )}
        <div className="admin-form-row">
          <Field label="Расстояние, км" type="number" value={form.distanceKm} onChange={value => setForm(current => ({ ...current, distanceKm: value }))} />
          <Field label="Время, мин" type="number" value={form.durationMin} onChange={value => setForm(current => ({ ...current, durationMin: value }))} />
        </div>
        <Field label="Ожидание, мин" type="number" value={form.waitingMinutes} onChange={value => setForm(current => ({ ...current, waitingMinutes: value }))} />
        {state.error && <InlineMessage danger text={state.error} />}
        {preview && (
          <div className="admin-preview-grid">
            <InfoLine label="Базовый расчёт" value={formatMoney(preview.rawPrice)} />
            <InfoLine label="После спроса" value={formatMoney(preview.surgePrice)} />
            <InfoLine label="Ожидание" value={formatMoney(preview.waitingPrice)} />
            <InfoLine label="Итоговая стоимость" value={formatMoney(preview.finalPrice)} />
            <InfoLine label="Комиссия сервиса" value={formatMoney(preview.serviceCommission)} />
            <InfoLine label="Доход водителя" value={formatMoney(preview.driverEarning)} />
          </div>
        )}
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="submit" className="admin-primary-button" disabled={state.loading}>{state.loading ? "Считаем..." : "Рассчитать"}</button>
        </div>
      </form>
    </ModalFrame>
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

function DebtAdjustmentPanel({ driver, regions, onClose, onSave, busy }) {
  const [form, setForm] = useState({ amount: "", reason: "", regionId: "" });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      setError("Введите сумму корректировки");
      return;
    }
    if (form.reason.trim().length < 3) {
      setError("Укажите причину корректировки");
      return;
    }
    await onSave(driver, form);
  }

  return (
    <ModalFrame title="Корректировка долга" onClose={onClose}>
      <form className="admin-form-grid" onSubmit={submit}>
        <section className="admin-detail-hero">
          <div>
            <h2>{driver.driverName || driver.name || "Водитель"}</h2>
            <p>{[driver.phone, driver.car].filter(Boolean).join(" · ") || "Данные водителя"}</p>
          </div>
          <Badge tone={Number(driver.debtTotal || 0) > 0 ? "warning" : "success"}>
            {formatMoney(driver.debtTotal)}
          </Badge>
        </section>
        <InlineMessage text="Положительная сумма увеличивает долг, отрицательная уменьшает." />
        <div className="admin-form-row">
          <Field
            label="Сумма корректировки"
            type="number"
            value={form.amount}
            onChange={value => setForm(current => ({ ...current, amount: value }))}
          />
          <label className="admin-field">
            <span>Регион</span>
            <select
              className="admin-control-select"
              value={form.regionId}
              onChange={event => setForm(current => ({ ...current, regionId: event.target.value }))}
            >
              <option value="">Без привязки к региону</option>
              {regions.map(region => (
                <option value={region.id} key={region.id}>{region.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="admin-textarea-field">
          <span>Причина корректировки</span>
          <textarea
            value={form.reason}
            onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}
            rows={4}
            placeholder="Например: сверка наличных за смену"
          />
        </label>
        {error && <InlineMessage danger text={error} />}
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="submit" className="admin-primary-button" disabled={busy}>
            {busy ? "Сохраняем..." : "Сохранить корректировку"}
          </button>
        </div>
      </form>
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

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function DataCard({ title, text, action, children }) {
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
      <strong>{value === 0 || value ? value : "—"}</strong>
    </div>
  );
}

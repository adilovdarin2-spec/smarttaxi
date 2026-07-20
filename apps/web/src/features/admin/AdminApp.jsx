import React, { useCallback, useEffect, useMemo, useState } from "react";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import DriversLiveMap from "./DriversLiveMap.jsx";
import {
  adjustAdminDriverDebt,
  assignAdminOrderDriver,
  blockAdminDriver,
  broadcastAdminNotification,
  clearAdminDriverCommissionOverride,
  clearToken,
  createAdminPromoCode,
  createAdminRaffle,
  createAdminRegion,
  createAdminTariff,
  deleteAdminPromoCode,
  deleteAdminRaffle,
  deleteAdminReview,
  exportAdminFinanceTransactionsCsv,
  fetchAdminDriverDocumentFile,
  getAdminApplicationDocuments,
  getAdminAudit,
  getAdminDashboard,
  getAdminDriverApplications,
  getAdminDriverDetail,
  getAdminDriverDocuments,
  getAdminDriverLiveLocations,
  getAdminDrivers,
  getAdminFinanceDriverDebts,
  getAdminFinanceReports,
  getAdminFinanceSummary,
  getAdminFinanceTransactions,
  getAdminLeaderboard,
  getAdminOrders,
  getAdminPayoutRequests,
  getAdminPromoCodes,
  getAdminRaffles,
  getAdminRecurringBookings,
  getAdminReferrals,
  getAdminRegions,
  getAdminReviews,
  getAdminRoadAlerts,
  getAdminSettings,
  getAdminSupport,
  getAdminTariffAnalytics,
  getAdminTariffs,
  loginUser,
  markOperatorOrderStatus,
  previewAdminTariffPrice,
  reopenAdminSupport,
  respondAdminSupport,
  reviewAdminDriverDocument,
  reviewAdminPayoutRequest,
  setAdminDriverCommissionOverride,
  setAdminPromoCodeStatus,
  setAdminTariffStatus,
  toggleAdminRegion,
  unblockAdminDriver,
  expireAdminRoadAlert,
  updateAdminDriverApplication,
  updateAdminDriverRegion,
  updateAdminRegion,
  updateAdminSettings,
  updateAdminTariff
} from "../../lib/mvpApi.js";

const adminRoles = new Set(["OWNER", "FINANCE"]);

const navigation = [
  { key: "dashboard", label: "Главная", eyebrow: "Состояние системы" },
  { key: "regions", label: "Регионы", eyebrow: "Активные зоны" },
  { key: "drivers", label: "Водители", eyebrow: "Доступ и статусы" },
  // Both pages' underlying list endpoints are OWNER-only server-side (no
  // FINANCE-visible data to fall back to at all, unlike e.g. Quality's
  // leaderboard) — hidden from FINANCE's nav entirely rather than leading
  // to a dead-end "failed to load" page.
  { key: "applications", label: "Заявки", eyebrow: "Проверка водителей", ownerOnly: true },
  { key: "orders", label: "Заказы", eyebrow: "Поездки клиентов" },
  { key: "tariffs", label: "Тарифы", eyebrow: "Цены по регионам" },
  { key: "promoCodes", label: "Промокоды", eyebrow: "Скидки и акции" },
  { key: "recurringBookings", label: "Регулярные поездки", eyebrow: "Постоянные привязки" },
  { key: "finance", label: "Финансы", eyebrow: "Деньги и долги" },
  { key: "payouts", label: "Выплаты", eyebrow: "Заявки водителей на вывод" },
  { key: "roadAlerts", label: "Дорога", eyebrow: "События и безопасность", ownerOnly: true },
  { key: "quality", label: "Качество", eyebrow: "Отзывы и рейтинг" },
  { key: "raffles", label: "Розыгрыши", eyebrow: "Конкурсы водителей" },
  { key: "referrals", label: "Рефералы", eyebrow: "Приглашения клиентов" },
  { key: "settings", label: "Настройки", eyebrow: "Параметры сервиса" },
  { key: "audit", label: "Журнал", eyebrow: "Действия системы" },
  { key: "support", label: "Поддержка", eyebrow: "Обращения клиентов" }
];

const pageTitles = Object.fromEntries(navigation.map(item => [item.key, item]));

const regionPresets = [
  {
    code: "ATAKENT",
    name: "Атакент",
    centerLat: "40.844435",
    centerLng: "68.509021",
    boundary: [[68.43, 40.78], [68.57, 40.78], [68.57, 40.90], [68.43, 40.90], [68.43, 40.78]]
  },
  {
    code: "MYRZAKENT",
    name: "Мырзакент",
    centerLat: "40.666108",
    centerLng: "68.543090",
    boundary: [[68.47, 40.60], [68.60, 40.60], [68.60, 40.73], [68.47, 40.73], [68.47, 40.60]]
  },
  {
    code: "ZHETYSAY",
    name: "Жетысай",
    centerLat: "40.884303",
    centerLng: "68.212621",
    boundary: [[68.05, 40.80], [68.33, 40.80], [68.33, 41.00], [68.05, 41.00], [68.05, 40.80]]
  },
  {
    code: "SHYMKENT",
    name: "Шымкент",
    centerLat: "42.314696",
    centerLng: "69.588328",
    boundary: [[69.30, 42.10], [69.85, 42.10], [69.85, 42.48], [69.30, 42.48], [69.30, 42.10]]
  }
];

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
    SEARCHING_DRIVER: "Поиск водителя",
    DRIVER_FOUND: "Водитель найден",
    DRIVER_GOING_TO_CLIENT: "Едет к клиенту",
    DRIVER_ASSIGNED: "Принят",
    DRIVER_ARRIVED: "Прибыл",
    WAITING_CLIENT: "Ждёт клиента",
    TRIP_STARTED: "В пути",
    IN_PROGRESS: "В пути",
    TRIP_COMPLETED: "Поездка завершена",
    PAYMENT_PENDING: "Ждёт оплаты",
    PAID: "Оплачен",
    RATED: "Оценён",
    COMPLETED: "Завершён",
    CANCELLED: "Отменён",
    CANCELLED_BY_CLIENT: "Отменён клиентом",
    CANCELLED_BY_DRIVER: "Отменён водителем",
    CANCELLED_BY_OPERATOR: "Отменён администрацией",
    NO_SHOW: "Клиент не вышел",
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
  if (["APPROVED", "FREE", "COMPLETED", "PAID", "RATED", "TRIP_COMPLETED"].includes(status)) return "success";
  if (["BLOCKED", "REJECTED", "CANCELLED", "CANCELLED_BY_CLIENT", "CANCELLED_BY_DRIVER", "CANCELLED_BY_OPERATOR", "NO_SHOW"].includes(status)) return "danger";
  if (["BUSY", "PENDING", "SEARCHING_DRIVER", "DRIVER_FOUND", "DRIVER_GOING_TO_CLIENT", "DRIVER_ASSIGNED", "DRIVER_ARRIVED", "WAITING_CLIENT", "TRIP_STARTED", "IN_PROGRESS", "PAYMENT_PENDING"].includes(status)) return "warning";
  return "muted";
}

const orderStatusOptions = [
  ["all", "Все статусы"],
  ["SEARCHING_DRIVER", "Поиск водителя"],
  ["DRIVER_FOUND", "Водитель найден"],
  ["DRIVER_GOING_TO_CLIENT", "Едет к клиенту"],
  ["DRIVER_ARRIVED", "Прибыл"],
  ["WAITING_CLIENT", "Ждёт клиента"],
  ["TRIP_STARTED", "В пути"],
  ["TRIP_COMPLETED", "Поездка завершена"],
  ["PAYMENT_PENDING", "Ждёт оплаты"],
  ["PAID", "Оплачен"],
  ["RATED", "Оценён"],
  ["CANCELLED_BY_CLIENT", "Отменён клиентом"],
  ["CANCELLED_BY_DRIVER", "Отменён водителем"],
  ["CANCELLED_BY_OPERATOR", "Отменён администрацией"],
  ["NO_SHOW", "Клиент не вышел"]
];

function readError(error) {
  if (error?.code === "FORBIDDEN" || error?.message?.includes("Forbidden")) {
    return "Текущий аккаунт не имеет доступа к этой панели. Войдите под владельцем или финансовым пользователем.";
  }
  if (error?.code === "NOT_FOUND") return "Данные не найдены";
  if (error?.code === "PROMO_CODE_HAS_REDEMPTIONS") return "Промокод уже использовался в заказах — отключите его вместо удаления, чтобы сохранить историю цен.";
  if (error?.code === "PROMO_CODE_EXISTS") return "Промокод с таким кодом уже существует";
  if (error?.details?.length) return error.details.map(item => item.message).join("; ");
  return "Не удалось загрузить данные. Проверьте соединение и попробуйте снова.";
}

function normalizeRegionForm(region) {
  const preset = regionPresets[0];
  return {
    name: region?.name || preset.name,
    code: region?.code || preset.code,
    currency: region?.currency || "KZT",
    centerLat: String(region?.centerLat ?? region?.center_lat ?? preset.centerLat),
    centerLng: String(region?.centerLng ?? region?.center_lng ?? preset.centerLng),
    boundary: JSON.stringify(region?.boundary || preset.boundary, null, 2),
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
    KASPI: "Kaspi",
    KASPI_TRANSFER: "Kaspi перевод",
    CARD: "Картой",
    UNKNOWN: "Требует проверки"
  }[method] || method || "—";
}

function roadAlertLabel(type) {
  return {
    ROAD_HAZARD: "Дорожная опасность",
    ACCIDENT: "ДТП",
    ROADWORK: "Ремонт дороги",
    SPEED_CAMERA: "Камера скорости",
    TRAFFIC_JAM: "Пробка",
    ROAD_CLOSED: "Закрытая дорога",
    BAD_ROAD: "Плохая дорога",
    PIT: "Яма",
    SPEED_BUMP: "Лежачий полицейский",
    ICY_ROAD: "Скользкая дорога",
    SCHOOL_ZONE: "Школьная зона",
    SPEED_LIMIT: "Ограничение скорости",
    DANGEROUS_TURN: "Опасный поворот",
    RAILROAD_CROSSING: "Ж/д переезд",
    PEDESTRIAN_CROSSING: "Пешеходный переход",
    POLICE: "Пост контроля",
    OTHER: "Другое"
  }[type] || type || "Событие";
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
  const [loginAuth, setLoginAuth] = useState({ phone: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [pageState, setPageState] = useState({ loading: false, error: "", payload: null });
  const [modal, setModal] = useState(null);
  const [actionState, setActionState] = useState({ loading: false, error: "", message: "" });
  const [regionStatus, setRegionStatus] = useState("all");
  const [driverStatus, setDriverStatus] = useState("all");
  const [applicationStatus, setApplicationStatus] = useState("PENDING");
  const [orderStatus, setOrderStatus] = useState("all");
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
  const [roadAlertStatus, setRoadAlertStatus] = useState("ACTIVE");
  const [roadAlertRegion, setRoadAlertRegion] = useState("all");
  const [supportStatus, setSupportStatus] = useState("OPEN");
  const [promoCodeStatus, setPromoCodeStatus] = useState("all");
  const [recurringBookingStatus, setRecurringBookingStatus] = useState("all");
  const [payoutStatus, setPayoutStatus] = useState("PENDING");
  const [ratingScope, setRatingScope] = useState("all");
  const [ratingRaffleId, setRatingRaffleId] = useState("");
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
        setAccessError("Войдите под владельцем или финансовым пользователем.");
      } else if (!adminRoles.has(resolvedUser.role)) {
        setAccessError("Текущий аккаунт не имеет доступа к этой панели. Войдите под владельцем или финансовым пользователем.");
      }
    } catch (error) {
      setAccessError(readError(error));
    } finally {
      setBootLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (page) => {
    if (page === "dashboard") {
      setPageState({ loading: false, error: "", payload: null });
      return;
    }

    const loaders = {
      regions: getAdminRegions,
      drivers: getAdminDrivers,
      applications: getAdminDriverApplications,
      orders: async () => {
        const status = orderStatus !== "all" ? orderStatus : undefined;
        const [orders, drivers, regions] = await Promise.allSettled([
          getAdminOrders({ status }),
          getAdminDrivers(),
          getAdminRegions()
        ]);
        if (orders.status === "rejected") throw orders.reason;
        return {
          orders: orders.value.orders || [],
          drivers: drivers.status === "fulfilled" ? drivers.value.drivers || [] : [],
          regions: regions.status === "fulfilled" ? regions.value.regions || [] : []
        };
      },
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
      roadAlerts: async () => {
        const selectedRegionId = roadAlertRegion !== "all" ? roadAlertRegion : undefined;
        const [alerts, regions] = await Promise.all([
          getAdminRoadAlerts({ status: roadAlertStatus, regionId: selectedRegionId, limit: 120 }),
          getAdminRegions()
        ]);
        return {
          alerts: alerts.alerts || [],
          regions: regions.regions || []
        };
      },
      quality: async () => {
        // getAdminReviews is OWNER-only; getAdminLeaderboard (below) is open
        // to FINANCE too. Without this .catch, a FINANCE user's reviews-403
        // would reject the whole Promise.all and take the leaderboard down
        // with it, even though they're perfectly entitled to see that part.
        const [reviews, raffles] = await Promise.all([
          getAdminReviews().catch(() => ({ reviews: [] })),
          getAdminRaffles().catch(() => ({ raffles: [] }))
        ]);
        const raffleList = raffles.raffles || [];
        const selectedRaffle = ratingScope === "raffle" ? raffleList.find(item => item.id === ratingRaffleId) : null;
        const leaderboard = await getAdminLeaderboard(
          selectedRaffle ? { dateFrom: selectedRaffle.startsAt, dateTo: selectedRaffle.endsAt } : {}
        );
        return {
          reviews: reviews.reviews || [],
          leaderboard: leaderboard.leaderboard || [],
          raffles: raffleList
        };
      },
      support: async () => {
        const support = await getAdminSupport({ status: supportStatus });
        return { messages: support.messages || [] };
      },
      promoCodes: async () => {
        const [promoCodes, regions] = await Promise.all([
          getAdminPromoCodes(),
          getAdminRegions()
        ]);
        return { promoCodes: promoCodes.promoCodes || [], regions: regions.regions || [] };
      },
      recurringBookings: async () => {
        const status = recurringBookingStatus !== "all" ? recurringBookingStatus : undefined;
        const data = await getAdminRecurringBookings({ status });
        return { recurringBookings: data.recurringBookings || data.bookings || [] };
      },
      referrals: async () => {
        const data = await getAdminReferrals();
        return { referrals: data.referrals || [] };
      },
      raffles: async () => {
        const data = await getAdminRaffles();
        return { raffles: data.raffles || [] };
      },
      payouts: async () => {
        const status = payoutStatus !== "ALL" ? payoutStatus : undefined;
        const data = await getAdminPayoutRequests({ status });
        return { payoutRequests: data.payoutRequests || [] };
      },
      audit: getAdminAudit,
      settings: async () => {
        const [settings, regions] = await Promise.allSettled([getAdminSettings(), getAdminRegions()]);
        if (settings.status === "rejected") throw settings.reason;
        return {
          settings: settings.value.settings,
          regions: regions.status === "fulfilled" ? regions.value.regions || [] : []
        };
      }
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
  }, [financeDateFrom, financeDatePreset, financeDateTo, financeDriver, financeGroupBy, financeRegion, financeTariff, orderStatus, payoutStatus, ratingRaffleId, ratingScope, recurringBookingStatus, roadAlertRegion, roadAlertStatus, supportStatus, tariffDateFrom, tariffDatePreset, tariffDateTo, tariffRegion]);

  // Fetches the next page from the server and appends it to whatever's
  // already loaded under itemsKey (e.g. "orders"), rather than replacing
  // the whole payload — orders/drivers/audit all now return
  // {total,limit,offset} from the backend to make this possible. Other
  // keys already on the payload (e.g. orders' bundled drivers/regions for
  // the dispatch picker) are left untouched.
  const [loadingMore, setLoadingMore] = useState(false);
  async function loadMoreItems(itemsKey, fetchNextPage) {
    const payload = pageState.payload;
    if (!payload) return;
    const currentItems = payload[itemsKey] || [];
    if (typeof payload.total === "number" && currentItems.length >= payload.total) return;
    setLoadingMore(true);
    try {
      const data = await fetchNextPage(currentItems.length);
      setPageState(current => ({
        ...current,
        payload: {
          ...current.payload,
          [itemsKey]: [...(current.payload[itemsKey] || []), ...(data[itemsKey] || [])],
          total: data.total,
          limit: data.limit,
          offset: data.offset
        }
      }));
    } catch (error) {
      setActionState({ loading: false, error: readError(error), message: "" });
    } finally {
      setLoadingMore(false);
    }
  }

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

    // Checked before the generic `regions`/`drivers` branches below: the
    // orders page payload now also carries `drivers`/`regions` (for the
    // manual-dispatch driver picker), which would otherwise satisfy those
    // more generic checks first and skip filtering `orders` entirely.
    if (payload.orders) {
      return {
        ...payload,
        orders: filter(payload.orders),
        drivers: payload.drivers || [],
        regions: payload.regions || []
      };
    }
    if (payload.regions) return { ...payload, regions: filter(payload.regions) };
    if (payload.drivers) return { ...payload, drivers: filter(payload.drivers) };
    if (payload.applications) return { ...payload, applications: filter(payload.applications) };
    if (payload.tariffs) return { ...payload, tariffs: filter(payload.tariffs), regions: payload.regions || [] };
    if (payload.alerts) return { ...payload, alerts: filter(payload.alerts), regions: payload.regions || [] };
    if (payload.reviews || payload.leaderboard) {
      return {
        ...payload,
        reviews: filter(payload.reviews || []),
        leaderboard: filter(payload.leaderboard || [])
      };
    }
    if (payload.transactions || payload.driverDebts) {
      return {
        ...payload,
        transactions: filter(payload.transactions || []),
        driverDebts: filter(payload.driverDebts || []),
        regions: payload.regions || []
      };
    }
    if (payload.logs) return { ...payload, logs: filter(payload.logs) };
    if (payload.messages) return { ...payload, messages: filter(payload.messages) };
    if (payload.promoCodes) return { ...payload, promoCodes: filter(payload.promoCodes), regions: payload.regions || [] };
    if (payload.recurringBookings) return { ...payload, recurringBookings: filter(payload.recurringBookings) };
    if (payload.referrals) return { ...payload, referrals: filter(payload.referrals) };
    if (payload.payoutRequests) return { ...payload, payoutRequests: filter(payload.payoutRequests) };
    if (payload.raffles && !payload.reviews) return { ...payload, raffles: filter(payload.raffles) };
    return payload;
  }, [pageState.payload, query]);

  const regions = asArray(pageState.payload, "regions");

  function selectPage(key) {
    // Central gate against every entry point that can jump pages (nav,
    // dashboard tiles, problem-item "action" buttons) — the nav list
    // itself is already filtered, but tiles/buttons elsewhere call this
    // directly with a hardcoded key, which would otherwise bypass that.
    const target = pageTitles[key];
    if (target?.ownerOnly && user?.role !== "OWNER") return;
    setActive(key);
    setQuery("");
    setDrawerOpen(false);
    setActionState({ loading: false, error: "", message: "" });
  }

  function logout() {
    clearToken();
    window.location.href = "/";
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const data = await loginUser(loginAuth);
      if (!adminRoles.has(data.user?.role)) {
        clearToken();
        throw new Error("Этот аккаунт не имеет доступа к панели управления");
      }
      await loadDashboard();
    } catch (error) {
      setLoginError(error?.message || "Не удалось войти. Проверьте телефон и пароль.");
    } finally {
      setLoginLoading(false);
    }
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

  // Blocking (unlike unblocking, which is purely corrective) suspends a
  // driver from the whole service in one click with no undo — worth a
  // reason prompt + confirm step, matching the payout-reject precedent.
  // Returns to the driver-detail view afterward (cancel or confirm) rather
  // than closing everything, since that's where this was opened from.
  async function confirmBlockDriver(driver, reason) {
    await setDriverBlocked(driver, true, reason);
    setModal({ type: "driver", driver });
  }

  async function setDriverRegion(driverId, regionId, status, reason = "") {
    await runAction(async () => {
      await updateAdminDriverRegion(driverId, { regionId, status, reason });
      await refreshDriverDetail(driverId);
      await loadPage("drivers");
      await loadDashboard();
    }, status === "APPROVED" ? "Доступ к региону одобрен" : "Регион заблокирован");
  }

  async function setDriverCommission(driverId, percent, active) {
    await runAction(async () => {
      await setAdminDriverCommissionOverride(driverId, { percent, active });
      await refreshDriverDetail(driverId);
    }, "Индивидуальная комиссия сохранена");
  }

  async function clearDriverCommission(driverId) {
    await runAction(async () => {
      await clearAdminDriverCommissionOverride(driverId);
      await refreshDriverDetail(driverId);
    }, "Индивидуальная комиссия удалена");
  }

  async function assignOrderDriver(orderId, driverId) {
    await runAction(async () => {
      await assignAdminOrderDriver(orderId, driverId);
      await loadPage("orders");
      await loadDashboard();
    }, "Водитель назначен");
  }

  async function advanceOrderStatus(orderId, action, successMessage) {
    await runAction(async () => {
      await markOperatorOrderStatus(orderId, action);
      await loadPage("orders");
      await loadDashboard();
    }, successMessage);
  }

  async function cancelOrder(orderId) {
    await runAction(async () => {
      await markOperatorOrderStatus(orderId, "cancel");
      await loadPage("orders");
      await loadDashboard();
    }, "Заказ отменён");
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

  async function hideRoadAlert(alert) {
    await runAction(async () => {
      await expireAdminRoadAlert(alert.id);
      await loadPage("roadAlerts");
    }, "Дорожное событие скрыто");
  }

  async function savePromoCode(form) {
    await runAction(async () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        regionId: form.regionId || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscountKzt: form.maxDiscountKzt ? Number(form.maxDiscountKzt) : undefined,
        minOrderPriceKzt: Number(form.minOrderPriceKzt || 0),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        perClientLimit: Number(form.perClientLimit || 1),
        validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : undefined,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined
      };
      await createAdminPromoCode(payload);
      setModal(null);
      await loadPage("promoCodes");
    }, "Промокод создан");
  }

  async function togglePromoCode(promoCode) {
    await runAction(async () => {
      await setAdminPromoCodeStatus(promoCode.id, !promoCode.isActive);
      await loadPage("promoCodes");
    }, promoCode.isActive ? "Промокод отключён" : "Промокод активирован");
  }

  async function deletePromoCode(promoCode) {
    await runAction(async () => {
      await deleteAdminPromoCode(promoCode.id);
      setModal(null);
      await loadPage("promoCodes");
    }, "Промокод удалён");
  }

  async function saveRaffle(form) {
    await runAction(async () => {
      await createAdminRaffle({
        title: form.title.trim(),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString()
      });
      setModal(null);
      await loadPage("raffles");
    }, "Розыгрыш создан");
  }

  async function deleteRaffle(raffle) {
    await runAction(async () => {
      await deleteAdminRaffle(raffle.id);
      setModal(null);
      await loadPage("raffles");
    }, "Розыгрыш удалён");
  }

  async function deleteReview(review) {
    await runAction(async () => {
      await deleteAdminReview(review.id);
      setModal(null);
      await loadPage("quality");
    }, "Отзыв удалён");
  }

  async function reviewPayout(payoutRequest, status, reason = "") {
    await runAction(async () => {
      await reviewAdminPayoutRequest(payoutRequest.id, { status, reason });
      setModal(null);
      await loadPage("payouts");
    }, {
      APPROVED: "Заявка на выплату одобрена",
      PAID: "Выплата отмечена как отправленная",
      REJECTED: "Заявка на выплату отклонена"
    }[status]);
  }

  async function respondSupport(message, response, resolve) {
    await runAction(async () => {
      await respondAdminSupport(message.id, { response, resolve });
      await loadPage("support");
    }, resolve ? "Ответ отправлен, обращение закрыто" : "Ответ отправлен");
  }

  async function reopenSupport(message) {
    await runAction(async () => {
      await reopenAdminSupport(message.id);
      await loadPage("support");
    }, "Обращение возвращено в очередь");
  }

  async function saveSettings(payload) {
    await runAction(async () => {
      await updateAdminSettings(payload);
      await loadPage("settings");
    }, "Настройки сохранены");
  }

  // Plain passthrough (like runTariffPreview) rather than routed through
  // runAction: the composer wants to show its own inline "sent to N people"
  // result next to the form, not the generic top-of-page success banner.
  async function sendBroadcast(payload) {
    return broadcastAdminNotification(payload);
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
          <h1>Войдите в панель управления</h1>
          <p>{accessError || "Доступ есть у владельца, оператора и финансового пользователя."}</p>
          <form className="admin-login-form" onSubmit={handleLogin}>
            <label>
              Телефон
              <input
                value={loginAuth.phone}
                onChange={event => setLoginAuth(prev => ({ ...prev, phone: event.target.value }))}
                placeholder="+7 700 000 00 00"
                autoComplete="tel"
                inputMode="tel"
              />
            </label>
            <label>
              Пароль
              <input
                value={loginAuth.password}
                onChange={event => setLoginAuth(prev => ({ ...prev, password: event.target.value }))}
                placeholder="Пароль"
                autoComplete="current-password"
                type="password"
              />
            </label>
            {loginError && <div className="admin-login-error">{loginError}</div>}
            <button type="submit" className="admin-primary-button" disabled={loginLoading}>
              {loginLoading ? "Входим..." : "Войти"}
            </button>
          </form>
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
          {navigation.filter(item => !item.ownerOnly || user?.role === "OWNER").map(item => (
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
          <DashboardPage dashboard={dashboard} health={dashboard?.health} onSelectPage={selectPage} />
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
            orderStatus={orderStatus}
            setOrderStatus={setOrderStatus}
            onAssignOrderDriver={assignOrderDriver}
            onAdvanceOrderStatus={advanceOrderStatus}
            onRequestCancelOrder={order => setModal({ type: "orderCancel", order })}
            loadingMore={loadingMore}
            onLoadMoreOrders={() => loadMoreItems("orders", offset => getAdminOrders({ status: orderStatus !== "all" ? orderStatus : undefined, offset }))}
            onLoadMoreDrivers={() => loadMoreItems("drivers", offset => getAdminDrivers({ offset }))}
            onLoadMoreAudit={() => loadMoreItems("logs", offset => getAdminAudit({ offset }))}
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
            roadAlertStatus={roadAlertStatus}
            setRoadAlertStatus={setRoadAlertStatus}
            roadAlertRegion={roadAlertRegion}
            setRoadAlertRegion={setRoadAlertRegion}
            supportStatus={supportStatus}
            setSupportStatus={setSupportStatus}
            onRespondSupport={respondSupport}
            onReopenSupport={reopenSupport}
            promoCodeStatus={promoCodeStatus}
            setPromoCodeStatus={setPromoCodeStatus}
            onAddPromoCode={() => setModal({ type: "promoCode" })}
            onTogglePromoCode={togglePromoCode}
            onDeletePromoCode={promoCode => setModal({ type: "promoCodeDelete", promoCode })}
            recurringBookingStatus={recurringBookingStatus}
            setRecurringBookingStatus={setRecurringBookingStatus}
            onAddRaffle={() => setModal({ type: "raffle" })}
            onDeleteRaffle={raffle => setModal({ type: "raffleDelete", raffle })}
            ratingScope={ratingScope}
            setRatingScope={setRatingScope}
            ratingRaffleId={ratingRaffleId}
            setRatingRaffleId={setRatingRaffleId}
            onDeleteReview={review => setModal({ type: "reviewDelete", review })}
            payoutStatus={payoutStatus}
            setPayoutStatus={setPayoutStatus}
            onApprovePayout={payoutRequest => reviewPayout(payoutRequest, "APPROVED")}
            onMarkPaidPayout={payoutRequest => reviewPayout(payoutRequest, "PAID")}
            onRejectPayout={payoutRequest => setModal({ type: "payoutReject", payoutRequest })}
            onSaveSettings={saveSettings}
            canEditSettings={user?.role === "OWNER"}
            onSendBroadcast={sendBroadcast}
            canManageOwnerOnly={user?.role === "OWNER"}
            onAddRegion={() => setModal({ type: "region", region: null })}
            onEditRegion={region => setModal({ type: "region", region })}
            onToggleRegion={region => (isActiveRegion(region) ? setModal({ type: "regionDeactivate", region }) : switchRegion(region))}
            onOpenDriver={openDriver}
            onBlockDriver={setDriverBlocked}
            onOpenApplication={application => setModal({ type: "application", application })}
            onAddTariff={() => setModal({ type: "tariff", tariff: null })}
            onEditTariff={tariff => setModal({ type: "tariff", tariff })}
            onToggleTariff={tariff => (isTariffActive(tariff) ? setModal({ type: "tariffDeactivate", tariff }) : switchTariff(tariff))}
            onPreviewTariff={tariff => setModal({ type: "tariffPreview", tariff })}
            canAdjustFinance={user?.role === "OWNER" || user?.role === "FINANCE"}
            onAdjustDebt={driver => setModal({ type: "debtAdjustment", driver })}
            onExportFinanceCsv={exportFinanceCsv}
            onHideRoadAlert={hideRoadAlert}
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
          onRequestBlock={driver => setModal({ type: "driverBlock", driver })}
          onSetRegion={setDriverRegion}
          canManageOwnerOnly={user?.role === "OWNER"}
          onSetCommission={setDriverCommission}
          onClearCommission={clearDriverCommission}
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
      {modal?.type === "promoCode" && (
        <PromoCodeEditor
          regions={asArray(pageState.payload, "regions")}
          onClose={() => setModal(null)}
          onSave={savePromoCode}
          busy={actionState.loading}
        />
      )}
      {modal?.type === "promoCodeDelete" && (
        <ConfirmPanel
          title="Удалить промокод"
          text={`Промокод ${modal.promoCode.code} будет удалён без возможности восстановления.`}
          confirmLabel="Удалить"
          busy={actionState.loading}
          danger
          onClose={() => setModal(null)}
          onConfirm={() => deletePromoCode(modal.promoCode)}
        />
      )}
      {modal?.type === "raffle" && (
        <RaffleEditor
          onClose={() => setModal(null)}
          onSave={saveRaffle}
          busy={actionState.loading}
        />
      )}
      {modal?.type === "raffleDelete" && (
        <ConfirmPanel
          title="Удалить розыгрыш"
          text={`Розыгрыш «${modal.raffle.title}» будет удалён. Поездки водителей не пострадают, но период исчезнет из фильтра рейтинга.`}
          confirmLabel="Удалить"
          busy={actionState.loading}
          danger
          onClose={() => setModal(null)}
          onConfirm={() => deleteRaffle(modal.raffle)}
        />
      )}
      {modal?.type === "orderCancel" && (
        <ConfirmPanel
          title="Отменить заказ"
          text={`Заказ ${modal.order.short_id || modal.order.id} будет отменён от имени администрации. Клиент и назначенный водитель (если есть) получат уведомление. Это действие нельзя отменить.`}
          confirmLabel="Отменить заказ"
          busy={actionState.loading}
          danger
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await cancelOrder(modal.order.id);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "regionDeactivate" && (
        <ConfirmPanel
          title="Отключить регион"
          text={`Регион «${modal.region.name}» перестанет принимать новые заказы — все водители и клиенты в нём потеряют доступ к сервису сразу. Активные поездки не прерываются, но новые заказы оформить будет нельзя.`}
          confirmLabel="Отключить регион"
          busy={actionState.loading}
          danger
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await switchRegion(modal.region);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "tariffDeactivate" && (
        <ConfirmPanel
          title="Отключить тариф"
          text={`Тариф «${modal.tariff.displayName || modal.tariff.name}» перестанет предлагаться клиентам в своём регионе. Активные поездки на этом тарифе не прерываются.`}
          confirmLabel="Отключить тариф"
          busy={actionState.loading}
          danger
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await switchTariff(modal.tariff);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "reviewDelete" && (
        <ConfirmPanel
          title="Удалить отзыв"
          text="Отзыв будет удалён из истории рейтинга водителя без возможности восстановления. Используйте для явно накрученных или оскорбительных отзывов."
          confirmLabel="Удалить отзыв"
          busy={actionState.loading}
          danger
          onClose={() => setModal(null)}
          onConfirm={() => deleteReview(modal.review)}
        />
      )}
      {modal?.type === "payoutReject" && (
        <PayoutRejectPanel
          payoutRequest={modal.payoutRequest}
          busy={actionState.loading}
          onClose={() => setModal(null)}
          onConfirm={reason => reviewPayout(modal.payoutRequest, "REJECTED", reason)}
        />
      )}
      {modal?.type === "driverBlock" && (
        <DriverBlockPanel
          driver={modal.driver}
          busy={actionState.loading}
          onClose={() => setModal({ type: "driver", driver: modal.driver })}
          onConfirm={reason => confirmBlockDriver(modal.driver, reason)}
        />
      )}
    </main>
  );
}

function DashboardPage({ dashboard, health, onSelectPage }) {
  const cards = Array.isArray(dashboard?.cards) ? dashboard.cards : [];
  const summary = dashboard?.summary || {};
  const problems = buildAdminProblemItems(dashboard, health);
  const activeProblems = problems.filter(item => item.tone !== "success");

  return (
    <div className="admin-page-stack">
      <section className="admin-command-hero">
        <div>
          <span className="admin-command-kicker">SmartTaxi Control Center</span>
          <h2>Панель владельца, которая ведёт сервис по проблемам</h2>
          <p>
            Здесь собраны зоны, водители, заказы, тарифы, финансы, дорожные события, отзывы и аудит.
            Главная страница показывает, где нужен контроль прямо сейчас.
          </p>
        </div>
        <div className="admin-command-score">
          <span>{activeProblems.length ? "Требует внимания" : "Стабильно"}</span>
          <strong>{activeProblems.length}</strong>
          <small>{activeProblems.length ? "открытых операционных вопросов" : "критичных вопросов не найдено"}</small>
        </div>
      </section>

      <section className="admin-health-card">
        <div>
          <small>Состояние системы</small>
          <h2>{health?.status === "ok" ? "Система доступна" : "Статус уточняется"}</h2>
          <p>{health?.time ? `Последняя проверка: ${formatDate(health.time)}` : "Данные проверки появятся после обновления."}</p>
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
          text={dashboard?.setup?.text || "Показатели появятся после первых рабочих заказов."}
        />
      )}

      <section className="admin-command-grid">
        <DataCard title="Что требует внимания" text="Приоритетный список проблем, которые админ может закрыть из панели.">
          <div className="admin-problem-list">
            {problems.map(item => (
              <button type="button" key={item.key} className={`admin-problem-item ${item.tone}`} onClick={() => onSelectPage(item.page)}>
                <span className="admin-problem-icon">{item.index}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <b>{item.action}</b>
              </button>
            ))}
          </div>
        </DataCard>

        <DataCard title="Карта управления" text="Все ключевые рычаги бизнеса собраны по ролям: владелец, оператор, финансы.">
          <div className="admin-solution-grid">
            <button type="button" onClick={() => onSelectPage("orders")}>
              <strong>{Number(summary.orders?.stuck || 0)}</strong>
              <span>Заказы без водителя больше 3 мин</span>
              <small>Назначение и контроль статуса</small>
            </button>
            <button type="button" onClick={() => onSelectPage("drivers")}>
              <strong>{Number(summary.drivers?.online || 0)}</strong>
              <span>Водители на линии</span>
              <small>Блокировка, регионы, доступ</small>
            </button>
            <button type="button" onClick={() => onSelectPage("tariffs")}>
              <strong>{Number(summary.regions?.active || 0)}</strong>
              <span>Активные регионы</span>
              <small>Тарифы и зоны запуска</small>
            </button>
            <button type="button" onClick={() => onSelectPage("finance")}>
              <strong>{Number(summary.attention?.highDebtDrivers || 0)}</strong>
              <span>Водителей с высоким долгом</span>
              <small>Комиссия, касса, CSV</small>
            </button>
            <button type="button" onClick={() => onSelectPage("roadAlerts")}>
              <strong>{Number(summary.attention?.activeRoadAlerts || 0)}</strong>
              <span>Активных дорожных событий</span>
              <small>Модерация предупреждений</small>
            </button>
            <button type="button" onClick={() => onSelectPage("quality")}>
              <strong>{Number(summary.attention?.lowReviews || 0)}</strong>
              <span>Низких оценок за 30 дней</span>
              <small>Отзывы и рейтинг водителей</small>
            </button>
          </div>
        </DataCard>
      </section>
    </div>
  );
}

function buildAdminProblemItems(dashboard, health) {
  const summary = dashboard?.summary || {};
  const orders = summary.orders || {};
  const drivers = summary.drivers || {};
  const regions = summary.regions || {};
  const applications = summary.applications || {};
  const attention = summary.attention || {};
  const items = [
    {
      key: "health",
      index: "01",
      tone: health?.status === "ok" ? "success" : "danger",
      page: "settings",
      title: health?.status === "ok" ? "Backend отвечает" : "Проверить backend",
      text: health?.status === "ok" ? "API, база и сервисы отвечают на ready-check." : "Панель не получила подтверждение готовности API.",
      action: "Открыть"
    },
    {
      key: "searching-orders",
      index: "02",
      // A handful of orders in SEARCHING_DRIVER is completely normal at any
      // moment (a request takes a few seconds to match) — the real signal an
      // owner needs is orders stuck searching well past that, since nobody
      // else is watching this instead of them.
      tone: Number(orders.stuck || 0) > 0 ? "warning" : "success",
      page: "orders",
      title: Number(orders.stuck || 0) > 0 ? "Есть зависшие заказы" : "Заказы распределяются нормально",
      text: Number(orders.stuck || 0) > 0
        ? `${Number(orders.stuck)} заказов ищут водителя больше 3 минут (всего в поиске: ${Number(orders.searching || 0)}).`
        : `Сейчас в поиске: ${Number(orders.searching || 0)}, зависших нет.`,
      action: "К заказам"
    },
    {
      key: "drivers-online",
      index: "03",
      tone: Number(drivers.online || 0) > 0 ? "success" : "warning",
      page: "drivers",
      title: Number(drivers.online || 0) > 0 ? "Водители на линии есть" : "Нет свободных водителей",
      text: `${Number(drivers.online || 0)} свободных, ${Number(drivers.busy || 0)} заняты, ${Number(drivers.blocked || 0)} заблокированы.`,
      action: "Водители"
    },
    {
      key: "applications",
      index: "04",
      tone: Number(applications.pending || 0) > 0 ? "warning" : "success",
      page: "applications",
      title: Number(applications.pending || 0) > 0 ? "Новые заявки водителей" : "Заявок на проверке нет",
      text: `${Number(applications.pending || 0)} заявок ожидают решения.`,
      action: "Проверить"
    },
    {
      key: "regions",
      index: "05",
      tone: Number(regions.active || 0) > 0 ? "success" : "danger",
      page: "regions",
      title: Number(regions.active || 0) > 0 ? "Регионы включены" : "Нет активных регионов",
      text: `${Number(regions.active || 0)} из ${Number(regions.total || 0)} регионов принимают заказы.`,
      action: "Регионы"
    },
    {
      key: "high-debt-drivers",
      index: "06",
      // 15000₸ debt blocks a driver from accepting new orders outright —
      // this flags them well before that point, while there's still time
      // to reach out instead of a driver silently discovering the block
      // mid-shift.
      tone: Number(attention.highDebtDrivers || 0) > 0 ? "warning" : "success",
      page: "finance",
      title: Number(attention.highDebtDrivers || 0) > 0 ? "Есть водители с высоким долгом" : "Долги водителей в норме",
      text: Number(attention.highDebtDrivers || 0) > 0
        ? `${Number(attention.highDebtDrivers)} водителей с долгом больше 10 000 ₸ (лимит для блокировки — 15 000 ₸).`
        : "Ни у одного водителя долг не превышает 10 000 ₸.",
      action: "Финансы"
    },
    {
      key: "frequent-cancel-clients",
      index: "07",
      tone: Number(attention.frequentCancelClients || 0) > 0 ? "warning" : "success",
      page: "orders",
      title: Number(attention.frequentCancelClients || 0) > 0 ? "Клиенты часто отменяют заказы" : "Отмены клиентов в норме",
      text: Number(attention.frequentCancelClients || 0) > 0
        ? `${Number(attention.frequentCancelClients)} клиентов отменили 3+ заказа за последние 7 дней — возможно, стоит разобраться.`
        : "Никто не отменял 3 и более заказов за последнюю неделю.",
      action: "Заказы"
    }
  ];
  return items;
}

function AdminPage(props) {
  const { active, payload } = props;
  if (active === "regions") return <RegionsPage regions={asArray(payload, "regions")} {...props} />;
  if (active === "drivers") return <DriversPage drivers={asArray(payload, "drivers")} {...props} />;
  if (active === "applications") return <ApplicationsPage applications={asArray(payload, "applications")} {...props} />;
  if (active === "orders") {
    return (
      <OrdersPage
        orders={asArray(payload, "orders")}
        drivers={asArray(payload, "drivers")}
        regions={asArray(payload, "regions")}
        {...props}
      />
    );
  }
  if (active === "tariffs") return <TariffsPage tariffs={asArray(payload, "tariffs")} regions={asArray(payload, "regions")} {...props} />;
  if (active === "finance") return <FinancePage payload={payload} regions={asArray(payload, "regions")} {...props} />;
  if (active === "roadAlerts") return <RoadAlertsPage alerts={asArray(payload, "alerts")} regions={asArray(payload, "regions")} {...props} />;
  if (active === "quality") {
    return (
      <QualityPage
        reviews={asArray(payload, "reviews")}
        leaderboard={asArray(payload, "leaderboard")}
        raffles={asArray(payload, "raffles")}
        ratingScope={props.ratingScope}
        setRatingScope={props.setRatingScope}
        ratingRaffleId={props.ratingRaffleId}
        setRatingRaffleId={props.setRatingRaffleId}
        onDeleteReview={props.onDeleteReview}
      />
    );
  }
  if (active === "audit") {
    return (
      <AuditPage
        logs={asArray(payload, "logs")}
        total={payload?.total}
        loadingMore={props.loadingMore}
        onLoadMore={props.onLoadMoreAudit}
      />
    );
  }
  if (active === "settings") {
    return (
      <SettingsPage
        settings={payload?.settings}
        regions={asArray(payload, "regions")}
        onSave={props.onSaveSettings}
        canEdit={props.canEditSettings}
        onSendBroadcast={props.onSendBroadcast}
      />
    );
  }
  if (active === "support") return <SupportPage messages={asArray(payload, "messages")} {...props} />;
  if (active === "promoCodes") return <PromoCodesPage promoCodes={asArray(payload, "promoCodes")} {...props} />;
  if (active === "recurringBookings") return <RecurringBookingsPage bookings={asArray(payload, "recurringBookings")} {...props} />;
  if (active === "referrals") return <ReferralsPage referrals={asArray(payload, "referrals")} />;
  if (active === "raffles") return <RafflesPage raffles={asArray(payload, "raffles")} onAddRaffle={props.onAddRaffle} onDeleteRaffle={props.onDeleteRaffle} />;
  if (active === "payouts") {
    return (
      <PayoutsPage
        payoutRequests={asArray(payload, "payoutRequests")}
        payoutStatus={props.payoutStatus}
        setPayoutStatus={props.setPayoutStatus}
        onApprove={props.onApprovePayout}
        onMarkPaid={props.onMarkPaidPayout}
        onReject={props.onRejectPayout}
      />
    );
  }
  return <StatePanel title="Нет данных для отображения" text="Выберите раздел меню или обновите страницу." />;
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

function RegionsPage({ regions, regionStatus, setRegionStatus, onAddRegion, onEditRegion, onToggleRegion, canManageOwnerOnly }) {
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
        action={canManageOwnerOnly ? <button type="button" className="admin-primary-button" onClick={onAddRegion}>Добавить регион</button> : null}
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
          action={canManageOwnerOnly ? "Добавить регион" : undefined}
          onAction={canManageOwnerOnly ? onAddRegion : undefined}
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
              {canManageOwnerOnly && (
                <footer>
                  <button type="button" className="admin-secondary-button" onClick={() => onEditRegion(region)}>Редактировать</button>
                  <button type="button" className={isActiveRegion(region) ? "admin-danger-button" : "admin-secondary-button"} onClick={() => onToggleRegion(region)}>
                    {isActiveRegion(region) ? "Отключить" : "Активировать"}
                  </button>
                </footer>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function DriversPage({ drivers, driverStatus, setDriverStatus, onOpenDriver, onBlockDriver, payload, loadingMore, onLoadMoreDrivers }) {
  const [view, setView] = useState("list");
  const total = payload?.total;
  const hasMore = typeof total === "number" && drivers.length < total;
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
        <SegmentedFilter value={view} onChange={setView} items={[["list", "Список"], ["map", "Карта"]]} />
        {view === "list" && (
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
        )}
      </PageHeader>

      {view === "map" ? (
        <DriversLiveMapSection />
      ) : !visible.length ? (
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
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="admin-load-more">
              <button type="button" className="admin-secondary-button" disabled={loadingMore} onClick={onLoadMoreDrivers}>
                {loadingMore ? "Загружаем..." : `Загрузить ещё водителей (${drivers.length} из ${total})`}
              </button>
            </div>
          )}
        </DataCard>
      )}
    </div>
  );
}

function DriversLiveMapSection() {
  const [state, setState] = useState({ loading: true, error: "", drivers: [] });
  const [lastUpdated, setLastUpdated] = useState(null);

  async function load() {
    try {
      const data = await getAdminDriverLiveLocations();
      setState({ loading: false, error: "", drivers: data.drivers || [] });
      setLastUpdated(new Date());
    } catch (error) {
      setState(current => ({ loading: false, error: readError(error), drivers: current.drivers }));
    }
  }

  useEffect(() => {
    load();
    // A dispatcher tool needs to actually be live — refetch periodically
    // while this view is open rather than only on manual action.
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  if (state.loading) return <LoadingState />;
  if (state.error) {
    return <StatePanel title="Не удалось загрузить карту" text={state.error} action="Повторить" onAction={load} />;
  }
  if (!state.drivers.length) {
    return <StatePanel title="Сейчас никто не на линии" text="Как только водитель выйдет на линию, он появится здесь." />;
  }
  return (
    <DataCard
      title={`Водителей на карте: ${state.drivers.length}`}
      text={lastUpdated ? `Обновлено: ${formatDate(lastUpdated)} · обновляется автоматически каждые 15 секунд` : ""}
    >
      <DriversLiveMap drivers={state.drivers} />
    </DataCard>
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
        <div className="admin-table premium">
          {visible.map(item => (
            <div className="admin-table-row applications" key={item.id}>
              <strong>{item.full_name}</strong>
              <span>{item.phone}</span>
              <span>{[item.car_model, item.car_color].filter(Boolean).join(" · ")}</span>
              <span>{item.plate_number}</span>
              <Badge tone={badgeTone(item.status)}>{statusLabel(item.status)}</Badge>
              <div className="admin-row-actions">
                <button type="button" className="admin-secondary-button compact" onClick={() => onOpenApplication(item)}>Открыть</button>
              </div>
            </div>
          ))}
        </div>
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
                <InfoLine label="Комиссия сервиса, %" value={formatPercent(tariff.serviceCommissionPercent)} />
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
                <option value={tariff.id} key={tariff.id}>
                  {tariff.displayName || tariff.name}{tariff.regionName ? ` · ${tariff.regionName}` : ""}
                </option>
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

// Mirrors order-dispatch.service.js's OPEN_ORDER_STATUSES / the
// CANCELLED_BY_OPERATOR entry of TRANSITION_RULES on the backend — kept as a
// separate frontend constant (this file can't import server code) purely to
// decide which buttons to show. The backend independently re-validates every
// transition, so drift here only ever means a button is missing or shown
// when it would 409, never an unsafe action actually going through.
const OPEN_ORDER_STATUSES = ["SEARCHING_DRIVER", "NEW"];
const CANCELLABLE_ORDER_STATUSES = [
  "SEARCHING_DRIVER", "NEW", "DRIVER_FOUND", "DRIVER_ASSIGNED",
  "DRIVER_GOING_TO_CLIENT", "DRIVER_ARRIVED", "WAITING_CLIENT"
];

function nextOrderStatusAction(status) {
  if (["DRIVER_FOUND", "DRIVER_ASSIGNED"].includes(status)) {
    return { action: "going-to-client", buttonLabel: "Водитель выехал", successMessage: "Отмечено: водитель выехал" };
  }
  if (status === "DRIVER_GOING_TO_CLIENT") {
    return { action: "arrived", buttonLabel: "Водитель приехал", successMessage: "Отмечено: водитель приехал" };
  }
  if (["DRIVER_ARRIVED", "WAITING_CLIENT"].includes(status)) {
    return { action: "start", buttonLabel: "Поездка началась", successMessage: "Отмечено: поездка началась" };
  }
  if (["TRIP_STARTED", "IN_PROGRESS"].includes(status)) {
    return { action: "complete", buttonLabel: "Поездка завершена", successMessage: "Отмечено: поездка завершена" };
  }
  if (status === "TRIP_COMPLETED") {
    return { action: "mark-paid", buttonLabel: "Отметить оплаченным", successMessage: "Заказ отмечен оплаченным" };
  }
  return null;
}

function OrdersPage({
  orders,
  orderStatus,
  setOrderStatus,
  drivers = [],
  regions = [],
  onAssignOrderDriver,
  onAdvanceOrderStatus,
  onRequestCancelOrder,
  payload,
  loadingMore,
  onLoadMoreOrders
}) {
  const [expandedId, setExpandedId] = useState(null);
  const total = payload?.total;
  const hasMore = typeof total === "number" && orders.length < total;
  return (
    <div className="admin-page-stack">
      <PageHeader title="Заказы" subtitle="Список загружен из регионально проверенных заказов">
        <select className="admin-control-select" value={orderStatus} onChange={event => setOrderStatus(event.target.value)}>
          {orderStatusOptions.map(([value, label]) => (
            <option value={value} key={value}>{label}</option>
          ))}
        </select>
      </PageHeader>
      {!orders.length ? (
        <StatePanel title="Нет заказов" text="Нет данных для отображения." />
      ) : (
        <div className="admin-table premium">
          {orders.map(order => (
            <OrderRow
              key={order.id}
              order={order}
              drivers={drivers}
              regions={regions}
              expanded={expandedId === order.id}
              onToggle={() => setExpandedId(current => (current === order.id ? null : order.id))}
              onAssignDriver={onAssignOrderDriver}
              onAdvanceStatus={onAdvanceOrderStatus}
              onRequestCancel={onRequestCancelOrder}
            />
          ))}
        </div>
      )}
      {hasMore && (
        <div className="admin-load-more">
          <button type="button" className="admin-secondary-button" disabled={loadingMore} onClick={onLoadMoreOrders}>
            {loadingMore ? "Загружаем..." : `Показать ещё заказы (${orders.length} из ${total})`}
          </button>
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, drivers, regions, expanded, onToggle, onAssignDriver, onAdvanceStatus, onRequestCancel }) {
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [busy, setBusy] = useState(false);

  const nextAction = nextOrderStatusAction(order.status);
  const canAssign = OPEN_ORDER_STATUSES.includes(order.status) && !order.driver_id;
  const canCancel = CANCELLABLE_ORDER_STATUSES.includes(order.status);
  const regionName = regions.find(region => region.id === order.region_id)?.name;
  const eligibleDrivers = drivers.filter(driver =>
    driver.status === "FREE" && !driver.is_blocked && driver.current_region_id === order.region_id
  );

  async function handleAssign() {
    if (!selectedDriverId || !onAssignDriver) return;
    setBusy(true);
    try {
      await onAssignDriver(order.id, selectedDriverId);
      setSelectedDriverId("");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvance() {
    if (!nextAction || !onAdvanceStatus) return;
    setBusy(true);
    try {
      await onAdvanceStatus(order.id, nextAction.action, nextAction.successMessage);
    } finally {
      setBusy(false);
    }
  }

  const hasActions = canAssign || nextAction || canCancel;

  return (
    <div className="admin-order-block">
      <button type="button" className="admin-table-row orders admin-order-row-toggle" onClick={onToggle}>
        <strong>{order.short_id || order.id}</strong>
        <span>{order.pickup_text} → {order.dropoff_text}</span>
        <Badge tone={badgeTone(order.status)}>{statusLabel(order.status)}</Badge>
        <span>
          {formatMoney(order.price)}
          {order.offered_price_kzt ? <Badge tone="warning"> Своя цена</Badge> : null}
        </span>
        <span>{formatDate(order.created_at)}</span>
      </button>
      {expanded && (
        <div className="admin-order-detail">
          <div className="admin-card-facts">
            <InfoLine label="Регион" value={regionName || "—"} />
            <InfoLine label="Тариф" value={order.tariff || "—"} />
            <InfoLine label="Оплата" value={paymentMethodLabel(order.payment_method)} />
            <InfoLine
              label="Водитель"
              value={order.driver_id ? `${order.driver_name || "—"} · ${order.driver_phone || "—"} · ${order.driver_car_model || ""} ${order.driver_plate || ""}`.trim() : "Не назначен"}
            />
          </div>
          {!hasActions && (
            <p className="admin-settings-note">Заказ находится в финальном статусе — ручные действия недоступны.</p>
          )}
          {canAssign && (
            <div className="admin-order-assign-row">
              <select
                className="admin-control-select"
                value={selectedDriverId}
                onChange={event => setSelectedDriverId(event.target.value)}
                disabled={busy}
              >
                <option value="">
                  {eligibleDrivers.length ? "Выберите свободного водителя в регионе" : "Нет свободных водителей в этом регионе"}
                </option>
                {eligibleDrivers.map(driver => (
                  <option value={driver.id} key={driver.id}>
                    {driver.name} · {driver.car_model} · ★{Number(driver.rating || 0).toFixed(1)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-primary-button compact"
                disabled={!selectedDriverId || busy}
                onClick={handleAssign}
              >
                Назначить
              </button>
            </div>
          )}
          <div className="admin-order-actions">
            {nextAction && (
              <button type="button" className="admin-secondary-button compact" disabled={busy} onClick={handleAdvance}>
                {nextAction.buttonLabel}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="admin-danger-button compact"
                disabled={busy}
                onClick={() => onRequestCancel?.(order)}
              >
                Отменить заказ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RoadAlertsPage({
  alerts,
  regions,
  roadAlertStatus,
  setRoadAlertStatus,
  roadAlertRegion,
  setRoadAlertRegion,
  onHideRoadAlert
}) {
  return (
    <div className="admin-page-stack">
      <PageHeader title="Дорожные события" subtitle="Модерация предупреждений водителей и безопасного слоя навигатора">
        <select className="admin-control-select" value={roadAlertRegion} onChange={event => setRoadAlertRegion(event.target.value)}>
          <option value="all">Все регионы</option>
          {regions.map(region => (
            <option value={region.id} key={region.id}>{region.name}</option>
          ))}
        </select>
        <SegmentedFilter
          value={roadAlertStatus}
          onChange={setRoadAlertStatus}
          items={[
            ["ACTIVE", "Активные"],
            ["EXPIRED", "Скрытые"],
            ["ALL", "Все"]
          ]}
        />
      </PageHeader>

      {!alerts.length ? (
        <StatePanel
          title="Дорожных событий нет"
          text="Когда водитель отправит предупреждение с линии, оно появится здесь для проверки."
        />
      ) : (
        <section className="admin-card-grid road-alerts">
          {alerts.map(alert => {
            const status = alert.status || "ACTIVE";
            const confidence = Number(alert.confidenceScore ?? alert.confidence_score ?? 0);
            return (
              <article className="admin-road-alert-card" key={alert.id}>
                <header>
                  <div>
                    <strong>{roadAlertLabel(alert.type)}</strong>
                    <span>{alert.regionName || "Регион не указан"} · {formatDate(alert.createdAt || alert.created_at)}</span>
                  </div>
                  <Badge tone={status === "ACTIVE" ? "warning" : "muted"}>
                    {status === "ACTIVE" ? "Активно" : "Скрыто"}
                  </Badge>
                </header>
                {alert.comment && <p>{alert.comment}</p>}
                <div className="admin-road-alert-meter" aria-label="Доверие к событию">
                  <span style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }} />
                </div>
                <div className="admin-card-facts">
                  <InfoLine label="Доверие" value={`${confidence}%`} />
                  <InfoLine label="Подтверждения" value={alert.confirmationsCount ?? alert.confirmations_count ?? 0} />
                  <InfoLine label="Отклонения" value={alert.dismissalsCount ?? alert.dismissals_count ?? 0} />
                  <InfoLine label="Лимит скорости" value={alert.speedLimit ? `${alert.speedLimit} км/ч` : "Не указан"} />
                  <InfoLine label="Водитель" value={alert.driverName || alert.driverPhone || "Не указан"} />
                  <InfoLine label="Координаты" value={`${Number(alert.lat).toFixed(5)}, ${Number(alert.lng).toFixed(5)}`} />
                  <InfoLine label="Истекает" value={formatDate(alert.expiresAt || alert.expires_at)} />
                </div>
                <footer>
                  <button
                    type="button"
                    className="admin-danger-button compact"
                    disabled={status !== "ACTIVE"}
                    onClick={() => onHideRoadAlert(alert)}
                  >
                    Скрыть событие
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

const supportRoleLabels = { CLIENT: "Пассажир", DRIVER: "Водитель" };

function SupportPage({
  messages,
  supportStatus,
  setSupportStatus,
  onRespondSupport,
  onReopenSupport
}) {
  return (
    <div className="admin-page-stack">
      <PageHeader title="Поддержка" subtitle="Обращения пассажиров и водителей">
        <SegmentedFilter
          value={supportStatus}
          onChange={setSupportStatus}
          items={[
            ["OPEN", "Открытые"],
            ["RESOLVED", "Закрытые"],
            ["ALL", "Все"]
          ]}
        />
      </PageHeader>

      {!messages.length ? (
        <StatePanel
          title="Обращений нет"
          text="Когда клиент или водитель отправит обращение, оно появится здесь для обработки."
        />
      ) : (
        <section className="admin-card-grid road-alerts">
          {messages.map(message => (
            <SupportTicketCard
              key={message.id}
              message={message}
              onRespond={onRespondSupport}
              onReopen={onReopenSupport}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function SupportTicketCard({ message, onRespond, onReopen }) {
  const [draft, setDraft] = useState(message.adminResponse || "");
  const [busy, setBusy] = useState(false);
  const isResolved = message.status === "RESOLVED";

  async function submit(resolve) {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await onRespond(message, draft.trim(), resolve);
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      await onReopen(message);
    } finally {
      setBusy(false);
    }
  }

  const isLostItem = message.topic === "LOST_ITEM";
  const isUrgent = Boolean(message.isUrgent);

  return (
    <article className={`admin-road-alert-card${isUrgent ? " urgent" : ""}`}>
      <header>
        <div>
          <strong>{isUrgent ? "🆘 SOS" : isLostItem ? "Забыл вещь" : message.topic}</strong>
          <span>{supportRoleLabels[message.role] || message.role} · {formatDate(message.createdAt)}</span>
        </div>
        <Badge tone={isResolved ? "muted" : isUrgent || isLostItem ? "danger" : "warning"}>
          {isResolved ? "Закрыто" : isUrgent ? "Экстренно" : isLostItem ? "Забытая вещь" : "Открыто"}
        </Badge>
      </header>
      <p>{message.message}</p>
      <div className="admin-card-facts">
        <InfoLine label="Контакт" value={message.contactName || "Не указан"} />
        <InfoLine label="Телефон" value={message.contactPhone || "Не указан"} />
        <InfoLine label="Заказ" value={message.orderId || "Без привязки к заказу"} />
      </div>
      {message.adminResponse && (
        <div className="admin-support-response">
          <strong>Ответ:</strong>
          <p>{message.adminResponse}</p>
          {message.respondedAt && <span>{formatDate(message.respondedAt)}</span>}
        </div>
      )}
      {isResolved ? (
        <footer>
          <button type="button" className="admin-secondary-button compact" disabled={busy} onClick={reopen}>
            Переоткрыть
          </button>
        </footer>
      ) : (
        <>
          <label className="admin-textarea-field">
            <span>Ответ клиенту</span>
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Напишите ответ..."
              rows={3}
            />
          </label>
          <footer>
            <button
              type="button"
              className="admin-secondary-button compact"
              disabled={busy || !draft.trim()}
              onClick={() => submit(false)}
            >
              Ответить
            </button>
            <button
              type="button"
              className="admin-primary-button compact"
              disabled={busy || !draft.trim()}
              onClick={() => submit(true)}
            >
              Ответить и закрыть
            </button>
          </footer>
        </>
      )}
    </article>
  );
}

function formatPromoValue(promoCode) {
  return promoCode.discountType === "PERCENT"
    ? `${promoCode.discountValue}%${promoCode.maxDiscountKzt ? ` (макс. ${formatMoney(promoCode.maxDiscountKzt)})` : ""}`
    : formatMoney(promoCode.discountValue);
}

function formatPromoLimit(promoCode) {
  const total = promoCode.usageLimit != null ? promoCode.usageLimit : "Без ограничения";
  const perClient = promoCode.perClientLimit != null ? promoCode.perClientLimit : 1;
  return `${total} всего · ${perClient} на клиента`;
}

function formatPromoValidity(promoCode) {
  if (!promoCode.validFrom && !promoCode.validUntil) return "Бессрочно";
  const from = promoCode.validFrom ? formatDate(promoCode.validFrom) : "сейчас";
  const until = promoCode.validUntil ? formatDate(promoCode.validUntil) : "бессрочно";
  return `${from} — ${until}`;
}

function PromoCodesPage({ promoCodes, promoCodeStatus, setPromoCodeStatus, onAddPromoCode, onTogglePromoCode, onDeletePromoCode }) {
  const visible = promoCodes.filter(promoCode => {
    if (promoCodeStatus === "active") return promoCode.isActive;
    if (promoCodeStatus === "inactive") return !promoCode.isActive;
    return true;
  });

  return (
    <div className="admin-page-stack">
      <PageHeader
        title="Промокоды"
        subtitle="Скидочные коды для заказов клиентов"
        action={<button type="button" className="admin-primary-button" onClick={onAddPromoCode}>Добавить промокод</button>}
      >
        <SegmentedFilter
          value={promoCodeStatus}
          onChange={setPromoCodeStatus}
          items={[
            ["all", "Все"],
            ["active", "Активные"],
            ["inactive", "Отключённые"]
          ]}
        />
      </PageHeader>

      {!visible.length ? (
        <StatePanel
          title="Промокодов пока нет"
          text="Добавьте первый промокод, чтобы предложить клиентам скидку на поездку."
          action="Добавить промокод"
          onAction={onAddPromoCode}
        />
      ) : (
        <div className="admin-table premium">
          {visible.map(promoCode => (
            <div className="admin-table-row promo-codes" key={promoCode.id}>
              <strong>{promoCode.code}</strong>
              <span>{promoCode.regionId ? "Ограничен регионом" : "Все регионы"}</span>
              <span>{formatPromoValue(promoCode)}</span>
              <span>{formatPromoLimit(promoCode)}</span>
              <span>{formatPromoValidity(promoCode)}</span>
              <Badge tone={promoCode.isActive ? "success" : "muted"}>
                {promoCode.isActive ? "Активен" : "Отключён"}
              </Badge>
              <div className="admin-row-actions">
                <button type="button" className="admin-secondary-button compact" onClick={() => onTogglePromoCode(promoCode)}>
                  {promoCode.isActive ? "Отключить" : "Активировать"}
                </button>
                <button type="button" className="admin-danger-button compact" onClick={() => onDeletePromoCode(promoCode)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const recurringBookingStatusLabels = {
  PENDING_DRIVER: "Ждёт водителя",
  ACTIVE: "Активна",
  PAUSED: "На паузе",
  CANCELLED: "Отменена"
};

function recurringBookingBadgeTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING_DRIVER") return "warning";
  if (status === "CANCELLED") return "danger";
  return "muted";
}

function formatDaysOfWeek(days) {
  const labels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  if (!Array.isArray(days) || !days.length) return "Дни не указаны";
  return days.map(day => labels[Number(day)] ?? day).join(", ");
}

function RecurringBookingsPage({ bookings, recurringBookingStatus, setRecurringBookingStatus }) {
  return (
    <div className="admin-page-stack">
      <PageHeader title="Регулярные поездки" subtitle="Постоянные привязки клиента к водителю по расписанию">
        <SegmentedFilter
          value={recurringBookingStatus}
          onChange={setRecurringBookingStatus}
          items={[
            ["all", "Все"],
            ["PENDING_DRIVER", "Ждут водителя"],
            ["ACTIVE", "Активные"],
            ["PAUSED", "На паузе"],
            ["CANCELLED", "Отменены"]
          ]}
        />
      </PageHeader>

      {!bookings.length ? (
        <StatePanel title="Регулярных поездок нет" text="Привязки клиента к водителю по расписанию появятся здесь после первого оформления в приложении." />
      ) : (
        <section className="admin-card-grid recurring-bookings">
          {bookings.map(booking => (
            <article className="admin-application-card" key={booking.id}>
              <header>
                <div>
                  <strong>{booking.clientName || booking.clientId}</strong>
                  <span>{booking.driverName || "Водитель не назначен"}</span>
                </div>
                <Badge tone={recurringBookingBadgeTone(booking.status)}>
                  {recurringBookingStatusLabels[booking.status] || booking.status}
                </Badge>
              </header>
              <div className="admin-card-facts">
                <InfoLine label="Маршрут" value={[booking.pickupText, booking.dropoffText].filter(Boolean).join(" → ") || "Маршрут не указан"} />
                <InfoLine label="Дни" value={formatDaysOfWeek(booking.daysOfWeek)} />
                <InfoLine label="Время" value={booking.timeOfDay || "Не указано"} />
                <InfoLine label="Цена" value={formatMoney(booking.priceKzt)} />
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function ReferralsPage({ referrals }) {
  return (
    <div className="admin-page-stack">
      <PageHeader title="Реферальная программа" subtitle="Кто кого пригласил и сколько начислено" />

      {!referrals.length ? (
        <StatePanel title="Приглашений пока нет" text="Список появится после первого приглашения клиента через приложение." />
      ) : (
        <DataCard title="Приглашения" text="Список всех рефералов клиентов сервиса.">
          <div className="admin-table premium">
            {referrals.map(referral => (
              <div className="admin-table-row drivers" key={referral.id}>
                <strong>{referral.inviterName || referral.inviterPhone || "Клиент"}</strong>
                <span>пригласил</span>
                <span>{referral.inviteeName || referral.inviteePhone || "Новый клиент"}</span>
                <Badge tone={referral.rewardCreditedAt ? "success" : "warning"}>
                  {referral.rewardCreditedAt ? "Начислено" : "Ожидает"}
                </Badge>
                <span>{formatMoney(referral.rewardKzt)}</span>
              </div>
            ))}
          </div>
        </DataCard>
      )}
    </div>
  );
}

function PromoCodeEditor({ regions, onClose, onSave, busy }) {
  const [form, setForm] = useState({
    code: "",
    regionId: "",
    discountType: "PERCENT",
    discountValue: "10",
    maxDiscountKzt: "",
    minOrderPriceKzt: "0",
    usageLimit: "",
    perClientLimit: "1",
    validFrom: "",
    validUntil: ""
  });
  const [error, setError] = useState("");

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.code.trim()) {
      setError("Введите код промокода");
      return;
    }
    if (!Number.isFinite(Number(form.discountValue)) || Number(form.discountValue) <= 0) {
      setError("Введите корректный размер скидки");
      return;
    }
    try {
      await onSave(form);
    } catch (submitError) {
      setError(submitError.message || "Не удалось сохранить промокод");
    }
  }

  return (
    <ModalFrame title="Добавить промокод" onClose={onClose}>
      <form className="admin-form-grid" onSubmit={submit}>
        <Field label="Код" value={form.code} onChange={value => setField("code", value.toUpperCase())} />
        <label className="admin-field">
          <span>Регион</span>
          <select className="admin-control-select" value={form.regionId} onChange={event => setField("regionId", event.target.value)}>
            <option value="">Все регионы</option>
            {regions.map(region => (
              <option value={region.id} key={region.id}>{region.name}</option>
            ))}
          </select>
        </label>
        <div className="admin-form-row">
          <label className="admin-field">
            <span>Тип скидки</span>
            <select className="admin-control-select" value={form.discountType} onChange={event => setField("discountType", event.target.value)}>
              <option value="PERCENT">Процент</option>
              <option value="FIXED">Фиксированная сумма</option>
            </select>
          </label>
          <Field label={form.discountType === "PERCENT" ? "Скидка, %" : "Скидка, ₸"} type="number" value={form.discountValue} onChange={value => setField("discountValue", value)} />
        </div>
        {form.discountType === "PERCENT" && (
          <Field label="Максимальная скидка, ₸ (необязательно)" type="number" value={form.maxDiscountKzt} onChange={value => setField("maxDiscountKzt", value)} />
        )}
        <Field label="Минимальная сумма заказа, ₸" type="number" value={form.minOrderPriceKzt} onChange={value => setField("minOrderPriceKzt", value)} />
        <div className="admin-form-row">
          <Field label="Лимит использований (необязательно)" type="number" value={form.usageLimit} onChange={value => setField("usageLimit", value)} />
          <Field label="Лимит на клиента" type="number" value={form.perClientLimit} onChange={value => setField("perClientLimit", value)} />
        </div>
        <div className="admin-form-row">
          <label className="admin-field">
            <span>Действует с</span>
            <input type="date" value={form.validFrom} onChange={event => setField("validFrom", event.target.value)} />
          </label>
          <label className="admin-field">
            <span>Действует по</span>
            <input type="date" value={form.validUntil} onChange={event => setField("validUntil", event.target.value)} />
          </label>
        </div>
        {error && <InlineMessage danger text={error} />}
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="submit" className="admin-primary-button" disabled={busy}>{busy ? "Сохраняем..." : "Создать промокод"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ConfirmPanel({ title, text, confirmLabel, danger, busy, onClose, onConfirm }) {
  return (
    <ModalFrame title={title} onClose={onClose}>
      <div className="admin-detail-stack">
        <p>{text}</p>
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="button" className={danger ? "admin-danger-button" : "admin-primary-button"} disabled={busy} onClick={onConfirm}>
            {busy ? "Выполняем..." : confirmLabel}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function raffleStatus(raffle) {
  const now = new Date();
  const starts = raffle.startsAt ? new Date(raffle.startsAt) : null;
  const ends = raffle.endsAt ? new Date(raffle.endsAt) : null;
  if (starts && now < starts) return "upcoming";
  if (ends && now > ends) return "ended";
  return "active";
}

const raffleStatusLabels = { upcoming: "Скоро начнётся", active: "Идёт сейчас", ended: "Завершён" };
const raffleStatusTones = { upcoming: "warning", active: "success", ended: "muted" };

function RafflesPage({ raffles, onAddRaffle, onDeleteRaffle }) {
  return (
    <div className="admin-page-stack">
      <PageHeader
        title="Розыгрыши"
        subtitle="Конкурсы среди водителей по рейтингу за период"
        action={<button type="button" className="admin-primary-button" onClick={onAddRaffle}>Добавить розыгрыш</button>}
      />
      {!raffles.length ? (
        <StatePanel
          title="Розыгрышей пока нет"
          text="Создайте период — поездки водителей, завершённые в это время, попадут в зачёт автоматически."
          action="Добавить розыгрыш"
          onAction={onAddRaffle}
        />
      ) : (
        <section className="admin-card-grid raffles">
          {raffles.map(raffle => {
            const status = raffleStatus(raffle);
            return (
              <article className="admin-application-card" key={raffle.id}>
                <header>
                  <div>
                    <strong>{raffle.title}</strong>
                    <span>{formatDate(raffle.startsAt)} — {formatDate(raffle.endsAt)}</span>
                  </div>
                  <Badge tone={raffleStatusTones[status]}>{raffleStatusLabels[status]}</Badge>
                </header>
                <footer>
                  <button type="button" className="admin-danger-button compact" onClick={() => onDeleteRaffle(raffle)}>Удалить</button>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function RaffleEditor({ onClose, onSave, busy }) {
  const [form, setForm] = useState({ title: "", startsAt: dateInputValue(new Date()), endsAt: dateInputValue(new Date()) });
  const [error, setError] = useState("");

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("Введите название розыгрыша");
      return;
    }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError("Дата окончания должна быть позже даты начала");
      return;
    }
    try {
      await onSave(form);
    } catch (submitError) {
      setError(submitError.message || "Не удалось создать розыгрыш");
    }
  }

  return (
    <ModalFrame title="Добавить розыгрыш" onClose={onClose}>
      <form className="admin-form-grid" onSubmit={submit}>
        <Field label="Название" value={form.title} onChange={value => setField("title", value)} />
        <div className="admin-form-row">
          <label className="admin-field">
            <span>Дата начала</span>
            <input type="date" value={form.startsAt} onChange={event => setField("startsAt", event.target.value)} />
          </label>
          <label className="admin-field">
            <span>Дата окончания</span>
            <input type="date" value={form.endsAt} onChange={event => setField("endsAt", event.target.value)} />
          </label>
        </div>
        {error && <InlineMessage danger text={error} />}
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="submit" className="admin-primary-button" disabled={busy}>{busy ? "Сохраняем..." : "Создать розыгрыш"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}

const payoutStatusLabels = {
  PENDING: "Ожидает",
  APPROVED: "Одобрена",
  PAID: "Выплачена",
  REJECTED: "Отклонена",
  CANCELLED: "Отменена водителем"
};

const payoutStatusTones = {
  PENDING: "warning",
  APPROVED: "warning",
  PAID: "success",
  REJECTED: "danger",
  CANCELLED: "muted"
};

const payoutMethodLabels = { KASPI_TRANSFER: "Перевод Kaspi", CASH: "Наличные" };

function PayoutsPage({ payoutRequests, payoutStatus, setPayoutStatus, onApprove, onMarkPaid, onReject }) {
  return (
    <div className="admin-page-stack">
      <PageHeader title="Выплаты" subtitle="Заявки водителей на вывод средств">
        <SegmentedFilter
          value={payoutStatus}
          onChange={setPayoutStatus}
          items={[
            ["PENDING", "Ожидают"],
            ["APPROVED", "Одобрены"],
            ["PAID", "Выплачены"],
            ["REJECTED", "Отклонены"],
            ["ALL", "Все"]
          ]}
        />
      </PageHeader>
      {!payoutRequests.length ? (
        <StatePanel title="Заявок нет" text="Заявки водителей на вывод средств появятся здесь." />
      ) : (
        <section className="admin-card-grid payouts">
          {payoutRequests.map(item => (
            <article className="admin-application-card" key={item.id}>
              <header>
                <div>
                  <strong>{item.driverName || "Водитель"}</strong>
                  <span>{item.driverPhone || "Телефон не указан"}</span>
                </div>
                <Badge tone={payoutStatusTones[item.status] || "muted"}>{payoutStatusLabels[item.status] || item.status}</Badge>
              </header>
              <div className="admin-card-facts">
                <InfoLine label="Сумма" value={formatMoney(item.amountKzt)} />
                <InfoLine label="Способ" value={payoutMethodLabels[item.method] || item.method} />
                <InfoLine label="Создана" value={formatDate(item.createdAt)} />
                <InfoLine label="Реквизиты" value={item.payoutDetails?.phone || item.payoutDetails?.cardNumber || item.payoutDetails?.account || "Не указаны"} />
              </div>
              {item.rejectionReason && <p className="admin-honest-note">Причина отклонения: {item.rejectionReason}</p>}
              {item.status === "PENDING" && (
                <footer>
                  <button type="button" className="admin-danger-button compact" onClick={() => onReject(item)}>Отклонить</button>
                  <button type="button" className="admin-secondary-button compact" onClick={() => onApprove(item)}>Одобрить</button>
                </footer>
              )}
              {item.status === "APPROVED" && (
                <footer>
                  <button type="button" className="admin-secondary-button compact" onClick={() => onMarkPaid(item)}>Отметить как выплачено</button>
                </footer>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function PayoutRejectPanel({ payoutRequest, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <ModalFrame title="Отклонить заявку на выплату" onClose={onClose}>
      <div className="admin-detail-stack">
        <p>Заявка водителя {payoutRequest.driverName || ""} на {formatMoney(payoutRequest.amountKzt)}.</p>
        <label className="admin-textarea-field">
          <span>Причина отклонения</span>
          <textarea value={reason} onChange={event => setReason(event.target.value)} rows={4} placeholder="Например: неверные реквизиты" />
        </label>
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="button" className="admin-danger-button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Отправляем..." : "Отклонить заявку"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function DriverBlockPanel({ driver, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <ModalFrame title="Заблокировать водителя" onClose={onClose}>
      <div className="admin-detail-stack">
        <p>
          {driver.name || "Этот водитель"} потеряет доступ ко всему сервису
          сразу во всех регионах — не сможет выйти на линию и принимать
          заказы, пока вы не разблокируете его вручную.
        </p>
        <label className="admin-textarea-field">
          <span>Причина блокировки</span>
          <textarea value={reason} onChange={event => setReason(event.target.value)} rows={4} placeholder="Например: жалобы клиентов на агрессивное вождение" />
        </label>
        <div className="admin-modal-actions">
          <button type="button" className="admin-secondary-button" onClick={onClose}>Отмена</button>
          <button type="button" className="admin-danger-button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Блокируем..." : "Заблокировать"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function QualityPage({ reviews, leaderboard, raffles, ratingScope, setRatingScope, ratingRaffleId, setRatingRaffleId, onDeleteReview }) {
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : 0;
  const lowReviews = reviews.filter(review => Number(review.rating || 0) <= 3);
  const selectedRaffle = raffles.find(item => item.id === ratingRaffleId);

  return (
    <div className="admin-page-stack">
      <PageHeader title="Качество сервиса" subtitle="Отзывы клиентов, рейтинг водителей и слабые точки поездок">
        <SegmentedFilter
          value={ratingScope}
          onChange={setRatingScope}
          items={[
            ["all", "Общий рейтинг"],
            ["raffle", "За розыгрыш"]
          ]}
        />
        {ratingScope === "raffle" && (
          <select className="admin-control-select" value={ratingRaffleId} onChange={event => setRatingRaffleId(event.target.value)}>
            <option value="">Выберите розыгрыш</option>
            {raffles.map(raffle => (
              <option value={raffle.id} key={raffle.id}>{raffle.title}</option>
            ))}
          </select>
        )}
      </PageHeader>
      {ratingScope === "raffle" && !raffles.length && (
        <InlineMessage text="Розыгрышей пока нет — создайте период в разделе «Розыгрыши», чтобы фильтровать рейтинг по нему." />
      )}
      {ratingScope === "raffle" && raffles.length > 0 && !ratingRaffleId && (
        <InlineMessage text="Выберите розыгрыш, чтобы увидеть рейтинг только за этот период." />
      )}
      {ratingScope === "raffle" && selectedRaffle && (
        <InlineMessage text={`Показан рейтинг за период «${selectedRaffle.title}»: ${formatDate(selectedRaffle.startsAt)} — ${formatDate(selectedRaffle.endsAt)}`} />
      )}

      <section className="admin-analytics-grid quality">
        <article className="admin-analytics-card quality">
          <span>Средняя оценка</span>
          <strong>{averageRating ? averageRating.toFixed(1) : "—"}</strong>
          <small>{reviews.length} отзывов в базе</small>
        </article>
        <article className="admin-analytics-card quality">
          <span>Низкие оценки</span>
          <strong>{lowReviews.length}</strong>
          <small>Требуют проверки причины</small>
        </article>
        <article className="admin-analytics-card quality">
          <span>Водителей в рейтинге</span>
          <strong>{leaderboard.length}</strong>
          <small>Сортировка по оценке и поездкам</small>
        </article>
        <article className="admin-analytics-card quality">
          <span>Лучший водитель</span>
          <strong>{leaderboard[0]?.rating ? Number(leaderboard[0].rating).toFixed(1) : "—"}</strong>
          <small>{leaderboard[0]?.name || "Появится после поездок"}</small>
        </article>
      </section>

      <div className="admin-quality-layout">
        <DataCard title="Рейтинг водителей" text="Помогает видеть сильных водителей и тех, кому нужна проверка качества.">
          {!leaderboard.length ? (
            <div className="admin-empty-note">
              <strong>Рейтинга пока нет</strong>
              <span>После первых оценённых поездок здесь появится таблица водителей.</span>
            </div>
          ) : (
            <div className="admin-table premium">
              {leaderboard.map((driver, index) => (
                <div className="admin-table-row quality-driver" key={driver.id}>
                  <strong>{index + 1}. {driver.name}</strong>
                  <span>{driver.phone}</span>
                  <span>{[driver.car_model, driver.plate].filter(Boolean).join(" · ") || "Авто не указано"}</span>
                  <Badge tone={Number(driver.rating || 0) >= 4.5 ? "success" : Number(driver.rating || 0) >= 4 ? "warning" : "muted"}>
                    {driver.rating ? `${Number(driver.rating).toFixed(1)} рейтинг` : "Нет оценок"}
                  </Badge>
                  <span>{driver.completed_orders || 0} поездок</span>
                  <span>{formatMoney(driver.revenue_total)}</span>
                </div>
              ))}
            </div>
          )}
        </DataCard>

        <DataCard title="Последние отзывы" text="Низкие оценки нужно разбирать с заказом, водителем и оператором.">
          {!reviews.length ? (
            <div className="admin-empty-note">
              <strong>Отзывов пока нет</strong>
              <span>Отзывы появятся после завершения поездок и оценки клиента.</span>
            </div>
          ) : (
            <div className="admin-review-list">
              {reviews.slice(0, 12).map(review => (
                <article className="admin-review-card" key={review.id}>
                  <header>
                    <div>
                      <strong>{review.driver_name || "Водитель"}</strong>
                      <span>{review.short_id || "Заказ не указан"} · {formatDate(review.created_at)}</span>
                    </div>
                    <Badge tone={Number(review.rating || 0) >= 4 ? "success" : "warning"}>
                      {review.rating}/5
                    </Badge>
                  </header>
                  {Array.isArray(review.tags) && review.tags.length ? (
                    <div className="admin-review-tags">
                      {review.tags.map(tag => <span key={tag}>{tag}</span>)}
                    </div>
                  ) : null}
                  <p>{review.comment || "Комментарий не указан"}</p>
                  <footer>
                    <button type="button" className="admin-danger-button compact" onClick={() => onDeleteReview(review)}>
                      Удалить отзыв
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </DataCard>
      </div>
    </div>
  );
}

function AuditPage({ logs, total, loadingMore, onLoadMore }) {
  if (!logs.length) return <StatePanel title="Журнал пока пуст" text="Записи появятся после действий пользователей." />;
  const hasMore = typeof total === "number" && logs.length < total;
  return (
    <DataCard title="Журнал действий" text="Последние системные события сервиса.">
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
      {hasMore && (
        <div className="admin-load-more">
          <button type="button" className="admin-secondary-button" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Загружаем..." : `Показать ещё (${logs.length} из ${total})`}
          </button>
        </div>
      )}
    </DataCard>
  );
}

function SettingsPage({ settings, regions = [], onSave, canEdit, onSendBroadcast }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings) {
      setForm({
        serviceName: settings.serviceName || "",
        city: settings.city || "",
        currency: settings.currency || "KZT",
        currencySymbol: settings.currencySymbol || "₸",
        defaultCommissionPercent: settings.defaultCommissionPercent ?? 0,
        supportPhone: settings.supportPhone || "",
        sosPhone: settings.sosPhone || "",
        autoApproveDrivers: !!settings.autoApproveDrivers
      });
    }
  }, [settings]);

  if (!settings || !form) return <StatePanel title="Настройки недоступны" text="Не удалось загрузить настройки сервиса." />;

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.serviceName.trim() || !form.city.trim()) {
      setError("Название и город обязательны");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        serviceName: form.serviceName.trim(),
        city: form.city.trim(),
        currency: form.currency.trim(),
        currencySymbol: form.currencySymbol.trim(),
        defaultCommissionPercent: Number(form.defaultCommissionPercent),
        supportPhone: form.supportPhone.trim(),
        sosPhone: form.sosPhone.trim(),
        autoApproveDrivers: form.autoApproveDrivers
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page-stack">
      <PageHeader title="Настройки сервиса" subtitle="Параметры, которые влияют на клиентское и водительское приложение" />
      <DataCard title="Основные параметры" text={canEdit ? "Изменения применяются сразу после сохранения." : "Изменять настройки может только владелец (OWNER)."}>
        <form className="admin-form-grid" onSubmit={submit}>
          <div className="admin-form-row">
            <label className="admin-field">
              <span>Название сервиса</span>
              <input value={form.serviceName} onChange={event => setField("serviceName", event.target.value)} disabled={!canEdit} />
            </label>
            <label className="admin-field">
              <span>Город</span>
              <input value={form.city} onChange={event => setField("city", event.target.value)} disabled={!canEdit} />
            </label>
          </div>
          <div className="admin-form-row">
            <label className="admin-field">
              <span>Код валюты</span>
              <input value={form.currency} onChange={event => setField("currency", event.target.value)} disabled={!canEdit} />
            </label>
            <label className="admin-field">
              <span>Символ валюты</span>
              <input value={form.currencySymbol} onChange={event => setField("currencySymbol", event.target.value)} disabled={!canEdit} />
            </label>
          </div>
          <div className="admin-form-row">
            <label className="admin-field">
              <span>Комиссия по умолчанию (%)</span>
              <input
                type="number"
                min="0"
                max="50"
                step="0.1"
                value={form.defaultCommissionPercent}
                onChange={event => setField("defaultCommissionPercent", event.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label className="admin-field">
              <span>Телефон поддержки</span>
              <input value={form.supportPhone} onChange={event => setField("supportPhone", event.target.value)} disabled={!canEdit} />
            </label>
          </div>
          <div className="admin-form-row">
            <label className="admin-field">
              <span>Экстренный номер</span>
              <input value={form.sosPhone} onChange={event => setField("sosPhone", event.target.value)} disabled={!canEdit} />
            </label>
            <div />
          </div>
          <div className="admin-form-row">
            <label className="admin-toggle-line">
              <input
                type="checkbox"
                checked={form.autoApproveDrivers}
                onChange={event => setField("autoApproveDrivers", event.target.checked)}
                disabled={!canEdit}
              />
              <span>Автоматически одобрять заявки водителей</span>
            </label>
          </div>
          <p className="admin-settings-note">
            Заказы всегда распределяются одинаково: система уведомляет всех
            свободных водителей в регионе, и заказ достаётся первому, кто
            откликнется. Отдельного назначения «ближайшему водителю» пока нет —
            если заказ долго висит без водителя, назначьте его вручную на
            странице «Заказы».
          </p>
          {error && <InlineMessage danger text={error} />}
          {canEdit && (
            <div className="admin-modal-actions">
              <button type="submit" className="admin-primary-button" disabled={busy}>
                {busy ? "Сохраняем..." : "Сохранить настройки"}
              </button>
            </div>
          )}
        </form>
      </DataCard>
      {canEdit && (
        <DataCard title="Рассылка уведомлений" text="Push- и внутреннее уведомление всем клиентам, всем водителям или водителям одного региона сразу.">
          <BroadcastComposer regions={regions} onSend={onSendBroadcast} />
        </DataCard>
      )}
    </div>
  );
}

function BroadcastComposer({ regions, onSend }) {
  const [segment, setSegment] = useState("ALL_CLIENTS");
  const [regionId, setRegionId] = useState(regions[0]?.id || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const segmentLabels = {
    ALL_CLIENTS: "Все клиенты",
    ALL_DRIVERS: "Все водители",
    REGION_DRIVERS: "Водители одного региона"
  };

  async function send() {
    setError("");
    setResult(null);
    if (!title.trim() || !body.trim()) {
      setError("Заголовок и текст обязательны");
      return;
    }
    if (segment === "REGION_DRIVERS" && !regionId) {
      setError("Выберите регион");
      return;
    }
    setBusy(true);
    try {
      const response = await onSend({
        segment,
        regionId: segment === "REGION_DRIVERS" ? regionId : undefined,
        title: title.trim(),
        body: body.trim()
      });
      setResult(response);
      setTitle("");
      setBody("");
    } catch (submitError) {
      setError(readError(submitError));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="admin-detail-stack">
      <div className="admin-form-row">
        <label className="admin-field">
          <span>Кому</span>
          <select className="admin-control-select" value={segment} onChange={event => setSegment(event.target.value)}>
            {Object.entries(segmentLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        {segment === "REGION_DRIVERS" ? (
          <label className="admin-field">
            <span>Регион</span>
            <select className="admin-control-select" value={regionId} onChange={event => setRegionId(event.target.value)}>
              {regions.map(region => (
                <option value={region.id} key={region.id}>{region.name}</option>
              ))}
            </select>
          </label>
        ) : <div />}
      </div>
      <label className="admin-field">
        <span>Заголовок</span>
        <input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} placeholder="Например: Изменение тарифов" />
      </label>
      <label className="admin-textarea-field">
        <span>Текст сообщения</span>
        <textarea value={body} onChange={event => setBody(event.target.value)} rows={3} maxLength={400} placeholder="Текст, который увидят получатели" />
      </label>
      {error && <InlineMessage danger text={error} />}
      {result && (
        <InlineMessage text={`Отправлено: ${result.recipientCount} получателей, push доставлен на ${result.pushSentCount} устройств.`} />
      )}
      {!confirming ? (
        <div className="admin-modal-actions">
          <button
            type="button"
            className="admin-primary-button"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => setConfirming(true)}
          >
            Отправить рассылку
          </button>
        </div>
      ) : (
        <div className="admin-detail-stack">
          <p className="admin-settings-note">
            Подтвердите: сообщение получат «{segmentLabels[segment]}»
            {segment === "REGION_DRIVERS" ? ` (${regions.find(r => r.id === regionId)?.name || "регион не выбран"})` : ""}.
            Это действие нельзя отменить или отозвать после отправки.
          </p>
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary-button" disabled={busy} onClick={() => setConfirming(false)}>Отмена</button>
            <button type="button" className="admin-danger-button" disabled={busy} onClick={send}>
              {busy ? "Отправляем..." : "Да, отправить"}
            </button>
          </div>
        </div>
      )}
    </div>
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
          <Field label="Цена от, ₸" type="number" value={form.basePrice} onChange={value => setField("basePrice", value)} />
          <Field label="Цена за км" type="number" value={form.pricePerKm} onChange={value => setField("pricePerKm", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Цена за минуту" type="number" value={form.pricePerMinute} onChange={value => setField("pricePerMinute", value)} />
          <Field label="Минимальная цена, ₸" type="number" value={form.minimumPrice} onChange={value => setField("minimumPrice", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Комиссия сервиса, %" type="number" value={form.serviceCommissionPercent} onChange={value => setField("serviceCommissionPercent", value)} />
          <Field label="Коэффициент спроса" type="number" value={form.surgeMultiplier} onChange={value => setField("surgeMultiplier", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Бесплатное ожидание, мин" type="number" value={form.freeWaitingMinutes} onChange={value => setField("freeWaitingMinutes", value)} />
          <Field label="Ожидание за минуту" type="number" value={form.waitingPricePerMinute} onChange={value => setField("waitingPricePerMinute", value)} />
        </div>
        <div className="admin-form-row">
          <Field label="Штраф отмены" type="number" value={form.cancellationFee} onChange={value => setField("cancellationFee", value)} />
          <Field label="Порядок показа" type="number" value={form.sortOrder} onChange={value => setField("sortOrder", value)} />
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

  function applyPreset(preset) {
    setForm(current => ({
      ...current,
      name: preset.name,
      code: preset.code,
      centerLat: preset.centerLat,
      centerLng: preset.centerLng,
      boundary: JSON.stringify(preset.boundary, null, 2),
      isActive: true
    }));
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
        <section className="admin-region-presets">
          <strong>Быстрый шаблон региона</strong>
          <div>
            {regionPresets.map(preset => (
              <button type="button" key={preset.code} className={form.code === preset.code ? "active" : ""} onClick={() => applyPreset(preset)}>
                {preset.name}
              </button>
            ))}
          </div>
        </section>
        <Field label="Название" value={form.name} onChange={value => setField("name", value)} />
        <Field label="Код" value={form.code} onChange={value => setField("code", value.toUpperCase())} />
        <Field label="Валюта" value={form.currency} onChange={value => setField("currency", value.toUpperCase())} />
        <div className="admin-form-row">
          <Field label="Широта центра" value={form.centerLat} onChange={value => setField("centerLat", value)} />
          <Field label="Долгота центра" value={form.centerLng} onChange={value => setField("centerLng", value)} />
        </div>
        <label className="admin-textarea-field">
          <span>Граница региона, координаты полигона</span>
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

function DriverDetailPanel({ initialDriver, detail, busy, onClose, onRefresh, onBlock, onRequestBlock, onSetRegion, onSetCommission, onClearCommission, canManageOwnerOnly }) {
  const [reasonByRegion, setReasonByRegion] = useState({});
  const driver = detail.payload?.driver || initialDriver;
  const regions = detail.payload?.regions || [];
  const activeOrder = detail.payload?.activeOrder;
  const [docs, setDocs] = useState({ loading: true, error: "", items: [] });
  const [busyDocumentId, setBusyDocumentId] = useState("");

  function loadDocuments() {
    setDocs({ loading: true, error: "", items: [] });
    getAdminDriverDocuments(driver.id)
      .then(data => setDocs({ loading: false, error: "", items: data.documents || [] }))
      .catch(error => setDocs({ loading: false, error: readError(error), items: [] }));
  }

  useEffect(() => {
    // Document list/review/file endpoints are all OWNER-only server-side —
    // skip the request entirely for FINANCE rather than firing a doomed
    // fetch and showing a misleading "failed to load" error in its card.
    if (canManageOwnerOnly) loadDocuments();
  }, [driver.id, canManageOwnerOnly]);

  async function requestDocumentResubmission(document, status, docReason) {
    setBusyDocumentId(document.id);
    try {
      await reviewAdminDriverDocument(document.id, { status, reason: docReason });
      loadDocuments();
    } catch (error) {
      setDocs(current => ({ ...current, error: readError(error) }));
    } finally {
      setBusyDocumentId("");
    }
  }

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

          {canManageOwnerOnly && (
            <section className="admin-detail-actions">
              <button
                type="button"
                className={driver.is_blocked ? "admin-secondary-button" : "admin-danger-button"}
                disabled={busy}
                onClick={() => (driver.is_blocked ? onBlock(driver, false) : onRequestBlock(driver))}
              >
                {driver.is_blocked ? "Разблокировать" : "Заблокировать"}
              </button>
            </section>
          )}

          <DataCard title="Индивидуальная комиссия" text="Заменяет стандартный процент комиссии тарифа для этого водителя. Применяется только к новым завершённым поездкам, задним числом не пересчитывается.">
            <CommissionOverrideEditor
              driverId={driver.id}
              override={detail.payload?.commissionOverride}
              busy={busy}
              onSave={onSetCommission}
              onClear={onClearCommission}
            />
          </DataCard>

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
                    {canManageOwnerOnly && (
                      <>
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
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </DataCard>

          {canManageOwnerOnly && (
          <DataCard title="Документы водителя" text="Просмотр без возможности удаления — при жалобах или сомнениях запросите переоформление конкретного документа.">
            <DriverDocumentsPanel
              documents={docs.items}
              loading={docs.loading}
              error={docs.error}
              onRetry={loadDocuments}
              mode="driver"
              onReview={requestDocumentResubmission}
              busyDocumentId={busyDocumentId}
            />
          </DataCard>
          )}

          <DataCard title="Избранное и блокировки" text="Только просмотр — управляют этим сами клиент и водитель, справочно при разборе спорной ситуации.">
            <ClientDriverPreferencesPanel
              clientPreferences={detail.payload?.clientPreferences || []}
              driverPreferences={detail.payload?.driverPreferences || []}
            />
          </DataCard>
        </div>
      )}
    </ModalFrame>
  );
}

const DOCUMENT_TYPE_LABELS = {
  DRIVER_LICENSE_FRONT: "Водительское удостоверение (лицевая)",
  DRIVER_LICENSE_BACK: "Водительское удостоверение (обратная)",
  ID_CARD_FRONT: "Удостоверение личности (лицевая)",
  ID_CARD_BACK: "Удостоверение личности (обратная)",
  VEHICLE_REGISTRATION: "Техпаспорт",
  INSURANCE_POLICY: "Страховой полис",
  PROFILE_PHOTO: "Фото профиля",
  OTHER: "Другое"
};

const REQUIRED_DOCUMENT_TYPES = [
  "DRIVER_LICENSE_FRONT",
  "DRIVER_LICENSE_BACK",
  "ID_CARD_FRONT",
  "ID_CARD_BACK",
  "VEHICLE_REGISTRATION"
];

function documentBadgeTone(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  return "warning";
}

const documentStatusLabels = { PENDING: "На проверке", APPROVED: "Одобрен", REJECTED: "Отклонён" };

function DocumentThumbnail({ documentId }) {
  const [state, setState] = useState({ loading: true, error: "", url: "", mimeType: "" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setState({ loading: true, error: "", url: "", mimeType: "" });
    fetchAdminDriverDocumentFile(documentId)
      .then(({ blob, mimeType }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ loading: false, error: "", url: objectUrl, mimeType });
      })
      .catch(error => {
        if (!cancelled) setState({ loading: false, error: error.message || "Не удалось загрузить файл", url: "", mimeType: "" });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  if (state.loading) return <div className="admin-document-thumb loading">Загружаем...</div>;
  if (state.error) return <div className="admin-document-thumb error">{state.error}</div>;
  const isImage = state.mimeType.startsWith("image/");
  return (
    <a className="admin-document-thumb" href={state.url} target="_blank" rel="noreferrer" title="Открыть в полном размере">
      {isImage ? <img src={state.url} alt="Документ" /> : <span className="admin-document-thumb-file"><Icon name="document" size={28} /></span>}
    </a>
  );
}

function CommissionOverrideEditor({ driverId, override, busy, onSave, onClear }) {
  const [percent, setPercent] = useState(override ? String(override.percent) : "");
  const [active, setActive] = useState(override ? override.active : true);

  useEffect(() => {
    setPercent(override ? String(override.percent) : "");
    setActive(override ? override.active : true);
  }, [override, driverId]);

  function submit(event) {
    event.preventDefault();
    const value = Number(percent);
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    onSave(driverId, value, active);
  }

  return (
    <form className="admin-inline-form" onSubmit={submit}>
      {override ? (
        <p className="admin-detail-note">
          Сейчас: {Number(override.percent)}% · {override.active ? "активна" : "выключена"} · обновлено {formatDate(override.updatedAt)}
        </p>
      ) : (
        <p className="admin-detail-note">Используется стандартный процент из тарифа — индивидуальная комиссия не задана.</p>
      )}
      <div className="admin-inline-form-row">
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          placeholder="Процент, %"
          value={percent}
          onChange={event => setPercent(event.target.value)}
        />
        <label className="admin-checkbox-label">
          <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />
          Активна
        </label>
        <button type="submit" className="admin-primary-button compact" disabled={busy || percent.trim() === ""}>
          Сохранить
        </button>
        {override && (
          <button type="button" className="admin-danger-button compact" disabled={busy} onClick={() => onClear(driverId)}>
            Убрать override
          </button>
        )}
      </div>
    </form>
  );
}

const preferenceTypeLabels = { FAVORITE: "В избранном", BLOCKED: "Заблокирован(а)" };
const preferenceTypeTones = { FAVORITE: "success", BLOCKED: "danger" };

function PreferenceList({ items, emptyText }) {
  if (!items.length) return <p className="admin-detail-note">{emptyText}</p>;
  return (
    <ul className="admin-preference-list">
      {items.map(item => (
        <li key={item.clientId} className="admin-preference-row">
          <div>
            <strong>{item.clientName || "Без имени"}</strong>
            <span>{item.clientPhone || "Телефон не указан"} · {formatDate(item.createdAt)}</span>
          </div>
          <Badge tone={preferenceTypeTones[item.type] || "muted"}>{preferenceTypeLabels[item.type] || item.type}</Badge>
        </li>
      ))}
    </ul>
  );
}

function ClientDriverPreferencesPanel({ clientPreferences, driverPreferences }) {
  return (
    <div className="admin-preference-columns">
      <div>
        <h4>Клиенты о водителе</h4>
        <PreferenceList items={clientPreferences} emptyText="Ни один клиент не добавил этого водителя в избранное или блокировку." />
      </div>
      <div>
        <h4>Водитель о клиентах</h4>
        <PreferenceList items={driverPreferences} emptyText="Водитель не отмечал клиентов как избранных или заблокированных." />
      </div>
    </div>
  );
}

function DriverDocumentCard({ document, mode, onReview, busy }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function submitReject() {
    onReview(document, "REJECTED", reason.trim());
    setRejecting(false);
    setReason("");
  }

  return (
    <article className="admin-document-card">
      <DocumentThumbnail documentId={document.id} />
      <div className="admin-document-card-body">
        <header>
          <strong>{DOCUMENT_TYPE_LABELS[document.type] || document.type}</strong>
          <Badge tone={documentBadgeTone(document.status)}>{documentStatusLabels[document.status] || document.status}</Badge>
        </header>
        <span>{document.originalFilename}</span>
        {document.status === "REJECTED" && document.rejectionReason && (
          <p className="admin-honest-note">Причина: {document.rejectionReason}</p>
        )}
        {!rejecting ? (
          <div className="admin-document-card-actions">
            <button type="button" className="admin-danger-button compact" disabled={busy} onClick={() => setRejecting(true)}>
              {mode === "driver" ? "Запросить переоформление" : "Отклонить"}
            </button>
            {mode === "application" && (
              <button type="button" className="admin-secondary-button compact" disabled={busy} onClick={() => onReview(document, "APPROVED", "")}>
                Одобрить
              </button>
            )}
          </div>
        ) : (
          <div className="admin-document-card-reject">
            <textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder={mode === "driver" ? "Что не так с документом, что нужно переснять" : "Причина отклонения"}
              rows={2}
            />
            <div className="admin-document-card-actions">
              <button type="button" className="admin-secondary-button compact" onClick={() => setRejecting(false)}>Отмена</button>
              <button type="button" className="admin-danger-button compact" disabled={busy || !reason.trim()} onClick={submitReject}>
                {mode === "driver" ? "Отправить запрос" : "Подтвердить отказ"}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function DriverDocumentsPanel({ documents, loading, error, onRetry, mode, onReview, busyDocumentId }) {
  const byType = new Map();
  documents.forEach(item => {
    const existing = byType.get(item.type);
    if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) byType.set(item.type, item);
  });
  const missingRequired = REQUIRED_DOCUMENT_TYPES.filter(type => !byType.has(type));
  const extraDocuments = documents.filter(item => !REQUIRED_DOCUMENT_TYPES.includes(item.type));
  const requiredDocuments = REQUIRED_DOCUMENT_TYPES.map(type => byType.get(type)).filter(Boolean);

  if (loading) return <LoadingState />;
  if (error) return <StatePanel title="Не удалось загрузить документы" text={error} action="Повторить" onAction={onRetry} />;

  return (
    <div className="admin-detail-stack">
      {missingRequired.length > 0 && (
        <InlineMessage danger text={`Не хватает обязательных документов: ${missingRequired.map(type => DOCUMENT_TYPE_LABELS[type]).join(", ")}`} />
      )}
      {!documents.length ? (
        <StatePanel title="Документы не загружены" text="Кандидат ещё не загрузил ни одного документа." />
      ) : (
        <>
          {requiredDocuments.length > 0 && (
            <section className="admin-document-grid">
              {requiredDocuments.map(item => (
                <DriverDocumentCard key={item.id} document={item} mode={mode} onReview={onReview} busy={busyDocumentId === item.id} />
              ))}
            </section>
          )}
          {extraDocuments.length > 0 && (
            <>
              <small className="admin-honest-note">Дополнительные документы</small>
              <section className="admin-document-grid">
                {extraDocuments.map(item => (
                  <DriverDocumentCard key={item.id} document={item} mode={mode} onReview={onReview} busy={busyDocumentId === item.id} />
                ))}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ApplicationPanel({ application, regions, busy, onClose, onReview }) {
  const [reason, setReason] = useState("");
  const [docs, setDocs] = useState({ loading: true, error: "", items: [] });
  const [busyDocumentId, setBusyDocumentId] = useState("");

  function loadDocuments() {
    setDocs({ loading: true, error: "", items: [] });
    getAdminApplicationDocuments(application.id)
      .then(data => setDocs({ loading: false, error: "", items: data.documents || [] }))
      .catch(error => setDocs({ loading: false, error: readError(error), items: [] }));
  }

  useEffect(() => {
    loadDocuments();
  }, [application.id]);

  async function reviewDocument(document, status, docReason) {
    setBusyDocumentId(document.id);
    try {
      await reviewAdminDriverDocument(document.id, { status, reason: docReason });
      loadDocuments();
    } catch (error) {
      setDocs(current => ({ ...current, error: readError(error) }));
    } finally {
      setBusyDocumentId("");
    }
  }

  return (
    <ModalFrame title="Заявка водителя" onClose={onClose} wide>
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

        <DataCard title="Документы кандидата" text="Обязательный набор: права (обе стороны), удостоверение личности (обе стороны), техпаспорт.">
          <DriverDocumentsPanel
            documents={docs.items}
            loading={docs.loading}
            error={docs.error}
            onRetry={loadDocuments}
            mode="application"
            onReview={reviewDocument}
            busyDocumentId={busyDocumentId}
          />
        </DataCard>

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

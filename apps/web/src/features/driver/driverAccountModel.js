// Presentation only. Amounts, document approval and booking state stay server-owned.
export const DRIVER_ACCOUNT_SECTIONS = [
  ["profile", "Профиль и автомобиль", "user", "Ваши данные для поездок"],
  ["history", "История поездок", "history", "Маршруты, стоимость и оплата"],
  ["wallet", "Кошелёк", "cash", "Баланс, операции и заявки"],
  ["rating", "Рейтинг и отзывы", "star", "Оценки ваших пассажиров"],
  ["documents", "Документы", "document", "Загрузка и статус проверки"],
  [
    "recurring",
    "Регулярные поездки",
    "clock",
    "Расписание постоянных клиентов",
  ],
  ["notifications", "Уведомления", "bell", "Поездки и новости аккаунта"],
  ["support", "Поддержка", "support", "Обращения и ответы оператора"],
];

export const DRIVER_DOCUMENT_TYPES = {
  DRIVER_LICENSE_FRONT: "Водительские права · лицевая сторона",
  DRIVER_LICENSE_BACK: "Водительские права · оборотная сторона",
  ID_CARD_FRONT: "Удостоверение · лицевая сторона",
  ID_CARD_BACK: "Удостоверение · оборотная сторона",
  VEHICLE_REGISTRATION: "Свидетельство о регистрации автомобиля",
  INSURANCE_POLICY: "Страховой полис",
  PROFILE_PHOTO: "Фото профиля",
  OTHER: "Другой документ",
};

const STATUS = {
  PENDING: "На рассмотрении",
  PENDING_DRIVER: "Новый запрос",
  APPROVED: "Одобрено",
  REJECTED: "Отклонено",
  CANCELLED: "Отменено",
  ACTIVE: "Активно",
  PAUSED: "Приостановлено",
  OPEN: "Ожидает ответа",
  RESOLVED: "Есть ответ",
  SEARCHING_DRIVER: "Поиск водителя",
  DRIVER_FOUND: "Заказ принят",
  DRIVER_ASSIGNED: "Заказ принят",
  DRIVER_GOING_TO_CLIENT: "К подаче",
  DRIVER_ARRIVED: "Водитель на месте",
  WAITING_CLIENT: "Ожидание",
  TRIP_STARTED: "В поездке",
  IN_PROGRESS: "В поездке",
  TRIP_COMPLETED: "Поездка завершена",
  COMPLETED: "Поездка завершена",
  PAYMENT_PENDING: "Ожидает оплату",
  PAID: "Оплачено",
  RATED: "Оценено",
  CANCELLED_BY_CLIENT: "Отменено пассажиром",
  CANCELLED_BY_DRIVER: "Отменено водителем",
  CANCELLED_BY_OPERATOR: "Отменено оператором",
  NO_SHOW: "Клиент не вышел",
};
export const accountStatus = (value) => STATUS[value] || "Статус уточняется";
export const accountDate = (value) => {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Дата не указана";
};
export function documentFileError(file) {
  if (!file) return "Выберите файл документа.";
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type))
    return "Поддерживаются только JPG, PNG и PDF.";
  if (!file.size || file.size > 8 * 1024 * 1024)
    return "Размер файла должен быть от 1 байта до 8 МБ.";
  return "";
}
export function latestDriverDocuments(documents = []) {
  const latest = new Map();
  for (const doc of documents) {
    if (!DRIVER_DOCUMENT_TYPES[doc.type]) continue;
    const prev = latest.get(doc.type);
    if (
      !prev ||
      new Date(doc.createdAt).getTime() > new Date(prev.createdAt).getTime()
    )
      latest.set(doc.type, doc);
  }
  return latest;
}
export function walletAmountError(value, { minimum, available } = {}) {
  // Do not turn an empty field, decimals or scientific notation into money.
  if (
    !/^\d+$/.test(String(value).trim()) ||
    !Number.isSafeInteger(Number(value))
  )
    return "Введите целую сумму в тенге.";
  const amount = Number(value);
  if (amount < minimum)
    return `Минимальная сумма — ${minimum.toLocaleString("ru-RU")} ₸.`;
  if (available != null && amount > available)
    return "Сумма превышает доступный баланс.";
  return "";
}
export function walletEntryLabel(kind) {
  return (
    {
      EARNING: "Доход от поездки",
      CASH_TRIP_COMMISSION: "Комиссия за наличную поездку",
      ADJUSTMENT: "Корректировка долга",
    }[kind] || "Операция"
  );
}
export function walletEntryAmount(item) {
  const amount = Number(item.amountKzt);
  if (!Number.isFinite(amount)) return "Сумма уточняется";
  // Commission is a debt movement, NOT income or a debit from the wallet.
  const prefix = item.kind === "EARNING" && amount > 0 ? "+" : "";
  return `${prefix}${amount.toLocaleString("ru-RU")} ₸`;
}
export function recurringDays(days = []) {
  const labels = ["", "Пн", "Вт", "Ср", "Чт", "Пт"];
  return [...new Set(days)]
    .filter((day) => labels[day])
    .sort((a, b) => a - b)
    .map((day) => labels[day])
    .join(", ");
}
export function accountError(error) {
  const messages = {
    PAYOUT_DETAILS_MISSING: "Добавьте номер Kaspi для получения выплаты.",
    PAYOUT_EXCEEDS_BALANCE:
      "Баланс изменился. Обновите кошелёк и проверьте сумму.",
    PAYOUT_REQUEST_NOT_PENDING: "Заявка уже обработана. Обновите список.",
    PAYOUT_BELOW_MINIMUM: "Сумма меньше минимальной выплаты.",
    TOPUP_BELOW_MINIMUM: "Минимальная сумма пополнения — 500 ₸.",
    INVALID_PHONE: "Проверьте номер телефона.",
    UNSUPPORTED_FILE_TYPE: "Поддерживаются только JPG, PNG и PDF.",
    LIMIT_FILE_SIZE: "Размер файла не должен превышать 8 МБ.",
    UNAUTHORIZED: "Сессия завершена. Войдите снова.",
    FORBIDDEN: "Этот раздел недоступен для текущего аккаунта.",
  };
  return (
    messages[error?.code] ||
    "Не удалось выполнить запрос. Проверьте соединение и обновите раздел."
  );
}

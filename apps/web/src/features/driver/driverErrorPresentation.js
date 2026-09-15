const DRIVER_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Неверный телефон или пароль",
  DRIVER_REGION_NOT_SELECTED: "Выберите рабочий регион",
  DRIVER_REGION_REQUIRED: "Выберите рабочий регион",
  DRIVER_REGION_INACTIVE: "Регион временно отключен",
  REGION_INACTIVE: "Регион временно отключен",
  DRIVER_REGION_NOT_APPROVED: "Вы не одобрены для этого региона",
  DRIVER_REGION_BLOCKED: "Работа в этом регионе заблокирована",
  DRIVER_BLOCKED: "Профиль водителя заблокирован",
  DRIVER_HAS_ACTIVE_ORDER: "Сначала завершите активный заказ",
  DRIVER_OFFLINE: "Выйдите на линию, чтобы принять заказ",
  DRIVER_ALREADY_HAS_ACTIVE_ORDER: "У вас уже есть активный заказ",
  ORDER_REGION_MISMATCH: "Заказ относится к другому региону",
  ORDER_ALREADY_ACCEPTED: "Заказ уже принят другим водителем",
  ORDER_NOT_FOUND: "Заказ не найден",
  DRIVER_PAYMENT_CONFIRMATION_FORBIDDEN:
    "Электронная оплата ожидает подтверждения платёжного сервиса",
  SERVICE_UNAVAILABLE: "Сервис временно недоступен. Попробуйте ещё раз.",
  INVALID_STATUS_TRANSITION: "Это действие сейчас недоступно",
  FORBIDDEN: "Недостаточно прав для действия",
  UNAUTHORIZED: "Войдите как водитель",
};

const NETWORK_ERROR =
  "Не удалось подключиться. Проверьте интернет и попробуйте ещё раз.";
const GENERIC_ERROR = "Не удалось выполнить действие. Попробуйте ещё раз.";

export function driverErrorMessage(error) {
  const mapped = DRIVER_ERROR_MESSAGES[error?.code];
  if (mapped) return mapped;

  // Browser fetch errors contain implementation-specific English strings such
  // as `Failed to fetch`, `Load failed` or `NetworkError`. None of those belong
  // in the driver UI, and arbitrary server messages are not trusted as copy.
  const message = String(error?.message || "");
  if (
    error instanceof TypeError ||
    /failed to fetch|load failed|network\s*error/i.test(message)
  ) {
    return NETWORK_ERROR;
  }
  return GENERIC_ERROR;
}

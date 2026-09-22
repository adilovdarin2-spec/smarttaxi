// Причина отказа словами, понятными человеку.
//
// Сервер умеет 99 отказов; сайт объяснял 24. Всё остальное превращалось в
// «Не удалось выполнить запрос. Проверьте соединение» — то есть человеку
// говорили, что у него плохой интернет, когда на самом деле сервер назвал
// причину: место в очереди закрылось, бронь просрочена, промокод исчерпан,
// код из SMS устарел. В приложении это уже исправлено, и формулировки здесь
// взяты оттуда же: один и тот же отказ должен читаться одинаково и на
// телефоне, и на сайте.
//
// Экраны сначала смотрят в свои карты — там формулировки под контекст, — и
// только потом сюда, поэтому добавление кода сюда ничего не переопределяет.
//
// Возвращает null для незнакомого кода: общий текст лучше выдуманного.
const API_ERROR_MESSAGES = {
  CANNOT_CONFIRM_OWN_ALERT: "Своё же сообщение подтвердить нельзя",
  CLIENT_CARD_NOT_FOUND: "Эта карта уже удалена",
  CLIENT_NOT_FOUND: "Профиль пассажира не найден. Войдите заново",
  CLIENT_PREFERENCE_NOT_FOUND: "Эта настройка уже сброшена",
  COORDINATES_REQUIRED: "Укажите точку на карте",
  DRIVER_BLOCKED_BY_CLIENT: "Этот заказ недоступен для вас. Выберите другой.",
  DRIVER_DEBT_LIMIT: "Превышен лимит долга. Свяжитесь с оператором",
  DRIVER_IS_THE_RIDER: "Это ваш собственный заказ — взять его нельзя",
  DRIVER_LOCATION_UNAVAILABLE: "Ожидаем геолокацию водителя",
  DRIVER_NOT_ASSIGNED: "На заказ пока не назначен водитель",
  DRIVER_NOT_FOUND: "Профиль водителя не найден. Войдите заново",
  DRIVER_PREFERENCE_NOT_FOUND: "Эта настройка уже сброшена",
  DRIVER_PREVIOUSLY_CANCELLED_ORDER: "Вы уже отменили этот заказ. Выберите другой.",
  FAVORITE_ADDRESS_NOT_FOUND: "Этот адрес уже удалён из избранного",
  FILE_REQUIRED: "Прикрепите файл",
  FORBIDDEN_ORDER: "Этот заказ назначен другому водителю",
  FORBIDDEN_RECURRING_BOOKING: "Эта постоянная поездка не ваша",
  FORBIDDEN_STAND_ENTRY: "Это место в очереди не ваше",
  FORBIDDEN_STAND_RESERVATION: "Эта бронь не ваша",
  INSUFFICIENT_CASHBACK: "Бонусов не хватает на всю поездку. Выберите другой способ оплаты",
  INVALID_COORDINATES: "Точка вне карты. Выберите другую",
  INVALID_PAYOUT_METHOD: "Такой способ вывода не поддерживается",
  INVALID_SMS_CODE: "Неверный код из SMS",
  NOTIFICATION_NOT_FOUND: "Это уведомление уже удалено",
  ORDER_ALREADY_RATED: "Вы уже оценили этого пассажира",
  ORDER_CLIENT_MISSING: "В этом заказе некого оценить",
  ORDER_DRIVER_MISSING: "В этом заказе некого оценить",
  ORDER_NOT_AWAITING_PAYMENT: "Этот заказ не ждёт оплаты",
  ORDER_NOT_COMPLETED: "Оплата поездки ещё не подтверждена оператором.",
  ORDER_NOT_PAID: "Сначала подтвердите оплату поездки",
  PAYOUT_REQUEST_NOT_FOUND: "Эта заявка на вывод уже закрыта",
  PROMO_ALREADY_USED: "Вы уже использовали этот промокод.",
  PROMO_CODE_REQUIRED: "Введите промокод.",
  PROMO_EXPIRED: "Срок действия промокода истёк.",
  PROMO_LIMIT_REACHED: "Лимит использования этого промокода исчерпан.",
  PROMO_MIN_ORDER_NOT_MET: "Сумма заказа меньше минимальной для этого промокода.",
  PROMO_NOT_FOUND: "Такой промокод не найден. Проверьте код.",
  PROMO_NOT_STARTED: "Этот промокод ещё не начал действовать.",
  QUICK_MESSAGE_NOT_ALLOWED: "Это сообщение недоступно в вашей роли",
  RECURRING_BOOKING_ALREADY_RESPONDED: "На эту поездку уже ответили",
  RECURRING_BOOKING_CANCELLED: "Эта постоянная поездка отменена",
  RECURRING_BOOKING_NOT_FOUND: "Эта постоянная поездка уже удалена",
  RECURRING_BOOKING_PENDING: "Водитель ещё не ответил на эту поездку",
  REGION_NOT_FOUND: "Эта точка не относится ни к одному рабочему району",
  ROAD_ALERT_ALREADY_ANSWERED: "Вы уже ответили на это сообщение",
  ROAD_ALERT_EXPIRED: "Это сообщение о дороге уже неактуально",
  ROAD_ALERT_NOT_FOUND: "Это сообщение о дороге уже удалено",
  ROAD_ALERT_OUTSIDE_REGION: "Точка за пределами вашего рабочего региона",
  SMS_CODE_ATTEMPTS_EXCEEDED: "Слишком много попыток. Запросите новый код позже",
  SMS_CODE_EXPIRED: "Срок действия кода истёк. Запросите новый",
  SMS_CODE_TOO_SOON: "Код уже отправлен. Подождите минуту и попробуйте снова",
  SMS_DAILY_LIMIT_REACHED: "На сегодня кодов для этого номера больше нет. Попробуйте завтра",
  SMS_DELIVERY_FAILED: "Не удалось доставить SMS. Проверьте номер и попробуйте ещё раз",
  SMS_PROVIDER_NOT_CONFIGURED: "Отправка SMS пока не настроена. Напишите в поддержку",
  STAND_ALREADY_QUEUED: "Вы уже стоите в очереди на этой стоянке",
  STAND_ENTRY_NOT_BOARDING: "Эта машина ещё не набирает пассажиров",
  STAND_ENTRY_NOT_FOUND: "Это место в очереди уже закрыто",
  STAND_ENTRY_NOT_LIVE: "Это место в очереди уже закрыто",
  STAND_HANDOVER_HAS_SEATS: "Сначала освободите занятые места, потом уступайте очередь",
  STAND_HANDOVER_OTHER_STAND: "Этот водитель стоит на другой стоянке",
  STAND_HANDOVER_SELF: "Уступить очередь самому себе нельзя",
  STAND_INACTIVE: "Эта стоянка закрыта",
  STAND_NOT_ENOUGH_SEATS: "Свободных мест не хватает",
  STAND_NO_TAKEN_SEATS: "Занятых мест нет — освобождать нечего",
  STAND_QUEUED_ELSEWHERE: "Вы уже в очереди на другой стоянке",
  STAND_RESERVATION_EXISTS: "У вас уже есть бронь места на стоянке",
  STAND_RESERVATION_EXPIRED: "Время брони истекло. Забронируйте место заново",
  STAND_RESERVATION_NOT_FOUND: "Эта бронь уже снята",
  STAND_RESERVATION_RESOLVED: "По этой брони уже приняли решение",
  STAND_RIDER_IS_THE_DRIVER: "В своей же машине место не забронировать",
  STAND_SEATS_BELOW_TAKEN: "Мест не может быть меньше, чем уже занято",
  SUPPORT_MESSAGE_NOT_FOUND: "Это обращение уже закрыто",
  TARIFF_NOT_FOUND: "Такого тарифа больше нет. Выберите другой",
  USER_ALREADY_EXISTS: "Аккаунт с таким номером уже есть — войдите",
  USER_NOT_FOUND: "Аккаунт не найден. Войдите заново",
};

export function apiErrorMessage(code) {
  if (!code) return null;
  return API_ERROR_MESSAGES[code] || null;
}

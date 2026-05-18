export const TARIFFS = [
  { id: "Economy", title: "Эконом", price: 500, eta: "6 мин", note: "Быстро и выгодно", kind: "sedan" },
  { id: "Comfort", title: "Комфорт", price: 800, eta: "7 мин", note: "Чище и удобнее", kind: "comfort" },
  { id: "Business", title: "Бизнес", price: 1500, eta: "9 мин", note: "Премиум класс", kind: "business" },
  { id: "Delivery", title: "Доставка", price: 900, eta: "8 мин", note: "Посылки и документы", kind: "van" }
];

export const PAYMENTS = [
  { id: "CASH", title: "Наличные", note: "После поездки" },
  { id: "KASPI", title: "Kaspi QR", note: "Переводом" },
  { id: "KASPI_TRANSFER", title: "Kaspi Перевод", note: "По номеру заказа" },
  { id: "CARD", title: "Банковская карта", note: "Добавить карту" }
];

export const PLACES = [
  { title: "Дом", subtitle: "улица Шамо, 58", lat: 42.3149, lng: 69.5932, group: "favorite" },
  { title: "Работа", subtitle: "улица Бектаcова, 52", lat: 42.3187, lng: 69.6007, group: "favorite" },
  { title: "Орталык базар", subtitle: "Мырзакент, Славянка", lat: 42.3139, lng: 69.5916, group: "popular" },
  { title: "Автовокзал", subtitle: "Мырзакент, Славянка", lat: 42.3184, lng: 69.6041, group: "popular" },
  { title: "Центральная больница", subtitle: "улица Бектаcова, 62", lat: 42.3206, lng: 69.5894, group: "popular" },
  { title: "Школа №2", subtitle: "улица Шамо, 45", lat: 42.3212, lng: 69.6006, group: "popular" },
  { title: "ТРЦ Мырзакент", subtitle: "улица Рыскулова, 20/1", lat: 42.3154, lng: 69.599, group: "recent" },
  { title: "улица Бектаcова, 52", subtitle: "Недавний адрес", lat: 42.3187, lng: 69.6007, group: "recent" }
];

export const TRIPS = [
  { date: "25 апреля, 19:57", address: "улица Жаштаева, 74", price: 300, tariff: "Эконом", status: "Завершено" },
  { date: "20 апреля, 19:10", address: "ТРЦ Мырзакент", price: 0, tariff: "Отменено", status: "Отменено" },
  { date: "17 апреля, 22:58", address: "улица Бектаcова, 52", price: 300, tariff: "Эконом", status: "Завершено" },
  { date: "17 апреля, 22:41", address: "улица Шамо, 58", price: 200, tariff: "Комфорт", status: "Завершено" },
  { date: "12 апреля, 18:33", address: "Орталык базар", price: 250, tariff: "Эконом", status: "Завершено" }
];

export const DRIVER_ORDERS = [
  { id: "ST-1234", pickup: "ул. Ленина, 10", dropoff: "ТЦ Галерея", distance: "2.1 км", price: 250, tariff: "Эконом", payment: "Наличные" },
  { id: "ST-1235", pickup: "Рынок", dropoff: "Больница", distance: "1.4 км", price: 450, tariff: "Комфорт", payment: "Kaspi" }
];

export const ADMIN_STATS = [
  ["Клиенты", "1 234"],
  ["Водители", "567"],
  ["Поездки сегодня", "2 345"],
  ["Доход сегодня", "345 678 ₸"],
  ["Операторы", "8"],
  ["Проблемные", "12"]
];

export const OPERATOR_TICKETS = [
  { id: "#1234", title: "Проблема с оплатой", client: "Алексей", time: "10:30", status: "new" },
  { id: "#1233", title: "Жалоба на водителя", client: "Мария", time: "10:15", status: "work" },
  { id: "#1232", title: "Проблема с поездкой", client: "Сергей", time: "09:45", status: "work" },
  { id: "#1231", title: "Другой вопрос", client: "Иван", time: "08:30", status: "done" }
];

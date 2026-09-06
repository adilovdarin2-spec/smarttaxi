export const MAP_CENTER = { lat: 40.844435, lng: 68.509021 };
export const FINISHED = ["COMPLETED", "CANCELLED"];
export const ACTIVE = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];
export const PAYMENTS = [["CASH", "Cash"], ["KASPI", "Kaspi"], ["CARD", "Card"], ["CASHBACK", "Cashback"]];
export const TARIFFS = [
  { name: "Economy", label: "Economy", min_price: 1200, base_price: 700, price_per_km: 120, price_per_minute: 25 },
  { name: "Comfort", label: "Comfort", min_price: 1800, base_price: 900, price_per_km: 150, price_per_minute: 30 },
  { name: "Business", label: "Business", min_price: 2500, base_price: 1300, price_per_km: 220, price_per_minute: 45 },
  { name: "Delivery", label: "Delivery", min_price: 1500, base_price: 800, price_per_km: 130, price_per_minute: 25 }
];
export const LOCAL_PLACES = [
  { title: "Центр Атакента", subtitle: "Атакент", lat: 40.844435, lng: 68.509021, keys: "center центр atakent атакент" },
  { title: "Рынок Атакент", subtitle: "Атакент", lat: 40.8464, lng: 68.5078, keys: "market bazar рынок базар" },
  { title: "Акимат", subtitle: "Атакент", lat: 40.8437, lng: 68.5104, keys: "akimat акимат администрация" },
  { title: "Kaspi", subtitle: "Атакент", lat: 40.8452, lng: 68.5111, keys: "kaspi каспи bank банк" },
  { title: "Школа", subtitle: "Атакент", lat: 40.8429, lng: 68.5065, keys: "school школа" },
  { title: "Мырзакент центр", subtitle: "Мырзакент", lat: 40.666108, lng: 68.538821, keys: "myrzakent мырзакент center центр" },
  { title: "Жетысай центр", subtitle: "Жетысай", lat: 40.7769, lng: 68.3272, keys: "zhetysay жетысай center центр" },
  { title: "Шымкент центр", subtitle: "Шымкент", lat: 42.3417, lng: 69.5901, keys: "shymkent шымкент center центр" }
];

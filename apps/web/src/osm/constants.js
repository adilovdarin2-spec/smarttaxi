export const MAP_CENTER = { lat: 42.3167, lng: 69.5958 };
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
  { title: "Atakent Center", subtitle: "City center", lat: 42.3167, lng: 69.5958, keys: "center" },
  { title: "Market", subtitle: "Central market", lat: 42.3139, lng: 69.5916, keys: "market bazar" },
  { title: "Station", subtitle: "Station", lat: 42.3184, lng: 69.6041, keys: "station" },
  { title: "Hospital", subtitle: "City hospital", lat: 42.3206, lng: 69.5894, keys: "hospital" },
  { title: "Akimat", subtitle: "Administration", lat: 42.3161, lng: 69.5974, keys: "akimat" },
  { title: "Kaspi", subtitle: "Bank", lat: 42.3154, lng: 69.599, keys: "kaspi bank" },
  { title: "Shamo 58", subtitle: "Street Shamo", lat: 42.3158, lng: 69.5948, keys: "shamo 58 shamova" }
];

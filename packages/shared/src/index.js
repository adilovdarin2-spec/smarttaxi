export const ORDER_STATUS = {
  NEW: "NEW",
  DRIVER_ASSIGNED: "DRIVER_ASSIGNED",
  DRIVER_ARRIVED: "DRIVER_ARRIVED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
};

export const PAYMENT_METHOD = {
  CASH: "CASH",
  KASPI: "KASPI",
  CARD: "CARD",
  CASHBACK: "CASHBACK",
  MIXED: "MIXED"
};

export const ROLE = {
  CLIENT: "CLIENT",
  DRIVER: "DRIVER",
  OWNER: "OWNER",
  OPERATOR: "OPERATOR",
  FINANCE: "FINANCE"
};

export function roundKzt(value) {
  return Math.max(0, Math.round(Number(value || 0) / 10) * 10);
}

export function calculatePrice(tariff, distanceKm, durationMin) {
  const raw = Number(tariff.base_price) +
    Number(tariff.price_per_km) * Number(distanceKm || 0) +
    Number(tariff.price_per_minute) * Number(durationMin || 0);
  return Math.max(Number(tariff.min_price), roundKzt(raw));
}

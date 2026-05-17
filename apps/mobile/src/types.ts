export type Tariff = {
  name: string;
  base_price?: number;
  min_price?: number;
};

export type OrderStatus =
  | "NEW"
  | "DRIVER_ASSIGNED"
  | "DRIVER_ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type Order = {
  id: string;
  short_id: string;
  rider_name: string;
  rider_phone: string;
  pickup_text: string;
  dropoff_text: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  tariff: string;
  payment_method: "CASH" | "KASPI" | "CARD" | "CASHBACK" | "MIXED";
  status: OrderStatus;
  price: number;
  notes?: string;
  driver_id?: string | null;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  car_model: string;
  plate: string;
  status: string;
  debt: number;
  balance: number;
};

export type FinanceStats = {
  today: {
    orders_total: number;
    revenue_total: number;
    commission_total: number;
    cashback_total: number;
    new_orders: number;
    active_orders: number;
    completed_orders: number;
  };
  drivers: {
    free_drivers: number;
    driver_debts_total: number;
  };
};

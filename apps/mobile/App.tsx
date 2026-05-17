import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { api, humanError } from "./src/services/api";
import { loginWithEmail, loginWithPhone, logout, restoreSession, User } from "./src/services/auth";
import { getCurrentCoordinates } from "./src/services/location";
import { createSmartTaxiSocket } from "./src/services/socket";
import { Driver, FinanceStats, Order, Tariff } from "./src/types";

const payments = ["CASH", "KASPI", "CARD"] as const;
const activeStatuses = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];

function money(value?: number | string | null) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    NEW: "Новый",
    DRIVER_ASSIGNED: "Назначен",
    DRIVER_ARRIVED: "Приехал",
    IN_PROGRESS: "В поездке",
    COMPLETED: "Завершен",
    CANCELLED: "Отменен",
    FREE: "Онлайн",
    BUSY: "Занят",
    OFFLINE: "Оффлайн"
  };
  return labels[status || ""] || status || "Нет статуса";
}

function Button({ label, onPress, variant = "primary", disabled = false }: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, variant === "ghost" && styles.buttonGhost, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, variant === "ghost" && styles.buttonGhostText]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, secure = false, keyboardType = "default", placeholder }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "decimal-pad";
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#756b55"
      />
    </View>
  );
}

function Message({ error }: { error: string }) {
  if (!error) return null;
  return <Text style={styles.error}>{error}</Text>;
}

function Badge({ status }: { status?: string }) {
  return <Text style={styles.badge}>{statusLabel(status)}</Text>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OrderCard({ order, children }: { order: Order; children?: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.orderId}>#{order.short_id}</Text>
        <Badge status={order.status} />
      </View>
      <Text style={styles.route}>{order.pickup_text}</Text>
      <Text style={styles.routeMuted}>{order.dropoff_text}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{money(order.price)}</Text>
        <Text style={styles.meta}>{order.tariff}</Text>
        <Text style={styles.meta}>{order.payment_method}</Text>
      </View>
      {order.notes ? <Text style={styles.note}>{order.notes}</Text> : null}
      {children}
    </View>
  );
}

function LoginPanel({ mode, onLogin }: { mode: "driver" | "owner"; onLogin: (user: User) => void }) {
  const [identifier, setIdentifier] = useState(mode === "driver" ? "+77000000000" : "admin@smarttaxi.local");
  const [password, setPassword] = useState(mode === "driver" ? "123456" : "ChangeMe_2026!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const data = mode === "driver"
        ? await loginWithPhone(identifier, password)
        : await loginWithEmail(identifier, password);
      onLogin(data.user);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>{mode === "driver" ? "Driver app" : "Owner dashboard"}</Text>
      <Text style={styles.h1}>{mode === "driver" ? "Вход водителя" : "Вход владельца"}</Text>
      <Message error={error} />
      <Field
        label={mode === "driver" ? "Телефон" : "Email"}
        value={identifier}
        onChangeText={setIdentifier}
        keyboardType={mode === "driver" ? "phone-pad" : "email-address"}
      />
      <Field label="Пароль" value={password} onChangeText={setPassword} secure />
      <Button label={loading ? "Проверяем..." : "Войти"} onPress={submit} disabled={loading} />
    </View>
  );
}

function ClientHome({ onOrder }: { onOrder: (order: Order) => void }) {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [form, setForm] = useState({
    riderName: "Дарын",
    riderPhone: "+77000000000",
    pickupText: "Atakent, центр",
    dropoffText: "Atakent, вокзал",
    pickupLat: "",
    pickupLng: "",
    dropoffLat: "",
    dropoffLng: "",
    tariff: "Economy",
    paymentMethod: "CASH",
    notes: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState("");

  useEffect(() => {
    api<{ tariffs: Tariff[] }>("/api/tariffs")
      .then(data => setTariffs(data.tariffs || []))
      .catch(err => setError(humanError(err)));
  }, []);

  function numeric(value: string) {
    const number = Number(value);
    return Number.isFinite(number) && value !== "" ? number : undefined;
  }

  async function locate() {
    setError("");
    try {
      const coords = await getCurrentCoordinates();
      setForm(current => ({ ...current, pickupLat: String(coords.lat), pickupLng: String(coords.lng) }));
    } catch (err) {
      setError(humanError(err));
    }
  }

  async function createOrder() {
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        pickupLat: numeric(form.pickupLat),
        pickupLng: numeric(form.pickupLng),
        dropoffLat: numeric(form.dropoffLat),
        dropoffLng: numeric(form.dropoffLng)
      };
      const estimateData = await api<{ estimate: { distanceKm: number; durationMin: number } }>("/api/maps/estimate", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setEstimate(`${estimateData.estimate.distanceKm} км · ${estimateData.estimate.durationMin} мин`);
      const data = await api<{ order: Order }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          distanceKm: estimateData.estimate.distanceKm,
          durationMin: estimateData.estimate.durationMin
        })
      });
      onOrder(data.order);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>Client home</Text>
      <Text style={styles.h1}>Заказать такси</Text>
      <Message error={error} />
      <Field label="Имя" value={form.riderName} onChangeText={riderName => setForm({ ...form, riderName })} />
      <Field label="Телефон" value={form.riderPhone} onChangeText={riderPhone => setForm({ ...form, riderPhone })} keyboardType="phone-pad" />
      <Field label="Откуда" value={form.pickupText} onChangeText={pickupText => setForm({ ...form, pickupText })} />
      <Button label="Определить моё местоположение" onPress={locate} variant="ghost" />
      <Field label="Куда" value={form.dropoffText} onChangeText={dropoffText => setForm({ ...form, dropoffText })} />
      <View style={styles.twoCols}>
        <Field label="Pickup lat" value={form.pickupLat} onChangeText={pickupLat => setForm({ ...form, pickupLat })} keyboardType="decimal-pad" />
        <Field label="Pickup lng" value={form.pickupLng} onChangeText={pickupLng => setForm({ ...form, pickupLng })} keyboardType="decimal-pad" />
      </View>
      <View style={styles.twoCols}>
        <Field label="Dropoff lat" value={form.dropoffLat} onChangeText={dropoffLat => setForm({ ...form, dropoffLat })} keyboardType="decimal-pad" />
        <Field label="Dropoff lng" value={form.dropoffLng} onChangeText={dropoffLng => setForm({ ...form, dropoffLng })} keyboardType="decimal-pad" />
      </View>
      <Text style={styles.label}>Тариф</Text>
      <View style={styles.chips}>
        {(tariffs.length ? tariffs : [{ name: "Economy" }, { name: "Comfort" }, { name: "Business" }]).map(tariff => (
          <Pressable key={tariff.name} style={[styles.chip, form.tariff === tariff.name && styles.chipActive]} onPress={() => setForm({ ...form, tariff: tariff.name })}>
            <Text style={styles.chipText}>{tariff.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Оплата</Text>
      <View style={styles.chips}>
        {payments.map(payment => (
          <Pressable key={payment} style={[styles.chip, form.paymentMethod === payment && styles.chipActive]} onPress={() => setForm({ ...form, paymentMethod: payment })}>
            <Text style={styles.chipText}>{payment}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Комментарий" value={form.notes} onChangeText={notes => setForm({ ...form, notes })} />
      {estimate ? <Text style={styles.muted}>Оценка: {estimate}</Text> : null}
      <Button label={loading ? "Создаем..." : "Создать заказ"} onPress={createOrder} disabled={loading} />
    </View>
  );
}

function ClientActiveOrder({ order }: { order: Order | null }) {
  if (!order) {
    return (
      <View style={styles.panel}>
        <Text style={styles.h2}>Активный заказ</Text>
        <Text style={styles.muted}>Создайте заказ на главном экране, и он появится здесь.</Text>
      </View>
    );
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>Client active order</Text>
      <OrderCard order={order} />
    </View>
  );
}

function ClientHistoryPlaceholder() {
  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>History</Text>
      <Text style={styles.h2}>История поездок</Text>
      <Text style={styles.muted}>Placeholder для истории клиента. Backend endpoint можно добавить отдельным этапом.</Text>
    </View>
  );
}

function DriverWorkspace({ user }: { user: User | null }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [stats, setStats] = useState<{ orders_total: number; completed_orders: number; revenue_total: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [ordersData, statsData] = await Promise.all([
        api<{ orders: Order[] }>("/api/orders?limit=100"),
        api<{ driver: Driver; today: { orders_total: number; completed_orders: number; revenue_total: number } }>("/api/drivers/me/stats")
      ]);
      setOrders(ordersData.orders || []);
      setDriver(statsData.driver);
      setStats(statsData.today);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (!user) return undefined;
    const socket = createSmartTaxiSocket();
    socket.emit("join_drivers");
    socket.on("order_created", load);
    socket.on("order_taken", load);
    socket.on("order_updated", load);
    return () => {
      socket.disconnect();
    };
  }, [user?.id]);

  async function action(path: string) {
    try {
      await api(path, { method: "POST" });
      await load();
    } catch (err) {
      setError(humanError(err));
    }
  }

  async function status(next: "FREE" | "OFFLINE") {
    try {
      await api("/api/drivers/me/status", { method: "PATCH", body: JSON.stringify({ status: next }) });
      await load();
    } catch (err) {
      setError(humanError(err));
    }
  }

  const activeTrip = useMemo(() => orders.find(order => order.driver_id === driver?.id && activeStatuses.includes(order.status)), [orders, driver?.id]);
  const newOrders = orders.filter(order => order.status === "NEW");

  if (!user) return <Text style={styles.muted}>Войдите как водитель.</Text>;

  return (
    <View style={styles.stack}>
      <Message error={error} />
      <View style={styles.rowGap}>
        <Button label="Онлайн" onPress={() => status("FREE")} />
        <Button label="Оффлайн" onPress={() => status("OFFLINE")} variant="ghost" />
      </View>
      {loading ? <ActivityIndicator color="#f1c95c" /> : null}
      <View style={styles.statsGrid}>
        <Stat label="Заказы" value={stats?.orders_total || 0} />
        <Stat label="Завершено" value={stats?.completed_orders || 0} />
        <Stat label="Выручка" value={money(stats?.revenue_total)} />
        <Stat label="Долг" value={money(driver?.debt)} />
        <Stat label="Баланс" value={money(driver?.balance)} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Driver active trip</Text>
        {activeTrip ? (
          <OrderCard order={activeTrip}>
            {activeTrip.status === "DRIVER_ASSIGNED" ? <Button label="Я приехал" onPress={() => action(`/api/orders/${activeTrip.id}/arrived`)} /> : null}
            {activeTrip.status === "DRIVER_ARRIVED" ? <Button label="Начать поездку" onPress={() => action(`/api/orders/${activeTrip.id}/start`)} /> : null}
            {activeTrip.status === "IN_PROGRESS" ? <Button label="Завершить" onPress={() => action(`/api/orders/${activeTrip.id}/complete`)} /> : null}
          </OrderCard>
        ) : (
          <Text style={styles.muted}>Активной поездки нет.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Driver orders</Text>
        <Text style={styles.h2}>Новые заказы</Text>
        {newOrders.length ? newOrders.map(order => (
          <OrderCard key={order.id} order={order}>
            <Button label="Принять" onPress={() => action(`/api/orders/${order.id}/accept`)} />
          </OrderCard>
        )) : <Text style={styles.muted}>Новых заказов нет.</Text>}
      </View>
    </View>
  );
}

function OwnerDashboard({ user }: { user: User | null }) {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");

  async function load() {
    if (!user) return;
    setError("");
    try {
      const [financeData, ordersData] = await Promise.all([
        api<FinanceStats>("/api/finance/stats"),
        api<{ orders: Order[] }>("/api/orders?limit=20")
      ]);
      setStats(financeData);
      setOrders(ordersData.orders || []);
    } catch (err) {
      setError(humanError(err));
    }
  }

  useEffect(() => { load(); }, [user?.id]);

  if (!user) return <Text style={styles.muted}>Войдите как owner/admin.</Text>;

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>Owner dashboard basic</Text>
      <Text style={styles.h1}>SmartTaxi</Text>
      <Message error={error} />
      <View style={styles.statsGrid}>
        <Stat label="Заказы" value={stats?.today.orders_total || 0} />
        <Stat label="Активные" value={stats?.today.active_orders || 0} />
        <Stat label="Выручка" value={money(stats?.today.revenue_total)} />
        <Stat label="Комиссия" value={money(stats?.today.commission_total)} />
        <Stat label="Долги" value={money(stats?.drivers.driver_debts_total)} />
      </View>
      <Button label="Обновить" onPress={load} variant="ghost" />
      {orders.map(order => <OrderCard key={order.id} order={order} />)}
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState("client-home");
  const [user, setUser] = useState<User | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    restoreSession()
      .then(session => setUser(session?.user || null))
      .finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    if (!activeOrder) return undefined;
    const socket = createSmartTaxiSocket();
    socket.on("order_status_public", payload => {
      setActiveOrder(current => current && payload.id === current.id ? { ...current, ...payload } : current);
    });
    return () => {
      socket.disconnect();
    };
  }, [activeOrder?.id]);

  async function signOut() {
    await logout();
    setUser(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.logo}>SmartTaxi</Text>
        {user ? <Pressable onPress={signOut}><Text style={styles.logout}>Выйти</Text></Pressable> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {restoring ? <ActivityIndicator color="#f1c95c" /> : null}
        <View style={styles.tabs}>
          <Button label="Client" onPress={() => setTab("client-home")} variant={tab.startsWith("client") ? "primary" : "ghost"} />
          <Button label="Driver" onPress={() => setTab("driver-login")} variant={tab.startsWith("driver") ? "primary" : "ghost"} />
          <Button label="Owner" onPress={() => setTab("owner-login")} variant={tab.startsWith("owner") ? "primary" : "ghost"} />
        </View>

        {tab.startsWith("client") ? (
          <>
            <View style={styles.subTabs}>
              <Pressable onPress={() => setTab("client-home")}><Text style={styles.subTab}>Home</Text></Pressable>
              <Pressable onPress={() => setTab("client-active")}><Text style={styles.subTab}>Active</Text></Pressable>
              <Pressable onPress={() => setTab("client-history")}><Text style={styles.subTab}>History</Text></Pressable>
            </View>
            {tab === "client-active" ? <ClientActiveOrder order={activeOrder} /> : tab === "client-history" ? <ClientHistoryPlaceholder /> : <ClientHome onOrder={(order) => { setActiveOrder(order); setTab("client-active"); }} />}
          </>
        ) : null}

        {tab.startsWith("driver") ? (
          user?.role === "DRIVER" ? <DriverWorkspace user={user} /> : <LoginPanel mode="driver" onLogin={(nextUser) => setUser(nextUser)} />
        ) : null}

        {tab.startsWith("owner") ? (
          user && ["OWNER", "OPERATOR", "FINANCE"].includes(user.role) ? <OwnerDashboard user={user} /> : <LoginPanel mode="owner" onLogin={(nextUser) => setUser(nextUser)} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070707" },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomColor: "#2d2617",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  logo: { color: "#f1c95c", fontSize: 22, fontWeight: "900" },
  logout: { color: "#a99d84", fontWeight: "800" },
  content: { padding: 14, gap: 14 },
  tabs: { flexDirection: "row", gap: 8 },
  subTabs: { flexDirection: "row", gap: 16, paddingVertical: 4 },
  subTab: { color: "#f1c95c", fontWeight: "800" },
  panel: { backgroundColor: "#12110e", borderColor: "#2d2617", borderWidth: 1, borderRadius: 10, padding: 14, gap: 12 },
  card: { backgroundColor: "#0b0a08", borderColor: "#211d14", borderWidth: 1, borderRadius: 10, padding: 12, gap: 10, marginTop: 10 },
  eyebrow: { color: "#f1c95c", fontSize: 12, textTransform: "uppercase", fontWeight: "900" },
  h1: { color: "#f8f2e3", fontSize: 32, fontWeight: "900" },
  h2: { color: "#f8f2e3", fontSize: 22, fontWeight: "900" },
  field: { gap: 6 },
  label: { color: "#a99d84", fontSize: 13, fontWeight: "800" },
  input: { minHeight: 48, borderColor: "#37301f", borderWidth: 1, borderRadius: 8, color: "#f8f2e3", paddingHorizontal: 12, backgroundColor: "#070707" },
  button: { minHeight: 48, borderRadius: 8, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#f1c95c", flex: 1 },
  buttonGhost: { backgroundColor: "#15130f", borderColor: "#2d2617", borderWidth: 1 },
  buttonText: { color: "#090806", fontWeight: "900" },
  buttonGhostText: { color: "#f8f2e3" },
  disabled: { opacity: 0.55 },
  error: { color: "#ffd0d0", backgroundColor: "rgba(255,107,107,.12)", borderColor: "rgba(255,107,107,.4)", borderWidth: 1, borderRadius: 8, padding: 10 },
  muted: { color: "#a99d84" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  rowGap: { flexDirection: "row", gap: 10 },
  twoCols: { flexDirection: "row", gap: 10 },
  orderId: { color: "#f1c95c", fontSize: 20, fontWeight: "900" },
  badge: { color: "#f1c95c", backgroundColor: "rgba(216,178,74,.15)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: "hidden", fontWeight: "900" },
  route: { color: "#f8f2e3", fontSize: 16, fontWeight: "800" },
  routeMuted: { color: "#a99d84" },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  meta: { color: "#f8f2e3", backgroundColor: "#15130f", padding: 8, borderRadius: 8, overflow: "hidden" },
  note: { color: "#a99d84" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: "#2d2617", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: "rgba(216,178,74,.18)", borderColor: "#d8b24a" },
  chipText: { color: "#f8f2e3", fontWeight: "800" },
  stack: { gap: 14 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { minWidth: "45%", flex: 1, backgroundColor: "#12110e", borderColor: "#2d2617", borderWidth: 1, borderRadius: 10, padding: 12 },
  statValue: { color: "#f1c95c", fontSize: 20, fontWeight: "900" },
  statLabel: { color: "#a99d84", fontSize: 12, marginTop: 4 }
});

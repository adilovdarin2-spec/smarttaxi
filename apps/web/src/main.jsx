import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, clearToken, login } from "./lib/api";
import { createSocket } from "./lib/socket";
import "./styles.css";

const STATUS = {
  NEW: "Новый",
  DRIVER_ASSIGNED: "Водитель назначен",
  DRIVER_ARRIVED: "Водитель приехал",
  IN_PROGRESS: "В поездке",
  COMPLETED: "Завершен",
  CANCELLED: "Отменен"
};

const PAYMENTS = {
  CASH: "Наличные",
  KASPI: "Kaspi",
  CARD: "Карта",
  CASHBACK: "Кэшбэк",
  MIXED: "Смешанная"
};

const DRIVER_ACTIVE = ["DRIVER_ASSIGNED", "DRIVER_ARRIVED", "IN_PROGRESS"];
const DEFAULT_TARIFFS = [{ name: "Economy" }, { name: "Comfort" }, { name: "Business" }, { name: "Delivery" }];
const GOOGLE_MAPS_BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || "";

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₸`;
}

function humanError(error) {
  const code = error?.code || "";
  if (code === "ORDER_ALREADY_ACCEPTED") return "Заказ уже принял другой водитель.";
  if (code === "DRIVER_NOT_AVAILABLE") return "Сначала включите статус онлайн.";
  if (code === "DRIVER_HAS_ACTIVE_ORDER") return "У вас уже есть активная поездка.";
  if (code === "INVALID_STATUS_TRANSITION" || code === "INVALID_ORDER_TRANSITION") return "Этот шаг сейчас недоступен для текущего статуса заказа.";
  if (code === "FORBIDDEN_ORDER") return "Нельзя управлять чужим заказом.";
  if (error?.message === "Failed to fetch") return "API не отвечает. Проверьте backend или адрес VITE_API_URL.";
  return error?.message || "Что-то пошло не так.";
}

function Nav() {
  return (
    <header className="nav">
      <a className="brand" href="/client" aria-label="SmartTaxi client">
        <span className="brand-mark">ST</span>
        <span>SmartTaxi</span>
      </a>
      <nav>
        <a href="/client">Клиент</a>
        <a href="/driver">Водитель</a>
        <a href="/owner">Owner</a>
      </nav>
    </header>
  );
}

function Shell({ children, wide = false }) {
  return <main className={wide ? "page page-wide" : "page"}>{children}</main>;
}

function Alert({ message }) {
  return message ? <div className="alert" role="alert">{message}</div> : null;
}

function Loading({ label = "Загрузка..." }) {
  return <div className="state">{label}</div>;
}

function Empty({ title, text }) {
  return <div className="state empty"><strong>{title}</strong><span>{text}</span></div>;
}

function StatusBadge({ status }) {
  return <span className={`badge status-${String(status || "").toLowerCase()}`}>{STATUS[status] || status || "Нет статуса"}</span>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function OrderRoute({ order }) {
  return (
    <div className="route">
      <span>{order.pickup_text}</span>
      <i />
      <span>{order.dropoff_text}</span>
    </div>
  );
}

function useSocket(enabled, setup) {
  useEffect(() => {
    if (!enabled) return undefined;
    const socket = createSocket();
    setup(socket);
    return () => socket.disconnect();
  }, [enabled]);
}

function Client() {
  const [tariffs, setTariffs] = useState([]);
  const [tariffsLoading, setTariffsLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
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
  const [geoLoading, setGeoLoading] = useState(false);
  const [estimate, setEstimate] = useState(null);

  useEffect(() => {
    let alive = true;
    setTariffsLoading(true);
    api("/api/tariffs")
      .then((data) => {
        if (!alive) return;
        const list = data.tariffs?.length ? data.tariffs : DEFAULT_TARIFFS;
        setTariffs(list);
        if (!list.some((item) => item.name === form.tariff)) {
          setForm((current) => ({ ...current, tariff: list[0]?.name || "Economy" }));
        }
      })
      .catch((err) => setError(humanError(err)))
      .finally(() => alive && setTariffsLoading(false));
    return () => { alive = false; };
  }, []);

  useSocket(Boolean(order), (socket) => {
    const update = (payload) => {
      const next = payload.order || payload;
      setOrder((current) => current && next?.id === current.id ? { ...current, ...next } : current);
    };
    socket.on("order_updated", update);
    socket.on("order_status_public", update);
  });

  function optionalNumber(value) {
    if (value === "" || value === null || value === undefined) return undefined;
    const next = Number(value);
    return Number.isFinite(next) ? next : undefined;
  }

  function payloadWithCoordinates(base = form) {
    return {
      ...base,
      pickupLat: optionalNumber(base.pickupLat),
      pickupLng: optionalNumber(base.pickupLng),
      dropoffLat: optionalNumber(base.dropoffLat),
      dropoffLng: optionalNumber(base.dropoffLng)
    };
  }

  async function estimateTrip(base = form) {
    const data = await api("/api/maps/estimate", {
      method: "POST",
      body: JSON.stringify(payloadWithCoordinates(base))
    });
    setEstimate(data.estimate);
    return data.estimate;
  }

  async function locateMe() {
    setError("");
    if (!("geolocation" in navigator)) {
      setError("Геолокация недоступна в этом браузере. Заполните адрес вручную.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          ...form,
          pickupLat: position.coords.latitude.toFixed(6),
          pickupLng: position.coords.longitude.toFixed(6)
        };
        setForm(next);
        estimateTrip(next).catch((err) => setError(humanError(err)));
        setGeoLoading(false);
      },
      () => {
        setError("Не удалось получить геолокацию. Разрешите доступ или оставьте ручной адрес.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const routeEstimate = await estimateTrip();
      const data = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          ...payloadWithCoordinates(),
          distanceKm: routeEstimate.distanceKm,
          durationMin: routeEstimate.durationMin
        })
      });
      setOrder(data.order);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Shell>
      <section className="hero">
        <p className="eyebrow">Atakent taxi platform</p>
        <h1>Заказ такси без звонков и ожидания диспетчера</h1>
      </section>

      <div className="client-layout">
        <section className="panel">
          <div className="panel-head">
            <h2>Новый заказ</h2>
            {tariffsLoading && <span className="mini">Тарифы загружаются</span>}
          </div>
          <Alert message={error} />
          <form className="form" onSubmit={submit}>
            <Field label="Имя">
              <input value={form.riderName} onChange={(e) => setForm({ ...form, riderName: e.target.value })} />
            </Field>
            <Field label="Телефон">
              <input inputMode="tel" value={form.riderPhone} onChange={(e) => setForm({ ...form, riderPhone: e.target.value })} />
            </Field>
            <Field label="Откуда">
              <input value={form.pickupText} onChange={(e) => setForm({ ...form, pickupText: e.target.value })} />
            </Field>
            <button type="button" className="btn btn-ghost" disabled={geoLoading} onClick={locateMe}>
              {geoLoading ? "Определяем..." : "Определить моё местоположение"}
            </button>
            <Field label="Куда">
              <input value={form.dropoffText} onChange={(e) => setForm({ ...form, dropoffText: e.target.value })} />
            </Field>
            <div className="form-row coords-row">
              <Field label="Pickup lat">
                <input inputMode="decimal" value={form.pickupLat} onChange={(e) => setForm({ ...form, pickupLat: e.target.value })} placeholder="опционально" />
              </Field>
              <Field label="Pickup lng">
                <input inputMode="decimal" value={form.pickupLng} onChange={(e) => setForm({ ...form, pickupLng: e.target.value })} placeholder="опционально" />
              </Field>
              <Field label="Dropoff lat">
                <input inputMode="decimal" value={form.dropoffLat} onChange={(e) => setForm({ ...form, dropoffLat: e.target.value })} placeholder="опционально" />
              </Field>
              <Field label="Dropoff lng">
                <input inputMode="decimal" value={form.dropoffLng} onChange={(e) => setForm({ ...form, dropoffLng: e.target.value })} placeholder="опционально" />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Тариф">
                <select value={form.tariff} onChange={(e) => setForm({ ...form, tariff: e.target.value })}>
                  {(tariffs.length ? tariffs : DEFAULT_TARIFFS).map((tariff) => <option key={tariff.name}>{tariff.name}</option>)}
                </select>
              </Field>
              <Field label="Оплата">
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                  {Object.entries(PAYMENTS).filter(([key]) => ["CASH", "KASPI", "CARD"].includes(key)).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Комментарий">
              <textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="estimate-strip">
              <span>{estimate ? `${estimate.distanceKm} км · ${estimate.durationMin} мин` : "Маршрут будет рассчитан fallback-оценкой"}</span>
              <small>{GOOGLE_MAPS_BROWSER_KEY ? "Google Maps key configured" : "Google Maps key отсутствует, fallback активен"}</small>
            </div>
            <button className="btn btn-primary" disabled={creating}>{creating ? "Создаем заказ..." : "Заказать такси"}</button>
          </form>
        </section>

        <section className="panel order-panel">
          <h2>Активный заказ</h2>
          {!order ? (
            <Empty title="Заказ еще не создан" text="После отправки формы здесь появятся номер, статус и цена." />
          ) : (
            <div className="active-order">
              <div className="order-top">
                <strong>#{order.short_id}</strong>
                <StatusBadge status={order.status} />
              </div>
              <OrderRoute order={order} />
              <div className="facts">
                <span><b>{money(order.price)}</b><small>Цена</small></span>
                <span><b>{PAYMENTS[order.payment_method] || order.payment_method}</b><small>Оплата</small></span>
                <span><b>{order.tariff}</b><small>Тариф</small></span>
              </div>
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

function DriverLogin({ onLogin }) {
  const [phone, setPhone] = useState("+77000000000");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ phone, password });
      onLogin();
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <section className="auth-card">
        <p className="eyebrow">Driver app</p>
        <h1>Вход водителя</h1>
        <Alert message={error} />
        <form className="form" onSubmit={submit}>
          <Field label="Телефон"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Пароль"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Проверяем..." : "Войти"}</button>
        </form>
      </section>
    </Shell>
  );
}

function Driver() {
  const [auth, setAuth] = useState(Boolean(localStorage.getItem("smarttaxi_token")));
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [ordersData, statsData] = await Promise.all([
        api("/api/orders?limit=100"),
        api("/api/drivers/me/stats")
      ]);
      setOrders(ordersData.orders || []);
      setStats(statsData);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (auth) load(); }, [auth]);

  useSocket(auth, (socket) => {
    socket.emit("join_drivers");
    socket.on("order_created", load);
    socket.on("order_taken", load);
    socket.on("order_updated", load);
  });

  async function runAction(label, fn) {
    setActionLoading(label);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(humanError(err));
      await load().catch(() => {});
    } finally {
      setActionLoading("");
    }
  }

  function logout() {
    clearToken();
    setAuth(false);
    setOrders([]);
    setStats(null);
  }

  if (!auth) return <DriverLogin onLogin={() => setAuth(true)} />;

  const driverId = stats?.driver?.id;
  const activeTrip = orders.find((order) => order.driver_id === driverId && DRIVER_ACTIVE.includes(order.status));
  const newOrders = orders.filter((order) => order.status === "NEW");

  return (
    <Shell>
      <div className="screen-head">
        <div>
          <p className="eyebrow">Driver workspace</p>
          <h1>Рабочая смена</h1>
        </div>
        <button className="icon-btn" onClick={logout}>Выйти</button>
      </div>
      <Alert message={error} />

      <section className="driver-toolbar">
        <button className="btn btn-primary" disabled={Boolean(actionLoading)} onClick={() => runAction("online", () => api("/api/drivers/me/status", { method: "PATCH", body: JSON.stringify({ status: "FREE" }) }))}>Онлайн</button>
        <button className="btn btn-ghost" disabled={Boolean(actionLoading)} onClick={() => runAction("offline", () => api("/api/drivers/me/status", { method: "PATCH", body: JSON.stringify({ status: "OFFLINE" }) }))}>Оффлайн</button>
        <button className="btn btn-ghost" disabled={loading} onClick={load}>Обновить</button>
      </section>

      {loading && <Loading label="Обновляем заказы..." />}

      <section className="stats-grid">
        <div className="stat"><strong>{stats?.today?.orders_total || 0}</strong><span>Заказы сегодня</span></div>
        <div className="stat"><strong>{money(stats?.today?.revenue_total)}</strong><span>Выручка</span></div>
        <div className="stat"><strong>{money(stats?.driver?.debt)}</strong><span>Долг сервису</span></div>
        <div className="stat"><strong>{money(stats?.driver?.balance)}</strong><span>Баланс</span></div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Активная поездка</h2>
          {activeTrip && <StatusBadge status={activeTrip.status} />}
        </div>
        {!activeTrip ? (
          <Empty title="Активной поездки нет" text="Новые заказы появятся ниже автоматически." />
        ) : (
          <OrderCard order={activeTrip}>
            {activeTrip.status === "DRIVER_ASSIGNED" && <button className="btn btn-primary" disabled={Boolean(actionLoading)} onClick={() => runAction("arrived", () => api(`/api/orders/${activeTrip.id}/arrived`, { method: "POST" }))}>Я приехал</button>}
            {activeTrip.status === "DRIVER_ARRIVED" && <button className="btn btn-primary" disabled={Boolean(actionLoading)} onClick={() => runAction("start", () => api(`/api/orders/${activeTrip.id}/start`, { method: "POST" }))}>Начать поездку</button>}
            {activeTrip.status === "IN_PROGRESS" && <button className="btn btn-primary" disabled={Boolean(actionLoading)} onClick={() => runAction("complete", () => api(`/api/orders/${activeTrip.id}/complete`, { method: "POST" }))}>Завершить</button>}
          </OrderCard>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Новые заказы</h2>
          <span className="mini">{newOrders.length}</span>
        </div>
        {!newOrders.length ? (
          <Empty title="Новых заказов нет" text="Когда клиент создаст заказ, он появится здесь без refresh." />
        ) : (
          <div className="cards-list">
            {newOrders.map((order) => (
              <OrderCard key={order.id} order={order}>
                <button className="btn btn-primary" disabled={Boolean(actionLoading)} onClick={() => runAction(`accept-${order.id}`, () => api(`/api/orders/${order.id}/accept`, { method: "POST" }))}>Принять</button>
              </OrderCard>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}

function OrderCard({ order, children }) {
  return (
    <article className="order-card">
      <div className="order-top">
        <strong>#{order.short_id}</strong>
        <StatusBadge status={order.status} />
      </div>
      <OrderRoute order={order} />
      <div className="order-meta">
        <span>{money(order.price)}</span>
        <span>{order.tariff}</span>
        <span>{PAYMENTS[order.payment_method] || order.payment_method}</span>
      </div>
      {order.notes && <p className="note">{order.notes}</p>}
      {children && <div className="actions">{children}</div>}
    </article>
  );
}

function OwnerLogin({ onLogin }) {
  const [email, setEmail] = useState("admin@smarttaxi.local");
  const [password, setPassword] = useState("ChangeMe_2026!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ email, password });
      onLogin();
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <section className="auth-card">
        <p className="eyebrow">Owner dashboard</p>
        <h1>Вход владельца</h1>
        <Alert message={error} />
        <form className="form" onSubmit={submit}>
          <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Пароль"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Проверяем..." : "Войти"}</button>
        </form>
      </section>
    </Shell>
  );
}

function Owner() {
  const [auth, setAuth] = useState(Boolean(localStorage.getItem("smarttaxi_token")));
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [ordersData, driversData, statsData] = await Promise.all([
        api("/api/orders?limit=200"),
        api("/api/drivers"),
        api("/api/finance/stats")
      ]);
      setOrders(ordersData.orders || []);
      setDrivers(driversData.drivers || []);
      setStats(statsData);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (auth) load(); }, [auth]);

  useSocket(auth, (socket) => {
    socket.emit("join_dispatch");
    socket.on("order_created", load);
    socket.on("order_updated", load);
  });

  function logout() {
    clearToken();
    setAuth(false);
    setOrders([]);
    setDrivers([]);
    setStats(null);
  }

  const driverById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);

  if (!auth) return <OwnerLogin onLogin={() => setAuth(true)} />;

  return (
    <Shell wide>
      <div className="screen-head">
        <div>
          <p className="eyebrow">Control room</p>
          <h1>Owner dashboard</h1>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost" disabled={loading} onClick={load}>{loading ? "Обновляем..." : "Refresh"}</button>
          <button className="icon-btn" onClick={logout}>Выйти</button>
        </div>
      </div>
      <Alert message={error} />

      <section className="owner-stats">
        <div className="stat"><strong>{stats?.today?.orders_total || 0}</strong><span>Заказы сегодня</span></div>
        <div className="stat"><strong>{stats?.today?.active_orders || 0}</strong><span>Активные</span></div>
        <div className="stat"><strong>{stats?.drivers?.free_drivers || 0}</strong><span>Водители онлайн</span></div>
        <div className="stat"><strong>{money(stats?.today?.revenue_total)}</strong><span>Выручка</span></div>
        <div className="stat"><strong>{money(stats?.today?.commission_total)}</strong><span>Комиссия</span></div>
        <div className="stat"><strong>{money(stats?.drivers?.driver_debts_total)}</strong><span>Долги водителей</span></div>
        <div className="stat"><strong>{money(stats?.today?.cashback_total)}</strong><span>Кэшбэк</span></div>
        <div className="stat"><strong>{stats?.today?.new_orders || 0}</strong><span>Новые</span></div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Заказы</h2>
            <span className="mini">{orders.length}</span>
          </div>
          {loading && !orders.length ? <Loading /> : !orders.length ? (
            <Empty title="Заказов нет" text="Новые заказы клиентов появятся здесь." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Клиент</th>
                    <th>Маршрут</th>
                    <th>Статус</th>
                    <th>Водитель</th>
                    <th>Цена</th>
                    <th>Оплата</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const driver = driverById.get(order.driver_id);
                    return (
                      <tr key={order.id}>
                        <td>#{order.short_id}</td>
                        <td><b>{order.rider_name}</b><small>{order.rider_phone}</small></td>
                        <td><small>{order.pickup_text}</small><small>{order.dropoff_text}</small></td>
                        <td><StatusBadge status={order.status} /></td>
                        <td>{driver ? driver.name : "Не назначен"}</td>
                        <td>{money(order.price)}</td>
                        <td>{PAYMENTS[order.payment_method] || order.payment_method}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Водители</h2>
            <span className="mini">{drivers.length}</span>
          </div>
          {!drivers.length ? (
            <Empty title="Водителей нет" text="После seed здесь будет тестовый водитель." />
          ) : (
            <div className="cards-list compact">
              {drivers.map((driver) => (
                <article className="driver-card" key={driver.id}>
                  <div>
                    <strong>{driver.name}</strong>
                    <span>{driver.phone}</span>
                  </div>
                  <StatusBadge status={driver.status} />
                  <p>{driver.car_model} · {driver.plate}</p>
                  <div className="driver-money">
                    <span>Долг: {money(driver.debt)}</span>
                    <span>Баланс: {money(driver.balance)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

function App() {
  const path = window.location.pathname;
  return (
    <>
      <Nav />
      {path.startsWith("/driver") ? <Driver /> : path.startsWith("/owner") ? <Owner /> : <Client />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);

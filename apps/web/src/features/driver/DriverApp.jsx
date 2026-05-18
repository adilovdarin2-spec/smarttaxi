import React, { useState } from "react";
import { DRIVER_ORDERS } from "../../core/data.js";
import { Icon, SmartLogo } from "../../core/icons.jsx";
import { AppHeader, BottomNav, Button, Money, PhoneFrame, StatCard } from "../../core/ui.jsx";
import MapView from "../map/MapView.jsx";

export default function DriverApp() {
  const [logged, setLogged] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [online, setOnline] = useState(false);
  const [active, setActive] = useState(null);
  const [stage, setStage] = useState("accepted");
  const [tab, setTab] = useState("home");
  const [orders, setOrders] = useState(DRIVER_ORDERS);

  if (!logged) {
    return (
      <PhoneFrame className="driver-app auth-screen">
        <SmartLogo />
        <h1>{authMode === "login" ? "Вход водителя" : "Регистрация водителя"}</h1>
        <p>Рабочее приложение Smart Taxi</p>
        <input placeholder="Телефон" defaultValue="+77000000000" />
        {authMode === "register" && <input placeholder="Автомобиль" defaultValue="Toyota Camry" />}
        {authMode === "register" && <input placeholder="Госномер" defaultValue="A123BC123" />}
        <input placeholder="Пароль" type="password" defaultValue="123456" />
        <Button className="wide" onClick={() => setLogged(true)}>{authMode === "login" ? "Войти" : "Отправить на проверку"}</Button>
        <Button variant="secondary" className="wide" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Регистрация водителя" : "Уже есть аккаунт"}</Button>
      </PhoneFrame>
    );
  }

  if (tab === "history") {
    return (
      <PhoneFrame className="driver-app">
        <AppHeader title="История заказов" subtitle="Водитель" right={<SmartLogo compact />} />
        <section className="orders-list">{DRIVER_ORDERS.map(order => <article className="driver-order" key={order.id}><b>{order.id}</b><p>{order.pickup} → {order.dropoff}</p><strong><Money value={order.price} /></strong></article>)}</section>
        <BottomNav active="history" onSelect={setTab} />
      </PhoneFrame>
    );
  }

  if (tab === "support") {
    return (
      <PhoneFrame className="driver-app">
        <AppHeader title="Поддержка водителя" subtitle="Smart Taxi" right={<SmartLogo compact />} />
        <section className="orders-list"><article className="driver-order"><b>Чат поддержки</b><p>Напишите оператору, если возникла проблема с заказом или выплатой.</p><div className="chat-input static"><input placeholder="Сообщение..." /><button type="button"><Icon name="route" /></button></div></article></section>
        <BottomNav active="support" onSelect={setTab} />
      </PhoneFrame>
    );
  }

  if (tab === "profile") {
    return (
      <PhoneFrame className="driver-app">
        <AppHeader title="Меню водителя" subtitle="Профиль и настройки" right={<SmartLogo compact />} />
        <section className="orders-list"><div className="list-card"><button type="button"><Icon name="route" /><span>Мои заказы<small>История и статусы</small></span><Icon name="back" /></button><button type="button"><Icon name="cash" /><span>Мой баланс<small>4 250 ₸</small></span><Icon name="back" /></button><button type="button"><Icon name="star" /><span>Статистика<small>Рейтинг 4.9</small></span><Icon name="back" /></button><button type="button" onClick={() => setLogged(false)}><Icon name="logout" /><span>Выйти из аккаунта</span><Icon name="back" /></button></div></section>
        <BottomNav active="profile" onSelect={setTab} />
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame className="driver-app">
      <AppHeader title="Водитель" subtitle={online ? "На линии" : "Не на линии"} right={<SmartLogo compact />} />
      <section className="driver-status-card">
        <div className="avatar">И</div>
        <span><b>Иван</b><small>Toyota Camry · A123BC123</small></span>
        <strong>4.9</strong>
      </section>
      <div className="stats-grid">
        <StatCard label="Поездки" value="8" icon="route" />
        <StatCard label="Заработок" value="4 250 ₸" icon="cash" />
        <StatCard label="Рейтинг" value="4.9" icon="star" />
      </div>
      <Button className="wide" variant={online ? "secondary" : "primary"} onClick={() => setOnline(!online)}>{online ? "Уйти с линии" : "Выйти на линию"}</Button>
      {active ? (
        <section className="order-panel">
          <MapView pickup={{}} destination={{}} driver status={stage === "accepted" ? "Еду к клиенту" : stage === "arrived" ? "Прибыл" : "В пути"} compact />
          <h2>Активный заказ</h2>
          <p>{active.pickup} → {active.dropoff}</p>
          <div className="button-row">
            {stage === "accepted" && <Button onClick={() => setStage("arrived")}>Я приехал</Button>}
            {stage === "arrived" && <Button onClick={() => setStage("ride")}>Начать поездку</Button>}
            {stage === "ride" && <Button onClick={() => { setActive(null); setStage("accepted"); }}>Завершить</Button>}
          </div>
        </section>
      ) : (
        <section className="orders-list">
          <h2>{online ? "Новые заказы" : "Вы не на линии"}</h2>
          {!online && <p className="muted-note">Выйдите на линию, чтобы получать заказы.</p>}
          {online && orders.map(order => (
            <article className="driver-order" key={order.id}>
              <MapView pickup={{}} destination={{}} status={order.distance} compact />
              <b>{order.pickup} → {order.dropoff}</b>
              <p>{order.tariff} · {order.payment}</p>
              <strong><Money value={order.price} /></strong>
              <div className="button-row"><Button onClick={() => setActive(order)}>Принять заказ</Button><Button variant="secondary" onClick={() => setOrders(list => list.filter(item => item.id !== order.id))}>Отклонить</Button></div>
            </article>
          ))}
        </section>
      )}
      <BottomNav active="home" onSelect={setTab} />
    </PhoneFrame>
  );
}

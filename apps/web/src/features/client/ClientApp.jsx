import React, { useEffect, useMemo, useState } from "react";
import { Icon, SmartLogo, VehicleIcon } from "../../core/icons.jsx";
import { AppHeader, BottomNav, Button, MenuRow, Money, PhoneFrame } from "../../core/ui.jsx";
import { PAYMENTS, PLACES, TARIFFS, TRIPS } from "../../core/data.js";
import MapView from "../map/MapView.jsx";

const quick = [
  ["home", "Дом"], ["work", "Работа"], ["star", "Избранное"], ["clock", "Недавние"]
];

function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    short_id: order.short_id || order.shortId || order.id,
    pickup_text: order.pickup_text || order.pickupText,
    dropoff_text: order.dropoff_text || order.dropoffText,
    payment_method: order.payment_method || order.paymentMethod
  };
}

export default function ClientApp() {
  const [screen, setScreen] = useState("splash");
  const [sheet, setSheet] = useState("home");
  const [pickup, setPickup] = useState({ ...PLACES[0], title: "улица Шамо, 58", subtitle: "Моё местоположение" });
  const [destination, setDestination] = useState(PLACES[2]);
  const [tariff, setTariff] = useState(TARIFFS[0]);
  const [payment, setPayment] = useState(PAYMENTS[0]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const price = useMemo(() => destination ? tariff.price + 150 : tariff.price, [destination, tariff]);

  async function createOrder() {
    if (!destination || loading) return;
    setLoading(true);
    setMessage("");
    const payload = {
      riderName: "Клиент Smart Taxi",
      riderPhone: "+77000000000",
      pickupText: pickup.title,
      dropoffText: destination.title,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffLat: destination.lat,
      dropoffLng: destination.lng,
      tariff: tariff.id,
      paymentMethod: payment.id,
      distanceKm: 6.2,
      durationMin: 14,
      notes: ""
    };
    window.setTimeout(() => {
      setOrder(normalizeOrder({ id: "local-ui-order", shortId: "ST-1001", status: "searching", ...payload, price }));
      setSheet("searching");
      setLoading(false);
    }, 450);
  }

  if (screen === "splash") {
    return <WelcomeScreen onStart={() => setScreen("home")} />;
  }

  if (screen === "register") {
    return <RegisterScreen onBack={() => setScreen("splash")} onDone={() => setScreen("home")} />;
  }

  return (
    <PhoneFrame className="client-app">
      {sheet === "home" && (
        <>
          <MapView pickup={pickup} destination={destination} status={destination ? "6 мин" : ""} />
          <HomeHeader onMenu={() => setSheet("menu")} onBonus={() => setSheet("bonus")} />
          <section className="ride-sheet">
            <div className="sheet-grip" />
            <RouteCard pickup={pickup} destination={destination} onPickup={() => setSheet("pickup")} onDestination={() => setSheet("destination")} />
            <div className="quick-grid">{quick.map(([icon, label]) => <button key={label} type="button" onClick={() => setSheet(label === "Недавние" ? "history" : "destination")}><Icon name={icon} /><span>{label}</span></button>)}</div>
            <TariffCarousel tariff={tariff} setTariff={setTariff} price={price} />
            {message && <p className="inline-error">{message}</p>}
            <Button className="wide" disabled={!destination || loading} onClick={createOrder}>{loading ? "Ищем..." : destination ? "Заказать такси" : "Найти водителя"}</Button>
          </section>
          <BottomNav active="home" onSelect={key => setSheet(key === "profile" ? "profile" : key)} />
        </>
      )}
      {sheet === "pickup" && <AddressScreen mode="pickup" onBack={() => setSheet("home")} onSelect={place => { setPickup(place); setSheet("home"); }} />}
      {sheet === "destination" && <AddressScreen mode="destination" onBack={() => setSheet("home")} onSelect={place => { setDestination(place); setSheet("home"); }} />}
      {sheet === "payment" && <PaymentScreen payment={payment} setPayment={setPayment} onBack={() => setSheet("home")} />}
      {sheet === "searching" && <SearchingScreen order={order} pickup={pickup} destination={destination} tariff={tariff} price={price} onCancel={() => setSheet("home")} onAssign={() => setSheet("assigned")} />}
      {sheet === "assigned" && <AssignedScreen order={order} pickup={pickup} destination={destination} price={price} onStart={() => setSheet("ride")} />}
      {sheet === "ride" && <RideScreen pickup={pickup} destination={destination} price={price} onComplete={() => setSheet("complete")} />}
      {sheet === "complete" && <CompleteScreen pickup={pickup} destination={destination} price={price} rating={rating} setRating={setRating} onHome={() => { setDestination(null); setOrder(null); setSheet("home"); }} />}
      {sheet === "history" && <HistoryScreen onBack={() => setSheet("home")} />}
      {sheet === "bonus" && <BonusScreen onBack={() => setSheet("home")} onPromo={() => setSheet("promo")} onInvite={() => setSheet("invite")} />}
      {sheet === "promo" && <PromoScreen onBack={() => setSheet("bonus")} />}
      {sheet === "invite" && <InviteScreen onBack={() => setSheet("bonus")} />}
      {sheet === "notifications" && <NotificationsScreen onBack={() => setSheet("profile")} />}
      {sheet === "support" && <SupportScreen onBack={() => setSheet("home")} />}
      {sheet === "profile" && <ProfileScreen onBack={() => setSheet("home")} setSheet={setSheet} />}
      {sheet === "profileEdit" && <ProfileEditScreen onBack={() => setSheet("profile")} />}
      {sheet === "settings" && <SettingsScreen onBack={() => setSheet("profile")} />}
      {sheet === "menu" && <ClientMenu onBack={() => setSheet("home")} setSheet={setSheet} />}
      {sheet === "driver" && <BecomeDriver onBack={() => setSheet("profile")} onApply={() => setSheet("driverApply")} />}
      {sheet === "driverApply" && <DriverApplicationScreen onBack={() => setSheet("driver")} />}
    </PhoneFrame>
  );
}

function WelcomeScreen({ onStart }) {
  const benefits = [
    ["route", "Быстрый заказ"],
    ["cash", "Честные цены"],
    ["cash", "Маленькая комиссия"],
    ["shield", "Безопасные поездки"],
    ["support", "Поддержка 24/7"]
  ];
  return (
    <PhoneFrame className="welcome-screen">
      <div className="welcome-inner">
        <SmartLogo />
        <h1>Smart<span>Taxi</span></h1>
        <p>Ваш комфорт. Ваш город.</p>
        <div className="splash-city" />
        <div className="splash-car"><VehicleIcon /></div>
        <ul>
          {benefits.map(([icon, title]) => <li key={title}><Icon name={icon} />{title}</li>)}
        </ul>
        <Button className="wide" onClick={onStart}>Начать поездку</Button>
      </div>
    </PhoneFrame>
  );
}

function RegisterScreen({ onBack, onDone }) {
  return (
    <section className="panel-screen auth-panel">
      <AppHeader title="Регистрация" subtitle="Создайте аккаунт клиента" onBack={onBack} />
      <form className="form-stack" onSubmit={event => { event.preventDefault(); onDone(); }}>
        <input placeholder="Имя" defaultValue="Дарын" />
        <input placeholder="Номер телефона" defaultValue="+7 (778) 417-51-36" />
        <input placeholder="Email" defaultValue="client@smarttaxi.kz" />
        <input placeholder="Пароль" type="password" defaultValue="12345678" />
        <label className="terms-row"><input type="checkbox" defaultChecked /> <span>Я согласен с условиями использования и политикой конфиденциальности</span></label>
        <Button className="wide" onClick={onDone}>Зарегистрироваться</Button>
      </form>
      <button className="plain-link" type="button" onClick={onBack}>Уже есть аккаунт? Войти</button>
    </section>
  );
}

function HomeHeader({ onMenu, onBonus }) {
  return (
    <header className="floating-header">
      <button className="round-button" type="button" onClick={onMenu} aria-label="Меню"><Icon name="menu" /></button>
      <button className="bonus-pill" type="button" onClick={onBonus}><SmartLogo compact /><span>Бонусы<br /><b>850 ₸</b></span></button>
    </header>
  );
}

function RouteCard({ pickup, destination, onPickup, onDestination }) {
  return (
    <div className="route-card">
      <button type="button" onClick={onPickup}><b className="dot blue" /> <span><small>Откуда</small>{pickup?.title || "Моё местоположение"}</span><Icon name="plus" /></button>
      <button type="button" onClick={onDestination}><b className="dot gold" /> <span><small>Куда</small>{destination?.title || "Куда едем?"}</span><Icon name="plus" /></button>
    </div>
  );
}

function TariffCarousel({ tariff, setTariff, price }) {
  return (
    <section>
      <h3 className="section-title">Тариф</h3>
      <div className="tariff-carousel">
        {TARIFFS.map(item => (
          <button type="button" className={`tariff-card ${tariff.id === item.id ? "active" : ""}`} key={item.id} onClick={() => setTariff(item)}>
            <VehicleIcon type={item.kind} />
            {tariff.id === item.id && <span className="check"><Icon name="check" size={14} /></span>}
            <strong>{item.title}</strong>
            <small>{item.eta}</small>
            <b><Money value={item.id === tariff.id ? price : item.price} /></b>
            <em>{item.note}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function AddressScreen({ mode, onBack, onSelect }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const filtered = PLACES
    .filter(p => tab === "all" || (tab === "addresses" ? p.group !== "popular" : p.group === "popular"))
    .filter(p => `${p.title} ${p.subtitle}`.toLowerCase().includes(query.toLowerCase()));
  const groups = [
    ["Избранные адреса", filtered.filter(p => p.group === "favorite")],
    ["Популярные места", filtered.filter(p => p.group === "popular")],
    ["Недавние", filtered.filter(p => p.group === "recent")]
  ];
  return (
    <section className="panel-screen">
      <AppHeader title={mode === "pickup" ? "Откуда поедем?" : "Куда едем?"} onBack={onBack} />
      <label className="search-field"><Icon name="search" /><input value={query} onChange={e => setQuery(e.target.value)} autoFocus placeholder="Куда?" /></label>
      <div className="tabs">
        <button type="button" className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>Все</button>
        <button type="button" className={tab === "addresses" ? "active" : ""} onClick={() => setTab("addresses")}>Адреса</button>
        <button type="button" className={tab === "orgs" ? "active" : ""} onClick={() => setTab("orgs")}>Организации</button>
      </div>
      {groups.map(([title, list]) => list.length ? <section className="address-group" key={title}><h3>{title}</h3>{list.map(place => <button key={place.title} type="button" onClick={() => onSelect(place)}><Icon name={place.group === "favorite" ? "home" : "pin"} /><span>{place.title}<small>{place.subtitle}</small></span><Icon name="back" /></button>)}</section> : null)}
      {query && <Button variant="secondary" className="wide" onClick={() => onSelect({ title: query, subtitle: "Введённый адрес", lat: 42.316, lng: 69.596 })}>Использовать адрес: {query}</Button>}
    </section>
  );
}

function PaymentScreen({ payment, setPayment, onBack }) {
  return (
    <section className="panel-screen">
      <AppHeader title="Способы оплаты" onBack={onBack} />
      <div className="list-card">{PAYMENTS.map(item => <button key={item.id} type="button" className={payment.id === item.id ? "selected" : ""} onClick={() => setPayment(item)}><Icon name={item.id === "CARD" ? "card" : item.id === "KASPI" ? "cash" : "cash"} /><span>{item.title}<small>{item.note}</small></span>{payment.id === item.id && <Icon name="check" />}</button>)}</div>
      <p className="muted-note">Оплата списывается или передаётся после завершения поездки.</p>
    </section>
  );
}

function SearchingScreen({ pickup, destination, tariff, price, onCancel, onAssign }) {
  useEffect(() => {
    const timer = window.setTimeout(onAssign, 1800);
    return () => window.clearTimeout(timer);
  }, [onAssign]);
  return (
    <section className="panel-screen ride-state">
      <AppHeader title="Поиск водителя" onBack={onCancel} right={<button className="text-danger" onClick={onCancel}>Отмена</button>} />
      <MapView pickup={pickup} destination={destination} status="Поиск ближайшего водителя" compact />
      <div className="radar"><VehicleIcon /><span /><span /><span /></div>
      <h2>Ищем водителя...</h2>
      <p>Обычно это занимает 1–2 минуты</p>
      <div className="summary-card"><b>{tariff.title}</b><span><Money value={price} /></span><small>{pickup.title} → {destination.title}</small></div>
      <Button variant="secondary" className="wide" onClick={onCancel}>Отменить поиск</Button>
    </section>
  );
}

function AssignedScreen({ pickup, destination, price, onStart }) {
  return (
    <section className="panel-screen ride-state">
      <AppHeader title="Поездка" onBack={onStart} />
      <DriverFound />
      <MapView pickup={pickup} destination={destination} driver status="Прибудет через 3 мин" compact />
      <div className="trip-metrics"><span><b>3 мин</b><small>Приедет</small></span><span><b><Money value={price} /></b><small>Стоимость</small></span></div>
      <Button className="wide" onClick={onStart}>Начать поездку</Button>
    </section>
  );
}

function RideScreen({ pickup, destination, price, onComplete }) {
  const [notice, setNotice] = useState("");
  function shareTrip() {
    const text = `Smart Taxi: еду от ${pickup.title} до ${destination.title}.`;
    if (navigator.share) {
      navigator.share({ title: "Smart Taxi", text }).catch(() => setNotice("Ссылка на поездку подготовлена."));
      return;
    }
    navigator.clipboard?.writeText(text).then(() => setNotice("Информация о поездке скопирована.")).catch(() => setNotice("Информация о поездке подготовлена."));
  }
  return (
    <section className="panel-screen ride-state">
      <AppHeader title="Поездка" onBack={onComplete} />
      <DriverFound />
      <MapView pickup={pickup} destination={destination} driver status="Едем к месту назначения" compact />
      <div className="trip-actions"><Button variant="secondary" onClick={shareTrip}>Поделиться</Button><Button variant="secondary" onClick={() => setNotice("Оператор поддержки подключён к поездке.")}>Поддержка</Button><Button variant="danger" onClick={() => setNotice("SOS-сигнал показан оператору в UI-режиме.")}>SOS</Button></div>
      {notice && <p className="inline-status">{notice}</p>}
      <div className="summary-card"><b>Стоимость</b><span><Money value={price} /></span></div>
      <Button className="wide" onClick={onComplete}>Завершить поездку</Button>
    </section>
  );
}

function DriverFound() {
  return <article className="driver-found"><div className="avatar">И</div><span><b>Иван</b><small>Toyota Camry, белый<br />A123BC123</small></span><strong><Icon name="star" size={15} />4.9</strong></article>;
}

function CompleteScreen({ pickup, destination, price, rating, setRating, onHome }) {
  const [saved, setSaved] = useState(false);
  return (
    <section className="panel-screen">
      <AppHeader title="Поездка завершена" onBack={onHome} />
      <div className="complete-card"><p>Спасибо за поездку!</p><h1><Money value={price} /></h1></div>
      <div className="summary-card route-summary"><b>Эконом</b><span>12.4 км · 18 мин</span><small>{pickup.title} → {destination.title}</small></div>
      <div className="rating-card"><p>Как прошла поездка?</p><div>{[1,2,3,4,5].map(v => <button type="button" key={v} className={v <= rating ? "active" : ""} onClick={() => setRating(v)}><Icon name="star" /></button>)}</div><Button variant="secondary" onClick={() => setSaved(true)}>{saved ? "Отзыв сохранён" : "Оставить отзыв"}</Button></div>
      <div className="button-row"><Button variant="secondary" onClick={() => setSaved(true)}>Чек</Button><Button onClick={onHome}>Повторить поездку</Button></div>
    </section>
  );
}

function HistoryScreen({ onBack }) {
  const [tab, setTab] = useState("done");
  const trips = TRIPS.filter(t => tab === "all" || (tab === "cancelled" ? t.status === "Отменено" : t.status !== "Отменено"));
  return <section className="panel-screen"><AppHeader title="История поездок" onBack={onBack} /><div className="tabs"><button type="button" className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>Все</button><button type="button" className={tab === "done" ? "active" : ""} onClick={() => setTab("done")}>Завершённые</button><button type="button" className={tab === "cancelled" ? "active" : ""} onClick={() => setTab("cancelled")}>Отменённые</button></div><div className="trip-list">{trips.map(t => <article key={t.date}><span><b>{t.date}</b><small>{t.address}</small></span><strong>{t.price ? <Money value={t.price} /> : t.status}</strong><small>{t.tariff}</small></article>)}</div></section>;
}

function BonusScreen({ onBack, onPromo, onInvite }) {
  return <section className="panel-screen"><AppHeader title="Бонусы" onBack={onBack} right={<Icon name="support" />} /><div className="bonus-card"><span>Ваш баланс</span><h1>850 ₸</h1><SmartLogo /></div><div className="bonus-actions"><button type="button" onClick={onBack}><Icon name="clock" />История</button><button type="button" onClick={onPromo}><Icon name="gift" />Промокод</button><button type="button" onClick={onInvite}><Icon name="user" />Пригласить</button></div><div className="referral-card"><h3>Пригласите друга и получите 500 ₸</h3><p><b>1</b>Ваш друг регистрируется по ссылке</p><p><b>2</b>Он совершает первую поездку</p><p><b>3</b>Вы получаете 500 ₸ на счёт</p></div><Button className="wide" onClick={onInvite}>Пригласить друга</Button></section>;
}

function PromoScreen({ onBack }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  return <section className="panel-screen"><AppHeader title="Промокоды" onBack={onBack} /><div className="summary-card"><b>Введите промокод</b><label className="search-field"><Icon name="gift" /><input value={value} onChange={e => setValue(e.target.value)} placeholder="SMART500" /></label><Button className="wide" onClick={() => setStatus(value.trim() ? "Промокод сохранён в UI." : "Введите промокод.")}>Применить</Button>{status && <p className="inline-status">{status}</p>}</div></section>;
}

function InviteScreen({ onBack }) {
  const [copied, setCopied] = useState(false);
  return <section className="panel-screen"><AppHeader title="Пригласить друга" onBack={onBack} /><div className="referral-card"><h3>Ваш код: SMART-850</h3><p><b>1</b>Отправьте приглашение другу</p><p><b>2</b>Друг совершает первую поездку</p><p><b>3</b>На ваш баланс начисляется 500 ₸</p></div><Button className="wide" onClick={() => { navigator.clipboard?.writeText("SMART-850"); setCopied(true); }}>{copied ? "Код скопирован" : "Скопировать приглашение"}</Button></section>;
}

function NotificationsScreen({ onBack }) {
  return <section className="panel-screen"><AppHeader title="Уведомления" onBack={onBack} /><div className="list-card"><MenuRow icon="gift" title="Бонусы начислены" value="+500 ₸" onClick={onBack} /><MenuRow icon="route" title="Поездка завершена" value="650 ₸" onClick={onBack} /><MenuRow icon="support" title="Поддержка ответила" onClick={onBack} /></div></section>;
}

function SupportScreen({ onBack }) {
  const [messages, setMessages] = useState(["Здравствуйте, нужна помощь по поездке.", "Оператор Smart Taxi на связи. Опишите проблему, мы поможем."]);
  const [draft, setDraft] = useState("");
  return <section className="panel-screen support-screen"><AppHeader title="Поддержка" onBack={onBack} /><div className="chat-box">{messages.map((m, i) => <p key={`${m}-${i}`} className={i % 2 ? "" : "from-user"}>{m}<small>10:{24 + i}</small></p>)}</div><form className="chat-input" onSubmit={e => { e.preventDefault(); if (draft.trim()) { setMessages([...messages, draft.trim()]); setDraft(""); } }}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Напишите сообщение..." /><button><Icon name="route" /></button></form></section>;
}

function ProfileScreen({ onBack, setSheet }) {
  return <section className="panel-screen"><AppHeader title="Профиль" onBack={onBack} /><div className="profile-card"><div className="avatar">Д</div><span><b>Дарын</b><small>+7 (778) 417-51-36</small><button type="button" onClick={() => setSheet("profileEdit")}>Изменить данные</button></span></div><div className="list-card"><MenuRow icon="card" title="Способы оплаты" onClick={() => setSheet("payment")} /><MenuRow icon="gift" title="Бонусы" value="850 ₸" onClick={() => setSheet("bonus")} /><MenuRow icon="star" title="Промокоды" onClick={() => setSheet("promo")} /><MenuRow icon="user" title="Пригласить друга" onClick={() => setSheet("invite")} /><MenuRow icon="pin" title="Избранные адреса" onClick={() => setSheet("destination")} /><MenuRow icon="clock" title="История поездок" onClick={() => setSheet("history")} /><MenuRow icon="chat" title="Уведомления" onClick={() => setSheet("notifications")} /><MenuRow icon="support" title="Поддержка" onClick={() => setSheet("support")} /><MenuRow icon="work" title="Стать водителем" onClick={() => setSheet("driver")} /><MenuRow icon="settings" title="Настройки" onClick={() => setSheet("settings")} /><MenuRow icon="logout" title="Выйти" danger onClick={onBack} /></div></section>;
}

function ClientMenu({ onBack, setSheet }) {
  return <section className="panel-screen"><AppHeader title="Меню клиента" onBack={onBack} /><div className="list-card"><MenuRow icon="user" title="Профиль" onClick={() => setSheet("profile")} /><MenuRow icon="clock" title="История поездок" onClick={() => setSheet("history")} /><MenuRow icon="card" title="Способы оплаты" onClick={() => setSheet("payment")} /><MenuRow icon="pin" title="Избранные адреса" onClick={() => setSheet("destination")} /><MenuRow icon="gift" title="Бонусы" onClick={() => setSheet("bonus")} /><MenuRow icon="star" title="Промокоды" onClick={() => setSheet("promo")} /><MenuRow icon="user" title="Пригласить друга" onClick={() => setSheet("invite")} /><MenuRow icon="support" title="Поддержка" onClick={() => setSheet("support")} /><MenuRow icon="settings" title="Настройки" onClick={() => setSheet("settings")} /><MenuRow icon="logout" title="Выйти" danger onClick={onBack} /></div></section>;
}

function BecomeDriver({ onBack, onApply }) {
  return <section className="panel-screen"><AppHeader title="Стать водителем" onBack={onBack} /><div className="driver-hero"><VehicleIcon /><h2>Свободный график и быстрые выплаты</h2><p><Icon name="check" /> Маленькая комиссия</p><p><Icon name="check" /> Много заказов</p><p><Icon name="check" /> Поддержка 24/7</p></div><Button className="wide" onClick={onApply}>Оставить заявку</Button></section>;
}

function ProfileEditScreen({ onBack }) {
  return <section className="panel-screen"><AppHeader title="Изменить данные" onBack={onBack} /><form className="form-stack"><input placeholder="Имя" defaultValue="Дарын" /><input placeholder="Телефон" defaultValue="+7 (778) 417-51-36" /><Button className="wide" onClick={onBack}>Сохранить</Button></form></section>;
}

function SettingsScreen({ onBack }) {
  return <section className="panel-screen"><AppHeader title="Настройки" onBack={onBack} /><div className="list-card"><MenuRow icon="support" title="Язык: русский" onClick={onBack} /><MenuRow icon="shield" title="Безопасность" onClick={onBack} /><MenuRow icon="settings" title="Уведомления включены" onClick={onBack} /></div></section>;
}

function DriverApplicationScreen({ onBack }) {
  return <section className="panel-screen"><AppHeader title="Заявка водителя" onBack={onBack} /><form className="form-stack"><input placeholder="ФИО" defaultValue="Дарын Адинов" /><input placeholder="Номер телефона" defaultValue="+7 (778) 417-51-36" /><input placeholder="Марка авто" defaultValue="Toyota Camry" /><input placeholder="Госномер" defaultValue="123ABM02" /><input placeholder="Год выпуска" defaultValue="2020" /><div className="tabs"><button type="button" className="active">Личный</button><button type="button">В аренде</button></div><Button className="wide" onClick={onBack}>Отправить заявку</Button></form></section>;
}

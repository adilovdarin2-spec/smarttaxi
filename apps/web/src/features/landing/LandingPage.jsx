import React from "react";
import { Icon } from "../../core/icons.jsx";
import "./landing.css";

function goToApp() {
  window.location.href = "/order";
}

const FEATURES = [
  { icon: "clock", title: "Быстрая подача", text: "Ближайший свободный водитель уже едет к вам — среднее ожидание пара минут." },
  { icon: "cash", title: "Честная цена", text: "Фиксированная стоимость видна ещё до заказа — никаких сюрпризов по приезду." },
  { icon: "shield", title: "Проверенные водители", text: "Каждый водитель проходит проверку документов перед выходом на линию." },
  { icon: "route", title: "Точный маршрут", text: "Живая карта и статус поездки от подачи машины до завершения поездки." }
];

const STEPS = [
  { title: "Укажите, куда едете", text: "Отметьте точку подачи и адрес назначения на карте — вручную или поиском по улице." },
  { title: "Выберите тариф", text: "Эконом, Комфорт, Бизнес или Доставка — стоимость показывается сразу, до подтверждения." },
  { title: "Водитель уже в пути", text: "Следите за машиной на карте в реальном времени и получайте уведомления по каждому шагу." }
];

const TARIFFS = [
  { icon: "user", name: "Эконом", desc: "Быстро и выгодно" },
  { icon: "star", name: "Комфорт", desc: "Больше комфорта" },
  { icon: "shield", name: "Бизнес", desc: "Премиальная поездка" },
  { icon: "gift", name: "Доставка", desc: "Посылки и грузы до 20 кг" }
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-shell landing-header-row">
          <div className="landing-brand">
            <img src="/brand/smarttaxi_app_icon_2026.png" alt="SmartTaxi" />
            <span>Smart<em>Taxi</em></span>
          </div>
          <nav className="landing-nav">
            <a href="#features">Возможности</a>
            <a href="#how">Как это работает</a>
            <a href="#tariffs">Тарифы</a>
            <a href="/driver">Водителям</a>
          </nav>
          <button type="button" className="landing-cta" onClick={goToApp}>Заказать поездку</button>
        </div>
      </header>

      <section className="landing-shell landing-hero">
        <div>
          <span className="landing-eyebrow"><Icon name="pin" size={14} /> Такси в вашем городе</span>
          <h1>Поездка за пару минут,<br /><em>без лишних шагов</em></h1>
          <p className="lead">
            SmartTaxi показывает цену ещё до заказа, находит ближайшего свободного
            водителя и ведёт всю поездку на карте — прямо в браузере, без установки
            приложения.
          </p>
          <div className="landing-hero-actions">
            <button type="button" className="landing-cta big" onClick={goToApp}>Заказать поездку</button>
            <button type="button" className="landing-cta ghost big" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
              Как это работает
            </button>
          </div>
          <div className="landing-trust">
            <div><Icon name="shield" size={16} /> Проверенные водители</div>
            <div><Icon name="cash" size={16} /> Фиксированная цена</div>
            <div><Icon name="clock" size={16} /> Подача за минуты</div>
          </div>
        </div>
        <div className="landing-mock-wrap">
          <div className="landing-mock">
            <div className="landing-mock-notch" />
            <div className="landing-mock-screen">
              <div className="landing-mock-map">
                <div className="landing-mock-route" />
                <div className="landing-mock-pin" />
              </div>
              <div className="landing-mock-sheet">
                <div className="row">
                  <span className="dot" />
                  <span className="txt">Точка на карте<small>ОТКУДА</small></span>
                </div>
                <div className="row">
                  <span className="dot sq" />
                  <span className="txt">Куда едем?<small>Выберите адрес</small></span>
                </div>
                <div className="landing-mock-cta">Указать куда</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section landing-shell">
        <div className="landing-section-head">
          <h2>Почему выбирают SmartTaxi</h2>
          <p>Всё, что важно в поездке — цена, скорость и безопасность — видно сразу.</p>
        </div>
        <div className="landing-features">
          {FEATURES.map(f => (
            <div className="landing-feature-card" key={f.title}>
              <div className="landing-feature-icon"><Icon name={f.icon} size={22} /></div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="landing-section landing-shell">
        <div className="landing-section-head">
          <h2>Как это работает</h2>
          <p>Три шага от адреса до поездки.</p>
        </div>
        <div className="landing-steps">
          {STEPS.map((s, i) => (
            <div className="landing-step" key={s.title}>
              <div className="landing-step-num">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tariffs" className="landing-section landing-shell">
        <div className="landing-section-head">
          <h2>Тариф под любую поездку</h2>
          <p>От короткой поездки по городу до доставки посылки.</p>
        </div>
        <div className="landing-tariffs">
          {TARIFFS.map(t => (
            <div className="landing-tariff-card" key={t.name}>
              <Icon name={t.icon} size={26} />
              <div className="name">{t.name}</div>
              <p className="desc">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-shell" style={{ paddingBottom: 64 }}>
        <div className="landing-banner">
          <div>
            <h2>Готовы поехать?</h2>
            <p>Укажите адрес — и через пару минут водитель уже будет на месте.</p>
          </div>
          <button type="button" className="landing-cta ghost big" onClick={goToApp}>Заказать поездку</button>
        </div>
      </section>

      <footer className="landing-footer landing-shell">
        <div className="landing-footer-grid">
          <div>
            <div className="landing-footer-brand">
              <img src="/brand/smarttaxi_app_icon_2026.png" alt="SmartTaxi" />
              <span>SmartTaxi</span>
            </div>
            <p className="muted">Сервис поездок для клиентов и водителей. Наличные и Kaspi, поддержка 24/7.</p>
          </div>
          <div>
            <h4>Сервис</h4>
            <ul>
              <li><a href="/order">Заказать поездку</a></li>
              <li><a href="/driver">Стать водителем</a></li>
            </ul>
          </div>
          <div>
            <h4>Документы</h4>
            <ul>
              <li><a href="/legal">Юридическая информация</a></li>
              <li><a href="/legal/privacy">Политика конфиденциальности</a></li>
              <li><a href="/legal/terms">Условия использования</a></li>
            </ul>
          </div>
          <div>
            <h4>Поддержка</h4>
            <ul>
              <li><a href="/order">Помощь по поездке</a></li>
            </ul>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} SmartTaxi</span>
          <span>Казахстан</span>
        </div>
      </footer>
    </div>
  );
}

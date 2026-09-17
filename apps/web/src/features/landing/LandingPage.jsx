import React from "react";
import { Icon } from "../../core/icons.jsx";
import "./landing.css";

const STEPS = [
  { icon: "pin", title: "Куда поедем?", text: "Найдите адрес или выберите точку на карте. Укажите, где вас забрать и куда отвезти." },
  { icon: "cash", title: "Выберите своё", text: "Сравните доступные тарифы. Стоимость поездки в тенге — до подтверждения заказа." },
  { icon: "route", title: "Оставайтесь в курсе", text: "После назначения водителя следите за подачей машины и статусом поездки в приложении." },
];

function Arrow() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function RideLink({ light = false, children = "В путь" }) {
  return <a className={`landing-cta${light ? " landing-cta-light" : ""}`} href="/order">{children}<Arrow /></a>;
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <a className="landing-skip" href="#main">Перейти к содержимому</a>
      <header className="landing-header">
        <div className="landing-shell landing-header-row">
          <a className="landing-brand" href="/" aria-label="BaiSapar — главная"><img src="/brand/baisapar_lockup.svg" alt="BaiSapar" width="170" height="32" /></a>
          <nav className="landing-nav" aria-label="Главная навигация"><a href="#how">Как это работает</a><a href="#tariffs">Тарифы</a><a href="/driver">Водителям</a></nav>
          <a className="landing-header-link" href="/order">Открыть такси <Arrow /></a>
        </div>
      </header>
      <main id="main">
        <section className="landing-shell landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow"><span /> ВАШ ГОРОД. ВАШ РИТМ.</span>
            <h1 id="landing-title">Ваши планы.<br /><em>Наша дорога.</em></h1>
            <p className="landing-lead">На работу, к близким или навстречу новому.<br className="landing-desktop-break" /> Поездки с BaiSapar — прямо в браузере.</p>
            <div className="landing-hero-actions"><RideLink /><span>Откроется веб-приложение.<br />Ничего скачивать не нужно.</span></div>
            <a className="landing-text-link" href="#how">Знакомьтесь с BaiSapar <span aria-hidden="true">↓</span></a>
          </div>
          <div className="landing-hero-art" aria-hidden="true">
            <div className="landing-art-top"><span>ХОРОШЕГО ПУТИ</span><img src="/brand/baisapar_mark_white.svg" alt="" width="42" height="42" /></div>
            <div className="landing-art-word">Поехали.</div>
            <div className="landing-road"><span /><span /><span /></div>
            <img className="landing-hero-car" src="/cars/tariff_comfort_unbranded_v2.png" alt="" width="768" height="512" fetchPriority="high" />
            <div className="landing-art-bottom"><span>BaiSapar</span><span>Каждый день — новый маршрут <Arrow /></span></div>
          </div>
        </section>
        <div className="landing-shell"><div className="landing-highlights" aria-label="О сервисе"><div><Icon name="pin" /><span>Адрес или точка на карте</span></div><div><Icon name="cash" /><span>Стоимость в тенге</span></div><div><Icon name="route" /><span>Вся поездка в одном месте</span></div></div></div>
        <section id="how" className="landing-shell landing-section" aria-labelledby="landing-how-title">
          <div className="landing-section-head"><div><span className="landing-eyebrow">ПРОСТО НАЧАТЬ</span><h2 id="landing-how-title">Меньше действий.<br />Больше движения.</h2></div><p>От первого адреса до места назначения.<br />Всё нужное — под рукой.</p></div>
          <ol className="landing-steps">{STEPS.map((step, index) => <li key={step.title}><div className="landing-step-top"><span>0{index + 1}</span><Icon name={step.icon} size={24} /></div><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        </section>
        <section id="tariffs" className="landing-tariff-section" aria-labelledby="landing-tariffs-title">
          <div className="landing-shell landing-section">
            <div className="landing-section-head"><div><span className="landing-eyebrow">ПОЕЗДКА ПОД ВАШИ ПЛАНЫ</span><h2 id="landing-tariffs-title">В своём темпе.<br />В своём комфорте.</h2></div><a className="landing-text-link" href="/order">Посмотреть стоимость <Arrow /></a></div>
            <div className="landing-tariffs">
              <article className="landing-tariff"><div><span className="landing-tariff-label">НА КАЖДЫЙ ДЕНЬ</span><h3>Эконом</h3><p>Для привычных маршрутов<br />и повседневных дел.</p></div><img src="/cars/tariff_economy_unbranded_v2.png" alt="Автомобиль тарифа Эконом — иллюстрация" width="768" height="512" loading="lazy" /></article>
              <article className="landing-tariff landing-tariff-comfort"><div><span className="landing-tariff-label">КОГДА ХОЧЕТСЯ БОЛЬШЕ</span><h3>Комфорт</h3><p>Для поездок, в которых<br />важен дополнительный комфорт.</p></div><img src="/cars/tariff_comfort_unbranded_v2.png" alt="Автомобиль тарифа Комфорт — иллюстрация" width="768" height="512" loading="lazy" /></article>
            </div>
            <p className="landing-caption">Доступность тарифов и стоимость зависят от региона и маршрута. Изображения автомобилей иллюстративные.</p>
          </div>
        </section>
        <section className="landing-shell landing-section landing-driver" aria-labelledby="landing-driver-title">
          <div className="landing-driver-symbol" aria-hidden="true"><img src="/brand/baisapar_mark.svg" alt="" width="120" height="120" /></div>
          <div><span className="landing-eyebrow">ПО ДРУГУЮ СТОРОНУ РУЛЯ</span><h2 id="landing-driver-title">Вы водитель?<br />Вам тоже сюда.</h2><p>Заказы, маршрут и статусы поездки — в водительской версии BaiSapar.</p></div>
          <a className="landing-driver-link" href="/driver">Кабинет водителя <Arrow /></a>
        </section>
        <section className="landing-shell landing-final" aria-labelledby="landing-final-title"><div className="landing-banner"><div><span className="landing-eyebrow">BAISAPAR · ХОРОШЕГО ПУТИ</span><h2 id="landing-final-title">Куда сегодня?</h2><p>Ваш следующий маршрут начинается здесь.</p></div><RideLink light /></div></section>
      </main>
      <footer className="landing-shell landing-footer">
        <div className="landing-footer-top"><div><img src="/brand/baisapar_lockup.svg" alt="BaiSapar" width="170" height="32" /><p>Ваши планы. Наша дорога.</p></div><nav aria-label="Сервис"><a href="/order">Заказать поездку</a><a href="/driver">Водителям</a></nav><nav aria-label="Документы"><a href="/legal">Юридическая информация</a><a href="/legal/privacy">Конфиденциальность</a><a href="/legal/terms">Условия использования</a></nav></div>
        <div className="landing-footer-bottom"><span>© {new Date().getFullYear()} BaiSapar</span><span>Казахстан</span></div>
      </footer>
    </div>
  );
}

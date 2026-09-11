import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../core/ui.jsx";
import { Icon } from "../../core/icons.jsx";
import { navigationDistance, navigationFixIsFresh, navigationInstruction, navigationProgress, nextNavigationStep } from "./navigationProgress.js";
import "./driverNavigator.css";

function ManeuverIcon({ name }) {
  const path = {
    left: "M23 27V15a5 5 0 0 0-5-5H7m7-6-7 6 7 6",
    right: "M9 27V15a5 5 0 0 1 5-5h11m-7-6 7 6-7 6",
    straight: "M16 27V5m-7 8 7-8 7 8",
    uturn: "M23 27V12a7 7 0 0 0-14 0v9m-5-5 5 6 5-6",
    roundabout: "M12 28v-6a9 9 0 1 1 13-8m-5-6 5 6 3-7",
    finish: "M8 28V4m1 1h17l-4 6 4 6H9",
    route: "M8 27V16a5 5 0 0 1 5-5h6a5 5 0 0 0 5-5V3m-4 4 4-4 4 4"
  }[name] || "M16 27V5m-7 8 7-8 7 8";
  return <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

export default function DriverNavigator({ order, route, routeUnavailable = false, position, locationIssue, error, nextAction, loading, onNext, onClose, onRetryGPS, MapComponent }) {
  const [now, setNow] = useState(Date.now);
  const [following, setFollowing] = useState(true);
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const escape = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => { window.clearInterval(timer); window.removeEventListener("keydown", escape); };
  }, [onClose]);

  const fresh = navigationFixIsFresh(position?.timestamp, now);
  const accurate = fresh && Number.isFinite(position?.accuracy) && position.accuracy <= 60;
  const progress = useMemo(() => accurate && !locationIssue ? navigationProgress(route, position) : null, [route, position, accurate, locationIssue]);
  const maneuver = useMemo(() => nextNavigationStep(route, progress), [route, progress]);
  const instruction = navigationInstruction(maneuver?.step);
  const target = route?.phase === "to_dropoff" || order.status === "TRIP_STARTED" ? order.dropoff : order.pickup;
  const phaseLabel = order.status === "TRIP_STARTED" ? "К месту назначения" : "К точке подачи";
  const roadRoute = route && !route.fallback && route.providerStatus !== "Fallback" ? route : null;
  const notice = locationIssue ? { title: locationIssue.title, detail: locationIssue.description, retry: true }
    : !fresh ? { title: "Нет свежего GPS", detail: "Проверьте геолокацию. Ждём новый сигнал GPS.", retry: true }
    : !accurate ? { title: "Уточняем местоположение", detail: "Точность GPS недостаточна для подсказок о поворотах.", retry: true }
    : !roadRoute ? { title: route || routeUnavailable ? "Маршрут недоступен" : "Строим маршрут", detail: routeUnavailable ? "Не удалось получить маршрут. Проверьте интернет; повторяем запрос автоматически." : "Ждём дорогу от сервиса маршрутов. Повороты по прямой линии не рассчитываются." }
    : !progress ? { title: "Перестраиваем маршрут", detail: "Машина вне прежнего пути. Ждём маршрут от новых координат." }
    : null;
  const seconds = progress?.durationSeconds;
  const arrival = Number.isFinite(seconds) ? new Date(now + seconds * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
  const speed = accurate && Number.isFinite(position?.speed) ? Math.round(position.speed * 3.6) : null;
  const bearing = accurate && position.speed >= 3 && Number.isFinite(position.heading) ? position.heading : null;

  return <section className={`driver-navigator${notice ? " has-navigation-notice" : ""}`} aria-label="Навигация по текущей поездке">
    <header className="driver-navigator-top">
      <div className="driver-navigator-toolbar">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Вернуться к заказу"><Icon name="back" /></button>
        <div><strong>{phaseLabel}</strong><span>SmartTaxi · Навигация</span></div>
        <span className={`driver-navigator-gps ${notice ? "uncertain" : ""}`}>{notice ? "GPS / маршрут" : "GPS"}</span>
      </div>
      {notice ? <div className="driver-navigator-notice" role="status">
        <strong>{notice.title}</strong><p>{notice.detail}</p>
        {notice.retry && <button type="button" onClick={onRetryGPS}>Повторить GPS</button>}
      </div> : <div className="driver-navigator-maneuver">
        <span className="driver-navigator-arrow"><ManeuverIcon name={instruction.icon} /></span>
        <div><strong>{maneuver ? (maneuver.distanceMeters <= 40 ? "Сейчас" : navigationDistance(maneuver.distanceMeters)) : "По маршруту"}</strong>
          <h1>{instruction.text}</h1>
          <p>{maneuver?.step.streetName || (maneuver ? "" : "Детальные подсказки недоступны")}</p>
        </div>
      </div>}
      {error && <p className="driver-navigator-action-error" role="alert">{error}</p>}
      {routeUnavailable && roadRoute && !notice && <p className="driver-navigator-action-error" role="status">Не удалось обновить маршрут. Показан последний полученный путь; повторяем запрос.</p>}
    </header>
    <div className="driver-navigator-map">
      <MapComponent destination={order.status === "TRIP_STARTED" ? order.destinationPoint : order.pickupPoint}
        driver={fresh ? { ...position, heading: bearing } : null} route={roadRoute}
        center={position || order.pickupPoint} compact navigationMode followDriver={following && accurate}
        onFollowChange={setFollowing} />
      <button className="driver-navigator-recenter" type="button" disabled={!accurate}
        onClick={() => setFollowing(true)} aria-label="Вернуться к машине" aria-pressed={following}>
        <Icon name="pin" /><span>{following ? "За машиной" : "К машине"}</span>
      </button>
    </div>
    <footer className="driver-navigator-bottom">
      <div className="driver-navigator-trip-info">
      <div className="driver-navigator-target"><Icon name="pin" /><div><small>{phaseLabel}</small><strong>{target}</strong></div></div>
      {!accurate ? <p className="driver-navigator-metrics-empty">Скорость и время прибытия появятся после получения точного GPS.</p> : <div className="driver-navigator-metrics">
        <div className="driver-navigator-speed"><strong>{speed ?? "—"}</strong><small>км/ч</small></div>
        <div><strong>{progress ? navigationDistance(progress.distanceMeters) : "—"}</strong><small>осталось</small></div>
        <div><strong>{Number.isFinite(seconds) ? `${Math.max(1, Math.ceil(seconds / 60))} мин` : "—"}</strong><small>прибытие {arrival}</small></div>
      </div>}
      </div>
      {nextAction && <Button onClick={onNext} disabled={Boolean(loading)}>{loading === "next" ? "Сохраняем…" : nextAction.label}</Button>}
    </footer>
  </section>;
}

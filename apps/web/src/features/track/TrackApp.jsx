import React, { useEffect, useState } from "react";
import SmartTaxiLogo from "../../components/ui/SmartTaxiLogo.jsx";
import MapView from "../map/MapView.jsx";
import { api } from "../../lib/api.js";
import { sanitizeAddressText } from "../../lib/text.js";

const STATUS_LABELS = {
  SEARCHING_DRIVER: "Ищем водителя",
  NEW: "Ищем водителя",
  DRIVER_FOUND: "Водитель найден",
  DRIVER_ASSIGNED: "Водитель найден",
  DRIVER_GOING_TO_CLIENT: "Водитель едет к пассажиру",
  DRIVER_ARRIVED: "Водитель на месте",
  WAITING_CLIENT: "Ожидание пассажира",
  TRIP_STARTED: "В поездке",
  IN_PROGRESS: "В поездке",
  TRIP_COMPLETED: "Поездка завершена",
  PAYMENT_PENDING: "Поездка завершена",
  PAID: "Поездка завершена",
  RATED: "Поездка завершена",
  COMPLETED: "Поездка завершена",
  CANCELLED: "Поездка отменена",
  CANCELLED_BY_CLIENT: "Поездка отменена",
  CANCELLED_BY_DRIVER: "Поездка отменена",
  CANCELLED_BY_OPERATOR: "Поездка отменена",
  NO_SHOW: "Поездка отменена"
};

function statusLabel(status) {
  return STATUS_LABELS[status] || "Статус обновляется";
}

// Same rounding convention as the driver/client apps: distance to one decimal
// km, duration rounded up to whole minutes so a live route never displays
// "0 мин" while the driver is still on the way.
function formatDistanceKm(route) {
  if (!route?.distanceMeters) return "";
  return `${(Number(route.distanceMeters) / 1000).toFixed(1)} км`;
}

function formatDurationMin(route) {
  if (!route?.durationSeconds) return "";
  return `${Math.max(1, Math.ceil(Number(route.durationSeconds) / 60))} мин`;
}

function validPoint(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return Number.isFinite(parsedLat) && Number.isFinite(parsedLng) ? { lat: parsedLat, lng: parsedLng } : null;
}

export default function TrackApp() {
  const token = window.location.pathname.split("/").filter(Boolean)[1] || "";
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Ссылка на поездку неверна.");
      setLoading(false);
      return undefined;
    }
    let alive = true;
    let hasLoadedOnce = false;
    async function load() {
      try {
        const data = await api(`/api/orders/track/${token}`);
        if (alive) {
          setTrip(data.trip && {
            ...data.trip,
            pickupText: sanitizeAddressText(data.trip.pickupText, "Точка посадки"),
            dropoffText: sanitizeAddressText(data.trip.dropoffText, "Точка назначения")
          });
          setError("");
          hasLoadedOnce = true;
        }
      } catch (err) {
        // A transient failure on a later poll shouldn't wipe an already
        // displayed trip — only surface the error while nothing has loaded yet.
        if (alive && !hasLoadedOnce) setError(err.message || "Не удалось загрузить поездку.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [token]);

  const pickupPoint = trip ? validPoint(trip.pickupLat, trip.pickupLng) : null;
  const dropoffPoint = trip ? validPoint(trip.dropoffLat, trip.dropoffLng) : null;
  const driverPoint = trip?.driverLocation ? validPoint(trip.driverLocation.lat, trip.driverLocation.lng) : null;
  const hasMap = Boolean(pickupPoint || dropoffPoint);
  const routeSummary = [formatDurationMin(trip?.route), formatDistanceKm(trip?.route)].filter(Boolean).join(" · ");

  return (
    <main className="track-shell">
      <section className="track-card">
        <SmartTaxiLogo />
        {loading && <p className="track-muted">Загружаем поездку...</p>}
        {!loading && error && <p className="track-error">{error}</p>}
        {!loading && !error && trip && (
          <>
            <h1>{statusLabel(trip.status)}</h1>
            {hasMap && (
              <div className="track-map-wrap">
                <MapView
                  pickup={pickupPoint}
                  destination={dropoffPoint}
                  driver={driverPoint}
                  route={trip.route}
                  center={driverPoint || pickupPoint || dropoffPoint}
                  compact
                  status={routeSummary}
                />
              </div>
            )}
            <div className="track-route">
              <div><i className="pickup-dot" /><span>{trip.pickupText}</span></div>
              <div><i className="dropoff-dot" /><span>{trip.dropoffText}</span></div>
            </div>
            {trip.driverName && (
              <div className="track-driver">
                <strong>{trip.driverName}</strong>
                <span>{[trip.driverCar, trip.driverPlate].filter(Boolean).join(" · ")}</span>
              </div>
            )}
            <p className="track-note">Страница обновляется автоматически каждые 5 секунд.</p>
          </>
        )}
      </section>
    </main>
  );
}

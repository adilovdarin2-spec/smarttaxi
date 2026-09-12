import React, { useCallback, useEffect, useRef, useState } from "react";
import { createSocket } from "../../lib/socket.js";

// MapLibre is a megabyte of JavaScript. The rest of this screen — the lines,
// the cars, the phone numbers — must not wait on it, and a rider who never
// opens Стоянки should never download it. Same lazy boundary the client app
// uses for its own maps.
const LazyMapView = React.lazy(() => import("../map/MapView.jsx"));

function StandsMap(props) {
  return (
    <React.Suspense fallback={<div className="map-deferred-fallback" role="status">Подготавливаем карту…</div>}>
      <LazyMapView {...props} />
    </React.Suspense>
  );
}
import {
  cancelStandReservation,
  getMyStandReservation,
  getStand,
  getStands,
  reserveStandSeat,
} from "../../lib/mvpApi.js";
import { carsLabel, freeSeatsLabel, seatsLabel } from "../shared/standFormat.mjs";

// The rider's side of a stand in the browser. A stand is a place people
// already know: the cars by the bazaar that leave for Шымкент once they fill
// up. This lists those places, the cars loading in each, and gives the two
// ways a seat is actually taken — call the driver, or claim a seat and let
// them confirm it.

const REFRESH_INTERVAL_MS = 20_000;
const KIND_LABELS = { CITY: "По городу", INTERCITY: "Межгород" };

function formatError(error) {
  return error?.message || "Не удалось выполнить действие";
}

export default function ClientStandsSection({ authenticated, regionId, onLogin, onHome }) {
  const [stands, setStands] = useState([]);
  const [openStand, setOpenStand] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const mountedRef = useRef(true);
  const openIdRef = useRef(null);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!authenticated) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [list, mine] = await Promise.all([
        getStands({ regionId: regionId || undefined }),
        getMyStandReservation(),
      ]);
      if (!mountedRef.current) return;
      setStands(list.stands || []);
      setReservation(mine.reservation || null);
      if (openIdRef.current) {
        const view = await getStand(openIdRef.current);
        if (mountedRef.current && openIdRef.current === view.stand.id) setOpenStand(view);
      }
      setError("");
    } catch (loadError) {
      if (!mountedRef.current) return;
      if (!silent) setError(formatError(loadError));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [authenticated, regionId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!authenticated) return undefined;
    const timer = setInterval(() => load({ silent: true }), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [authenticated, load]);

  // Free seats are the whole reason to look at this screen, and they change as
  // other people take them. The interval above remains the fallback.
  useEffect(() => {
    if (!authenticated) return undefined;
    const socket = createSocket();
    const refresh = () => load({ silent: true });
    const join = () => {
      if (regionId) socket.emit("join_region_stands", { regionId });
      if (openIdRef.current) socket.emit("join_stand", { standId: openIdRef.current });
    };
    socket.on("connect", join);
    [
      "stand_queue_updated",
      "stand_reservation_confirmed",
      "stand_reservation_declined",
      "stand_reservation_cancelled",
      "stand_reservation_expired"
    ].forEach(event => socket.on(event, refresh));
    join();
    return () => socket.disconnect();
  }, [authenticated, regionId, load]);

  async function openStandById(standId) {
    setActionError("");
    try {
      const view = await getStand(standId);
      if (!mountedRef.current) return;
      openIdRef.current = standId;
      setOpenStand(view);
    } catch (openError) {
      if (mountedRef.current) setActionError(formatError(openError));
    }
  }

  function closeStand() {
    openIdRef.current = null;
    setOpenStand(null);
  }

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await action();
      await load({ silent: true });
    } catch (runError) {
      if (mountedRef.current) setActionError(formatError(runError));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <section className="client-stands">
        <header className="client-stands-header">
          <h1>Стоянки</h1>
          <p>Машины, которые набирают пассажиров по городу и на межгород.</p>
        </header>
        <div className="client-stand-empty">
          <strong>Войдите в аккаунт</strong>
          <p>Стоянки и брони доступны после входа.</p>
          <button type="button" className="client-stand-primary" onClick={onLogin}>Войти</button>
        </div>
      </section>
    );
  }

  return (
    <section className="client-stands">
      <header className="client-stands-header">
        <h1>Стоянки</h1>
        <p>Машины, которые набирают пассажиров по городу и на межгород.</p>
      </header>

      {error && <div className="client-stand-error" role="alert">{error}</div>}
      {actionError && <div className="client-stand-error" role="alert">{actionError}</div>}

      {reservation && (
        <article className={`client-stand-reservation${reservation.status === "CONFIRMED" ? " confirmed" : ""}`}>
          <strong>Ваша бронь на стоянке</strong>
          <span>{reservation.standName} · {seatsLabel(reservation.seats)}</span>
          <em>
            {reservation.status === "CONFIRMED"
              ? "Место подтверждено"
              : "Ждём подтверждения водителя"}
          </em>
          {(reservation.driver?.carModel || reservation.driver?.plate) && (
            <p>{[reservation.driver?.carColor, reservation.driver?.carModel, reservation.driver?.plate].filter(Boolean).join(" · ")}</p>
          )}
          <div className="client-stand-reservation-actions">
            {reservation.driver?.phone && (
              <a className="client-stand-call" href={`tel:${reservation.driver.phone}`}>Позвонить</a>
            )}
            <button
              type="button"
              className="client-stand-ghost"
              disabled={busy}
              onClick={() => run(() => cancelStandReservation(reservation.id))}
            >
              Отменить бронь
            </button>
          </div>
        </article>
      )}

      {stands.length > 0 && (
        <div className="client-stands-map">
          <StandsMap stands={stands} onStandClick={openStandById} compact />
        </div>
      )}

      {loading && !stands.length ? (
        <div className="client-stand-empty"><strong>Загружаем стоянки…</strong></div>
      ) : !stands.length ? (
        <div className="client-stand-empty">
          <strong>Стоянок нет</strong>
          <p>В этом регионе стоянки ещё не добавлены.</p>
          {onHome && <button type="button" className="client-stand-ghost" onClick={onHome}>На главную</button>}
        </div>
      ) : (
        <div className="client-stand-list">
          {stands.map(stand => (
            <button key={stand.id} type="button" className="client-stand-row" onClick={() => openStandById(stand.id)}>
              <span className="client-stand-row-main">
                <strong>{stand.name}</strong>
                <em>{KIND_LABELS[stand.kind] || stand.kind} · {carsLabel(stand.driversCount)}</em>
              </span>
              {stand.freeSeats > 0 && <span className="client-stand-badge">{freeSeatsLabel(stand.freeSeats)}</span>}
            </button>
          ))}
        </div>
      )}

      {openStand && (
        <StandSheet
          view={openStand}
          reservation={reservation}
          busy={busy}
          onClose={closeStand}
          onReserve={(entryId, seats) => run(async () => {
            await reserveStandSeat(entryId, { seats });
            closeStand();
          })}
        />
      )}
    </section>
  );
}

function StandSheet({ view, reservation, busy, onClose, onReserve }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector("button")?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
      }
    }
    dialog?.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog?.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  // Only cars that are actually loading can take a passenger; the rest of the
  // line is waiting its turn, and offering a seat in one would promise
  // something its driver cannot deliver.
  const boarding = (view.entries || []).filter(entry => entry.status === "BOARDING");

  return (
    <div className="client-stand-backdrop" role="presentation">
      <div className="client-stand-sheet" role="dialog" aria-modal="true" aria-label={view.stand.name} ref={dialogRef}>
        <header>
          <div>
            <h2>{view.stand.name}</h2>
            <span>{KIND_LABELS[view.stand.kind] || view.stand.kind}</span>
          </div>
          <button type="button" className="client-stand-close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        {view.stand.note && <p className="client-stand-note">{view.stand.note}</p>}

        <h3>Машины на стоянке</h3>
        {!boarding.length ? (
          <p className="client-stand-note">Сейчас на стоянке нет машин, готовых принять пассажиров.</p>
        ) : (
          boarding.map(entry => (
            <article key={entry.id} className="client-stand-car">
              <div className="client-stand-car-head">
                <div>
                  <strong>{entry.destinationLabel || "Направление не указано"}</strong>
                  <em>{entry.pricePerSeat == null ? "Цена по договорённости" : `${entry.pricePerSeat} ₸ за место`}</em>
                </div>
                <span className={entry.freeSeats > 0 ? "client-stand-badge" : "client-stand-badge muted"}>
                  {freeSeatsLabel(entry.freeSeats)}
                </span>
              </div>
              <p>{[entry.driver?.name, entry.driver?.carColor, entry.driver?.carModel, entry.driver?.plate].filter(Boolean).join(" · ")}</p>
              {entry.comment && <p className="client-stand-note">{entry.comment}</p>}
              <div className="client-stand-car-actions">
                <a className="client-stand-call" href={`tel:${entry.driver?.phone || ""}`}>Позвонить</a>
                <select
                  aria-label="Сколько мест"
                  defaultValue="1"
                  id={`seats-${entry.id}`}
                  disabled={busy || Boolean(reservation) || entry.freeSeats <= 0}
                >
                  {Array.from({ length: Math.max(1, Math.min(entry.freeSeats, 8)) }, (_, index) => index + 1).map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="client-stand-primary"
                  disabled={busy || Boolean(reservation) || entry.freeSeats <= 0}
                  onClick={() => {
                    const select = document.getElementById(`seats-${entry.id}`);
                    onReserve(entry.id, Number(select?.value || 1));
                  }}
                >
                  Забронировать место
                </button>
              </div>
            </article>
          ))
        )}
        <p className="client-stand-note">Позвоните водителю и скажите, когда подойдёте.</p>
      </div>
    </div>
  );
}

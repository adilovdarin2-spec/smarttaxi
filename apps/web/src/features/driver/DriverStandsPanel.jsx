import React, { useCallback, useEffect, useRef, useState } from "react";
import { createSocket } from "../../lib/socket.js";
import { getToken } from "../../lib/api.js";
import { StandSync } from "../shared/standSync.mjs";
import { standOutcomeNotice, standOutcomeMessages } from '../shared/standOutcome.mjs';
import { freshStandPosition } from "../shared/standLocation.mjs";
import {
  addStandSeats,
  departStandQueue,
  getDriverStands,
  getMyStandPlace,
  getStandEntryOutcome,
  handOverStandTurn,
  joinStandQueue,
  leaveStandQueue,
  publishStandPresence,
  releaseStandSeats,
  respondStandReservation,
  updateStandOffer,
} from "../../lib/mvpApi.js";
import {
  carsInLine,
  distanceMeters,
  freeSeatsLabel,
  metresLabel as metres,
  plural,
} from "../shared/standFormat.mjs";

// The driver's side of a stand in the browser: the same line the phone app
// shows, so a driver working from a laptop or an older device is not cut out
// of the feature. A stand is a place, so everything here is gated on actually
// being at it — the server refuses otherwise, and a button that only ever
// produces a refusal is worse than no button.

const PRESENCE_INTERVAL_MS = 25_000;
const REFRESH_INTERVAL_MS = 20_000;
const KIND_LABELS = { CITY: "По городу", INTERCITY: "Межгород" };

function formatError(error) {
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(error?.message || '')) {
    return 'Не удалось связаться с сервером. Проверьте соединение и обновите данные.';
  }
  return error?.message || "Не удалось выполнить действие";
}

export default function DriverStandsPanel({ regionId, isOnline, position, onGoToLine }) {
  const [stands, setStands] = useState([]);
  const [place, setPlace] = useState({ entry: null, stand: null, queue: [] });
  const [presence, setPresence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState(null);
  const previousEntryRef = useRef(null);
  const [offerDraft, setOfferDraft] = useState(null);
  const mountedRef = useRef(true);
  const feedbackRef = useRef(null);
  const syncRef = useRef(null);
  if (!syncRef.current) syncRef.current = new StandSync(getToken);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    if (busy || (!blocked && !actionError)) return undefined;
    const frame = requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [busy, blocked, actionError]);

  useEffect(() => {
    mountedRef.current = true;
    syncRef.current.activate();
    setBlocked(true);
    setBusy(false);
    setStands([]);
    setPlace({ entry: null, stand: null, queue: [] });
    previousEntryRef.current = null;
    setNotice(null);
    return () => { mountedRef.current = false; syncRef.current.dispose(); };
  }, [regionId]);

  const load = useCallback(async ({ silent = false, reconcile = false } = {}) => {
    const ticket = syncRef.current.beginRead({ reconcile });
    if (!ticket) return;
    if (!silent) setLoading(true);
    try {
      const [mine, list] = await Promise.all([
        getMyStandPlace(),
        getDriverStands({
          regionId: regionId || undefined,
          lat: positionRef.current?.lat,
          lng: positionRef.current?.lng,
        }),
      ]);
      if (!Array.isArray(list.stands) || !Object.hasOwn(mine, 'entry')) {
        throw new Error('Сервер не подтвердил состояние стоянки');
      }
      if (!syncRef.current.currentRead(ticket)) return;
      const previous = previousEntryRef.current;
      let outcome;
      if (previous && !mine.entry) {
        try { outcome = (await getStandEntryOutcome(previous)).outcome; } catch { /* Keep the confirmed empty state with neutral wording. */ }
      }
      if (!syncRef.current.settleRead(ticket, true)) return;
      if (mine.entry) setNotice(null);
      else if (previous) setNotice(standOutcomeNotice(outcome, previous, true));
      previousEntryRef.current = mine.entry?.id || null;
      setPlace({ entry: mine.entry || null, stand: mine.stand || null, queue: mine.queue || [] });
      setStands(list.stands || []);
      setBlocked(false);
      setError("");
    } catch (loadError) {
      if (!syncRef.current.settleRead(ticket, false)) return;
      setBlocked(true);
      setError(formatError(loadError));
    } finally {
      if (syncRef.current.currentRead(ticket)) setLoading(false);
    }
  }, [regionId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load({ silent: true }), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // A booking request arrives while the driver is looking at this screen, and
  // waiting out the poll makes the rider stand there wondering. The socket is
  // what the phone app uses; the interval above stays as the safety net for a
  // dropped connection.
  const standId = place.stand?.id || null;
  useEffect(() => {
    const socket = createSocket();
    const refresh = () => load({ silent: true });
    const join = () => {
      if (standId) socket.emit("join_stand", { standId });
      if (regionId) socket.emit("join_region_stands", { regionId });
    };
    socket.on("connect", join);
    [
      "stand_queue_updated_driver",
      "stand_queue_updated",
      "stand_reservation_created",
      "stand_reservation_cancelled",
      "stand_reservation_expired",
      "stand_turn_started",
      "stand_place_lost"
    ].forEach(event => socket.on(event, refresh));
    join();
    return () => {
      if (standId) socket.emit("leave_stand", { standId });
      socket.disconnect();
    };
  }, [standId, regionId, load]);

  // Holding a place is a claim about where the car physically is, so the app
  // keeps saying so while this panel is open.
  useEffect(() => {
    if (!place.entry) return undefined;
    let cancelled = false;
    let publishing = false;
    setPresence(null);
    async function beat() {
      if (publishing || cancelled) return;
      publishing = true;
      try {
        const fix = freshStandPosition(positionRef.current);
        const data = await publishStandPresence({
          lat: fix?.lat ?? null,
          lng: fix?.lng ?? null,
        });
        if (!cancelled && mountedRef.current) setPresence(data.presence || null);
      } catch {
        // A missed heartbeat is not evidence the car left; the server's own
        // much longer timeout is what decides that.
      } finally {
        publishing = false;
      }
    }
    beat();
    const timer = setInterval(beat, PRESENCE_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [place.entry?.id]);

  async function run(action, onSuccess) {
    const ticket = syncRef.current.beginWrite();
    if (!ticket) return;
    setBusy(true);
    setActionError("");
    let actionFailure;
    try {
      await action();
      if (syncRef.current.currentWrite(ticket)) onSuccess?.();
    } catch (runError) {
      actionFailure = runError;
    } finally {
      if (syncRef.current.currentWrite(ticket)) {
        await load({ silent: true, reconcile: true });
        if (syncRef.current.finishWrite(ticket)) {
          if (actionFailure) setActionError(formatError(actionFailure));
          setBusy(false);
        }
      }
    }
  }

  const syncNotice = blocked && !busy && !loading && (
    <div className="driver-core-error" role="alert" ref={feedbackRef}>
      Данные стоянки не подтверждены. Обновите их перед следующим действием.
      <button type="button" className="driver-stand-blocked-action" onClick={() => load()}>Обновить стоянки</button>
    </div>
  );

  const entry = place.entry;

  if (loading && !entry && !stands.length) {
    return <div className="driver-core-loading">Загружаем стоянки…</div>;
  }

  if (entry) {
    return (
      <section className="driver-stands">
        {syncNotice}
        {error && <div className="driver-core-error" role="alert">{error}</div>}
        {actionError && !blocked && <div className="driver-core-error" role="alert" ref={feedbackRef}>{actionError}</div>}
        {!freshStandPosition(position) && (
          <div className="driver-core-error" role="alert">
            Не удалось подтвердить геолокацию. Включите точное местоположение, чтобы сохранить место в очереди.
          </div>
        )}
        {freshStandPosition(position) && presence?.inside === false && (
          <div className="driver-core-error" role="alert">
            Вы вне зоны стоянки ({metres(presence.distanceM)}). Место освободится через{" "}
            {presence.graceMinutes ?? 6} мин.
          </div>
        )}
        <MyPlaceCard
          place={place}
          busy={busy || blocked}
          offerDraft={offerDraft}
          setOfferDraft={setOfferDraft}
          onAddSeat={source => run(() => addStandSeats(entry.id, { seats: 1, source }))}
          onReleaseSeat={() => run(() => releaseStandSeats(entry.id, 1))}
          onSaveOffer={draft => run(() => updateStandOffer(entry.id, draft), () => setOfferDraft(null))}
          onDepart={() => run(() => departStandQueue(entry.id))}
          onLeave={() => run(() => leaveStandQueue(entry.id))}
          onGiveTurn={driverId => run(() => handOverStandTurn(entry.id, driverId))}
          onRespond={(reservationId, accept) => run(() => respondStandReservation(reservationId, accept))}
        />
      </section>
    );
  }

  return (
    <section className="driver-stands">
      {syncNotice}
      {notice && <div className="stand-outcome-notice" role="status">{standOutcomeMessages[notice]}</div>}
      {error && <div className="driver-core-error" role="alert">{error}</div>}
      {actionError && !blocked && <div className="driver-core-error" role="alert" ref={feedbackRef}>{actionError}</div>}
      <div className="driver-core-section-title">
        <strong>Стоянки рядом</strong>
        <span>{stands.length}</span>
      </div>
      {!stands.length ? (
        <div className="driver-stand-empty">
          <strong>Стоянок нет</strong>
          <p>Сейчас в этом регионе нет доступных стоянок.</p>
        </div>
      ) : (
        stands.map(stand => (
          <StandCard
            key={stand.id}
            stand={stand}
            position={freshStandPosition(position)}
            isOnline={isOnline}
            busy={busy || blocked}
            onJoin={draft => run(() => {
              const fix = freshStandPosition(positionRef.current);
              if (!fix) throw new Error('Нужна свежая точная геолокация. Включите определение местоположения.');
              return joinStandQueue(stand.id, { ...fix, ...draft });
            })}
            onGoToLine={onGoToLine}
          />
        ))
      )}
    </section>
  );
}

function StandCard({ stand, position, isOnline, busy, onJoin, onGoToLine }) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [price, setPrice] = useState("");
  const [seats, setSeats] = useState(stand.defaultSeats || 4);
  const [comment, setComment] = useState("");

  // A cached list may have been sorted around a region centre. Without a
  // fresh device fix, its distance must not look like the driver's distance.
  const distance = position ? distanceMeters(position, stand) : null;
  const inside = distance != null && distance <= stand.radiusM;
  const blocked = !isOnline
    ? "Выйдите на линию, чтобы встать в очередь"
    : !position
      ? "Включите геолокацию, чтобы встать в очередь"
      : !inside
        ? "Подойдите к стоянке, чтобы встать в очередь"
        : "";

  return (
    <article className="driver-stand-card">
      <header>
        <strong>{stand.name}</strong>
        {distance != null && (
          <span className={inside ? "near" : ""}>{metres(distance)}</span>
        )}
      </header>
      <div className="driver-stand-chips">
        <span>{KIND_LABELS[stand.kind] || stand.kind}</span>
        <span>{carsInLine(stand.driversCount)}</span>
        {stand.driversCount > 0 && <span>{freeSeatsLabel(stand.freeSeats)}</span>}
      </div>
      {stand.note && <p className="driver-stand-note">{stand.note}</p>}
      {open ? (
        <form
          className="driver-stand-form"
          onSubmit={event => {
            event.preventDefault();
            if (blocked || busy) return;
            onJoin({
              destinationLabel: destination.trim() || undefined,
              pricePerSeat: price.trim() ? Number(price) : undefined,
              totalSeats: Number(seats),
              comment: comment.trim() || undefined,
            });
          }}
        >
          <label>
            <span>Направление</span>
            <input value={destination} maxLength={120} placeholder="Например: Шымкент" onChange={e => setDestination(e.target.value)} />
          </label>
          <label>
            <span>Цена за место, ₸</span>
            <input value={price} inputMode="numeric" onChange={e => setPrice(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label>
            <span>Мест в машине</span>
            <select value={seats} onChange={e => setSeats(e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>Комментарий</span>
            <input value={comment} maxLength={200} placeholder="Например: выезжаю по заполнению" onChange={e => setComment(e.target.value)} />
          </label>
          <div className="driver-stand-form-actions">
            <button type="button" onClick={() => setOpen(false)} disabled={busy}>Отмена</button>
            <button type="submit" className="primary" disabled={busy || Boolean(blocked)}>Встать в очередь</button>
          </div>
          {blocked && <p className="driver-stand-note">{blocked}</p>}
        </form>
      ) : (
        <>
          <button
            type="button"
            className="driver-stand-join"
            disabled={Boolean(blocked) || busy}
            onClick={() => setOpen(true)}
          >
            Встать в очередь
          </button>
          {blocked && (
            <div className="driver-stand-blocked">
              <p>{blocked}</p>
              {/* The way out of the refusal is an action, not a word inside the
                  sentence explaining it: as a link in running text it was a
                  16px-tall target on the phone this driver is holding. */}
              {!isOnline && onGoToLine && (
                <button type="button" className="driver-stand-blocked-action" onClick={onGoToLine}>
                  Перейти на линию
                </button>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function MyPlaceCard({
  place,
  busy,
  offerDraft,
  setOfferDraft,
  onAddSeat,
  onReleaseSeat,
  onSaveOffer,
  onDepart,
  onLeave,
  onGiveTurn,
  onRespond,
}) {
  const { entry, stand, queue } = place;
  const position = entry.position || 1;
  const ahead = Math.max(0, position - 1);
  const boarding = entry.status === "BOARDING";
  const pending = (entry.reservations || []).filter(row => row.status === "PENDING");
  const others = queue.filter(row => row.id !== entry.id);
  const [handoverOpen, setHandoverOpen] = useState(false);

  return (
    <>
      <article className="driver-stand-place">
        <header>
          <strong>{stand?.name || "Стоянка"}</strong>
          <span className={boarding ? "turn" : ""}>
            {boarding ? "Ваша очередь" : `${position}-й в очереди`}
          </span>
        </header>
        <p className="driver-stand-hint">
          {boarding
            ? "Набирайте пассажиров. Когда машина заполнится — выезжайте."
            : `Ждите очередь. Перед вами ${ahead} ${plural(ahead, "машина", "машины", "машин")}.`}
        </p>

        <div className="driver-stand-seats">
          <span>Места</span>
          <strong>{entry.takenSeats} из {entry.totalSeats}</strong>
          {entry.pendingSeats > 0 && <p>Ожидают подтверждения: {entry.pendingSeats} {plural(entry.pendingSeats, 'место', 'места', 'мест')}</p>}
          {entry.takenSeats > 0 && !entry.manualSeats && <p>Кнопка «−» освобождает только места по звонку или на месте. Бронь из приложения отменяет пассажир.</p>}
          <div className="driver-stand-seat-actions">
            <button
              type="button"
              onClick={onReleaseSeat}
              disabled={busy || !boarding || !entry.manualSeats}
              aria-label="Освободить место"
            >
              −
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => onAddSeat("WALK_IN")}
              disabled={busy || !boarding || entry.freeSeats <= 0}
            >
              +1 место
            </button>
            <button
              type="button"
              onClick={() => onAddSeat("PHONE")}
              disabled={busy || !boarding || entry.freeSeats <= 0}
            >
              +1 по звонку
            </button>
          </div>
        </div>

        {offerDraft ? (
          <form
            className="driver-stand-form"
            onSubmit={event => {
              event.preventDefault();
              onSaveOffer({
                destinationLabel: offerDraft.destinationLabel,
                pricePerSeat: offerDraft.pricePerSeat === "" ? undefined : Number(offerDraft.pricePerSeat),
                totalSeats: Number(offerDraft.totalSeats),
                comment: offerDraft.comment,
              });
            }}
          >
            <label>
              <span>Направление</span>
              <input
                value={offerDraft.destinationLabel}
                maxLength={120}
                onChange={e => setOfferDraft({ ...offerDraft, destinationLabel: e.target.value })}
              />
            </label>
            <label>
              <span>Цена за место, ₸</span>
              <input
                value={offerDraft.pricePerSeat}
                inputMode="numeric"
                onChange={e => setOfferDraft({ ...offerDraft, pricePerSeat: e.target.value.replace(/\D/g, "") })}
              />
            </label>
            <label>
              <span>Мест в машине</span>
              <select
                value={offerDraft.totalSeats}
                onChange={e => setOfferDraft({ ...offerDraft, totalSeats: e.target.value })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8]
                  // Lowering the total below what is already taken would strand
                  // a rider who is already counted in.
                  .filter(value => value >= entry.takenSeats + (entry.pendingSeats || 0) || value === Number(offerDraft.totalSeats))
                  .map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Комментарий</span>
              <input
                value={offerDraft.comment}
                maxLength={200}
                onChange={e => setOfferDraft({ ...offerDraft, comment: e.target.value })}
              />
            </label>
            <div className="driver-stand-form-actions">
              <button type="button" onClick={() => setOfferDraft(null)} disabled={busy}>Отмена</button>
              <button type="submit" className="primary" disabled={busy}>Сохранить</button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="driver-stand-offer"
            onClick={() => setOfferDraft({
              destinationLabel: entry.destinationLabel || "",
              pricePerSeat: entry.pricePerSeat == null ? "" : String(entry.pricePerSeat),
              totalSeats: entry.totalSeats,
              comment: entry.comment || "",
            })}
            disabled={busy}
          >
            <span>{entry.destinationLabel || "Направление не указано"}</span>
            <em>{entry.pricePerSeat == null ? "Цена по договорённости" : `${entry.pricePerSeat} ₸ за место`}</em>
          </button>
        )}

        <div className="driver-stand-place-actions">
          <button type="button" className="primary" onClick={onDepart} disabled={busy || !boarding}>
            Выехать
          </button>
          <button type="button" onClick={() => setHandoverOpen(value => !value)} disabled={busy}>
            Отдать очередь
          </button>
          <button type="button" onClick={onLeave} disabled={busy}>
            Выйти из очереди
          </button>
        </div>

        {handoverOpen && (
          <div className="driver-stand-handover">
            {entry.takenSeats + (entry.pendingSeats || 0) > 0 ? (
              <p>Сначала освободите занятые места.</p>
            ) : !others.length ? (
              <p>В очереди нет других водителей.</p>
            ) : (
              others.map(row => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => { setHandoverOpen(false); onGiveTurn(row.driverId); }}
                  disabled={busy}
                >
                  <strong>{row.position}</strong>
                  <span>{[row.driver?.carColor, row.driver?.carModel].filter(Boolean).join(" ") || row.driver?.name}</span>
                  <em>{row.driver?.plate}</em>
                </button>
              ))
            )}
          </div>
        )}
      </article>

      {pending.length > 0 && (
        <section className="driver-stand-requests">
          <div className="driver-core-section-title">
            <strong>Заявки на места</strong>
            <span>{pending.length}</span>
          </div>
          {pending.map(reservation => (
            <article key={reservation.id} className="driver-stand-request">
              <strong>{reservation.client?.name || "—"}</strong>
              <span>
                {reservation.seats} {plural(reservation.seats, "место", "места", "мест")}
                {reservation.client?.phone ? ` · ${reservation.client.phone}` : ""}
              </span>
              {reservation.pickupLabel && <em>{reservation.pickupLabel}</em>}
              <div className="driver-stand-request-actions">
                <button type="button" onClick={() => onRespond(reservation.id, false)} disabled={busy}>Отказать</button>
                <button type="button" className="primary" onClick={() => onRespond(reservation.id, true)} disabled={busy}>Подтвердить</button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="driver-stand-queue">
        <div className="driver-core-section-title">
          <strong>Очередь</strong>
          <span>{queue.length}</span>
        </div>
        {queue.map(row => (
          <div key={row.id} className={`driver-stand-queue-row${row.id === entry.id ? " me" : ""}`}>
            <strong>{row.position}</strong>
            <span>{[row.driver?.carColor, row.driver?.carModel].filter(Boolean).join(" ") || row.driver?.name}</span>
            <em>{row.driver?.plate}</em>
            <b>{row.takenSeats} из {row.totalSeats}</b>
          </div>
        ))}
      </section>
    </>
  );
}

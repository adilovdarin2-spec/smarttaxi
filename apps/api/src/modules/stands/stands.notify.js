import { query } from "../../db/pool.js";
import { notifyUser } from "../notifications/notification.service.js";
import { publicReservation, standQueueView, standRegionRoom, standRoom } from "./stands.service.js";

// Everything that tells people a line changed. A stand's queue moves for
// people who did nothing — a car ahead leaves and everyone behind it moves up,
// a rider's car drives off with their seat — so these are shared by every
// path that can move it: the driver's own actions, the presence sweeper, and
// the two places where a place is released for them (going off the line,
// accepting a dispatch order).

/// Pushes the whole line rather than a delta: a stand screen is small, the
/// update has to be correct for every viewer regardless of which events they
/// missed, and positions shift for people who took no action at all.
export async function broadcastStand(io, standId) {
  if (!io || !standId) return;
  try {
    const [clientView, driverView] = await Promise.all([
      standQueueView(standId, { audience: "CLIENT" }),
      standQueueView(standId, { audience: "DRIVER" })
    ]);
    io.to(standRoom(standId)).emit("stand_queue_updated", clientView);
    io.to(standRegionRoom(clientView.stand.regionId)).emit("stand_queue_updated", clientView);
    // The driver projection carries seat requests and phone numbers, so it
    // only ever goes to the room the server put drivers in.
    io.to(`${standRoom(standId)}:drivers`).emit("stand_queue_updated_driver", driverView);
  } catch (error) {
    console.error("[stands] broadcast failed", { standId, error });
  }
}

export async function notifyPromotedDrivers(io, promotedEntryIds, standId) {
  if (!promotedEntryIds?.length) return;
  const rows = (await query(`
    SELECT e.id, d.user_id, s.name stand_name
    FROM taxi_stand_queue_entries e
    JOIN drivers d ON d.id=e.driver_id
    JOIN taxi_stands s ON s.id=e.stand_id
    WHERE e.id = ANY($1::uuid[])
  `, [promotedEntryIds])).rows;
  for (const row of rows) {
    if (!row.user_id) continue;
    io?.to(`user:${row.user_id}`).emit("stand_turn_started", { standId, entryId: row.id });
    notifyUser(row.user_id, {
      title: "Ваша очередь",
      body: `Вы первый на стоянке «${row.stand_name}». Можно набирать пассажиров.`,
      type: "STAND_TURN_STARTED",
      data: { standId, entryId: row.id }
    }).catch((error) => console.error("[push] stand promotion failed", error));
  }
}

/// Drivers whose place is gone through no action of their own: they drove out
/// of the stand and stayed out, the app stopped reporting where they were, or
/// the owner closed the stand under them. Each is a different thing to be told,
/// and none of them should be discovered by watching the screen empty.
const PLACE_LOST_BODY = {
  LEFT_AREA: (stand) => `Вы уехали со стоянки «${stand}», место освободилось.`,
  STAND_CLOSED: (stand) => `Стоянку «${stand}» закрыли. Очередь снята, место больше не занято.`,
  NO_SIGNAL: (stand) => `Приложение потеряло связь, место на стоянке «${stand}» освободилось.`
};

export async function notifyDroppedDrivers(io, expiredEntries) {
  for (const entry of expiredEntries || []) {
    if (!entry?.driver_id) continue;
    const row = (await query(`
      SELECT d.user_id, s.name stand_name
      FROM drivers d
      JOIN taxi_stands s ON s.id=$2
      WHERE d.id=$1
    `, [entry.driver_id, entry.stand_id])).rows[0];
    if (!row?.user_id) continue;
    const body = (PLACE_LOST_BODY[entry.left_reason] || PLACE_LOST_BODY.NO_SIGNAL)(row.stand_name);
    io?.to(`user:${row.user_id}`).emit("stand_place_lost", {
      standId: entry.stand_id,
      entryId: entry.id,
      reason: entry.left_reason
    });
    notifyUser(row.user_id, {
      title: entry.left_reason === "STAND_CLOSED" ? "Стоянка закрыта" : "Вы вышли из очереди",
      body,
      type: "STAND_PLACE_LOST",
      data: { standId: entry.stand_id, reason: entry.left_reason }
    }).catch((error) => console.error("[push] stand place lost failed", error));
  }
}

/// Riders whose seat is gone. Told what actually happened and what is left to
/// do about it: a rider whose car drove off can pick another one at the same
/// stand, but a rider whose stand was closed has nothing there to pick.
const SEAT_LOST_COPY = {
  STAND_CLOSED: {
    title: "Стоянка закрыта",
    body: "Стоянку закрыли, бронь снята. Закажите машину обычным заказом."
  },
  DEFAULT: {
    title: "Бронь на стоянке снята",
    body: "Машина уехала. Выберите другую машину на стоянке."
  }
};

export async function notifyStrandedRiders(io, reservations, { reason } = {}) {
  const copy = SEAT_LOST_COPY[reason] || SEAT_LOST_COPY.DEFAULT;
  for (const reservation of reservations || []) {
    if (!reservation.client_id) continue;
    const row = (await query("SELECT user_id FROM clients WHERE id=$1", [reservation.client_id])).rows[0];
    if (!row?.user_id) continue;
    io?.to(`user:${row.user_id}`).emit("stand_reservation_cancelled", {
      standId: reservation.stand_id,
      reservationId: reservation.id,
      reason: reason || null
    });
    notifyUser(row.user_id, {
      title: copy.title,
      body: copy.body,
      type: "STAND_RESERVATION_CANCELLED",
      data: { standId: reservation.stand_id, reservationId: reservation.id, reason: reason || null }
    }).catch((error) => console.error("[push] stand stranded rider failed", error));
  }
}

export async function notifyReservationOutcome(io, reservation, accepted) {
  if (!reservation?.client_id) return;
  const row = (await query("SELECT user_id FROM clients WHERE id=$1", [reservation.client_id])).rows[0];
  if (!row?.user_id) return;
  io?.to(`user:${row.user_id}`).emit(
    accepted ? "stand_reservation_confirmed" : "stand_reservation_declined",
    { standId: reservation.stand_id, reservationId: reservation.id }
  );
  notifyUser(row.user_id, {
    title: accepted ? "Место подтверждено" : "Водитель отказал",
    body: accepted
      ? "Водитель подтвердил ваше место. Подходите к машине."
      : "Водитель не подтвердил место. Выберите другую машину.",
    type: accepted ? "STAND_RESERVATION_CONFIRMED" : "STAND_RESERVATION_DECLINED",
    data: { standId: reservation.stand_id, reservationId: reservation.id }
  }).catch((error) => console.error("[push] stand reservation outcome failed", error));
}

/// The full aftermath of a place being given up: whoever moved up learns it,
/// whoever lost a seat learns it, and every open stand screen redraws.
/// Deliberately never throws at its caller — a place was already released, and
/// failing to announce it must not roll that back.
export async function announceStandRelease(io, release) {
  if (!release) return;
  try {
    await notifyPromotedDrivers(io, release.promoted, release.standId);
    await notifyStrandedRiders(io, release.strandedRows);
    await broadcastStand(io, release.standId);
  } catch (error) {
    console.error("[stands] release announcement failed", { standId: release?.standId, error });
  }
}

export { publicReservation };

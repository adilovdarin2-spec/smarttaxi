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

/// Riders whose car is gone. Told plainly that the car left rather than left
/// holding a reservation that quietly stopped meaning anything.
export async function notifyStrandedRiders(io, reservations) {
  for (const reservation of reservations || []) {
    if (!reservation.client_id) continue;
    const row = (await query("SELECT user_id FROM clients WHERE id=$1", [reservation.client_id])).rows[0];
    if (!row?.user_id) continue;
    io?.to(`user:${row.user_id}`).emit("stand_reservation_cancelled", {
      standId: reservation.stand_id,
      reservationId: reservation.id
    });
    notifyUser(row.user_id, {
      title: "Место на стоянке освободилось",
      body: "Машина уехала. Выберите другую машину на стоянке.",
      type: "STAND_RESERVATION_CANCELLED",
      data: { standId: reservation.stand_id, reservationId: reservation.id }
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

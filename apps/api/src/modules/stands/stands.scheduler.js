import { query } from "../../db/pool.js";
import { notifyUser } from "../notifications/notification.service.js";
import {
  publicStand,
  standQueueView,
  standRegionRoom,
  standRoom,
  sweepStaleQueueEntries
} from "./stands.service.js";

// A place in a stand line is a claim about the physical world: this car is
// standing here, right now. Nothing else in the system notices when that
// stops being true — the driver closes the app, drives home, loses signal —
// so this sweep is what keeps the line honest for the riders reading it.
const SWEEP_INTERVAL_MS = 60_000;

let intervalHandle = null;

async function broadcast(io, standId) {
  if (!io) return;
  try {
    const [clientView, driverView] = await Promise.all([
      standQueueView(standId, { audience: "CLIENT" }),
      standQueueView(standId, { audience: "DRIVER" })
    ]);
    io.to(standRoom(standId)).emit("stand_queue_updated", clientView);
    io.to(standRegionRoom(clientView.stand.regionId)).emit("stand_queue_updated", clientView);
    io.to(`${standRoom(standId)}:drivers`).emit("stand_queue_updated_driver", driverView);
  } catch (error) {
    console.error("[stands] broadcast after sweep failed", { standId, error });
  }
}

async function notifyDroppedDrivers(io, expiredEntries) {
  for (const entry of expiredEntries) {
    const row = (await query(`
      SELECT d.user_id, s.name stand_name
      FROM drivers d
      JOIN taxi_stands s ON s.id=$2
      WHERE d.id=$1
    `, [entry.driver_id, entry.stand_id])).rows[0];
    if (!row?.user_id) continue;
    const left = entry.left_reason === "LEFT_AREA";
    io?.to(`user:${row.user_id}`).emit("stand_place_lost", {
      standId: entry.stand_id,
      entryId: entry.id,
      reason: entry.left_reason
    });
    notifyUser(row.user_id, {
      title: "Вы вышли из очереди",
      body: left
        ? `Вы уехали со стоянки «${row.stand_name}», место освободилось.`
        : `Приложение потеряло связь, место на стоянке «${row.stand_name}» освободилось.`,
      type: "STAND_PLACE_LOST",
      data: { standId: entry.stand_id, reason: entry.left_reason }
    }).catch((error) => console.error("[push] stand place lost failed", error));
  }
}

async function notifyStrandedRiders(io, reservations) {
  for (const reservation of reservations) {
    if (!reservation.client_id) continue;
    const row = (await query("SELECT user_id FROM clients WHERE id=$1", [reservation.client_id])).rows[0];
    if (!row?.user_id) continue;
    io?.to(`user:${row.user_id}`).emit("stand_reservation_cancelled", {
      standId: reservation.stand_id,
      reservationId: reservation.id
    });
    notifyUser(row.user_id, {
      title: "Бронь отменена",
      body: "Машина уехала со стоянки. Выберите другую машину.",
      type: "STAND_RESERVATION_CANCELLED",
      data: { standId: reservation.stand_id, reservationId: reservation.id }
    }).catch((error) => console.error("[push] stand stranded rider failed", error));
  }
}

export async function standsSweepTick(io) {
  const { expired, strandedByEntry, expiredReservations, touchedStands } = await sweepStaleQueueEntries(query);
  if (expired.length) await notifyDroppedDrivers(io, expired);
  if (strandedByEntry.length) await notifyStrandedRiders(io, strandedByEntry);
  for (const reservation of expiredReservations) {
    if (!reservation.client_id) continue;
    const row = (await query("SELECT user_id FROM clients WHERE id=$1", [reservation.client_id])).rows[0];
    if (!row?.user_id) continue;
    io?.to(`user:${row.user_id}`).emit("stand_reservation_expired", {
      standId: reservation.stand_id,
      reservationId: reservation.id
    });
  }
  const standsToRefresh = new Set([
    ...touchedStands,
    ...expiredReservations.map((row) => row.stand_id)
  ]);
  for (const standId of standsToRefresh) {
    await broadcast(io, standId);
  }
  return { expired: expired.length, expiredReservations: expiredReservations.length };
}

export function startStandsSweeper(io) {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    standsSweepTick(io).catch((error) => console.error("[stands] sweep tick failed", error));
  }, SWEEP_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

export function stopStandsSweeper() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

export { publicStand };

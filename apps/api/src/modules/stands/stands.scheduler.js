import { query } from "../../db/pool.js";
import { broadcastStand, notifyDroppedDrivers, notifyStrandedRiders } from "./stands.notify.js";
import { sweepStaleQueueEntries } from "./stands.service.js";
import { runDistributedJob } from "../../common/distributedJob.js";

// A place in a stand line is a claim about the physical world: this car is
// standing here, right now. Nothing else in the system notices when that
// stops being true — the driver closes the app, drives home, loses signal —
// so this sweep is what keeps the line honest for the riders reading it.
const SWEEP_INTERVAL_MS = 60_000;

let intervalHandle = null;

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
    await broadcastStand(io, standId);
  }
  return { expired: expired.length, expiredReservations: expiredReservations.length };
}

export function startStandsSweeper(io) {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    runDistributedJob("baisapar:stands-sweeper", () => standsSweepTick(io))
      .catch((error) => console.error("[stands] sweep tick failed", error));
  }, SWEEP_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

export function stopStandsSweeper() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

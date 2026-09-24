import { query } from "../../db/pool.js";
import { runDistributedJob } from "../../common/distributedJob.js";
import { closeStaleShifts } from "./driver-shift.service.js";

// Смена, которую никто не закрыл, растёт сама по себе.
//
// Водитель вышел на линию и закрыл приложение не нажав «оффлайн»; телефон
// сел; связь пропала. Статус в базе остаётся FREE, смена — открытой, и в
// отчёте о заработке за час у этого водителя копятся часы, которых не было.
// Один такой водитель за ночь добавляет восемь часов простоя и опускает
// среднее по всем.
//
// Поэтому линия считается до последнего признака жизни, а не до бесконечности.
const SWEEP_INTERVAL_MS = 5 * 60_000;

let intervalHandle = null;

export async function driverShiftSweepTick() {
  const closed = await closeStaleShifts(query);
  return { closed };
}

export function startDriverShiftSweeper() {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    runDistributedJob("onedriver:driver-shift-sweeper", () => driverShiftSweepTick())
      .catch((error) => console.error("[shifts] sweep tick failed", error));
  }, SWEEP_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

export function stopDriverShiftSweeper() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

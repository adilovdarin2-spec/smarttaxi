import { query as defaultQuery } from "../../db/pool.js";

// Время водителя на линии.
//
// В drivers лежит только текущий статус — что сейчас, а не что было. Поэтому
// заработок за час посчитать было не из чего, а именно он решает, уйдёт
// водитель или останется: тот, кто возит за 700 ₸ и потом сорок минут стоит,
// зарабатывает меньше того, кто возит за 600 ₸ без простоя.
//
// Смена открывается, когда водитель уходит с OFFLINE, и закрывается, когда
// возвращается. FREE и BUSY — обе на линии, переход между ними смену не
// трогает.

// На линии — значит доступен для заказов. Перерыв к линии не относится:
// водитель в это время заказы не берёт, и включать эти часы в «заработок за
// час» значило бы занижать его собственный труд.
const OFF_LINE_STATUSES = new Set(["OFFLINE", "BREAK"]);

// Исполнителем бывает и пул (функция), и клиент внутри транзакции (объект с
// методом query) — тот же приём, что в остальных сервисах.
function run(executor, sql, params = []) {
  const target = executor || defaultQuery;
  return target.query ? target.query(sql, params) : target(sql, params);
}

export function isOnLine(status) {
  return Boolean(status) && !OFF_LINE_STATUSES.has(String(status).toUpperCase());
}

// Смену открывает уникальный индекс, а не проверка перед вставкой: два
// запроса от одного водителя могут прийти одновременно, и тогда без него
// открылись бы две смены, а часы посчитались бы дважды.
export async function openShift(driverId, executor) {
  if (!driverId) return null;
  // Район берётся здесь и остаётся на смене навсегда. Читать его из водителя
  // при отчёте нельзя: он переезжает, и тогда часы, отработанные в Жетысае,
  // пересчитались бы в Мырзакент, а заработок одного района поделился бы на
  // часы другого.
  const result = await run(executor, `
    INSERT INTO driver_shifts(driver_id, region_id)
    SELECT id, current_region_id FROM drivers WHERE id = $1
    ON CONFLICT (driver_id) WHERE ended_at IS NULL DO NOTHING
    RETURNING *
  `, [driverId]);
  return result.rows[0] || null;
}

export async function closeShift(driverId, reason = "driver", executor) {
  if (!driverId) return null;
  const result = await run(executor, `
    UPDATE driver_shifts
    SET ended_at = NOW(), ended_reason = $2
    WHERE driver_id = $1 AND ended_at IS NULL
    RETURNING *
  `, [driverId, reason]);
  return result.rows[0] || null;
}

// Один вызов на все места, где водитель сам меняет свой статус.
export async function recordShiftForStatus(driverId, previousStatus, nextStatus, executor) {
  const was = isOnLine(previousStatus);
  const now = isOnLine(nextStatus);
  if (was === now) return null;
  return now ? openShift(driverId, executor) : closeShift(driverId, "driver", executor);
}

// Приложение может умереть, телефон — сесть, и смена останется открытой
// навсегда: водитель «на линии» третьи сутки, а часы в отчёте растут сами по
// себе. Считаем линию до последнего признака жизни, а не до бесконечности.
export const STALE_SHIFT_MINUTES = 30;

export async function closeStaleShifts(executor) {
  const result = await run(executor, `
    UPDATE driver_shifts s
    SET ended_at = GREATEST(s.started_at, COALESCE(d.last_seen_at, s.started_at)),
        ended_reason = 'stale'
    FROM drivers d
    WHERE d.id = s.driver_id
      AND s.ended_at IS NULL
      AND COALESCE(d.last_seen_at, s.started_at) < NOW() - ($1 || ' minutes')::interval
    RETURNING s.id
  `, [String(STALE_SHIFT_MINUTES)]);
  return result.rowCount || 0;
}

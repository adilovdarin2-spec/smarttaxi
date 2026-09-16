import { query as defaultQuery, tx } from "../../db/pool.js";
import { AppError } from "../../common/errors.js";
import { assertDriverRegionApproved } from "../driver-region-approvals/driver-region-approvals.service.js";
import { ACTIVE_ORDER_STATUSES } from '../orders/active-order-statuses.js';

// A stand is the physical place drivers already queue at off-app: the
// межгород line by the bazaar, the по городу line by the bus station. The
// owner draws it as a point plus a radius, and everything here treats that
// radius as the real boundary — a driver has to actually be standing there
// to take or hold a place in the line.

// How long a driver may be outside the stand's radius before the sweeper
// drops their place. Stepping out for fuel or a shop must not cost the line;
// leaving for good has to.
export const OUT_OF_RANGE_GRACE_MINUTES = 6;
// A phone that stops reporting entirely is the same thing as a car that
// left, just without the evidence — expire it on the same kind of timer.
export const STALE_PRESENCE_MINUTES = 15;
// A seat a rider claimed in the app but the driver never answered. Short on
// purpose: the whole point of a stand is that the car leaves when it fills.
export const RESERVATION_TTL_MINUTES = 10;

function run(executor, sql, params = []) {
  if (!executor) return defaultQuery(sql, params);
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function standRoom(standId) {
  return `stand:${standId}`;
}

export function standRegionRoom(regionId) {
  return `region:${regionId}:stands`;
}

const number = (value) => (value == null ? null : Number(value));

export function publicStand(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    regionId: row.region_id,
    regionName: row.region_name ?? null,
    name: row.name,
    kind: row.kind,
    lat: Number(row.lat),
    lng: Number(row.lng),
    radiusM: Number(row.radius_m),
    boardingSlots: Number(row.boarding_slots),
    defaultSeats: Number(row.default_seats),
    isActive: row.is_active,
    note: row.note || "",
    driversCount: extra.driversCount ?? (row.drivers_count == null ? 0 : Number(row.drivers_count)),
    freeSeats: extra.freeSeats ?? (row.free_seats == null ? 0 : Number(row.free_seats)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Two audiences read the same queue entry and they must not see the same
// thing. A rider needs the driver's phone (calling the car is the whole
// point of a stand) but has no business seeing another driver's position
// bookkeeping; the driver themselves needs the reservation list. `audience`
// picks which, rather than leaving it to each caller to remember to strip
// fields.
export function publicQueueEntry(row, { audience = "DRIVER", position = null, reservations = null } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    standId: row.stand_id,
    driverId: row.driver_id,
    status: row.status,
    position,
    destinationLabel: row.destination_label || "",
    destinationRegionId: row.destination_region_id || null,
    pricePerSeat: number(row.price_per_seat),
    totalSeats: Number(row.total_seats),
    takenSeats: Number(row.taken_seats),
    pendingSeats: Number(row.pending_seats || 0),
    freeSeats: Math.max(0, Number(row.total_seats) - Number(row.taken_seats) - Number(row.pending_seats || 0)),
    comment: row.comment || "",
    joinedAt: row.joined_at,
    boardingStartedAt: row.boarding_started_at,
    driver: {
      name: row.driver_name || "",
      phone: row.driver_phone || "",
      carModel: row.car_model || "",
      carColor: row.car_color || "",
      plate: row.plate || "",
      rating: row.rating == null ? null : Number(row.rating)
    }
  };
  if (audience === "CLIENT") return base;
  return {
    ...base,
    manualSeats: Math.min(Number(row.taken_seats), Number(row.manual_seats || 0)),
    queueSeq: row.queue_seq == null ? null : Number(row.queue_seq),
    regionId: row.region_id,
    lastSeenAt: row.last_seen_at,
    outsideSince: row.outside_since,
    departedAt: row.departed_at,
    leftAt: row.left_at,
    leftReason: row.left_reason || null,
    reservations
  };
}

export function publicReservation(row, { audience = "DRIVER" } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    entryId: row.entry_id,
    standId: row.stand_id,
    driverId: row.driver_id,
    seats: Number(row.seats),
    status: row.status,
    source: row.source,
    pickupLabel: row.pickup_label || "",
    pickupLat: number(row.pickup_lat),
    pickupLng: number(row.pickup_lng),
    comment: row.comment || "",
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
  if (audience === "CLIENT") {
    return {
      ...base,
      standName: row.stand_name ?? null,
      driver: {
        name: row.driver_name || "",
        phone: row.driver_phone || "",
        carModel: row.car_model || "",
        carColor: row.car_color || "",
        plate: row.plate || ""
      }
    };
  }
  return {
    ...base,
    clientId: row.client_id,
    client: {
      name: row.client_name || "",
      phone: row.client_phone || ""
    }
  };
}

const LIVE_STATUSES = "('WAITING','BOARDING')";

// The "one live place per driver" and "one live reservation per client" rules
// are enforced by partial unique indexes as well as by a read before the
// insert. That read locks nothing when there is no row yet, so two requests
// arriving together both see a free slot and both insert — the index then
// rejects the loser with a raw 23505, which reached the driver as a 500 and a
// generic "server error" instead of the same plain refusal the sequential path
// gives. Translate those violations back into the rule they enforce.
const UNIQUE_VIOLATION = "23505";
const INDEX_CONFLICTS = {
  idx_stand_queue_one_live_per_driver: () =>
    new AppError("You are already in a stand line", 409, "STAND_ALREADY_QUEUED"),
  idx_stand_reservations_one_live_per_client: () =>
    new AppError("You already hold a seat at a stand", 409, "STAND_RESERVATION_EXISTS")
};

function translateUniqueViolation(error) {
  if (error?.code !== UNIQUE_VIOLATION) return error;
  const build = INDEX_CONFLICTS[error.constraint];
  return build ? build() : error;
}

const PENDING_SEATS_SQL = `(SELECT COALESCE(SUM(res.seats), 0)
  FROM taxi_stand_seat_reservations res
  WHERE res.entry_id=e.id AND res.status='PENDING'
    AND (res.expires_at IS NULL OR res.expires_at > NOW()))`;

const ENTRY_SELECT = `
  e.*, d.name driver_name, d.phone driver_phone, d.car_model, d.car_color, d.plate, d.rating,
  ${PENDING_SEATS_SQL} pending_seats,
  (SELECT COALESCE(SUM(res.seats), 0) FROM taxi_stand_seat_reservations res
   WHERE res.entry_id=e.id AND res.status='CONFIRMED' AND res.source IN ('PHONE','WALK_IN')) manual_seats
`;

async function pendingSeatsForEntry(entryId, executor) {
  const row = (await run(executor, `SELECT ${PENDING_SEATS_SQL} pending_seats
    FROM taxi_stand_queue_entries e WHERE e.id=$1`, [entryId])).rows[0];
  return Number(row?.pending_seats || 0);
}

export async function loadStand(standId, executor) {
  const row = (await run(executor, `
    SELECT s.*, r.name region_name
    FROM taxi_stands s
    JOIN regions r ON r.id=s.region_id
    WHERE s.id=$1
  `, [standId])).rows[0];
  if (!row) throw new AppError("Stand not found", 404, "STAND_NOT_FOUND");
  return row;
}

// Structural queue changes serialize on their stand before locking entries.
// Dispatch may already hold driver rows; never acquire drivers after this lock.
export async function lockStand(standId, executor) {
  const row = (await run(executor, 'SELECT id FROM taxi_stands WHERE id=$1 FOR UPDATE', [standId])).rows[0];
  if (!row) throw new AppError('Стоянка не найдена', 404, 'STAND_NOT_FOUND');
}

async function lockStandForEntry(entryId, executor) {
  const row = (await run(executor, 'SELECT stand_id FROM taxi_stand_queue_entries WHERE id=$1', [entryId])).rows[0];
  if (!row) throw new AppError('Queue entry not found', 404, 'STAND_ENTRY_NOT_FOUND');
  await lockStand(row.stand_id, executor);
}

export function assertInsideStand(stand, { lat, lng }) {
  if (lat == null || lng == null) {
    throw new AppError("Driver location is required", 400, "STAND_LOCATION_REQUIRED");
  }
  const distance = haversineMeters(Number(stand.lat), Number(stand.lng), Number(lat), Number(lng));
  if (distance > Number(stand.radius_m)) {
    throw new AppError("You are not at this stand", 403, "STAND_OUT_OF_RANGE", {
      distanceM: Math.round(distance),
      radiusM: Number(stand.radius_m)
    });
  }
  return Math.round(distance);
}

export async function listStands({ regionId, includeInactive = false } = {}, executor) {
  const params = [];
  const where = [];
  if (regionId) {
    params.push(regionId);
    where.push(`s.region_id=$${params.length}`);
  }
  if (!includeInactive) where.push("s.is_active=true");
  const result = await run(executor, `
    SELECT s.*, r.name region_name,
      COALESCE(live.drivers_count, 0) drivers_count,
      COALESCE(live.free_seats, 0) free_seats
    FROM taxi_stands s
    JOIN regions r ON r.id=s.region_id
    LEFT JOIN (
      SELECT stand_id,
             COUNT(*) drivers_count,
             SUM(GREATEST(0, total_seats - taken_seats - ${PENDING_SEATS_SQL})) FILTER (WHERE status='BOARDING') free_seats
      FROM taxi_stand_queue_entries e
      WHERE status IN ${LIVE_STATUSES}
      GROUP BY stand_id
    ) live ON live.stand_id=s.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY s.name ASC
  `, params);
  return result.rows.map((row) => publicStand(row));
}

export async function listLiveEntries(standId, executor) {
  const result = await run(executor, `
    SELECT ${ENTRY_SELECT}
    FROM taxi_stand_queue_entries e
    JOIN drivers d ON d.id=e.driver_id
    WHERE e.stand_id=$1 AND e.status IN ${LIVE_STATUSES}
    ORDER BY e.queue_seq ASC
  `, [standId]);
  return result.rows;
}

async function listReservationsForEntries(entryIds, executor) {
  if (!entryIds.length) return new Map();
  const result = await run(executor, `
    SELECT res.*, c.name client_name, c.phone client_phone
    FROM taxi_stand_seat_reservations res
    LEFT JOIN clients c ON c.id=res.client_id
    WHERE res.entry_id = ANY($1::uuid[]) AND res.status IN ('PENDING','CONFIRMED')
      AND (res.status='CONFIRMED' OR res.expires_at IS NULL OR res.expires_at > NOW())
    ORDER BY res.created_at ASC
  `, [entryIds]);
  const byEntry = new Map();
  for (const row of result.rows) {
    if (!byEntry.has(row.entry_id)) byEntry.set(row.entry_id, []);
    byEntry.get(row.entry_id).push(row);
  }
  return byEntry;
}

// The single read every queue screen uses. Positions are derived from
// queue_seq order here rather than stored, so handing a turn over only has
// to swap two numbers and every reader stays consistent.
export async function standQueueView(standId, { audience = "CLIENT", forDriverId = null } = {}, executor) {
  const stand = await loadStand(standId, executor);
  const rows = await listLiveEntries(standId, executor);
  const reservationsByEntry = audience === "DRIVER"
    ? await listReservationsForEntries(rows.map((row) => row.id), executor)
    : new Map();
  const entries = rows.map((row, index) => publicQueueEntry(row, {
    audience,
    position: index + 1,
    reservations: audience === "DRIVER" && (!forDriverId || row.driver_id === forDriverId)
      ? (reservationsByEntry.get(row.id) || []).map((res) => publicReservation(res, { audience: "DRIVER" }))
      : null
  }));
  const boardingSeats = rows
    .filter((row) => row.status === "BOARDING")
    .reduce((sum, row) => sum + Math.max(0, Number(row.total_seats) - Number(row.taken_seats) - Number(row.pending_seats || 0)), 0);
  return {
    stand: publicStand(stand, { driversCount: rows.length, freeSeats: boardingSeats }),
    entries
  };
}

// Recomputes which places are at the front of the line. Called after every
// mutation instead of being set at each call site, so "the first
// boarding_slots cars are loading" can never drift from the actual order.
async function refreshBoardingSlots(standId, executor) {
  const stand = (await run(executor, "SELECT boarding_slots FROM taxi_stands WHERE id=$1", [standId])).rows[0];
  const slots = Math.max(1, Number(stand?.boarding_slots || 1));
  const live = (await run(executor, `
    SELECT id, status FROM taxi_stand_queue_entries
    WHERE stand_id=$1 AND status IN ${LIVE_STATUSES}
    ORDER BY queue_seq ASC
  `, [standId])).rows;
  const promoted = [];
  for (let index = 0; index < live.length; index += 1) {
    const shouldBoard = index < slots;
    const entry = live[index];
    if (shouldBoard && entry.status !== "BOARDING") {
      await run(executor, `
        UPDATE taxi_stand_queue_entries
        SET status='BOARDING',
            boarding_started_at=COALESCE(boarding_started_at, NOW()),
            updated_at=NOW()
        WHERE id=$1 AND status IN ${LIVE_STATUSES}
      `, [entry.id]);
      promoted.push(entry.id);
    } else if (!shouldBoard && entry.status !== "WAITING") {
      await run(executor, `UPDATE taxi_stand_queue_entries SET status='WAITING', updated_at=NOW() WHERE id=$1 AND status IN ${LIVE_STATUSES}`, [entry.id]);
    }
  }
  return promoted;
}

async function nextQueueSeq(standId, executor) {
  const row = (await run(executor, `
    SELECT COALESCE(MAX(queue_seq), 0) + 1 next_seq
    FROM taxi_stand_queue_entries
    WHERE stand_id=$1 AND status IN ${LIVE_STATUSES}
  `, [standId])).rows[0];
  return Number(row.next_seq);
}

export async function loadLiveEntryForDriver(driverId, executor) {
  return (await run(executor, `
    SELECT ${ENTRY_SELECT}
    FROM taxi_stand_queue_entries e
    JOIN drivers d ON d.id=e.driver_id
    WHERE e.driver_id=$1 AND e.status IN ${LIVE_STATUSES}
  `, [driverId])).rows[0] || null;
}

// Call with a freshly locked driver, never the object read by the HTTP route.
// Stand admission must not "repair" BUSY or change dispatch status.
export async function assertStandDriverAvailable(driver, executor) {
  if (!driver) throw new AppError('Водитель не найден', 404, 'DRIVER_NOT_FOUND');
  if (driver.is_blocked) throw new AppError('Водитель заблокирован', 403, 'DRIVER_BLOCKED');
  if (driver.status === 'BUSY') {
    throw new AppError('Водитель занят. Сначала нужно завершить поездку', 409, 'DRIVER_HAS_ACTIVE_ORDER');
  }
  if (driver.status !== 'FREE') {
    throw new AppError('Водителю нужно выйти на линию, чтобы занять место на стоянке', 409, 'DRIVER_OFFLINE');
  }
  const active = (await run(executor,
    'SELECT id FROM orders WHERE driver_id=$1 AND status = ANY($2::text[]) LIMIT 1',
    [driver.id, ACTIVE_ORDER_STATUSES])).rows[0];
  if (active) throw new AppError('У водителя есть незавершённая поездка', 409, 'DRIVER_HAS_ACTIVE_ORDER');
}

export function assertHandoverLocation(stand, location, { queuePresence = false, now = Date.now() } = {}) {
  const age = now - new Date(location?.updated_at ?? NaN).getTime();
  const lat = location?.lat == null ? NaN : Number(location.lat);
  const lng = location?.lng == null ? NaN : Number(location.lng);
  const accuracy = location?.accuracy == null ? NaN : Number(location.accuracy);
  if (!Number.isFinite(age) || age < -5000 || age > 30_000 ||
      !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 ||
      (!queuePresence && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 60))) {
    throw new AppError('Не удалось подтвердить местоположение водителя. Попросите его открыть стоянку и обновить GPS',
      409, 'STAND_HANDOVER_LOCATION_REQUIRED');
  }
  return assertInsideStand(stand, { lat, lng });
}

export async function joinQueue({ driver, standId, lat, lng, destinationLabel, destinationRegionId, pricePerSeat, totalSeats, comment }) {
  try {
    return await tx(async (client) => {
      driver = (await client.query('SELECT * FROM drivers WHERE id=$1 FOR UPDATE', [driver.id])).rows[0];
      await assertStandDriverAvailable(driver, client);
      await lockStand(standId, client);
      const stand = await loadStand(standId, client);
      if (!stand.is_active) throw new AppError("Stand is closed", 409, "STAND_INACTIVE");
      // Standing at the place is not the same as being allowed to work there.
      // A stand sits in exactly one region, and a driver advertising seats out
      // of a region they were never approved for would be taking passengers
      // outside every check the dispatch side already enforces.
      await assertDriverRegionApproved(driver, stand.region_id, client);
      assertInsideStand(stand, { lat, lng });

      const existing = (await client.query(`
        SELECT * FROM taxi_stand_queue_entries
        WHERE driver_id=$1 AND status IN ${LIVE_STATUSES}
        FOR UPDATE
      `, [driver.id])).rows[0];
      if (existing) {
        if (existing.stand_id === standId) {
          throw new AppError("You are already in this line", 409, "STAND_ALREADY_QUEUED", { entryId: existing.id });
        }
        throw new AppError("You are already in another stand line", 409, "STAND_QUEUED_ELSEWHERE", {
          entryId: existing.id,
          standId: existing.stand_id
        });
      }

      const seats = Number(totalSeats || stand.default_seats);
      const seq = await nextQueueSeq(standId, client);
      const inserted = (await client.query(`
        INSERT INTO taxi_stand_queue_entries(
          stand_id, driver_id, region_id, status, queue_seq,
          destination_label, destination_region_id, price_per_seat, total_seats,
          comment, last_seen_at, last_lat, last_lng
        )
        VALUES($1,$2,$3,'WAITING',$4,$5,$6,$7,$8,$9,NOW(),$10,$11)
        RETURNING *
      `, [
        standId,
        driver.id,
        stand.region_id,
        seq,
        destinationLabel || null,
        destinationRegionId || null,
        pricePerSeat ?? null,
        seats,
        comment || null,
        lat,
        lng
      ])).rows[0];
      await refreshBoardingSlots(standId, client);
      return { stand, entryId: inserted.id };
    });
  } catch (error) {
    throw translateUniqueViolation(error);
  }
}

export async function updateOffer({ driver, entryId, patch }) {
  return tx(async (client) => {
    const entry = (await client.query(`
      SELECT * FROM taxi_stand_queue_entries WHERE id=$1 FOR UPDATE
    `, [entryId])).rows[0];
    if (!entry) throw new AppError("Queue entry not found", 404, "STAND_ENTRY_NOT_FOUND");
    if (entry.driver_id !== driver.id) throw new AppError("Forbidden queue entry", 403, "FORBIDDEN_STAND_ENTRY");
    if (!["WAITING", "BOARDING"].includes(entry.status)) {
      throw new AppError("This place in the line is closed", 409, "STAND_ENTRY_NOT_LIVE", { status: entry.status });
    }
    const totalSeats = patch.totalSeats == null ? Number(entry.total_seats) : Number(patch.totalSeats);
    const pendingSeats = await pendingSeatsForEntry(entryId, client);
    if (totalSeats < Number(entry.taken_seats) + pendingSeats) {
      throw new AppError("Seats already taken exceed the new total", 409, "STAND_SEATS_BELOW_TAKEN", {
        takenSeats: Number(entry.taken_seats), pendingSeats
      });
    }
    const updated = (await client.query(`
      UPDATE taxi_stand_queue_entries
      SET destination_label=COALESCE($2, destination_label),
          destination_region_id=COALESCE($3, destination_region_id),
          price_per_seat=COALESCE($4, price_per_seat),
          total_seats=$5,
          comment=COALESCE($6, comment),
          updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [
      entryId,
      patch.destinationLabel ?? null,
      patch.destinationRegionId ?? null,
      patch.pricePerSeat ?? null,
      totalSeats,
      patch.comment ?? null
    ])).rows[0];
    return { entry: updated, standId: entry.stand_id };
  });
}

// The "+1 место" button. A seat claimed at the car window or over the phone
// still gets a row, so a full car can always be explained afterwards.
export async function addSeatsManually({ driver, entryId, seats, source, comment }) {
  return tx(async (client) => {
    const entry = (await client.query("SELECT * FROM taxi_stand_queue_entries WHERE id=$1 FOR UPDATE", [entryId])).rows[0];
    if (!entry) throw new AppError("Queue entry not found", 404, "STAND_ENTRY_NOT_FOUND");
    if (entry.driver_id !== driver.id) throw new AppError("Forbidden queue entry", 403, "FORBIDDEN_STAND_ENTRY");
    if (!["WAITING", "BOARDING"].includes(entry.status)) {
      throw new AppError("This place in the line is closed", 409, "STAND_ENTRY_NOT_LIVE", { status: entry.status });
    }
    const free = Number(entry.total_seats) - Number(entry.taken_seats) - await pendingSeatsForEntry(entryId, client);
    if (seats > free) {
      throw new AppError("Not enough free seats", 409, "STAND_NOT_ENOUGH_SEATS", { freeSeats: Math.max(0, free) });
    }
    const updated = (await client.query(`
      UPDATE taxi_stand_queue_entries
      SET taken_seats=taken_seats+$2, updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [entryId, seats])).rows[0];
    await client.query(`
      INSERT INTO taxi_stand_seat_reservations(
        entry_id, stand_id, driver_id, seats, status, source, comment, confirmed_at
      )
      VALUES($1,$2,$3,$4,'CONFIRMED',$5,$6,NOW())
    `, [entryId, entry.stand_id, driver.id, seats, source, comment || null]);
    return { entry: updated, standId: entry.stand_id };
  });
}

export async function releaseSeats({ driver, entryId, seats }) {
  return tx(async (client) => {
    const entry = (await client.query("SELECT * FROM taxi_stand_queue_entries WHERE id=$1 FOR UPDATE", [entryId])).rows[0];
    if (!entry) throw new AppError("Queue entry not found", 404, "STAND_ENTRY_NOT_FOUND");
    if (entry.driver_id !== driver.id) throw new AppError("Forbidden queue entry", 403, "FORBIDDEN_STAND_ENTRY");
    if (!["WAITING", "BOARDING"].includes(entry.status)) {
      throw new AppError("This place in the line is closed", 409, "STAND_ENTRY_NOT_LIVE", { status: entry.status });
    }
    const release = Math.min(Number(seats), Number(entry.taken_seats));
    if (release <= 0) {
      throw new AppError("No seats to release", 409, "STAND_NO_TAKEN_SEATS");
    }
    // Give back the walk-in/phone rows first: an app reservation is a named
    // rider who is on their way and must not be silently dropped because the
    // driver tapped minus once too often.
    const manual = (await client.query(`
      SELECT id, seats FROM taxi_stand_seat_reservations
      WHERE entry_id=$1 AND status='CONFIRMED' AND source IN ('PHONE','WALK_IN')
      ORDER BY created_at DESC
      FOR UPDATE
    `, [entryId])).rows;
    const manualSeats = manual.reduce((sum, row) => sum + Number(row.seats), 0);
    if (Number(seats) > manualSeats) {
      throw new AppError("Можно освободить только места, добавленные вручную. Бронь из приложения отменяет пассажир.", 409, "STAND_NO_MANUAL_SEATS", { manualSeats });
    }
    let remaining = release;
    for (const row of manual) {
      if (remaining <= 0) break;
      if (Number(row.seats) <= remaining) {
        await client.query(
          "UPDATE taxi_stand_seat_reservations SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW() WHERE id=$1",
          [row.id]
        );
        remaining -= Number(row.seats);
      } else {
        await client.query(
          "UPDATE taxi_stand_seat_reservations SET seats=seats-$2, updated_at=NOW() WHERE id=$1",
          [row.id, remaining]
        );
        remaining = 0;
      }
    }
    const updated = (await client.query(`
      UPDATE taxi_stand_queue_entries
      SET taken_seats=GREATEST(0, taken_seats-$2), updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [entryId, release])).rows[0];
    return { entry: updated, standId: entry.stand_id, releasedSeats: release, unmatchedSeats: remaining };
  });
}

export async function departQueue({ driver, entryId }) {
  return tx(async (client) => {
    await lockStandForEntry(entryId, client);
    const entry = (await client.query("SELECT * FROM taxi_stand_queue_entries WHERE id=$1 FOR UPDATE", [entryId])).rows[0];
    if (!entry) throw new AppError("Queue entry not found", 404, "STAND_ENTRY_NOT_FOUND");
    if (entry.driver_id !== driver.id) throw new AppError("Forbidden queue entry", 403, "FORBIDDEN_STAND_ENTRY");
    if (!["WAITING", "BOARDING"].includes(entry.status)) {
      throw new AppError("This place in the line is already closed", 409, "STAND_ENTRY_NOT_LIVE", { status: entry.status });
    }
    const updated = (await client.query(`
      UPDATE taxi_stand_queue_entries
      SET status='DEPARTED', departed_at=NOW(), updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [entryId])).rows[0];
    await client.query(`
      UPDATE taxi_stand_seat_reservations
      SET status='BOARDED', updated_at=NOW()
      WHERE entry_id=$1 AND status='CONFIRMED'
    `, [entryId]);
    const strandedRows = (await client.query(`
      UPDATE taxi_stand_seat_reservations
      SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW()
      WHERE entry_id=$1 AND status='PENDING'
      RETURNING *
    `, [entryId])).rows;
    const promoted = await refreshBoardingSlots(entry.stand_id, client);
    return { entry: updated, standId: entry.stand_id, promoted, strandedRows };
  });
}

export async function leaveQueue({ driver, entryId, reason = "DRIVER_LEFT" }) {
  return tx(async (client) => {
    await lockStandForEntry(entryId, client);
    const entry = (await client.query("SELECT * FROM taxi_stand_queue_entries WHERE id=$1 FOR UPDATE", [entryId])).rows[0];
    if (!entry) throw new AppError("Queue entry not found", 404, "STAND_ENTRY_NOT_FOUND");
    if (entry.driver_id !== driver.id) throw new AppError("Forbidden queue entry", 403, "FORBIDDEN_STAND_ENTRY");
    if (!["WAITING", "BOARDING"].includes(entry.status)) {
      return { entry, standId: entry.stand_id, promoted: [], strandedRows: [] };
    }
    const updated = (await client.query(`
      UPDATE taxi_stand_queue_entries
      SET status='LEFT', left_at=NOW(), left_reason=$2, updated_at=NOW()
      WHERE id=$1
      RETURNING *
    `, [entryId, reason])).rows[0];
    const strandedRows = (await client.query(`
      UPDATE taxi_stand_seat_reservations
      SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW()
      WHERE entry_id=$1 AND status IN ('PENDING','CONFIRMED')
      RETURNING *
    `, [entryId])).rows;
    const promoted = await refreshBoardingSlots(entry.stand_id, client);
    return { entry: updated, standId: entry.stand_id, promoted, strandedRows };
  });
}

// "Отдать свою очередь" — the thing drivers already do verbally. If the other
// driver is in the same line the two places swap, which moves exactly one
// position and leaves everyone else untouched. If they are standing at the
// stand but not in the line yet, they take over the giver's place outright
// and the giver steps out.
export async function handOverTurn({ driver, entryId, toDriverId }) {
  return tx(async (client) => {
    if (toDriverId === driver.id) throw new AppError("Choose another driver", 400, "STAND_HANDOVER_SELF");
    // Driver rows first, as in dispatch. Stable ordering serializes A -> B
    // and B -> A instead of deadlocking their queue entries.
    const drivers = (await client.query('SELECT * FROM drivers WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [[driver.id, toDriverId]])).rows;
    const target = drivers.find(row => row.id === toDriverId);
    await lockStandForEntry(entryId, client);
    const entry = (await client.query("SELECT * FROM taxi_stand_queue_entries WHERE id=$1 FOR UPDATE", [entryId])).rows[0];
    if (!entry) throw new AppError("Queue entry not found", 404, "STAND_ENTRY_NOT_FOUND");
    if (entry.driver_id !== driver.id) throw new AppError("Forbidden queue entry", 403, "FORBIDDEN_STAND_ENTRY");
    if (!["WAITING", "BOARDING"].includes(entry.status)) {
      throw new AppError("This place in the line is closed", 409, "STAND_ENTRY_NOT_LIVE", { status: entry.status });
    }
    const pendingSeats = await pendingSeatsForEntry(entryId, client);
    if (Number(entry.taken_seats) > 0 || pendingSeats > 0) {
      throw new AppError("Release your booked seats before giving away the turn", 409, "STAND_HANDOVER_HAS_SEATS", {
        takenSeats: Number(entry.taken_seats), pendingSeats
      });
    }

    await assertStandDriverAvailable(target, client);

    const stand = await loadStand(entry.stand_id, client);
    if (!stand.is_active) throw new AppError('Стоянка закрыта', 409, 'STAND_INACTIVE');
    await assertDriverRegionApproved(target, stand.region_id, client);
    const targetEntry = (await client.query(`
      SELECT * FROM taxi_stand_queue_entries
      WHERE driver_id=$1 AND status IN ${LIVE_STATUSES}
      FOR UPDATE
    `, [toDriverId])).rows[0];

    if (targetEntry) {
      if (targetEntry.stand_id !== entry.stand_id) {
        throw new AppError("That driver is in another stand line", 409, "STAND_HANDOVER_OTHER_STAND");
      }
      // Both cars must be free of passengers before swapping their places.
      if (Number(targetEntry.taken_seats) > 0 || await pendingSeatsForEntry(targetEntry.id, client) > 0) {
        throw new AppError('У выбранного водителя уже есть пассажиры или заявки. Обмен местами недоступен',
          409, 'STAND_HANDOVER_TARGET_HAS_SEATS');
      }
      // Stand-only clients publish presence without a navigation location.
      // touchPresence never refreshes this timestamp without coordinates.
      assertHandoverLocation(stand, { lat: targetEntry.last_lat, lng: targetEntry.last_lng,
        updated_at: targetEntry.last_seen_at }, { queuePresence: true });
      // Postgres has no deferred unique index here, so park the giver on a
      // sentinel sequence for the length of the swap rather than colliding
      // with idx_stand_queue_live_seq mid-statement.
      const parking = -Math.abs(Number(entry.queue_seq)) - 1;
      await client.query("UPDATE taxi_stand_queue_entries SET queue_seq=$2 WHERE id=$1", [entry.id, parking]);
      await client.query(
        "UPDATE taxi_stand_queue_entries SET queue_seq=$2, received_turn_from_driver_id=$3, updated_at=NOW() WHERE id=$1",
        [targetEntry.id, Number(entry.queue_seq), driver.id]
      );
      await client.query(
        "UPDATE taxi_stand_queue_entries SET queue_seq=$2, gave_turn_to_driver_id=$3, updated_at=NOW() WHERE id=$1",
        [entry.id, Number(targetEntry.queue_seq), toDriverId]
      );
      await refreshBoardingSlots(entry.stand_id, client);
      return { standId: entry.stand_id, mode: "SWAP", targetDriverId: toDriverId, stand };
    }

    // Not in the line yet: they have to clear exactly what joining normally
    // clears — approved for this stand's region, and actually standing there.
    // Their last published position is the only fact the server has about
    // where they are.
    const location = (await client.query(
      "SELECT lat, lng, accuracy, updated_at FROM driver_locations WHERE driver_id=$1",
      [toDriverId]
    )).rows[0];
    assertHandoverLocation(stand, location);

    await client.query(`
      UPDATE taxi_stand_queue_entries
      SET status='LEFT', left_at=NOW(), left_reason='GAVE_TURN', gave_turn_to_driver_id=$2, updated_at=NOW()
      WHERE id=$1
    `, [entry.id, toDriverId]);
    const created = (await client.query(`
      INSERT INTO taxi_stand_queue_entries(
        stand_id, driver_id, region_id, status, queue_seq, total_seats,
        destination_label, destination_region_id, price_per_seat,
        last_seen_at, last_lat, last_lng, received_turn_from_driver_id
      )
      VALUES($1,$2,$3,'WAITING',$4,$5,$6,$7,$8,NOW(),$9,$10,$11)
      RETURNING *
    `, [
      entry.stand_id,
      toDriverId,
      entry.region_id,
      Number(entry.queue_seq),
      Number(stand.default_seats),
      entry.destination_label,
      entry.destination_region_id,
      entry.price_per_seat,
      location?.lat ?? null,
      location?.lng ?? null,
      driver.id
    ])).rows[0];
    await refreshBoardingSlots(entry.stand_id, client);
    return { standId: entry.stand_id, mode: "TRANSFER", targetDriverId: toDriverId, stand, createdEntryId: created.id };
  });
}

// Heartbeat from the driver app. Returns whether the place is still held, so
// the caller can show "вы вне зоны стоянки" before the sweeper acts.
export async function touchPresence({ driverId, lat, lng }, executor) {
  const entry = (await run(executor, `
    SELECT e.*, s.lat stand_lat, s.lng stand_lng, s.radius_m
    FROM taxi_stand_queue_entries e
    JOIN taxi_stands s ON s.id=e.stand_id
    WHERE e.driver_id=$1 AND e.status IN ${LIVE_STATUSES}
  `, [driverId])).rows[0];
  if (!entry) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    // An open app is not proof that its car is still here. Preserve the last
    // actual fix and the existing grace period instead of renewing it forever
    // with null coordinates after permission/GPS was lost.
    return { entryId: entry.id, standId: entry.stand_id, inside: null, distanceM: null };
  }
  const distance = haversineMeters(Number(entry.stand_lat), Number(entry.stand_lng), Number(lat), Number(lng));
  const inside = distance <= Number(entry.radius_m);
  await run(executor, `
    UPDATE taxi_stand_queue_entries
    SET last_seen_at=NOW(),
        last_lat=$2,
        last_lng=$3,
        outside_since=CASE WHEN $4 THEN NULL ELSE COALESCE(outside_since, NOW()) END,
        updated_at=NOW()
    WHERE id=$1
  `, [entry.id, lat, lng, inside]);
  return {
    entryId: entry.id,
    standId: entry.stand_id,
    inside,
    distanceM: Math.round(distance),
    graceMinutes: OUT_OF_RANGE_GRACE_MINUTES
  };
}

export async function reserveSeat({ client: rider, entryId, seats, pickupLabel, pickupLat, pickupLng, comment }) {
  try {
    return await tx(async (dbClient) => {
      const entry = (await dbClient.query(`
        SELECT e.*, s.name stand_name
        FROM taxi_stand_queue_entries e
        JOIN taxi_stands s ON s.id=e.stand_id
        WHERE e.id=$1
        FOR UPDATE OF e
      `, [entryId])).rows[0];
      if (!entry) throw new AppError("Queue entry not found", 404, "STAND_ENTRY_NOT_FOUND");
      if (entry.status !== "BOARDING") {
        throw new AppError("This car is not taking passengers yet", 409, "STAND_ENTRY_NOT_BOARDING", { status: entry.status });
      }
      // Do not make a passenger wait for the periodic sweeper before booking
      // again after their previous request timed out. This only resolves
      // expired pending holds, never a confirmed seat.
      await dbClient.query(`UPDATE taxi_stand_seat_reservations
        SET status='EXPIRED', updated_at=NOW()
        WHERE client_id=$1 AND status='PENDING' AND expires_at <= clock_timestamp()`, [rider.id]);
      const existing = (await dbClient.query(`
        SELECT * FROM taxi_stand_seat_reservations
        WHERE client_id=$1 AND status IN ('PENDING','CONFIRMED')
      `, [rider.id])).rows[0];
      if (existing) {
        throw new AppError("You already hold a seat", 409, "STAND_RESERVATION_EXISTS", {
          reservationId: existing.id,
          entryId: existing.entry_id
        });
      }
      // Pending seats are held against the same free-seat count confirmed ones
      // draw down, or two riders could each be promised the last seat.
      const pending = (await dbClient.query(`
        SELECT COALESCE(SUM(seats), 0) held
        FROM taxi_stand_seat_reservations
        WHERE entry_id=$1 AND status='PENDING' AND (expires_at IS NULL OR expires_at > NOW())
      `, [entryId])).rows[0];
      const free = Number(entry.total_seats) - Number(entry.taken_seats) - Number(pending.held);
      if (seats > free) {
        throw new AppError("Not enough free seats", 409, "STAND_NOT_ENOUGH_SEATS", { freeSeats: Math.max(0, free) });
      }
      const created = (await dbClient.query(`
        INSERT INTO taxi_stand_seat_reservations(
          entry_id, stand_id, driver_id, client_id, seats, status, source,
          pickup_label, pickup_lat, pickup_lng, comment, expires_at
        )
        VALUES($1,$2,$3,$4,$5,'PENDING','APP',$6,$7,$8,$9, NOW() + INTERVAL '${RESERVATION_TTL_MINUTES} minutes')
        RETURNING *
      `, [
        entryId,
        entry.stand_id,
        entry.driver_id,
        rider.id,
        seats,
        pickupLabel || null,
        pickupLat ?? null,
        pickupLng ?? null,
        comment || null
      ])).rows[0];
      return { reservation: created, entry, standId: entry.stand_id };
    });
  } catch (error) {
    throw translateUniqueViolation(error);
  }
}

// Confirming/cancelling a seat locks its entry before its reservation row.
// The reverse order deadlocks with departure (entry -> reservations).
async function lockReservationEntry(reservationId, client) {
  const ref = (await client.query('SELECT entry_id FROM taxi_stand_seat_reservations WHERE id=$1', [reservationId])).rows[0];
  if (!ref) throw new AppError("Reservation not found", 404, "STAND_RESERVATION_NOT_FOUND");
  return (await client.query('SELECT * FROM taxi_stand_queue_entries WHERE id=$1 FOR UPDATE', [ref.entry_id])).rows[0];
}

export async function respondToReservation({ driver, reservationId, accept }) {
  return tx(async (client) => {
    const entry = await lockReservationEntry(reservationId, client);
    const reservation = (await client.query(`
      SELECT res.*, c.name client_name, c.phone client_phone,
        (res.expires_at IS NOT NULL AND res.expires_at <= clock_timestamp()) is_expired
      FROM taxi_stand_seat_reservations res
      LEFT JOIN clients c ON c.id=res.client_id
      WHERE res.id=$1
      FOR UPDATE OF res
    `, [reservationId])).rows[0];
    if (!reservation) throw new AppError("Reservation not found", 404, "STAND_RESERVATION_NOT_FOUND");
    if (reservation.driver_id !== driver.id) throw new AppError("Forbidden reservation", 403, "FORBIDDEN_STAND_RESERVATION");
    if (reservation.status !== "PENDING") {
      throw new AppError("Reservation is already resolved", 409, "STAND_RESERVATION_RESOLVED", { status: reservation.status });
    }
    if (reservation.is_expired) {
      throw new AppError("Время ожидания подтверждения истекло. Пассажиру нужно создать новую бронь.", 409, "STAND_RESERVATION_EXPIRED");
    }
    if (!accept) {
      const declined = (await client.query(`
        UPDATE taxi_stand_seat_reservations
        SET status='DECLINED', declined_at=NOW(), updated_at=NOW()
        WHERE id=$1 RETURNING *
      `, [reservationId])).rows[0];
      return { reservation: { ...declined, client_name: reservation.client_name, client_phone: reservation.client_phone }, standId: reservation.stand_id };
    }
    if (!entry || !["WAITING", "BOARDING"].includes(entry.status)) {
      throw new AppError("This place in the line is closed", 409, "STAND_ENTRY_NOT_LIVE", { status: entry?.status || "GONE" });
    }
    const otherHeld = Math.max(0, await pendingSeatsForEntry(entry.id, client) - Number(reservation.seats));
    const free = Number(entry.total_seats) - Number(entry.taken_seats) - otherHeld;
    if (Number(reservation.seats) > free) {
      throw new AppError("Not enough free seats", 409, "STAND_NOT_ENOUGH_SEATS", { freeSeats: Math.max(0, free) });
    }
    const confirmed = (await client.query(`
      UPDATE taxi_stand_seat_reservations
      SET status='CONFIRMED', confirmed_at=NOW(), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [reservationId])).rows[0];
    const updatedEntry = (await client.query(`
      UPDATE taxi_stand_queue_entries
      SET taken_seats=taken_seats+$2, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [reservation.entry_id, Number(reservation.seats)])).rows[0];
    return {
      reservation: { ...confirmed, client_name: reservation.client_name, client_phone: reservation.client_phone },
      entry: updatedEntry,
      standId: reservation.stand_id
    };
  });
}

export async function cancelReservation({ rider, reservationId }) {
  return tx(async (client) => {
    await lockReservationEntry(reservationId, client);
    const reservation = (await client.query(
      "SELECT * FROM taxi_stand_seat_reservations WHERE id=$1 FOR UPDATE",
      [reservationId]
    )).rows[0];
    if (!reservation) throw new AppError("Reservation not found", 404, "STAND_RESERVATION_NOT_FOUND");
    if (reservation.client_id !== rider.id) throw new AppError("Forbidden reservation", 403, "FORBIDDEN_STAND_RESERVATION");
    if (!["PENDING", "CONFIRMED"].includes(reservation.status)) {
      return { reservation, standId: reservation.stand_id, seatsReturned: 0 };
    }
    let seatsReturned = 0;
    if (reservation.status === "CONFIRMED") {
      await client.query(`
        UPDATE taxi_stand_queue_entries
        SET taken_seats=GREATEST(0, taken_seats-$2), updated_at=NOW()
        WHERE id=$1
      `, [reservation.entry_id, Number(reservation.seats)]);
      seatsReturned = Number(reservation.seats);
    }
    const cancelled = (await client.query(`
      UPDATE taxi_stand_seat_reservations
      SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [reservationId])).rows[0];
    return { reservation: cancelled, standId: reservation.stand_id, seatsReturned };
  });
}

// A place in a line says "this car is standing here, ready to fill up". Two
// things make that untrue the moment they happen and are not the driver
// pressing "выйти": going off the line, and accepting a dispatch order. Both
// call this, inside their own transaction, so a rider never calls a car whose
// driver has closed the app or is already on their way to someone else.
export async function releaseStandPlaceForDriver({ driverId, reason }, executor) {
  if (!executor || executor === defaultQuery) {
    return tx(client => releaseStandPlaceForDriver({ driverId, reason }, client));
  }
  const peek = (await run(executor, `SELECT stand_id FROM taxi_stand_queue_entries
    WHERE driver_id=$1 AND status IN ${LIVE_STATUSES}`, [driverId])).rows[0];
  if (!peek) return null;
  await lockStand(peek.stand_id, executor);
  const entry = (await run(executor, `
    SELECT * FROM taxi_stand_queue_entries
    WHERE driver_id=$1 AND stand_id=$2 AND status IN ${LIVE_STATUSES}
    FOR UPDATE
  `, [driverId, peek.stand_id])).rows[0];
  if (!entry) return null;
  const updated = (await run(executor, `
    UPDATE taxi_stand_queue_entries
    SET status='LEFT', left_at=NOW(), left_reason=$2, updated_at=NOW()
    WHERE id=$1
    RETURNING *
  `, [entry.id, reason])).rows[0];
  const strandedRows = (await run(executor, `
    UPDATE taxi_stand_seat_reservations
    SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW()
    WHERE entry_id=$1 AND status IN ('PENDING','CONFIRMED')
    RETURNING *
  `, [entry.id])).rows;
  const promoted = await refreshBoardingSlots(entry.stand_id, executor);
  return { entry: updated, standId: entry.stand_id, promoted, strandedRows };
}

export async function activeReservationForClient(clientId, executor) {
  return (await run(executor, `
    SELECT res.*, s.name stand_name, d.name driver_name, d.phone driver_phone,
           d.car_model, d.car_color, d.plate
    FROM taxi_stand_seat_reservations res
    JOIN taxi_stands s ON s.id=res.stand_id
    JOIN drivers d ON d.id=res.driver_id
    WHERE res.client_id=$1 AND res.status IN ('PENDING','CONFIRMED')
      AND (res.status='CONFIRMED' OR res.expires_at IS NULL OR res.expires_at > NOW())
    ORDER BY res.created_at DESC
    LIMIT 1
  `, [clientId])).rows[0] || null;
}

// Sweeper: the two ways a place in the line stops being real without anyone
// pressing anything — the car drove off, or the phone went dark.
export async function sweepStaleQueueEntries(executor = defaultQuery, { standId = null } = {}) {
  // Take one stand at a time, not entry/reservation locks across the country.
  // The optional scope is also used by isolated local integration checks.
  const candidates = (await run(executor, `
    SELECT DISTINCT stand_id FROM (
      SELECT stand_id FROM taxi_stand_queue_entries
      WHERE status IN ${LIVE_STATUSES} AND (
        outside_since < NOW() - INTERVAL '${OUT_OF_RANGE_GRACE_MINUTES} minutes'
        OR last_seen_at < NOW() - INTERVAL '${STALE_PRESENCE_MINUTES} minutes')
      UNION
      SELECT stand_id FROM taxi_stand_seat_reservations
      WHERE status='PENDING' AND expires_at <= NOW()
    ) candidates WHERE ($1::uuid IS NULL OR stand_id=$1)
    ORDER BY stand_id
  `, [standId])).rows;
  const result = { expired: [], expiredReservations: [], strandedByEntry: [], touchedStands: [] };
  for (const candidate of candidates) {
    const sweep = async (client) => {
      // A stand can be deleted between the candidate read and its turn.
      const found = (await run(client, 'SELECT id FROM taxi_stands WHERE id=$1 FOR UPDATE', [candidate.stand_id])).rows[0];
      if (!found) return null;
      // Same entry-before-reservation order as seat confirmation/cancellation.
      await run(client, `SELECT e.id FROM taxi_stand_queue_entries e
        WHERE e.stand_id=$1 AND (e.status IN ${LIVE_STATUSES} OR EXISTS (
          SELECT 1 FROM taxi_stand_seat_reservations res WHERE res.entry_id=e.id AND res.status='PENDING'))
        ORDER BY e.id FOR UPDATE`, [candidate.stand_id]);
      const expired = (await run(client, `
        UPDATE taxi_stand_queue_entries SET status='EXPIRED', left_at=NOW(),
          left_reason=CASE WHEN outside_since < NOW() - INTERVAL '${OUT_OF_RANGE_GRACE_MINUTES} minutes'
            THEN 'LEFT_AREA' ELSE 'NO_SIGNAL' END, updated_at=NOW()
        WHERE stand_id=$1 AND status IN ${LIVE_STATUSES} AND (
          outside_since < NOW() - INTERVAL '${OUT_OF_RANGE_GRACE_MINUTES} minutes'
          OR last_seen_at < NOW() - INTERVAL '${STALE_PRESENCE_MINUTES} minutes')
        RETURNING *
      `, [candidate.stand_id])).rows;
      const expiredReservations = (await run(client, `
        UPDATE taxi_stand_seat_reservations SET status='EXPIRED', updated_at=NOW()
        WHERE stand_id=$1 AND status='PENDING' AND expires_at <= NOW() RETURNING *
      `, [candidate.stand_id])).rows;
      const strandedByEntry = expired.length ? (await run(client, `
        UPDATE taxi_stand_seat_reservations SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW()
        WHERE entry_id = ANY($1::uuid[]) AND status IN ('PENDING','CONFIRMED') RETURNING *
      `, [expired.map(row => row.id)])).rows : [];
      if (expired.length) await refreshBoardingSlots(candidate.stand_id, client);
      return { expired, expiredReservations, strandedByEntry };
    };
    const batch = executor === defaultQuery ? await tx(sweep) : await sweep(executor);
    if (!batch) continue;
    result.expired.push(...batch.expired);
    result.expiredReservations.push(...batch.expiredReservations);
    result.strandedByEntry.push(...batch.strandedByEntry);
    if (batch.expired.length) result.touchedStands.push(candidate.stand_id);
  }
  return result;
}

export { refreshBoardingSlots };

import { query } from "../../db/pool.js";
import { runFollowUpObservation } from "./cancellation-review.service.js";
import { runDistributedJob } from "../../common/distributedJob.js";

// A cancellation tells you what someone clicked. Where the car went in the
// next few minutes tells you what actually happened, and that can only be
// read after the fact — hence a scheduler rather than a check at cancel time.
const TICK_INTERVAL_MS = 120_000;
// Long enough for a real trip to be visibly under way, short enough that the
// driver's last published position still belongs to this episode.
const OBSERVE_AFTER_MINUTES = 8;
const OBSERVE_BEFORE_MINUTES = 40;
const BATCH = 20;

let intervalHandle = null;

async function findDueAudits() {
  return (await query(`
    SELECT * FROM order_cancellation_audits
    WHERE follow_up_status='PENDING'
      AND driver_id IS NOT NULL
      AND created_at <= NOW() - INTERVAL '${OBSERVE_AFTER_MINUTES} minutes'
    ORDER BY created_at ASC
    LIMIT ${BATCH}
  `)).rows;
}

export async function cancellationReviewTick() {
  const due = await findDueAudits();
  let observed = 0;
  for (const audit of due) {
    const ageMinutes = (Date.now() - new Date(audit.created_at).getTime()) / 60_000;
    if (ageMinutes > OBSERVE_BEFORE_MINUTES) {
      // Too old to attribute the driver's current position to this
      // cancellation — closing it as skipped is the honest outcome, not a
      // guess dressed up as evidence.
      await query(
        "UPDATE order_cancellation_audits SET follow_up_status='SKIPPED', follow_up_checked_at=NOW(), updated_at=NOW() WHERE id=$1",
        [audit.id]
      );
      continue;
    }
    try {
      await runFollowUpObservation({ audit });
      observed += 1;
    } catch (error) {
      console.error("[cancellation-review] follow-up failed", { auditId: audit.id, error });
    }
  }
  return { due: due.length, observed };
}

export function startCancellationReviewScheduler() {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    runDistributedJob("onedriver:cancellation-review", cancellationReviewTick)
      .catch((error) => console.error("[cancellation-review] tick failed", error));
  }, TICK_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

export function stopCancellationReviewScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

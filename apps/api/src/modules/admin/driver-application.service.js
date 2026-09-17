import { AppError } from '../../common/errors.js';

const run = (db, sql, values = []) => db.query ? db.query(sql, values) : db(sql, values);
const fail = (code, message, status = 409) => { throw new AppError(message, status, code); };

// Transactions always lock the applicant user before their application. This
// serializes duplicate submissions/reviews without claiming a phone-only record.
export async function submitDriverApplication({ userId, body, executor }) {
  const user = (await run(executor, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
  if (!user?.is_active || !['CLIENT', 'DRIVER'].includes(user.role)) fail('FORBIDDEN', 'Applicant account unavailable', 403);
  const current = (await run(executor, "SELECT * FROM driver_applications WHERE user_id=$1 AND status IN ('PENDING','NEEDS_INFO','APPROVED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [userId])).rows[0];
  if (current?.status === 'APPROVED') return current;
  if (user.role !== 'CLIENT' || (await run(executor, 'SELECT id FROM drivers WHERE user_id=$1', [userId])).rows.length) {
    fail('DRIVER_PROFILE_EXISTS', 'Use the existing driver profile');
  }
  if (!/^\+77\d{9}$/.test(user.phone || '')) fail('APPLICATION_ACCOUNT_PHONE_REQUIRED', 'Sign in with a verified Kazakhstan phone', 403);
  if (body.phone && body.phone.replace(/[^+\d]/g, '') !== user.phone) fail('APPLICATION_PHONE_MISMATCH', 'Use your signed-in account phone', 400);
  if (current) {
    // Retry is idempotent. Corrections are allowed only after a reviewer asks.
    if (current.status === 'PENDING') return current;
    return (await run(executor, `UPDATE driver_applications SET full_name=$2,car_model=$3,car_color=$4,plate_number=$5,year=$6,
      status='PENDING',comment=$7,reviewed_at=NULL WHERE id=$1 RETURNING *`,
    [current.id, body.fullName, body.carModel, body.carColor || null, body.plateNumber, body.year || null, body.comment])).rows[0];
  }
  // New applicants require explicit owner review; the legacy automatic-status
  // setting cannot provision accounts or grant regional access implicitly.
  return (await run(executor, `INSERT INTO driver_applications(user_id,full_name,phone,car_model,car_color,plate_number,year,status,comment)
    VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',$8) RETURNING *`,
  [userId, body.fullName, user.phone, body.carModel, body.carColor || null, body.plateNumber, body.year || null, body.comment])).rows[0];
}

export async function reviewDriverApplication({ id, status, comment, regionId, actorUserId, executor }) {
  const peek = (await run(executor, 'SELECT user_id FROM driver_applications WHERE id=$1', [id])).rows[0];
  if (!peek) fail('DRIVER_APPLICATION_NOT_FOUND', 'Application not found', 404);
  const user = peek.user_id ? (await run(executor, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [peek.user_id])).rows[0] : null;
  const before = (await run(executor, 'SELECT * FROM driver_applications WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (before.driver_id) {
    if (status === 'APPROVED' && before.region_id === regionId) return { before, application: before };
    fail('APPLICATION_ALREADY_PROVISIONED', 'Manage an approved driver in their driver profile');
  }
  let driverId = null;
  if (status === 'APPROVED') {
    if (!user || !user.is_active || before.user_id !== user.id || user.role !== 'CLIENT' || user.phone !== before.phone) {
      fail('APPLICATION_ACCOUNT_REQUIRED', 'Applicant must submit from their own signed-in account');
    }
    if (!regionId) fail('APPLICATION_REGION_REQUIRED', 'Select the approved work region', 400);
    const region = (await run(executor, 'SELECT id FROM regions WHERE id=$1 AND is_active=true FOR SHARE', [regionId])).rows[0];
    if (!region) fail('REGION_NOT_FOUND', 'Active region not found', 404);
    if ((await run(executor, 'SELECT id FROM drivers WHERE user_id=$1', [user.id])).rows.length) fail('DRIVER_PROFILE_EXISTS', 'Driver profile already exists');
    const driver = (await run(executor, `INSERT INTO drivers(user_id,name,phone,car_model,car_color,plate,status,current_region_id)
      VALUES($1,$2,$3,$4,$5,$6,'OFFLINE',$7) RETURNING id`,
    [user.id, before.full_name, user.phone, before.car_model, before.car_color, before.plate_number, regionId])).rows[0];
    driverId = driver.id;
    await run(executor, `INSERT INTO driver_region_approvals(driver_id,region_id,status,approved_by_user_id,approved_at)
      VALUES($1,$2,'APPROVED',$3,NOW())`, [driverId, regionId, actorUserId]);
    await run(executor, "UPDATE users SET role='DRIVER' WHERE id=$1", [user.id]);
    // Keep the applicant's existing passenger session and password, history and
    // wallet. Switching mode issues a server-approved driver token afterward.
    await run(executor, 'UPDATE driver_documents SET driver_id=$1 WHERE driver_application_id=$2', [driverId, id]);
  }
  const application = (await run(executor, `UPDATE driver_applications SET status=$1,comment=$2,reviewed_at=NOW(),
    driver_id=$4,region_id=$5 WHERE id=$3 RETURNING *`, [status, comment, id, driverId, status === 'APPROVED' ? regionId : null])).rows[0];
  return { before, application };
}

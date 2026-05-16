import { query } from "../db/pool.js";

function run(executor, sql, params) {
  return executor.query ? executor.query(sql, params) : executor(sql, params);
}

export async function writeAudit(executor = query, {
  action,
  actorUserId = null,
  entityType = null,
  entityId = null,
  metadata = {},
  req = null
}) {
  if (!action) return;

  await run(executor, `
    INSERT INTO audit_logs(action, actor_user_id, entity_type, entity_id, metadata, ip, user_agent)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)
  `, [
    action,
    actorUserId,
    entityType,
    entityId,
    JSON.stringify(metadata || {}),
    req?.ip || null,
    req?.headers?.["user-agent"] || null
  ]);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role
  };
}

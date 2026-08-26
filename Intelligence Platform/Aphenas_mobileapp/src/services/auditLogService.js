import pool from '../config/db.js';
import { requestContext } from './requestSecurityService.js';

export async function writeAuditLog({
  eventType,
  actorUserId = null,
  targetUserId = null,
  targetType = null,
  targetId = null,
  req = null,
  metadata = {},
}) {
  if (!eventType) return;
  const context = req ? requestContext(req) : {};
  try {
    await pool.query(
      `INSERT INTO audit_log (
        event_type,
        actor_user_id,
        target_user_id,
        target_type,
        target_id,
        ip_address,
        device_id_hash,
        user_agent,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::inet, $7, $8, $9::jsonb)`,
      [
        eventType,
        actorUserId,
        targetUserId,
        targetType,
        targetId ? String(targetId).slice(0, 120) : null,
        context.ipAddress || null,
        context.deviceIdHash || null,
        context.userAgent || null,
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}

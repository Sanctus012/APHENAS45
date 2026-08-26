import crypto from 'crypto';
import pool from '../config/db.js';
import { writeAuditLog } from '../services/auditLogService.js';

function chatPinPepper() {
  const configuredPepper = process.env.CHAT_PIN_PEPPER || process.env.RECOVERY_PHRASE_PEPPER;
  const environment = process.env.NODE_ENV || 'development';

  if (configuredPepper) return configuredPepper;
  if (environment === 'development' || environment === 'test') return 'aphenas-chat-pin';

  throw new Error('CHAT_PIN_PEPPER must be configured outside development.');
}

const pepper = chatPinPepper();

function userId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Valid userId is required');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(`${pepper}:${pin}`).digest('hex');
}

function validPin(pin) {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

export async function verifyChatPinForUser(id, pin) {
  const parsedId = userId(id);
  if (!validPin(pin)) {
    const error = new Error('Chat PIN must contain exactly six digits');
    error.statusCode = 400;
    throw error;
  }
  const result = await pool.query('SELECT pin_hash FROM chat_settings WHERE user_id = $1', [parsedId]);
  if (result.rowCount === 0) {
    const error = new Error('Chat PIN has not been set');
    error.statusCode = 404;
    throw error;
  }
  const expected = Buffer.from(result.rows[0].pin_hash, 'hex');
  const actual = Buffer.from(hashPin(pin), 'hex');
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!ok) {
    const error = new Error('Incorrect chat PIN');
    error.statusCode = 401;
    throw error;
  }
  return true;
}

export function unlockExpiryForPeriod(period) {
  const normalized = String(period || '').trim().toLowerCase();
  const days = normalized === '14days' ? 14 : normalized === '30days' ? 30 : normalized === '80days' ? 80 : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function setChatPin(req, res) {
  try {
    const id = userId(req.user?.id);
    if (!validPin(req.body.pin)) return res.status(400).json({ success: false, message: 'Chat PIN must contain exactly six digits' });
    await pool.query(
      `INSERT INTO chat_settings (user_id, pin_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = NOW()`,
      [id, hashPin(req.body.pin)]
    );
    await writeAuditLog({
      eventType: 'chat_pin_changed',
      actorUserId: id,
      targetUserId: id,
      req,
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('Unable to set chat PIN:', error);
    return res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || 'Unable to set chat PIN' });
  }
}

export async function verifyChatPin(req, res) {
  try {
    const id = userId(req.user?.id);
    await verifyChatPinForUser(id, req.body.pin);
    await writeAuditLog({
      eventType: 'chat_pin_verified',
      actorUserId: id,
      targetUserId: id,
      req,
    });
    return res.status(200).json({ success: true, message: 'Chat PIN verified' });
  } catch (error) {
    console.error('Unable to verify chat PIN:', error);
    return res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || 'Unable to verify chat PIN' });
  }
}

import 'dotenv/config';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { hashDeviceId } from './requestSecurityService.js';

const TOKEN_ISSUER = 'aphenas-backend';
const TOKEN_AUDIENCE = 'aphenas-mobile';
const TOKEN_ALGORITHM = 'HS256';
const ACCESS_TOKEN_TTL_SECONDS = 20 * 60;
const REFRESH_TOKEN_TTL_DAYS = 30;

function sessionSecret() {
  const secret = process.env.SESSION_TOKEN_SECRET || process.env.ONBOARDING_TOKEN_SECRET;
  if (!secret) throw new Error('SESSION_TOKEN_SECRET is not configured');
  return secret;
}

function refreshTokenHash(refreshToken) {
  return crypto.createHash('sha256').update(String(refreshToken || '')).digest('hex');
}

function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function accessExpiry() {
  return new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
}

export function createSessionToken({ userId, serviceId, role, sessionId }) {
  return jwt.sign(
    {
      serviceId,
      role,
      purpose: 'session',
      sid: sessionId,
    },
    sessionSecret(),
    {
      algorithm: TOKEN_ALGORITHM,
      subject: String(userId),
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    }
  );
}

export async function createSessionPair({ userId, serviceId, role, deviceId, ipAddress = null, userAgent = null }) {
  const deviceIdHash = hashDeviceId(deviceId);
  if (!deviceIdHash) {
    const error = new Error('Device identifier is required');
    error.statusCode = 400;
    throw error;
  }

  const sessionId = crypto.randomUUID();
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const accessExpiresAt = accessExpiry();
  const refreshExpiresAt = refreshExpiry();

  await pool.query(
    `INSERT INTO sessions (
      id,
      user_id,
      device_id_hash,
      refresh_token_hash,
      user_agent,
      ip_address,
      access_expires_at,
      refresh_expires_at
    )
    VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::inet, $7, $8)`,
    [
      sessionId,
      userId,
      deviceIdHash,
      refreshTokenHash(refreshToken),
      userAgent || null,
      ipAddress || null,
      accessExpiresAt,
      refreshExpiresAt,
    ]
  );

  return {
    authToken: createSessionToken({ userId, serviceId, role, sessionId }),
    refreshToken,
    sessionId,
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export function verifySessionToken(token) {
  const payload = jwt.verify(token, sessionSecret(), {
    algorithms: [TOKEN_ALGORITHM],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });

  if (payload.purpose !== 'session') {
    throw new Error('Invalid session token');
  }

  return {
    userId: Number(payload.sub),
    serviceId: payload.serviceId,
    role: payload.role,
    sessionId: payload.sid,
  };
}

export async function validateSession({ session, deviceId }) {
  if (!session?.sessionId) throw new Error('Invalid session token');
  const deviceIdHash = hashDeviceId(deviceId);
  if (!deviceIdHash) {
    const error = new Error('Device identifier is required');
    error.statusCode = 401;
    throw error;
  }
  const result = await pool.query(
    `SELECT id, user_id, device_id_hash, revoked_at, refresh_expires_at
       FROM sessions
      WHERE id = $1
        AND user_id = $2
      LIMIT 1`,
    [session.sessionId, session.userId]
  );
  const row = result.rows[0];
  if (!row || row.revoked_at || row.refresh_expires_at <= new Date()) {
    const error = new Error('Session has expired or was revoked');
    error.statusCode = 401;
    throw error;
  }
  if (row.device_id_hash !== deviceIdHash) {
    const error = new Error('Session device mismatch');
    error.statusCode = 401;
    throw error;
  }
  return row;
}

export async function refreshSession({ refreshToken, deviceId, ipAddress = null, userAgent = null }) {
  const deviceIdHash = hashDeviceId(deviceId);
  if (!refreshToken || !deviceIdHash) {
    const error = new Error('Refresh token and device identifier are required');
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `SELECT s.id, s.user_id, s.device_id_hash, s.revoked_at, s.refresh_expires_at,
            p.service_id, p.role
       FROM sessions s
       JOIN accounts_profile p ON p.user_id = s.user_id
      WHERE s.refresh_token_hash = $1
      LIMIT 1`,
    [refreshTokenHash(refreshToken)]
  );
  const row = result.rows[0];
  if (!row || row.revoked_at || row.refresh_expires_at <= new Date() || row.device_id_hash !== deviceIdHash) {
    const error = new Error('Invalid or expired refresh session');
    error.statusCode = 401;
    throw error;
  }

  const nextRefreshToken = crypto.randomBytes(48).toString('base64url');
  const accessExpiresAt = accessExpiry();
  const refreshExpiresAt = refreshExpiry();
  await pool.query(
    `UPDATE sessions
        SET refresh_token_hash = $1,
            access_expires_at = $2,
            refresh_expires_at = $3,
            ip_address = NULLIF($4, '')::inet,
            user_agent = $5
      WHERE id = $6`,
    [refreshTokenHash(nextRefreshToken), accessExpiresAt, refreshExpiresAt, ipAddress || null, userAgent || null, row.id]
  );

  return {
    authToken: createSessionToken({
      userId: row.user_id,
      serviceId: row.service_id,
      role: row.role,
      sessionId: row.id,
    }),
    refreshToken: nextRefreshToken,
    sessionId: row.id,
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export async function revokeSession({ sessionId, revokedBy = null, reason = 'revoked' }) {
  const result = await pool.query(
    `UPDATE sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoked_by = $2,
            revoked_reason = $3
      WHERE id = $1
      RETURNING id, user_id, revoked_at`,
    [sessionId, revokedBy, String(reason || 'revoked').slice(0, 200)]
  );
  return result.rows[0] || null;
}

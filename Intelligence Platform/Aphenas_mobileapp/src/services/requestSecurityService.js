import crypto from 'crypto';

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || null;
}

export function deviceIdFromRequest(req) {
  return String(req.headers['x-aphenas-device-id'] || req.body?.deviceId || req.query?.deviceId || '').trim();
}

export function hashDeviceId(deviceId) {
  const value = String(deviceId || '').trim();
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function requestContext(req) {
  const deviceId = deviceIdFromRequest(req);
  return {
    ipAddress: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    deviceId,
    deviceIdHash: hashDeviceId(deviceId),
  };
}

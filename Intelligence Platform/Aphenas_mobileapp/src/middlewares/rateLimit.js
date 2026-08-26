import { writeAuditLog } from '../services/auditLogService.js';
import { clientIp } from '../services/requestSecurityService.js';

const buckets = new Map();

function cleanup(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function createRateLimiter({
  name,
  max = 5,
  windowMs = 15 * 60 * 1000,
  cooldownMs = 15 * 60 * 1000,
  keyGenerator = (req) => clientIp(req) || 'unknown',
  auditEvent = 'rate_limit_exceeded',
  onLimit = null,
}) {
  return async function rateLimiter(req, res, next) {
    const now = Date.now();
    cleanup(now);
    const key = `${name}:${keyGenerator(req)}`;
    const current = buckets.get(key) || { count: 0, resetAt: now + windowMs, lockedUntil: 0 };

    if (current.lockedUntil > now) {
      res.set('Retry-After', String(Math.ceil((current.lockedUntil - now) / 1000)));
      return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    }

    current.count += 1;
    if (current.count > max) {
      current.lockedUntil = now + cooldownMs;
      current.resetAt = current.lockedUntil;
      buckets.set(key, current);
      if (onLimit) await onLimit(req, { key, name, cooldownMs });
      await writeAuditLog({
        eventType: auditEvent,
        actorUserId: req.user?.id || null,
        targetUserId: req.user?.id || null,
        req,
        metadata: { limiter: name, key },
      });
      res.set('Retry-After', String(Math.ceil(cooldownMs / 1000)));
      return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    }

    buckets.set(key, current);
    return next();
  };
}

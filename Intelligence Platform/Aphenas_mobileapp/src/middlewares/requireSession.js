import { findOfficerByUserId } from '../models/authModel.js';
import { validateSession, verifySessionToken } from '../services/sessionTokenService.js';
import { deviceIdFromRequest } from '../services/requestSecurityService.js';

export async function requireSession(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  try {
    const session = verifySessionToken(authorization.substring(7));
    await validateSession({ session, deviceId: deviceIdFromRequest(req) });
    const officer = await findOfficerByUserId(session.userId);

    if (!officer || officer.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'This account is not active.',
      });
    }
    if (officer.locked_until && new Date(officer.locked_until) > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Try again later.',
      });
    }

    req.user = {
      id: Number(session.userId),
      userId: Number(session.userId),
      serviceId: session.serviceId,
      role: session.role,
      sessionId: session.sessionId,
      officer,
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session.',
    });
  }
}

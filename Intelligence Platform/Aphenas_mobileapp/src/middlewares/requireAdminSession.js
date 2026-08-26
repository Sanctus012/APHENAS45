import { findOfficerByUserId } from '../models/authModel.js';
import { validateSession, verifySessionToken } from '../services/sessionTokenService.js';
import { deviceIdFromRequest } from '../services/requestSecurityService.js';

export async function requireAdminSession(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required.',
    });
  }

  try {
    const session = verifySessionToken(authorization.substring(7));
    await validateSession({ session, deviceId: deviceIdFromRequest(req) });
    const officer = await findOfficerByUserId(session.userId);

    if (!officer || officer.role !== 'admin' || officer.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Only Aphenas administrators can provision officers.',
      });
    }
    if (officer.locked_until && new Date(officer.locked_until) > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Try again later.',
      });
    }

    req.adminOfficer = officer;
    req.user = {
      id: Number(session.userId),
      userId: Number(session.userId),
      serviceId: session.serviceId,
      role: session.role,
      sessionId: session.sessionId,
      officer,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired admin session.',
    });
  }
}

import express from 'express';

import {
  provisionOfficer,
  previewSecureId,
} from '../controllers/provisioningController.js';
import { requireAdminSession } from '../middlewares/requireAdminSession.js';
import { revokeSession } from '../services/sessionTokenService.js';
import { writeAuditLog } from '../services/auditLogService.js';

const router = express.Router();

router.get(
  '/secure-id',
  requireAdminSession,
  previewSecureId
);

router.post(
  '/officers',
  requireAdminSession,
  provisionOfficer
);

router.delete(
  '/sessions/:sessionId',
  requireAdminSession,
  async (req, res) => {
    try {
      const session = await revokeSession({
        sessionId: req.params.sessionId,
        revokedBy: req.user.id,
        reason: req.body?.reason || 'admin_revoked',
      });
      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found.' });
      }
      await writeAuditLog({
        eventType: 'admin_session_revoked',
        actorUserId: req.user.id,
        targetUserId: session.user_id,
        targetType: 'session',
        targetId: session.id,
        req,
      });
      return res.json({ success: true, session });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Unable to revoke session.' });
    }
  }
);

export default router;

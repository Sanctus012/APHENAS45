import express from 'express';
import {
  acknowledgeBroadcast,
  createCommandBroadcast,
  createSitrep,
  listCommandBroadcasts,
  listSitreps,
} from '../messaging/models/messageModel.js';
import { requireSession } from '../middlewares/requireSession.js';
import { writeAuditLog } from '../services/auditLogService.js';

const router = express.Router();
router.use(requireSession);

function respondError(res, error, fallback) {
  const status = Number(error.statusCode) || 500;
  console.error(error);
  return res.status(status).json({ success: false, message: status === 500 ? fallback : error.message });
}

router.get('/sitreps', async (req, res) => {
  try {
    const sitreps = await listSitreps(req.user.id, req.query.status || null);
    return res.json({ success: true, sitreps });
  } catch (error) {
    return respondError(res, error, 'Unable to load SITREPs');
  }
});

router.post('/sitreps', async (req, res) => {
  try {
    const sitrep = await createSitrep({
      senderId: req.user.id,
      conversationId: req.body?.conversationId || null,
      status: req.body?.status,
      note: req.body?.note,
      latitude: req.body?.latitude ?? null,
      longitude: req.body?.longitude ?? null,
    });
    return res.status(201).json({ success: true, sitrep });
  } catch (error) {
    return respondError(res, error, 'Unable to send SITREP');
  }
});

router.get('/broadcasts', async (req, res) => {
  try {
    const broadcasts = await listCommandBroadcasts(req.user.id);
    return res.json({ success: true, broadcasts });
  } catch (error) {
    return respondError(res, error, 'Unable to load broadcasts');
  }
});

router.post('/broadcasts', async (req, res) => {
  try {
    if (req.user.officer?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only Aphenas administrators can send command broadcasts.' });
    }
    const broadcast = await createCommandBroadcast({
      senderId: req.user.id,
      conversationId: req.body?.conversationId,
      title: req.body?.title,
      body: req.body?.body,
      priority: req.body?.priority,
      escalationMinutes: req.body?.escalationMinutes,
    });
    await writeAuditLog({
      eventType: 'admin_command_broadcast',
      actorUserId: req.user.id,
      targetType: 'conversation',
      targetId: req.body?.conversationId,
      req,
      metadata: { broadcastId: broadcast.id, priority: broadcast.priority },
    });
    return res.status(201).json({ success: true, broadcast });
  } catch (error) {
    return respondError(res, error, 'Unable to send broadcast');
  }
});

router.post('/broadcasts/:id/ack', async (req, res) => {
  try {
    const acknowledgment = await acknowledgeBroadcast({
      broadcastId: req.params.id,
      userId: req.user.id,
    });
    return res.json({ success: true, acknowledgment });
  } catch (error) {
    return respondError(res, error, 'Unable to acknowledge broadcast');
  }
});

export default router;

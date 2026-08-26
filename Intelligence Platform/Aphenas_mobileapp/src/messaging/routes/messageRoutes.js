import express from 'express';
import {
  createChat,
  sendMessage,
  fetchMessages,
  deliveredMessage,
  readMessage,
  editMessage,
  deleteMessage,
  lockMessage,
  unlockMessage,
} from '../controllers/messageController.js';
import { requireSession } from '../../middlewares/requireSession.js';
import { createRateLimiter } from '../../middlewares/rateLimit.js';
import { recordLoginFailure } from '../../models/authModel.js';

const router = express.Router();
const messageUnlockLimiter = createRateLimiter({
  name: 'message_unlock',
  max: 5,
  windowMs: 15 * 60 * 1000,
  cooldownMs: 15 * 60 * 1000,
  keyGenerator: (req) => `${req.user?.id || 'unknown'}:${req.params.messageId}:${req.ip}`,
  auditEvent: 'message_unlock_rate_limit_exceeded',
  onLimit: async (req) => {
    if (req.user?.id) await recordLoginFailure(req.user.id, 1, 15);
  },
});

router.use(requireSession);

router.post('/create', createChat);
router.post('/send', sendMessage);
router.get('/:conversationId', fetchMessages);
router.post('/:messageId/delivered', deliveredMessage);
router.post('/:messageId/read', readMessage);
router.post('/:messageId/lock', lockMessage);
router.post('/:messageId/unlock', messageUnlockLimiter, unlockMessage);
router.patch('/:messageId', editMessage);
router.delete('/:messageId', deleteMessage);

export default router;

import express from 'express';
import pool from '../config/db.js';
import { setChatPin, verifyChatPin } from '../controllers/chatPinController.js';
import { requireSession } from '../middlewares/requireSession.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { recordLoginFailure } from '../models/authModel.js';

const router = express.Router();
router.use(requireSession);
const chatPinVerifyLimiter = createRateLimiter({
  name: 'chat_pin_verify',
  max: 5,
  windowMs: 15 * 60 * 1000,
  cooldownMs: 15 * 60 * 1000,
  keyGenerator: (req) => `${req.user?.id || 'unknown'}:${req.params.userId}:${req.ip}`,
  auditEvent: 'chat_pin_verify_rate_limit_exceeded',
  onLimit: async (req) => {
    if (req.user?.id) await recordLoginFailure(req.user.id, 1, 15);
  },
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), p.display_name, p.service_id) AS name,
              COALESCE(p.display_name, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), p.service_id) AS display_name,
              p.service_id,
              p.rank_title AS rank,
              p.unit,
              p.role,
              p.status
         FROM auth_user u
         JOIN accounts_profile p ON p.user_id = u.id
        WHERE u.is_active = TRUE
        ORDER BY name ASC, u.id ASC`
    );

    return res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('Unable to load users:', error);
    return res.status(500).json({ success: false, message: 'Unable to load users' });
  }
});

router.post('/:userId/chat-pin', setChatPin);
router.post('/:userId/chat-pin/verify', chatPinVerifyLimiter, verifyChatPin);

export default router;

import express from 'express';
import pool from '../config/db.js';
import {
  addMemberToConversation,
  createConversation,
  isConversationMember,
  listConversationsForUser,
  clearConversationHistory,
  getConversationUnlock,
  setConversationUnlockedUntil,
} from '../messaging/models/messageModel.js';
import { unlockExpiryForPeriod, verifyChatPinForUser } from '../controllers/chatPinController.js';
import { requireSession } from '../middlewares/requireSession.js';
import { createRateLimiter } from '../middlewares/rateLimit.js';
import { writeAuditLog } from '../services/auditLogService.js';
import { recordLoginFailure } from '../models/authModel.js';

const router = express.Router();
router.use(requireSession);
const chatUnlockLimiter = createRateLimiter({
  name: 'chat_unlock',
  max: 5,
  windowMs: 15 * 60 * 1000,
  cooldownMs: 15 * 60 * 1000,
  keyGenerator: (req) => `${req.user?.id || 'unknown'}:${req.params.id}:${req.ip}`,
  auditEvent: 'chat_unlock_rate_limit_exceeded',
  onLimit: async (req) => {
    if (req.user?.id) await recordLoginFailure(req.user.id, 1, 15);
  },
});

function numberId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`${label} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function respondError(res, error, fallback = 'Unable to complete request') {
  const status = Number(error.statusCode) || 500;
  console.error(error);
  return res.status(status).json({ success: false, message: status === 500 ? fallback : error.message });
}

router.get('/:userId', async (req, res) => {
  try {
    const conversations = await listConversationsForUser(req.user.id, req.query.type || null);
    return res.json({ success: true, conversations });
  } catch (error) {
    return respondError(res, error, 'Unable to load conversations');
  }
});

router.get('/:id/unlock-status', async (req, res) => {
  try {
    const unlock = await getConversationUnlock(req.params.id, req.user.id);
    return res.json({
      success: true,
      locked: !unlock,
      unlockedUntil: unlock?.unlocked_until || null,
    });
  } catch (error) {
    return respondError(res, error, 'Unable to load unlock status');
  }
});

router.post('/:id/unlock', chatUnlockLimiter, async (req, res) => {
  try {
    await verifyChatPinForUser(req.user.id, req.body?.pin);
    const unlockedUntil = unlockExpiryForPeriod(req.body?.validityPeriod);
    const unlock = await setConversationUnlockedUntil(req.params.id, req.user.id, unlockedUntil);
    await writeAuditLog({
      eventType: 'chat_unlock',
      actorUserId: req.user.id,
      targetUserId: req.user.id,
      targetType: 'conversation',
      targetId: req.params.id,
      req,
      metadata: { unlockedUntil: unlock.unlocked_until },
    });
    return res.json({
      success: true,
      locked: false,
      unlockedUntil: unlock.unlocked_until,
    });
  } catch (error) {
    return respondError(res, error, 'Unable to unlock conversation');
  }
});

router.post('/direct', async (req, res) => {
  try {
    const userId = req.user.id;
    const participantId = numberId(req.body.participantId, 'participantId');

    if (userId === participantId) {
      return res.status(400).json({ success: false, message: 'A direct chat needs another officer' });
    }

    const participantProfile = await pool.query(
      `SELECT COALESCE(
                NULLIF(TRIM(p.display_name), ''),
                NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                NULLIF(TRIM(p.service_id), ''),
                'Officer'
              ) AS display_name,
              p.service_id,
              p.rank_title AS rank,
              p.unit
         FROM auth_user u
         JOIN accounts_profile p ON p.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [participantId]
    );
    if (participantProfile.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Selected officer was not found' });
    }
    const selectedOfficer = participantProfile.rows[0];

    const existing = await pool.query(
      `SELECT c.id
         FROM conversations c
         JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.left_at IS NULL
        WHERE c.type = 'DIRECT'
        GROUP BY c.id
       HAVING COUNT(DISTINCT cm.user_id) = 2
          AND COUNT(*) = 2
          AND COUNT(*) FILTER (WHERE cm.user_id IN ($1, $2)) = 2
        ORDER BY c.id DESC
        LIMIT 1`,
      [userId, participantId]
    );

    if (existing.rowCount > 0) {
      await pool.query(
        `UPDATE conversations
            SET title = COALESCE(NULLIF(title, ''), $1)
          WHERE id = $2`,
        [selectedOfficer.display_name, existing.rows[0].id]
      );
      return res.json({
        success: true,
        conversationId: existing.rows[0].id,
        existing: true,
        participant: { id: participantId, name: selectedOfficer.display_name, serviceId: selectedOfficer.service_id, rank: selectedOfficer.rank, unit: selectedOfficer.unit },
      });
    }

    const conversation = await createConversation('DIRECT', selectedOfficer.display_name, userId);
    await addMemberToConversation({ conversationId: conversation.id, userId, role: 'OWNER' });
    await addMemberToConversation({ conversationId: conversation.id, userId: participantId });

    return res.status(201).json({
      success: true,
      conversationId: conversation.id,
      conversation: { ...conversation, name: selectedOfficer.display_name, participant_id: participantId, participant_name: selectedOfficer.display_name, participant_service_id: selectedOfficer.service_id },
      participant: { id: participantId, name: selectedOfficer.display_name, serviceId: selectedOfficer.service_id, rank: selectedOfficer.rank, unit: selectedOfficer.unit },
    });
  } catch (error) {
    return respondError(res, error, 'Unable to create direct conversation');
  }
});

router.post('/group', async (req, res) => {
  try {
    const createdBy = req.user.id;
    const memberIds = Array.from(new Set([
      createdBy,
      ...(Array.isArray(req.body.memberIds) ? req.body.memberIds.map((id) => numberId(id, 'memberId')) : []),
    ]));

    if (memberIds.length < 2) {
      return res.status(400).json({ success: false, message: 'Select at least one other officer' });
    }

    const title = String(req.body.name || '').trim().slice(0, 120) || 'Group chat';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const conversationResult = await client.query(
        `INSERT INTO conversations (type, title, created_by)
         VALUES ('GROUP', $1, $2)
         RETURNING id, type, title, created_by, created_at, last_activity`,
        [title, createdBy]
      );
      const conversationId = conversationResult.rows[0].id;
      for (const memberId of memberIds) {
        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (conversation_id, user_id) DO NOTHING`,
          [conversationId, memberId, memberId === createdBy ? 'OWNER' : 'MEMBER']
        );
      }
      await client.query('COMMIT');
      return res.status(201).json({ success: true, conversationId, conversation: conversationResult.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return respondError(res, error, 'Unable to create group conversation');
  }
});

router.post('/:id/leave', async (req, res) => {
  try {
    const conversationId = numberId(req.params.id, 'conversationId');
    const userId = req.user.id;
    await pool.query(
      `UPDATE conversation_members
          SET left_at = COALESCE(left_at, NOW())
        WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    return res.json({ success: true });
  } catch (error) {
    return respondError(res, error, 'Unable to leave conversation');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const conversationId = numberId(req.params.id, 'conversationId');
    const userId = req.user.id;
    if (!(await isConversationMember(conversationId, userId))) {
      return res.status(403).json({ success: false, message: 'You are not a member of this conversation' });
    }
    await pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
    return res.json({ success: true });
  } catch (error) {
    return respondError(res, error, 'Unable to delete conversation');
  }
});

router.delete('/:id/history', async (req, res) => {
  try {
    await clearConversationHistory(req.params.id, req.user.id, {
      forEveryone: Boolean(req.body?.forEveryone),
    });
    return res.json({ success: true });
  } catch (error) {
    return respondError(res, error, 'Unable to clear conversation history');
  }
});

export default router;

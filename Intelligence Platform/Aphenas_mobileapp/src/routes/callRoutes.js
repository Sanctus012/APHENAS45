import express from 'express';
import pool from '../config/db.js';
import { isConversationMember } from '../messaging/models/messageModel.js';
import { requireSession } from '../middlewares/requireSession.js';

const router = express.Router();
router.use(requireSession);

function id(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${label} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

async function listCalls(req, res, userValue) {
  try {
    const userId = id(userValue, 'userId');
    const result = await pool.query(
      `SELECT cs.id,
              cs.conversation_id,
              cs.call_type,
              cs.status,
              cs.created_at,
              cs.started_at,
              cs.ended_at,
              c.title,
              c.type,
              COALESCE(
                NULLIF(NULLIF(NULLIF(TRIM(p.display_name), ''), 'Unknown officer'), 'Secure chat'),
                NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                NULLIF(TRIM(p.service_id), ''),
                NULLIF(TRIM(c.title), ''),
                'Unknown officer'
              ) AS participant_name,
              participant.user_id AS participant_id,
              p.service_id AS participant_service_id
         FROM call_sessions cs
         JOIN conversations c ON c.id = cs.conversation_id
         JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = $1
         LEFT JOIN LATERAL (
           SELECT cm.user_id
             FROM conversation_members cm
            WHERE cm.conversation_id = c.id AND cm.user_id <> $1 AND cm.left_at IS NULL
            ORDER BY cm.joined_at ASC, cm.id ASC LIMIT 1
         ) participant ON TRUE
         LEFT JOIN accounts_profile p ON p.user_id = participant.user_id
         LEFT JOIN auth_user u ON u.id = participant.user_id
        ORDER BY cs.created_at DESC, cs.id DESC
        LIMIT 100`,
      [userId]
    );
    return res.json({ success: true, calls: result.rows });
  } catch (error) {
    console.error('Unable to load call history:', error);
    return res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || 'Unable to load call history' });
  }
}

router.get('/', (req, res) => listCalls(req, res, req.user.id));
router.get('/:userId', (req, res) => listCalls(req, res, req.user.id));

router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = id(req.body.conversationId, 'conversationId');
    if (!(await isConversationMember(conversationId, userId))) {
      return res.status(403).json({ success: false, message: 'User is not a member of this conversation' });
    }
    const result = await pool.query(
      `INSERT INTO call_sessions (conversation_id, initiator_id, call_type, status)
       VALUES ($1, $2, $3, 'RINGING')
       RETURNING *`,
      [conversationId, userId, req.body.callType === 'VIDEO' ? 'VIDEO' : 'AUDIO']
    );
    return res.status(201).json({ success: true, call: result.rows[0] });
  } catch (error) {
    console.error('Unable to start call:', error);
    return res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || 'Unable to start call' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const callId = id(req.params.id, 'callId');
    const userId = req.user.id;
    const status = ['RINGING', 'ACTIVE', 'DECLINED', 'MISSED', 'ENDED'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ success: false, message: 'Invalid call status' });
    const result = await pool.query(
      `UPDATE call_sessions
          SET status = $1,
              started_at = CASE WHEN $1 = 'ACTIVE' THEN COALESCE(started_at, NOW()) ELSE started_at END,
              ended_at = CASE WHEN $1 IN ('DECLINED', 'MISSED', 'ENDED') THEN COALESCE(ended_at, NOW()) ELSE ended_at END
        WHERE id = $2 AND EXISTS (
          SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = call_sessions.conversation_id AND cm.user_id = $3
        )
        RETURNING *`,
      [status, callId, userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Call not found' });
    return res.json({ success: true, call: result.rows[0] });
  } catch (error) {
    console.error('Unable to update call:', error);
    return res.status(Number(error.statusCode) || 500).json({ success: false, message: error.message || 'Unable to update call' });
  }
});

export default router;

import pool from '../../config/db.js';
import {
  decryptMessageContent,
  encryptMessageContent,
  isEncryptedMessageContent,
} from '../../services/messageCryptoService.js';

function requireId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`${label} must be a positive integer`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return requireId(value, label);
}

function messageRow(result) {
  return result.rows[0] || null;
}

function decryptMessageRow(row) {
  if (!row || row.content === undefined || row.content === null) return row;
  return { ...row, content: decryptMessageContent(row.content) };
}

function decryptReplyContent(row) {
  if (!row || !row.reply_content) return row;
  return { ...row, reply_content: decryptMessageContent(row.reply_content) };
}

function publicMessageRow(row, canViewContent = true) {
  if (!row) return row;
  const deleted = Boolean(row.deleted_at);
  const locked = Boolean(row.locked);
  const redacted = !deleted && locked;
  const content = !deleted && !locked && canViewContent
    ? decryptMessageContent(row.content)
    : '';
  const replyContent = row.reply_content && canViewContent
    ? decryptMessageContent(row.reply_content)
    : '';
  return {
    ...row,
    content,
    reply_content: replyContent,
    redacted,
  };
}

async function hasActiveConversationUnlock(conversationId, userId) {
  const result = await pool.query(
    `SELECT 1
       FROM conversation_unlocks
      WHERE conversation_id = $1
        AND user_id = $2
        AND unlocked_until > NOW()
      LIMIT 1`,
    [conversationId, userId]
  );
  return result.rowCount > 0;
}

export async function isConversationMember(conversationId, userId) {
  const result = await pool.query(
    `SELECT 1
       FROM conversation_members
      WHERE conversation_id = $1
        AND user_id = $2
        AND left_at IS NULL
      LIMIT 1`,
    [requireId(conversationId, 'conversationId'), requireId(userId, 'userId')]
  );
  return result.rowCount > 0;
}

export async function getConversationMemberIds(conversationId) {
  const result = await pool.query(
    `SELECT user_id
       FROM conversation_members
      WHERE conversation_id = $1
        AND left_at IS NULL`,
    [requireId(conversationId, 'conversationId')]
  );
  return result.rows.map((row) => Number(row.user_id)).filter(Boolean);
}

export async function findDirectConversationBetween(userId, participantId) {
  const user = requireId(userId, 'userId');
  const participant = requireId(participantId, 'participantId');
  const result = await pool.query(
    `SELECT c.id
       FROM conversations c
       JOIN conversation_members cm
         ON cm.conversation_id = c.id
        AND cm.left_at IS NULL
      WHERE c.type = 'DIRECT'
      GROUP BY c.id
     HAVING COUNT(DISTINCT cm.user_id) = 2
        AND COUNT(*) = 2
        AND COUNT(*) FILTER (WHERE cm.user_id IN ($1, $2)) = 2
      ORDER BY c.id DESC
      LIMIT 1`,
    [user, participant]
  );
  return decryptMessageRow(messageRow(result));
}

export async function createConversation(type = 'DIRECT', title = null, createdBy = null) {
  const result = await pool.query(
    `INSERT INTO conversations (type, title, created_by)
     VALUES ($1, NULLIF($2, ''), $3)
     RETURNING id, type, title, created_by, created_at, last_activity`,
    [type, title || null, createdBy ? requireId(createdBy, 'createdBy') : null]
  );
  return decryptMessageRow(messageRow(result));
}

export async function addMemberToConversation({ conversationId, userId, role = 'MEMBER' }) {
  const result = await pool.query(
    `INSERT INTO conversation_members (conversation_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, user_id)
     DO UPDATE SET left_at = NULL, role = EXCLUDED.role
     RETURNING *`,
    [requireId(conversationId, 'conversationId'), requireId(userId, 'userId'), role]
  );
  return messageRow(result);
}

async function findExistingClientMessage({ conversationId, senderId, clientId }) {
  if (!clientId) return null;
  const result = await pool.query(
    `SELECT id, conversation_id, sender_id, content, message_type, client_id,
            reply_to_id, edited_at, deleted_at, locked, created_at
       FROM messages
      WHERE conversation_id = $1 AND sender_id = $2 AND client_id = $3
      LIMIT 1`,
    [conversationId, senderId, clientId]
  );
  return messageRow(result);
}

export async function createMessage({
  conversationId,
  senderId,
  content,
  messageType = 'TEXT',
  clientId = null,
  replyToId = null,
  locked = false,
}) {
  const conversation = requireId(conversationId, 'conversationId');
  const sender = requireId(senderId, 'senderId');
  const text = String(content || '').trim();
  const client = clientId ? String(clientId).slice(0, 120) : null;
  const replyTo = optionalId(replyToId, 'replyToId');

  if (!text) {
    const error = new Error('Message content is required');
    error.statusCode = 400;
    throw error;
  }
  if (!(await isConversationMember(conversation, sender))) {
    const error = new Error('Sender is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }

  const existing = await findExistingClientMessage({ conversationId: conversation, senderId: sender, clientId: client });
  if (existing) return { ...existing, deduped: true };

  if (replyTo) {
    const replyCheck = await pool.query(
      `SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2 LIMIT 1`,
      [replyTo, conversation]
    );
    if (replyCheck.rowCount === 0) {
      const error = new Error('Reply target is not in this conversation');
      error.statusCode = 400;
      throw error;
    }
  }

  const clientConnection = await pool.connect();
  try {
    await clientConnection.query('BEGIN');
    const result = await clientConnection.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, client_id, reply_to_id, locked)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, conversation_id, sender_id, content, message_type, client_id,
                 reply_to_id, edited_at, deleted_at, locked, created_at`,
      [conversation, sender, encryptMessageContent(text), messageType || 'TEXT', client, replyTo, Boolean(locked)]
    );

    await clientConnection.query(
      `UPDATE conversations SET last_activity = NOW() WHERE id = $1`,
      [conversation]
    );

    const members = await clientConnection.query(
      `SELECT user_id
         FROM conversation_members
        WHERE conversation_id = $1
          AND user_id <> $2
          AND left_at IS NULL`,
      [conversation, sender]
    );
    for (const member of members.rows) {
      await clientConnection.query(
        `INSERT INTO message_receipts (message_id, recipient_id)
         VALUES ($1, $2)
         ON CONFLICT (message_id, recipient_id) DO NOTHING`,
        [result.rows[0].id, member.user_id]
      );
    }

    await clientConnection.query('COMMIT');
    return decryptMessageRow(result.rows[0]);
  } catch (error) {
    await clientConnection.query('ROLLBACK');
    if (error.code === '23505' && client) {
      const duplicate = await findExistingClientMessage({ conversationId: conversation, senderId: sender, clientId: client });
      if (duplicate) return { ...decryptMessageRow(duplicate), deduped: true };
    }
    throw error;
  } finally {
    clientConnection.release();
  }
}

async function assertMessageOwner(messageId, senderId) {
  const result = await pool.query(
    `SELECT id, conversation_id, sender_id, content, message_type, client_id,
            reply_to_id, edited_at, deleted_at, locked, created_at
       FROM messages
      WHERE id = $1
      LIMIT 1`,
    [requireId(messageId, 'messageId')]
  );
  const message = messageRow(result);
  if (!message) {
    const error = new Error('Message not found');
    error.statusCode = 404;
    throw error;
  }
  if (message.sender_id !== requireId(senderId, 'senderId')) {
    const error = new Error('Only the sender can change this message');
    error.statusCode = 403;
    throw error;
  }
  return decryptMessageRow(message);
}

export async function editMessage({ messageId, senderId, content }) {
  await assertMessageOwner(messageId, senderId);
  const text = String(content || '').trim();
  if (!text) {
    const error = new Error('Message content is required');
    error.statusCode = 400;
    throw error;
  }
  const result = await pool.query(
    `UPDATE messages
        SET content = $1, edited_at = NOW()
      WHERE id = $2
      RETURNING id, conversation_id, sender_id, content, message_type, client_id,
                reply_to_id, edited_at, deleted_at, locked, created_at`,
    [encryptMessageContent(text), requireId(messageId, 'messageId')]
  );
  return decryptMessageRow(messageRow(result));
}

export async function deleteMessage({ messageId, senderId }) {
  await assertMessageOwner(messageId, senderId);
  const result = await pool.query(
    `UPDATE messages
        SET deleted_at = COALESCE(deleted_at, NOW())
      WHERE id = $1
      RETURNING id, conversation_id, sender_id, content, message_type, client_id,
                reply_to_id, edited_at, deleted_at, locked, created_at`,
    [requireId(messageId, 'messageId')]
  );
  return decryptMessageRow(messageRow(result));
}

export async function setMessageLocked({ messageId, senderId, locked = true }) {
  await assertMessageOwner(messageId, senderId);
  const result = await pool.query(
    `UPDATE messages
        SET locked = $1
      WHERE id = $2
      RETURNING id, conversation_id, sender_id, content, message_type, client_id,
                reply_to_id, edited_at, deleted_at, locked, created_at`,
    [Boolean(locked), requireId(messageId, 'messageId')]
  );
  return decryptMessageRow(messageRow(result));
}

export async function getLockedMessageContent(messageId, userId) {
  const result = await pool.query(
    `SELECT id, conversation_id, sender_id, content, message_type, client_id,
            reply_to_id, edited_at, deleted_at, locked, created_at
       FROM messages
      WHERE id = $1
      LIMIT 1`,
    [requireId(messageId, 'messageId')]
  );
  const message = messageRow(result);
  if (!message) {
    const error = new Error('Message not found');
    error.statusCode = 404;
    throw error;
  }
  if (!(await isConversationMember(message.conversation_id, userId))) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  return decryptMessageRow(message);
}

export async function getMessages(conversationId, userId) {
  const conversation = requireId(conversationId, 'conversationId');
  const user = requireId(userId, 'userId');
  if (!(await isConversationMember(conversation, user))) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  const canViewContent = Boolean(await getConversationUnlock(conversation, user));

  const result = await pool.query(
    `SELECT m.id,
            m.conversation_id,
            m.sender_id,
            m.content,
            m.message_type,
            m.client_id,
            m.reply_to_id,
            m.edited_at,
            m.deleted_at,
            m.locked,
            m.created_at,
            CASE
              WHEN m.sender_id = $2 THEN sender_receipts.delivered_at
              ELSE viewer_receipt.delivered_at
            END AS delivered_at,
            CASE
              WHEN m.sender_id = $2 THEN sender_receipts.read_at
              ELSE viewer_receipt.read_at
            END AS read_at,
            CASE WHEN reply.deleted_at IS NULL AND COALESCE(reply.locked, FALSE) = FALSE THEN reply.content ELSE '' END AS reply_content,
            reply.sender_id AS reply_sender_id
       FROM messages m
       LEFT JOIN message_receipts viewer_receipt
         ON viewer_receipt.message_id = m.id AND viewer_receipt.recipient_id = $2
       LEFT JOIN LATERAL (
         SELECT
           MAX(delivered_at) AS delivered_at,
           MAX(read_at) AS read_at
          FROM message_receipts
         WHERE message_id = m.id
           AND recipient_id <> m.sender_id
       ) sender_receipts ON TRUE
       LEFT JOIN messages reply ON reply.id = m.reply_to_id
       LEFT JOIN conversation_clears cc
         ON cc.conversation_id = m.conversation_id AND cc.user_id = $2
      WHERE m.conversation_id = $1
        AND (cc.cleared_at IS NULL OR m.created_at > cc.cleared_at)
      ORDER BY m.created_at ASC, m.id ASC`,
    [conversation, user]
  );
  return result.rows.map((row) => publicMessageRow(row, canViewContent));
}

export async function markMessageDelivered(messageId, recipientId) {
  const message = await pool.query(
    `SELECT id, conversation_id, sender_id FROM messages WHERE id = $1 LIMIT 1`,
    [requireId(messageId, 'messageId')]
  );
  const row = messageRow(message);
  const recipient = requireId(recipientId, 'recipientId');
  if (!row) {
    const error = new Error('Message not found');
    error.statusCode = 404;
    throw error;
  }
  if (row.sender_id === recipient) return null;
  if (!(await isConversationMember(row.conversation_id, recipient))) {
    const error = new Error('Recipient is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO message_receipts (message_id, recipient_id, delivered_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (message_id, recipient_id)
     DO UPDATE SET delivered_at = COALESCE(message_receipts.delivered_at, NOW())
      RETURNING *`,
    [row.id, recipient]
  );
  const receipt = messageRow(result);
  return receipt ? { ...receipt, conversation_id: row.conversation_id } : receipt;
}

export async function markMessageRead(messageId, recipientId) {
  const message = await pool.query(
    `SELECT id, conversation_id, sender_id FROM messages WHERE id = $1 LIMIT 1`,
    [requireId(messageId, 'messageId')]
  );
  const row = messageRow(message);
  const recipient = requireId(recipientId, 'recipientId');
  if (!row) {
    const error = new Error('Message not found');
    error.statusCode = 404;
    throw error;
  }
  if (row.sender_id === recipient) return null;
  if (!(await isConversationMember(row.conversation_id, recipient))) {
    const error = new Error('Recipient is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO message_receipts (message_id, recipient_id, delivered_at, read_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (message_id, recipient_id)
     DO UPDATE SET
       delivered_at = COALESCE(message_receipts.delivered_at, NOW()),
       read_at = COALESCE(message_receipts.read_at, NOW())
      RETURNING *`,
    [row.id, recipient]
  );
  await pool.query(
    `UPDATE conversation_members SET last_read_at = NOW()
      WHERE conversation_id = $1 AND user_id = $2`,
    [row.conversation_id, recipient]
  );
  const receipt = messageRow(result);
  return receipt ? { ...receipt, conversation_id: row.conversation_id } : receipt;
}

export async function listConversationsForUser(userId, type = null) {
  const user = requireId(userId, 'userId');
  const values = [user];
  const typeFilter = type ? 'AND c.type = $2' : '';
  if (type) values.push(type);

  const result = await pool.query(
    `SELECT c.id,
            c.type,
            c.title,
            c.created_at,
            c.last_activity,
            CASE WHEN c.type = 'DIRECT'
                 THEN COALESCE(
                   NULLIF(NULLIF(NULLIF(TRIM(other_profile.display_name), ''), 'Unknown officer'), 'Secure chat'),
                   NULLIF(TRIM(CONCAT_WS(' ', other_user.first_name, other_user.last_name)), ''),
                   NULLIF(TRIM(other_profile.service_id), ''),
                   NULLIF(TRIM(c.title), ''),
                   'Unknown officer'
                 )
                 ELSE COALESCE(NULLIF(TRIM(c.title), ''), 'Group chat') END AS name,
            other_member.user_id AS participant_id,
            other_profile.service_id AS participant_service_id,
            COALESCE(
              NULLIF(NULLIF(NULLIF(TRIM(other_profile.display_name), ''), 'Unknown officer'), 'Secure chat'),
              NULLIF(TRIM(CONCAT_WS(' ', other_user.first_name, other_user.last_name)), ''),
              NULLIF(TRIM(other_profile.service_id), ''),
              NULLIF(TRIM(c.title), ''),
              'Unknown officer'
            ) AS participant_name,
            latest.content AS last_message,
            latest.locked AS last_message_locked,
            latest.deleted_at AS last_message_deleted_at,
            latest.created_at AS last_message_at,
            cu.unlocked_until AS unlocked_until,
            COALESCE(unread.unread_count, 0)::INTEGER AS unread_count
       FROM conversations c
       JOIN conversation_members mine
         ON mine.conversation_id = c.id AND mine.user_id = $1 AND mine.left_at IS NULL
       LEFT JOIN conversation_clears cc
         ON cc.conversation_id = c.id AND cc.user_id = $1
       LEFT JOIN conversation_unlocks cu
         ON cu.conversation_id = c.id
        AND cu.user_id = $1
        AND cu.unlocked_until > NOW()
       LEFT JOIN LATERAL (
         SELECT cm.user_id
           FROM conversation_members cm
          WHERE cm.conversation_id = c.id AND cm.user_id <> $1 AND cm.left_at IS NULL
          ORDER BY cm.joined_at ASC, cm.id ASC LIMIT 1
       ) other_member ON TRUE
       LEFT JOIN accounts_profile other_profile ON other_profile.user_id = other_member.user_id
       LEFT JOIN auth_user other_user ON other_user.id = other_member.user_id
       LEFT JOIN LATERAL (
         SELECT m.content,
                m.locked,
                m.deleted_at,
                m.created_at
           FROM messages m WHERE m.conversation_id = c.id
            AND (cc.cleared_at IS NULL OR m.created_at > cc.cleared_at)
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       ) latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS unread_count
           FROM message_receipts mr JOIN messages um ON um.id = mr.message_id
          WHERE mr.recipient_id = $1 AND mr.read_at IS NULL AND um.conversation_id = c.id
            AND (cc.cleared_at IS NULL OR um.created_at > cc.cleared_at)
       ) unread ON TRUE
      WHERE 1 = 1 ${typeFilter}
      ORDER BY COALESCE(c.last_activity, c.created_at) DESC, c.id DESC`,
    values
  );
  return result.rows.map((row) => {
    let lastMessage = '';
    if (row.last_message_deleted_at) lastMessage = 'Message deleted';
    else if (row.last_message_locked) lastMessage = 'Target locked';
    else if (row.unlocked_until && row.last_message) lastMessage = decryptMessageContent(row.last_message);
    else if (row.last_message) lastMessage = 'New message';
    return {
      ...row,
      last_message: lastMessage,
      last_message_locked: undefined,
      last_message_deleted_at: undefined,
      unlocked_until: undefined,
    };
  });
}

export async function clearConversationHistory(conversationId, userId, options = {}) {
  const conversation = requireId(conversationId, 'conversationId');
  const user = requireId(userId, 'userId');
  if (!(await isConversationMember(conversation, user))) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  const targetUsers = options.forEveryone
    ? await getConversationMemberIds(conversation)
    : [user];
  const values = targetUsers.map((_, index) => `($1, $${index + 2}, NOW())`).join(', ');

  await pool.query(
    `INSERT INTO conversation_clears (conversation_id, user_id, cleared_at)
     VALUES ${values}
     ON CONFLICT (conversation_id, user_id)
     DO UPDATE SET cleared_at = EXCLUDED.cleared_at`,
    [conversation, ...targetUsers]
  );
  await pool.query(
    `UPDATE conversation_members
        SET last_read_at = NOW()
      WHERE conversation_id = $1 AND user_id = ANY($2::int[])`,
    [conversation, targetUsers]
  );
}

export async function setConversationUnlockedUntil(conversationId, userId, unlockedUntil) {
  const conversation = requireId(conversationId, 'conversationId');
  const user = requireId(userId, 'userId');
  if (!(await isConversationMember(conversation, user))) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  const result = await pool.query(
    `INSERT INTO conversation_unlocks (conversation_id, user_id, unlocked_until)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, user_id)
     DO UPDATE SET unlocked_until = EXCLUDED.unlocked_until, updated_at = NOW()
     RETURNING conversation_id, user_id, unlocked_until`,
    [conversation, user, unlockedUntil]
  );
  return messageRow(result);
}

export async function getConversationUnlock(conversationId, userId) {
  const conversation = requireId(conversationId, 'conversationId');
  const user = requireId(userId, 'userId');
  if (!(await isConversationMember(conversation, user))) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  await pool.query(
    `DELETE FROM conversation_unlocks
      WHERE user_id = $1
        AND conversation_id = $2
        AND unlocked_until <= NOW()`,
    [user, conversation]
  );
  const result = await pool.query(
    `SELECT conversation_id, user_id, unlocked_until
       FROM conversation_unlocks
      WHERE conversation_id = $1
        AND user_id = $2
        AND unlocked_until > NOW()
      LIMIT 1`,
    [conversation, user]
  );
  return messageRow(result);
}

export async function createSitrep({ senderId, conversationId = null, status, note = '', latitude = null, longitude = null }) {
  const sender = requireId(senderId, 'senderId');
  const conversation = conversationId ? requireId(conversationId, 'conversationId') : null;
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (!['GREEN', 'AMBER', 'RED'].includes(normalizedStatus)) {
    const error = new Error('SITREP status must be GREEN, AMBER, or RED');
    error.statusCode = 400;
    throw error;
  }
  if (conversation && !(await isConversationMember(conversation, sender))) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  const result = await pool.query(
    `INSERT INTO sitreps (sender_id, conversation_id, status, note, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [sender, conversation, normalizedStatus, String(note || '').trim().slice(0, 500), latitude, longitude]
  );
  return messageRow(result);
}

export async function listSitreps(userId, status = null) {
  const user = requireId(userId, 'userId');
  const values = [user];
  const statusFilter = status ? 'AND s.status = $2' : '';
  if (status) values.push(String(status).trim().toUpperCase());
  const result = await pool.query(
    `SELECT s.*,
            p.service_id,
            COALESCE(NULLIF(TRIM(p.display_name), ''), p.service_id) AS sender_name
       FROM sitreps s
       JOIN accounts_profile p ON p.user_id = s.sender_id
      WHERE (
        s.sender_id = $1 OR
        EXISTS (
          SELECT 1 FROM conversation_members cm
           WHERE cm.conversation_id = s.conversation_id
             AND cm.user_id = $1
             AND cm.left_at IS NULL
        )
      )
      ${statusFilter}
      ORDER BY s.created_at DESC
      LIMIT 150`,
    values
  );
  return result.rows;
}

export async function createCommandBroadcast({ senderId, conversationId, title, body, priority = 'NORMAL', escalationMinutes = 30 }) {
  const sender = requireId(senderId, 'senderId');
  const conversation = requireId(conversationId, 'conversationId');
  if (!(await isConversationMember(conversation, sender))) {
    const error = new Error('User is not a member of this conversation');
    error.statusCode = 403;
    throw error;
  }
  const text = String(body || '').trim();
  if (!text) {
    const error = new Error('Broadcast body is required');
    error.statusCode = 400;
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const broadcast = await client.query(
      `INSERT INTO command_broadcasts (sender_id, conversation_id, title, body, priority, escalation_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::interval)
       RETURNING *`,
      [sender, conversation, String(title || 'Command broadcast').trim().slice(0, 160), text, String(priority || 'NORMAL').toUpperCase(), Number(escalationMinutes) || 30]
    );
    const recipients = await client.query(
      `SELECT user_id
         FROM conversation_members
        WHERE conversation_id = $1
          AND user_id <> $2
          AND left_at IS NULL`,
      [conversation, sender]
    );
    for (const row of recipients.rows) {
      await client.query(
        `INSERT INTO command_broadcast_acknowledgments (broadcast_id, recipient_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [broadcast.rows[0].id, row.user_id]
      );
    }
    await client.query('COMMIT');
    return broadcast.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listCommandBroadcasts(userId) {
  const user = requireId(userId, 'userId');
  const result = await pool.query(
    `SELECT b.*,
            ack.acknowledged_at,
            CASE WHEN b.escalation_at <= NOW() AND ack.acknowledged_at IS NULL THEN TRUE ELSE FALSE END AS escalated,
            COALESCE(roster.total_recipients, 0)::INTEGER AS total_recipients,
            COALESCE(roster.acknowledged_count, 0)::INTEGER AS acknowledged_count
       FROM command_broadcasts b
       JOIN conversation_members cm
         ON cm.conversation_id = b.conversation_id
        AND cm.user_id = $1
        AND cm.left_at IS NULL
       LEFT JOIN command_broadcast_acknowledgments ack
         ON ack.broadcast_id = b.id
        AND ack.recipient_id = $1
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS total_recipients,
                COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged_count
           FROM command_broadcast_acknowledgments
          WHERE broadcast_id = b.id
       ) roster ON TRUE
      ORDER BY b.created_at DESC
      LIMIT 100`,
    [user]
  );
  return result.rows;
}

export async function acknowledgeBroadcast({ broadcastId, userId }) {
  const result = await pool.query(
    `UPDATE command_broadcast_acknowledgments
        SET acknowledged_at = COALESCE(acknowledged_at, NOW())
      WHERE broadcast_id = $1
        AND recipient_id = $2
      RETURNING *`,
    [requireId(broadcastId, 'broadcastId'), requireId(userId, 'userId')]
  );
  if (result.rowCount === 0) {
    const error = new Error('Broadcast acknowledgment was not found');
    error.statusCode = 404;
    throw error;
  }
  return messageRow(result);
}

import {
  createMessage,
  deleteMessage,
  editMessage,
  findDirectConversationBetween,
  getConversationMemberIds,
  isConversationMember,
  markMessageDelivered,
  markMessageRead,
} from './models/messageModel.js';
import pool from '../config/db.js';
import { findOfficerByUserId } from '../models/authModel.js';
import { validateSession, verifySessionToken } from '../services/sessionTokenService.js';

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function acknowledge(callback, payload) {
  if (typeof callback === 'function') callback(payload);
}

function roomFor(conversationId) {
  return `conversation_${conversationId}`;
}

function userRoomFor(userId) {
  return `user_${userId}`;
}

function redactMessageIfLocked(message) {
  if (!message?.locked) return message;
  return { ...message, content: '', redacted: true };
}

async function emitConversationEvent(io, conversationId, event, payload) {
  let target = io.to(roomFor(conversationId));
  const memberIds = await getConversationMemberIds(conversationId);
  for (const memberId of memberIds) {
    target = target.to(userRoomFor(memberId));
  }
  target.emit(event, payload);
}

async function updateCallStatus({ callId, conversationId, userId, status }) {
  const call = positiveId(callId);
  if (!call || !status) return null;

  const result = await pool.query(
    `UPDATE call_sessions
        SET status = $1,
            started_at = CASE WHEN $1 = 'ACTIVE' THEN COALESCE(started_at, NOW()) ELSE started_at END,
            ended_at = CASE WHEN $1 IN ('DECLINED', 'MISSED', 'ENDED') THEN COALESCE(ended_at, NOW()) ELSE ended_at END
      WHERE id = $2
        AND conversation_id = $3
        AND EXISTS (
          SELECT 1
            FROM conversation_members cm
           WHERE cm.conversation_id = call_sessions.conversation_id
             AND cm.user_id = $4
             AND cm.left_at IS NULL
        )
      RETURNING *`,
    [status, call, conversationId, userId]
  );

  return result.rows[0] || null;
}

export function setupMessagingSocket(io) {
  const onlineSockets = new Map();

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        String(socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');

      if (!token) return next(new Error('Authentication required'));

      const session = verifySessionToken(token);
      await validateSession({
        session,
        deviceId: socket.handshake.auth?.deviceId || socket.handshake.headers?.['x-aphenas-device-id'],
      });
      const officer = await findOfficerByUserId(session.userId);

      if (!officer || officer.status !== 'active') {
        return next(new Error('This account is not active'));
      }
      if (officer.locked_until && new Date(officer.locked_until) > new Date()) {
        return next(new Error('Account is temporarily locked'));
      }

      socket.userId = Number(session.userId);
      socket.session = session;
      return next();
    } catch {
      return next(new Error('Invalid or expired session'));
    }
  });

  const broadcastPresence = (userId, online, lastSeen = null) => {
    io.emit('presence', { userId, online, lastSeen });
  };

  io.on('connection', (socket) => {
    console.log('Messaging socket connected:', socket.id);

    socket.on('userOnline', (userId, callback) => {
      const id = positiveId(socket.userId);
      if (!id) {
        acknowledge(callback, { success: false, message: 'Socket identity is required' });
        return;
      }
      socket.join(userRoomFor(id));
      const userSockets = onlineSockets.get(id) || new Set();
      const wasOffline = userSockets.size === 0;
      userSockets.add(socket.id);
      onlineSockets.set(id, userSockets);
      acknowledge(callback, { success: true, userId: id });
      if (wasOffline) broadcastPresence(id, true);
    });

    socket.on('joinConversation', async (payload, callback) => {
      let conversationId = positiveId(typeof payload === 'object' ? payload.conversationId : payload);
      const userId = positiveId(socket.userId);
      const participantId = positiveId(typeof payload === 'object' ? payload.participantId : null);
      if (!conversationId || !userId || (socket.userId && socket.userId !== userId)) {
        acknowledge(callback, { success: false, message: 'Valid conversationId and userId are required' });
        return;
      }
      try {
        if (!(await isConversationMember(conversationId, userId))) {
          const resolved = participantId
            ? await findDirectConversationBetween(userId, participantId)
            : null;
          if (!resolved?.id || !(await isConversationMember(resolved.id, userId))) {
            acknowledge(callback, { success: false, message: 'User is not a member of this conversation' });
            return;
          }
          conversationId = resolved.id;
        }
        await socket.join(roomFor(conversationId));
        await socket.join(userRoomFor(userId));
        acknowledge(callback, { success: true, conversationId, resolvedConversationId: conversationId });
      } catch (error) {
        console.error('Join conversation error:', error);
        acknowledge(callback, { success: false, message: 'Unable to join conversation' });
      }
    });

    socket.on('typing', async (payload = {}) => {
      const conversationId = positiveId(payload.conversationId);
      const userId = positiveId(socket.userId || payload.userId);
      if (!conversationId || !userId || userId !== socket.userId) return;
      try {
        if (!(await isConversationMember(conversationId, userId))) return;
        socket.to(roomFor(conversationId)).emit('typing', {
          conversationId,
          userId,
          isTyping: Boolean(payload.isTyping),
        });
      } catch (error) {
        console.error('Typing event error:', error);
      }
    });

    socket.on('sendMessage', async (data = {}, callback) => {
      const conversationId = positiveId(data.conversationId);
      const senderId = positiveId(data.senderId || socket.userId);
      const content = String(data.content || '').trim();
      if (!socket.userId) {
        acknowledge(callback, { success: false, message: 'Socket identity is required' });
        return;
      }
      if (!conversationId || !senderId || !content) {
        acknowledge(callback, { success: false, message: 'conversationId, senderId, and content are required' });
        return;
      }
      if (socket.userId !== senderId) {
        acknowledge(callback, { success: false, message: 'Socket identity does not match senderId' });
        return;
      }
      try {
        const message = await createMessage({
          conversationId,
          senderId,
          content,
          messageType: data.messageType || 'TEXT',
          clientId: data.clientId,
          replyToId: data.replyToId,
          locked: Boolean(data.locked),
        });
        const visibleMessage = redactMessageIfLocked(message);
        await emitConversationEvent(io, conversationId, 'newMessage', visibleMessage);
        await emitConversationEvent(io, conversationId, 'conversationUpdated', {
          conversationId,
          lastMessage: visibleMessage,
          updatedAt: message.created_at,
        });
        acknowledge(callback, { success: true, message: visibleMessage });
      } catch (error) {
        console.error('Realtime message error:', error);
        acknowledge(callback, {
          success: false,
          message: Number(error.statusCode) === 500 ? 'Unable to send message' : error.message,
        });
      }
    });

    socket.on('editMessage', async (data = {}, callback) => {
      if (!socket.userId) {
        acknowledge(callback, { success: false, message: 'Socket identity is required' });
        return;
      }
      try {
        const message = await editMessage({ messageId: data.messageId, senderId: socket.userId, content: data.content });
        const visibleMessage = redactMessageIfLocked(message);
        await emitConversationEvent(io, message.conversation_id, 'messageUpdated', visibleMessage);
        acknowledge(callback, { success: true, message: visibleMessage });
      } catch (error) {
        console.error('Edit message error:', error);
        acknowledge(callback, { success: false, message: error.message });
      }
    });

    socket.on('deleteMessage', async (data = {}, callback) => {
      if (!socket.userId) {
        acknowledge(callback, { success: false, message: 'Socket identity is required' });
        return;
      }
      try {
        const message = await deleteMessage({ messageId: data.messageId, senderId: socket.userId });
        const visibleMessage = { ...message, content: '' };
        await emitConversationEvent(io, message.conversation_id, 'messageDeleted', visibleMessage);
        acknowledge(callback, { success: true, message: visibleMessage });
      } catch (error) {
        console.error('Delete message error:', error);
        acknowledge(callback, { success: false, message: error.message });
      }
    });

    socket.on('messageDelivered', async (data = {}, callback) => {
      if (!socket.userId) {
        acknowledge(callback, { success: false, message: 'Socket identity is required' });
        return;
      }
      try {
        const recipientId = positiveId(socket.userId);
        const receipt = await markMessageDelivered(data.messageId, recipientId);
        if (data.conversationId) {
          await emitConversationEvent(io, data.conversationId, 'messageDelivered', { messageId: data.messageId, recipientId, receipt });
        }
        acknowledge(callback, { success: true, receipt });
      } catch (error) {
        console.error('messageDelivered handler error:', error);
        acknowledge(callback, { success: false, message: error.message });
      }
    });

    socket.on('messageRead', async (data = {}, callback) => {
      if (!socket.userId) {
        acknowledge(callback, { success: false, message: 'Socket identity is required' });
        return;
      }
      try {
        const recipientId = positiveId(socket.userId);
        const receipt = await markMessageRead(data.messageId, recipientId);
        if (data.conversationId) {
          await emitConversationEvent(io, data.conversationId, 'messageRead', { messageId: data.messageId, recipientId, receipt });
        }
        acknowledge(callback, { success: true, receipt });
      } catch (error) {
        console.error('messageRead handler error:', error);
        acknowledge(callback, { success: false, message: error.message });
      }
    });

    const callStatusByEvent = {
      callAccepted: 'ACTIVE',
      callRejected: 'DECLINED',
      callEnded: 'ENDED',
    };

    for (const event of ['callInvite', 'callAccepted', 'callRejected', 'callEnded', 'callSignal']) {
      socket.on(event, async (payload = {}, callback) => {
        const conversationId = positiveId(payload.conversationId);
        if (!conversationId || !socket.userId) {
          acknowledge(callback, { success: false, message: 'Conversation and user identity are required' });
          return;
        }
        try {
          if (!(await isConversationMember(conversationId, socket.userId))) {
            acknowledge(callback, { success: false, message: 'User is not a member of this conversation' });
            return;
          }

          const nextStatus = callStatusByEvent[event];
          const call = nextStatus
            ? await updateCallStatus({
                callId: payload.callId,
                conversationId,
                userId: socket.userId,
                status: nextStatus,
              })
            : null;

          const nextPayload = {
            ...payload,
            conversationId,
            actorId: socket.userId,
            callerId: event === 'callInvite' ? socket.userId : payload.callerId,
            status: call?.status || payload.status || nextStatus,
            call,
          };

          socket.to(roomFor(conversationId)).emit(event, nextPayload);
          acknowledge(callback, { success: true, call });
        } catch (error) {
          acknowledge(callback, { success: false, message: error.message });
        }
      });
    }

    socket.on('disconnect', () => {
      console.log('Messaging socket disconnected:', socket.id);
      if (!socket.userId) return;
      const userSockets = onlineSockets.get(socket.userId);
      if (!userSockets) return;
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineSockets.delete(socket.userId);
        broadcastPresence(socket.userId, false, new Date().toISOString());
      }
    });
  });
}

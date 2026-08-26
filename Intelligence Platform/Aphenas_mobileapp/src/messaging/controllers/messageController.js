import {
  addMemberToConversation,
  createConversation,
  createMessage,
  deleteMessage as removeMessage,
  editMessage as updateMessage,
  getConversationMemberIds,
  getLockedMessageContent,
  getMessages,
  setMessageLocked,
  markMessageDelivered,
  markMessageRead,
} from '../models/messageModel.js';
import { verifyChatPinForUser } from '../../controllers/chatPinController.js';
import { writeAuditLog } from '../../services/auditLogService.js';

function respondError(res, error, fallback) {
  const status = Number(error.statusCode) || 500;
  console.error(error);
  return res.status(status).json({ success: false, message: status === 500 ? fallback : error.message });
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
  if (!io) return;
  let target = io.to(roomFor(conversationId));
  const memberIds = await getConversationMemberIds(conversationId);
  for (const memberId of memberIds) {
    target = target.to(userRoomFor(memberId));
  }
  target.emit(event, payload);
}

export async function createChat(req, res) {
  try {
    const { type = 'DIRECT', title = null, members = [] } = req.body;
    const createdBy = req.user.id;
    const requestedMembers = Array.isArray(members) ? members : [];
    const securedMembers = Array.from(new Set([createdBy, ...requestedMembers]));
    if (securedMembers.length === 0) {
      return res.status(400).json({ success: false, message: 'members must be a non-empty array' });
    }
    const conversation = await createConversation(type, title, createdBy || null);
    for (const userId of securedMembers) {
      await addMemberToConversation({ conversationId: conversation.id, userId });
    }
    return res.status(201).json({ success: true, conversation });
  } catch (error) {
    return respondError(res, error, 'Unable to create conversation');
  }
}

export async function sendMessage(req, res) {
  try {
    const message = await createMessage({
      ...req.body,
      senderId: req.user.id,
    });
    const visibleMessage = redactMessageIfLocked(message);
    const io = req.app.get('io');
    await emitConversationEvent(io, message.conversation_id, 'newMessage', visibleMessage);
    await emitConversationEvent(io, message.conversation_id, 'conversationUpdated', { conversationId: message.conversation_id, lastMessage: visibleMessage, updatedAt: message.created_at });
    return res.status(201).json({ success: true, message: visibleMessage });
  } catch (error) {
    return respondError(res, error, 'Unable to send message');
  }
}

export async function fetchMessages(req, res) {
  try {
    const messages = await getMessages(req.params.conversationId, req.user.id);
    return res.json({ success: true, messages });
  } catch (error) {
    return respondError(res, error, 'Unable to fetch messages');
  }
}

export async function deliveredMessage(req, res) {
  try {
    const receipt = await markMessageDelivered(req.params.messageId, req.user.id);
    if (receipt?.conversation_id) {
      await emitConversationEvent(req.app.get('io'), receipt.conversation_id, 'messageDelivered', {
        messageId: req.params.messageId,
        recipientId: req.user.id,
        receipt,
      });
    }
    return res.json({ success: true, receipt });
  } catch (error) {
    return respondError(res, error, 'Unable to mark message delivered');
  }
}

export async function readMessage(req, res) {
  try {
    const receipt = await markMessageRead(req.params.messageId, req.user.id);
    if (receipt?.conversation_id) {
      await emitConversationEvent(req.app.get('io'), receipt.conversation_id, 'messageRead', {
        messageId: req.params.messageId,
        recipientId: req.user.id,
        receipt,
      });
    }
    return res.json({ success: true, receipt });
  } catch (error) {
    return respondError(res, error, 'Unable to mark message read');
  }
}

export async function editMessage(req, res) {
  try {
    const message = await updateMessage({
      messageId: req.params.messageId,
      senderId: req.user.id,
      content: req.body.content,
    });
    const visibleMessage = redactMessageIfLocked(message);
    await emitConversationEvent(req.app.get('io'), message.conversation_id, 'messageUpdated', visibleMessage);
    return res.json({ success: true, message: visibleMessage });
  } catch (error) {
    return respondError(res, error, 'Unable to edit message');
  }
}

export async function deleteMessage(req, res) {
  try {
    const message = await removeMessage({
      messageId: req.params.messageId,
      senderId: req.user.id,
    });
    const visibleMessage = { ...message, content: '' };
    await emitConversationEvent(req.app.get('io'), message.conversation_id, 'messageDeleted', visibleMessage);
    return res.json({ success: true, message: visibleMessage });
  } catch (error) {
    return respondError(res, error, 'Unable to delete message');
  }
}

export async function lockMessage(req, res) {
  try {
    const message = await setMessageLocked({
      messageId: req.params.messageId,
      senderId: req.user.id,
      locked: req.body?.locked !== false,
    });
    const visibleMessage = redactMessageIfLocked(message);
    await emitConversationEvent(req.app.get('io'), message.conversation_id, 'messageUpdated', visibleMessage);
    return res.json({ success: true, message: visibleMessage });
  } catch (error) {
    return respondError(res, error, 'Unable to update message lock');
  }
}

export async function unlockMessage(req, res) {
  try {
    await verifyChatPinForUser(req.user.id, req.body?.pin);
    const message = await getLockedMessageContent(req.params.messageId, req.user.id);
    await writeAuditLog({
      eventType: 'message_unlock',
      actorUserId: req.user.id,
      targetUserId: message.sender_id,
      targetType: 'message',
      targetId: message.id,
      req,
      metadata: { conversationId: message.conversation_id },
    });
    return res.json({ success: true, message });
  } catch (error) {
    return respondError(res, error, 'Unable to unlock message');
  }
}

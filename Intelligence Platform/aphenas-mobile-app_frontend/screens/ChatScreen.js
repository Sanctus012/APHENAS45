import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import socket from '../services/socketService';
import { API_URL } from '../config/api';
import { authHeaders } from '../services/apiClient';
import { setChatPin } from '../services/chatPinService';
import {
  deleteMessage as deleteMessageHttp,
  editMessage as editMessageHttp,
  lockMessage as lockMessageHttp,
  sendMessage as sendMessageHttp,
  unlockMessage as unlockMessageHttp,
} from '../services/messageService';
import { createDirectConversation, getConversationUnlockStatus, unlockConversation } from '../services/conversationService';
import { getCachedDeviceId } from '../services/deviceService';
import { colors, initials } from '../theme/aphenasTheme';

const MESSAGE_LOCK_TIME = 2 * 60 * 1000;
const VALIDITY_OPTIONS = ['14days', '30days', '80days'];

function mapMessage(message, currentUserId) {
  const createdAt = new Date(message.created_at || Date.now()).getTime();
  const isDeleted = Boolean(message.deleted_at);
  const isLocked = Boolean(message.locked || message.redacted);
  return {
    ...message,
    id: String(message.id),
    text: isDeleted ? 'This message was deleted' : isLocked ? '' : message.content || '',
    sender: Number(message.sender_id) === currentUserId ? 'me' : 'them',
    createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
    time: new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    locked: isLocked,
    edited: Boolean(message.edited_at),
    deleted: isDeleted,
    replyToId: message.reply_to_id ? String(message.reply_to_id) : null,
    replyText: message.reply_content || '',
    status: message.status || (message.read_at ? 'read' : message.delivered_at ? 'delivered' : 'sent'),
  };
}

function statusMark(status) {
  if (status === 'sending') return '...';
  if (status === 'delivered' || status === 'read') return '✓✓';
  return '✓';
}

function strongerStatus(currentStatus, nextStatus) {
  const rank = { failed: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
  if (!currentStatus) return nextStatus || 'sent';
  if (!nextStatus) return currentStatus;
  return (rank[nextStatus] || 0) >= (rank[currentStatus] || 0) ? nextStatus : currentStatus;
}

function mergeMessageState(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    status: strongerStatus(existing.status, incoming.status),
  };
}

export default function ChatScreen({ currentUser, conversation: conversationProp = {}, conversationId: conversationIdProp, onBack, navigation, route }) {
  const conversation = route?.params?.conversation || conversationProp;
  const conversationId = route?.params?.conversationId || conversationIdProp || conversation?.id || conversation?.conversationId;
  const currentUserId = Number(currentUser?.userId || currentUser?.id || 0);
  const authToken = currentUser?.authToken;
  const participantId = Number(conversation?.participantId || conversation?.participant_id || 0);
  const isDirectConversation = String(conversation?.type || 'DIRECT').toUpperCase() !== 'GROUP';
  const chatName = conversation?.name || conversation?.title || conversation?.participant_name || conversation?.participant_service_id || 'Unknown officer';
  const watermarkId = currentUser?.secureId || currentUser?.secure_id || currentUser?.serviceId || currentUser?.service_id || 'APHENAS';
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const [chatLocked, setChatLocked] = useState(true);
  const [lockModalVisible, setLockModalVisible] = useState(false);
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [call, setCall] = useState(null);
  const [validity, setValidity] = useState('');
  const [confirmClearVisible, setConfirmClearVisible] = useState(false);
  const [clearForEveryone, setClearForEveryone] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const scrollRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => {
    setActiveConversationId(conversationId);
  }, [conversationId]);

  useEffect(() => {
    let mounted = true;
    if (!conversationId || !currentUserId || !authToken) return () => {};
    setPin('');
    setPinError('');
    setSelectedMessageId(null);
    setLockModalVisible(false);
    getConversationUnlockStatus(conversationId, authToken)
      .then((result) => {
        if (!mounted) return;
        setChatLocked(Boolean(result.locked));
        setUnlockModalVisible(Boolean(result.locked));
      })
      .catch(() => {
        if (!mounted) return;
        setChatLocked(true);
        setUnlockModalVisible(true);
      });
    return () => { mounted = false; };
  }, [authToken, conversationId, currentUserId]);

  const persistCallStatus = useCallback(async (callId, status) => {
    if (!callId || !currentUserId) return;

    const response = await fetch(`${API_URL}/calls/${callId}`, {
      method: 'PATCH',
      headers: authHeaders(authToken),
      body: JSON.stringify({ userId: currentUserId, status }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Unable to update call status');
    }
  }, [authToken, currentUserId]);

  const addMessage = useCallback((incoming) => {
    setMessages((current) => {
      const normalized = mapMessage(incoming, currentUserId);
      const existingIndex = current.findIndex((item) => item.id === normalized.id || (normalized.client_id && item.client_id === normalized.client_id));
      if (existingIndex === -1) return [...current, normalized];
      const next = [...current];
      next[existingIndex] = mergeMessageState(next[existingIndex], normalized);
      return next;
    });
  }, [currentUserId]);

  const markIncomingRead = useCallback((incoming) => {
    if (Number(incoming.sender_id) === currentUserId) return;
    socket.emit('messageDelivered', { messageId: incoming.id, recipientId: currentUserId, conversationId: activeConversationId });
    socket.emit('messageRead', { messageId: incoming.id, recipientId: currentUserId, conversationId: activeConversationId });
  }, [activeConversationId, currentUserId]);

  useEffect(() => {
    let mounted = true;
    socket.auth = { ...(socket.auth || {}), token: authToken, deviceId: getCachedDeviceId() };
    const isRecoverableConversationError = (value) => {
      const text = String(value?.message || value || '').toLowerCase();
      return text.includes('not a member') || text.includes('unable to join');
    };
    const recoverDirectConversation = async () => {
      if (!isDirectConversation || !participantId) return false;
      try {
        const resolved = await createDirectConversation(currentUserId, participantId, authToken);
        if (!mounted || !resolved?.conversationId) return false;
        if (Number(resolved.conversationId) !== Number(activeConversationId)) {
          setActiveConversationId(resolved.conversationId);
          setError('');
          return true;
        }
        return false;
      } catch (recoverError) {
        return false;
      }
    };
    const syncHistory = async () => {
      try {
        const response = await fetch(`${API_URL}/messages/${activeConversationId}?userId=${currentUserId}`, {
          headers: authHeaders(authToken),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to synchronize messages');
        if (!mounted) return;
        setMessages((current) => {
          const merged = [...current];
          for (const item of (data.messages || []).map((row) => mapMessage(row, currentUserId))) {
            const index = merged.findIndex((existing) => existing.id === item.id || (item.client_id && existing.client_id === item.client_id));
            if (index === -1) merged.push(item);
            else merged[index] = mergeMessageState(merged[index], item);
          }
          return merged.sort((a, b) => a.createdAt - b.createdAt);
        });
        setError('');
      } catch (syncError) {
        if (isRecoverableConversationError(syncError) && await recoverDirectConversation()) return;
        if (mounted) setError(syncError.message || 'Unable to synchronize messages');
      }
    };
    const handleConnect = () => {
      socket.emit('userOnline', currentUserId, (result) => {
        if (!mounted || result?.success) return;
        setError(result?.message || 'Unable to establish your secure identity');
      });
      socket.emit('joinConversation', { conversationId: activeConversationId, userId: currentUserId, participantId }, async (result) => {
        if (!mounted) return;
        if (result?.success) {
          if (result.resolvedConversationId && Number(result.resolvedConversationId) !== Number(activeConversationId)) {
            setActiveConversationId(result.resolvedConversationId);
            return;
          }
          setError('');
          syncHistory();
          return;
        }

        if (isRecoverableConversationError(result?.message) && await recoverDirectConversation()) return;
        if (isRecoverableConversationError(result?.message)) return;
        if (result?.message) setError(result.message);
      });
    };
    const handleNewMessage = (incoming) => {
      if (Number(incoming.conversation_id) !== Number(activeConversationId)) return;
      addMessage(incoming);
      markIncomingRead(incoming);
    };
    const handleMessageUpdated = (incoming) => {
      if (Number(incoming.conversation_id) !== Number(activeConversationId)) return;
      setMessages((current) => current.map((item) => (
        item.id === String(incoming.id)
          ? mergeMessageState(item, mapMessage(incoming, currentUserId))
          : item
      )));
    };
    const handleMessageDeleted = (incoming) => {
      if (Number(incoming.conversation_id) !== Number(activeConversationId)) return;
      setMessages((current) => current.map((item) => item.id === String(incoming.id) ? { ...item, text: 'This message was deleted', deleted: true, edited: false } : item));
    };
    const handleDelivered = ({ messageId }) => setMessages((current) => current.map((item) => (
      item.id === String(messageId) && item.sender === 'me'
        ? { ...item, status: item.status === 'read' ? 'read' : 'delivered' }
        : item
    )));
    const handleRead = ({ messageId }) => setMessages((current) => current.map((item) => (
      item.id === String(messageId) && item.sender === 'me'
        ? { ...item, status: 'read' }
        : item
    )));
    const handleTyping = (payload) => {
      if (Number(payload.conversationId) === Number(activeConversationId) && Number(payload.userId) !== currentUserId) setTyping(Boolean(payload.isTyping));
    };
    const handlePresence = (payload) => {
      if (participantId && Number(payload.userId) === participantId) setOnline(Boolean(payload.online));
    };
    const handleCallInvite = (payload) => {
      if (Number(payload.conversationId) !== Number(activeConversationId) || Number(payload.callerId) === currentUserId) return;
      const callId = payload.callId || payload.call?.id;
      Alert.alert(`${chatName} is calling`, `${payload.callType === 'VIDEO' ? 'Video' : 'Audio'} call`, [
        {
          text: 'Decline',
          style: 'cancel',
          onPress: async () => {
            socket.emit('callRejected', { conversationId: activeConversationId, callId });
            try {
              await persistCallStatus(callId, 'DECLINED');
            } catch (statusError) {
              setError(statusError.message || 'Unable to decline call');
            }
          },
        },
        {
          text: 'Accept',
          onPress: async () => {
            setCall({ ...payload, callId, status: 'ACTIVE' });
            socket.emit('callAccepted', { conversationId: activeConversationId, callId });
            try {
              await persistCallStatus(callId, 'ACTIVE');
            } catch (statusError) {
              setError(statusError.message || 'Unable to accept call');
            }
          },
        },
      ]);
    };
    const handleCallStatus = (payload) => {
      if (Number(payload.conversationId) === Number(activeConversationId)) setCall((current) => current ? { ...current, ...payload } : payload);
    };
    const handleConnectError = () => mounted && setError('Realtime connection unavailable. Retrying...');
    const loadMessages = async () => {
      try {
        const response = await fetch(`${API_URL}/messages/${activeConversationId}?userId=${currentUserId}`, {
          headers: authHeaders(authToken),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load messages');
        if (!mounted) return;
        const loaded = (data.messages || []).map((item) => mapMessage(item, currentUserId));
        setMessages(loaded);
        setError('');
        loaded.filter((item) => item.sender === 'them').forEach(markIncomingRead);
      } catch (loadError) {
        if (isRecoverableConversationError(loadError) && await recoverDirectConversation()) return;
        if (mounted) setError(loadError.message || 'Unable to load messages');
      }
    };

    socket.on('connect', handleConnect);
    socket.on('newMessage', handleNewMessage);
    socket.on('messageUpdated', handleMessageUpdated);
    socket.on('messageDeleted', handleMessageDeleted);
    socket.on('messageDelivered', handleDelivered);
    socket.on('messageRead', handleRead);
    socket.on('typing', handleTyping);
    socket.on('presence', handlePresence);
    socket.on('callInvite', handleCallInvite);
    socket.on('callAccepted', handleCallStatus);
    socket.on('callRejected', handleCallStatus);
    socket.on('callEnded', handleCallStatus);
    socket.on('connect_error', handleConnectError);
    if (socket.connected) handleConnect(); else socket.connect();
    loadMessages();

    return () => {
      mounted = false;
      socket.emit('typing', { conversationId: activeConversationId, userId: currentUserId, isTyping: false });
      socket.off('connect', handleConnect);
      socket.off('newMessage', handleNewMessage);
      socket.off('messageUpdated', handleMessageUpdated);
      socket.off('messageDeleted', handleMessageDeleted);
      socket.off('messageDelivered', handleDelivered);
      socket.off('messageRead', handleRead);
      socket.off('typing', handleTyping);
      socket.off('presence', handlePresence);
      socket.off('callInvite', handleCallInvite);
      socket.off('callAccepted', handleCallStatus);
      socket.off('callRejected', handleCallStatus);
      socket.off('callEnded', handleCallStatus);
      socket.off('connect_error', handleConnectError);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [activeConversationId, addMessage, authToken, chatName, currentUserId, isDirectConversation, markIncomingRead, participantId, persistCallStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setMessages((current) => current.map((item) => {
        const shouldLock = item.sender === 'me'
          && !String(item.id).startsWith('local:')
          && !item.locked
          && !item.deleted
          && item.status !== 'failed'
          && now - item.createdAt >= MESSAGE_LOCK_TIME;
        if (shouldLock) {
          lockMessageHttp(item.id, true, authToken).catch(() => {});
          return { ...item, locked: true, text: '' };
        }
        return item;
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [authToken]);

  const handleChangeText = (value) => {
    setMessage(value);
    if (socket.connected && !editingMessage) {
      socket.emit('typing', { conversationId: activeConversationId, userId: currentUserId, isTyping: Boolean(value.trim()) });
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => socket.emit('typing', { conversationId: activeConversationId, userId: currentUserId, isTyping: false }), 900);
    }
  };

  const resolveConversationAfterFailure = async (payload) => {
    if (!isDirectConversation || !participantId) throw new Error('Unable to prepare this conversation.');
    const resolved = await createDirectConversation(currentUserId, participantId, authToken);
    const nextConversationId = resolved?.conversationId;
    if (!nextConversationId) throw new Error('Unable to prepare this conversation.');
    setActiveConversationId(nextConversationId);
    return { ...payload, conversationId: nextConversationId };
  };

  const deliverOutgoing = async (payload) => {
    const optimistic = mapMessage({
      id: `local:${payload.clientId}`,
      conversation_id: payload.conversationId,
      sender_id: payload.senderId,
      content: payload.content,
      message_type: payload.messageType || 'TEXT',
      client_id: payload.clientId,
      reply_to_id: payload.replyToId || null,
      created_at: new Date().toISOString(),
      status: 'sending',
      reply_content: payload.replyText || '',
    }, currentUserId);
    setMessages((current) => current.some((item) => item.client_id === payload.clientId) ? current : [...current, optimistic]);

    const markFailed = (message) => {
      setMessages((current) => current.map((item) => item.client_id === payload.clientId ? { ...item, status: 'failed', failure: message } : item));
      setError(message);
    };
    const applySuccess = (serverMessage) => {
      if (serverMessage) addMessage(serverMessage);
      setMessages((current) => current.map((item) => {
        if (item.client_id !== payload.clientId) return item;
        const persisted = serverMessage ? mapMessage(serverMessage, currentUserId) : {};
        return mergeMessageState(item, { ...persisted, status: 'sent' });
      }));
      setError('');
    };

    try {
      const saved = await sendMessageHttp({ ...payload, authToken });
      applySuccess(saved.message);
      if (!socket.connected) socket.connect();
    } catch (firstError) {
      try {
        const retryPayload = await resolveConversationAfterFailure(payload);
        const saved = await sendMessageHttp({ ...retryPayload, authToken });
        applySuccess(saved.message);
        if (!socket.connected) socket.connect();
      } catch (finalError) {
        markFailed(finalError.message || firstError.message || 'Message failed. Tap retry.');
        if (!socket.connected) socket.connect();
      }
    }
  };

  const retryMessage = (item) => {
    deliverOutgoing({
      conversationId: activeConversationId,
      senderId: currentUserId,
      content: item.text,
      messageType: item.message_type || 'TEXT',
      clientId: item.client_id || `${currentUserId}-${Date.now()}`,
      replyToId: item.replyToId || null,
      replyText: item.replyText || '',
    });
  };

  const sendMessage = async () => {
    const content = message.trim();
    if (!content || chatLocked) {
      if (!content && !chatLocked) setError('Type a message first.');
      return;
    }
    if (editingMessage) {
      socket.timeout(10000).emit('editMessage', { messageId: editingMessage.id, senderId: currentUserId, content }, (timeoutError, result) => {
        if (!timeoutError && result?.success) {
          setMessage('');
          setEditingMessage(null);
          return;
        }

        editMessageHttp(editingMessage.id, currentUserId, content, authToken)
          .then((response) => {
            if (response.message) addMessage(response.message);
            setMessage('');
            setEditingMessage(null);
            setError('');
          })
          .catch((editError) => setError(editError.message || result?.message || 'Unable to edit message'));
      });
      return;
    }
    if (!activeConversationId) {
      setError('Unable to prepare this conversation.');
      return;
    }

    const clientId = `${currentUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = { conversationId: activeConversationId, senderId: currentUserId, content, messageType: 'TEXT', clientId, replyToId: replyTo?.id || null, replyText: replyTo?.text || '' };
    setMessage('');
    setReplyTo(null);
    deliverOutgoing(payload);
  };

  const showMessageActions = (item) => {
    const actions = [
      { text: 'Reply', onPress: () => { setReplyTo(item); setEditingMessage(null); } },
    ];
    if (item.sender === 'me' && !item.deleted && !item.locked && item.status !== 'failed') {
      actions.push({
        text: 'Lock message',
        onPress: async () => {
          try {
            const response = await lockMessageHttp(item.id, true, authToken);
            setMessages((current) => current.map((messageItem) => (
              messageItem.id === item.id
                ? mergeMessageState(messageItem, mapMessage(response.message, currentUserId))
                : messageItem
            )));
          } catch (lockError) {
            setError(lockError.message || 'Unable to lock message');
          }
        },
      });
    }
    if (item.locked) {
      actions.push({ text: 'Unlock message', onPress: () => openPin('message', item.id) });
    }
    if (item.status === 'failed') {
      actions.push({ text: 'Retry sending', onPress: () => retryMessage(item) });
    }
    if (item.sender === 'me' && !item.deleted && !item.locked && item.status !== 'failed') {
      actions.push({ text: 'Edit', onPress: () => { setEditingMessage(item); setReplyTo(null); setMessage(item.text); } });
    }
    if (item.sender === 'me' && !item.deleted && item.status !== 'failed') {
      actions.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () => socket.timeout(10000).emit('deleteMessage', { messageId: item.id, senderId: currentUserId }, (timeoutError, result) => {
          if (!timeoutError && result?.success) return;
          deleteMessageHttp(item.id, currentUserId, authToken)
            .then((response) => {
              if (response.message) {
                setMessages((current) => current.map((messageItem) => (
                  messageItem.id === String(response.message.id)
                    ? mapMessage(response.message, currentUserId)
                    : messageItem
                )));
              }
              setError('');
            })
            .catch((deleteError) => setError(deleteError.message || result?.message || 'Unable to delete message'));
        }),
      });
    }
    actions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Message', item.deleted ? 'This message was deleted.' : item.text, actions);
  };

  const clearHistory = () => {
    setMenuVisible(false);
    setClearForEveryone(false);
    setConfirmClearVisible(true);
  };

  const confirmClearHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/conversations/${activeConversationId}/history`, { method: 'DELETE', headers: authHeaders(authToken), body: JSON.stringify({ userId: currentUserId, forEveryone: clearForEveryone }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to clear history');
      setMessages([]);
      setConfirmClearVisible(false);
      setClearForEveryone(false);
    } catch (clearError) { Alert.alert('Clear history failed', clearError.message); }
  };

  const startCall = async () => {
    try {
      const response = await fetch(`${API_URL}/calls`, { method: 'POST', headers: authHeaders(authToken), body: JSON.stringify({ conversationId: activeConversationId, userId: currentUserId, callType: 'AUDIO' }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to start call');
      const callPayload = { conversationId: activeConversationId, callId: data.call.id, callType: data.call.call_type, status: 'RINGING' };
      setCall(callPayload);
      socket.emit('callInvite', callPayload);
    } catch (callError) { Alert.alert('Call unavailable', callError.message); }
  };

  const endCall = () => {
    if (!call) return;
    const callId = call.callId || call.call?.id;
    socket.emit('callEnded', { conversationId: activeConversationId, callId });
    persistCallStatus(callId, 'ENDED').catch(() => {});
    setCall(null);
  };

  const openPin = (mode, messageId = null) => {
    setPin(''); setPinError(''); setSelectedMessageId(messageId);
    if (mode === 'lock') setLockModalVisible(true); else setUnlockModalVisible(true);
  };

  const pinInputRef = useRef(null);

  const renderPinBoxes = () => {
    const digits = pin.padEnd(6, ' ').slice(0, 6).split('');
    return (
      <Pressable style={styles.pinBoxes} onPress={() => pinInputRef.current?.focus()}>
        {digits.map((digit, index) => (
          <View key={String(index)} style={styles.pinBox}>
            <Text style={styles.pinBoxText}>{digit.trim()}</Text>
          </View>
        ))}
      </Pressable>
    );
  };

  const lockChat = async () => {
    if (!/^\d{6}$/.test(pin)) return setPinError('Enter the six-digit access code.');
    try {
      await setChatPin(currentUserId, pin, authToken);
      setChatLocked(true);
      setLockModalVisible(false);
      setPin('');
    } catch (pinErrorValue) { setPinError(pinErrorValue.message || 'Unable to save chat PIN'); }
  };
  const reloadMessagesAfterUnlock = async () => {
    const response = await fetch(`${API_URL}/messages/${activeConversationId}?userId=${currentUserId}`, {
      headers: authHeaders(authToken),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load unlocked messages');
    setMessages((data.messages || []).map((item) => mapMessage(item, currentUserId)));
  };
  const unlockChat = async () => {
    try {
      await unlockConversation(activeConversationId, pin, validity, authToken);
      await reloadMessagesAfterUnlock();
      setChatLocked(false);
      setUnlockModalVisible(false);
      setPin('');
    } catch (pinErrorValue) { setPinError(pinErrorValue.message || 'Incorrect access code'); }
  };
  const unlockSelectedMessage = async () => {
    try {
      const response = await unlockMessageHttp(selectedMessageId, pin, authToken);
      setMessages((current) => current.map((item) => (
        item.id === selectedMessageId
          ? mergeMessageState(item, { ...mapMessage(response.message, currentUserId), locked: false })
          : item
      )));
      setUnlockModalVisible(false);
      setSelectedMessageId(null);
      setPin('');
    } catch (pinErrorValue) { setPinError(pinErrorValue.message || 'Incorrect access code'); }
  };

  const searchText = chatSearch.trim().toLowerCase();
  const visibleMessages = searchText && !chatLocked
    ? messages.filter((item) => String(item.text || '').toLowerCase().includes(searchText))
    : messages;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.soft} />
      {searchMode ? (
        <View style={styles.searchHeader}>
          <Feather name="search" size={20} color="#A9A9A9" />
          <TextInput style={styles.chatSearchInput} value={chatSearch} onChangeText={setChatSearch} placeholder="Search chats or group ......." placeholderTextColor="#B7B7B7" autoFocus />
          <Pressable onPress={() => { setSearchMode(false); setChatSearch(''); }} hitSlop={8}><Feather name="x" size={21} color={colors.text} /></Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => onBack ? onBack() : navigation?.goBack()} hitSlop={8}><Feather name="arrow-left" size={25} color={colors.text} /></Pressable>
          <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{conversation?.type === 'GROUP' ? 'GR' : initials(chatName, 'CO')}</Text></View>
          <View style={styles.headerInfo}><Text style={styles.headerName} numberOfLines={1}>{chatName}</Text></View>
          <Pressable style={styles.callButton} onPress={startCall}><Feather name="phone" size={23} color={colors.green} /></Pressable>
          <Pressable style={styles.menuButton} onPress={() => setMenuVisible(true)}><Feather name="more-vertical" size={24} color={colors.text} /></Pressable>
        </View>
      )}

      {!!error && <Pressable onPress={() => setError('')} style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></Pressable>}
      {!!call && <View style={styles.callBar}><Text style={styles.callBarText}>{call.status === 'ACTIVE' ? `Connected with ${chatName}` : `Calling ${chatName}…`}</Text><Pressable onPress={endCall}><Text style={styles.endCallText}>End</Text></Pressable></View>}

      <View style={styles.chatSurface}>
        <WatermarkLayer value={watermarkId} />
        <View style={styles.securityBanner}><Feather name="lock" size={9} color={colors.text} /><Text style={styles.securityText}>Secured Chat</Text></View>
      <ScrollView ref={scrollRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {chatLocked ? <View style={styles.lockedChatState}><Text style={styles.lockedChatIcon}>▣</Text><Text style={styles.lockedChatTitle}>Chat locked</Text><Text style={styles.lockedChatText}>Enter your access code to view this secure conversation.</Text><Pressable style={styles.greenButton} onPress={() => openPin('unlock')}><Text style={styles.greenButtonText}>Unlock Chat</Text></Pressable></View> : messages.length === 0 ? <View style={styles.emptyChat}><Text style={styles.emptyChatTitle}>Start a secure conversation</Text><Text style={styles.emptyChatText}>Messages are delivered in real time to {chatName}.</Text></View> : visibleMessages.length === 0 ? <View style={styles.emptyChat}><Text style={styles.emptyChatTitle}>No matches</Text><Text style={styles.emptyChatText}>Try another message keyword.</Text></View> : visibleMessages.map((item) => (
          <View key={item.id} style={[styles.messageRow, item.sender === 'me' ? styles.myMessageRow : styles.theirMessageRow]}>
            <Pressable onPress={() => { if (item.locked) openPin('message', item.id); else if (item.status === 'failed') retryMessage(item); }} onLongPress={() => showMessageActions(item)}>
              <View style={[styles.messageBubble, item.sender === 'me' ? styles.myBubble : styles.theirBubble, item.locked && styles.lockedBubble]}>
                {item.locked ? <><Text style={styles.lockedText}>Target locked</Text><Text style={styles.unlockHint}>Tap to unlock</Text></> : <>{item.replyToId && <View style={styles.replyPreview}><Text style={styles.replyPreviewLabel}>Reply</Text><Text style={styles.replyPreviewText} numberOfLines={1}>{item.replyText || 'Original message'}</Text></View>}<Text style={[styles.messageText, item.sender === 'me' ? styles.myMessageText : styles.theirMessageText]}>{item.text}</Text><Text style={[styles.messageTime, item.sender === 'me' ? styles.myTime : styles.theirTime]}>{item.edited ? 'edited · ' : ''}{item.status === 'failed' ? 'Failed · tap to retry' : item.time}{item.sender === 'me' && item.status !== 'failed' ? <Text style={[styles.statusTicks, item.status === 'read' && styles.statusTicksRead]}> {statusMark(item.status)}</Text> : null}</Text></>}
              </View>
            </Pressable>
          </View>
        ))}
        {typing && <Text style={styles.typingLabel}>{chatName} is typing…</Text>}
      </ScrollView>
      </View>

      {!!replyTo && <View style={styles.composerContext}><View style={styles.contextBody}><Text style={styles.contextTitle}>Replying to {replyTo.sender === 'me' ? 'yourself' : chatName}</Text><Text style={styles.contextText} numberOfLines={1}>{replyTo.text}</Text></View><Pressable onPress={() => setReplyTo(null)}><Text style={styles.contextClose}>×</Text></Pressable></View>}
      {!!editingMessage && <View style={styles.composerContext}><View style={styles.contextBody}><Text style={styles.contextTitle}>Edit message</Text><Text style={styles.contextText} numberOfLines={1}>{editingMessage.text}</Text></View><Pressable onPress={() => { setEditingMessage(null); setMessage(''); }}><Text style={styles.contextClose}>×</Text></Pressable></View>}
      <View style={styles.inputContainer}>
        <Pressable style={styles.attachButton} onPress={() => Alert.alert('Attachments', 'Attachment sending will connect to the encrypted file service.') }><Feather name="paperclip" size={26} color={colors.text} /></Pressable>
        <TextInput style={styles.input} value={message} onChangeText={handleChangeText} placeholder="Message" placeholderTextColor="#A0A0A0" multiline editable={!chatLocked} />
        <Pressable
          style={[styles.sendButton, message.trim() && styles.sendButtonActive]}
          onPress={message.trim() ? sendMessage : undefined}
        >
          <MaterialCommunityIcons
            name={message.trim() ? 'send' : 'microphone'}
            size={24}
            color="#FFFFFF"
          />
        </Pressable>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}><Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}><View style={styles.menuPanel} onStartShouldSetResponder={() => true}><Text style={styles.menuTitle}>{chatName}</Text><Pressable style={styles.menuOption} onPress={() => { setMenuVisible(false); setSearchMode(true); }}><Text style={styles.menuOptionText}>Search chat</Text></Pressable><Pressable style={styles.menuOption} onPress={() => { setMenuVisible(false); openPin(chatLocked ? 'unlock' : 'lock'); }}><Text style={styles.menuOptionText}>{chatLocked ? 'Unlock chat' : 'Lock chat'}</Text></Pressable><Pressable style={styles.menuOption} onPress={clearHistory}><Text style={[styles.menuOptionText, styles.dangerText]}>Clear history</Text></Pressable><Pressable style={styles.menuOption} onPress={() => setMenuVisible(false)}><Text style={styles.menuCancel}>Cancel</Text></Pressable></View></Pressable></Modal>
      <Modal visible={lockModalVisible || (unlockModalVisible && selectedMessageId === null)} transparent animationType="fade" onRequestClose={() => { setLockModalVisible(false); setUnlockModalVisible(false); }}><View style={styles.modalOverlay}><View style={styles.pinModal}><Text style={styles.modalTitle}>{lockModalVisible ? 'Lock Chat' : 'Unlock Chat'}</Text><Text style={styles.modalDescription}>{lockModalVisible ? 'Setup an access code dedicated for your chat to keep your message secure' : 'Input passcode to unlock chat'}</Text><Text style={styles.inputLabel}>Input Code</Text>{renderPinBoxes()}<TextInput ref={pinInputRef} style={styles.hiddenPinInput} value={pin} onChangeText={(value) => { setPin(value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus />{unlockModalVisible && selectedMessageId === null && <View style={styles.validityBlock}><Text style={styles.validityLabel}>Open Validity Period</Text><View style={styles.validityRow}>{VALIDITY_OPTIONS.map((option) => <Pressable key={option} style={styles.validityItem} onPress={() => setValidity((current) => current === option ? '' : option)}><View style={[styles.checkBox, validity === option && styles.checkBoxActive]}>{validity === option && <Feather name="check" size={13} color="#FFFFFF" />}</View><Text style={styles.validityText}>{option}</Text></Pressable>)}</View><Text style={styles.note}>NB. Chat will automatically lock after 7 days if open validity period is not set.</Text></View>}{!!pinError && <Text style={styles.pinError}>{pinError}</Text>}<Pressable style={styles.greenButton} onPress={lockModalVisible ? lockChat : unlockChat}><Text style={styles.greenButtonText}>{lockModalVisible ? 'Lock' : 'Unlock'}</Text></Pressable></View></View></Modal>
      <Modal visible={unlockModalVisible && selectedMessageId !== null} transparent animationType="fade" onRequestClose={() => setUnlockModalVisible(false)}><View style={styles.modalOverlay}><View style={styles.messageLockedModal}><Text style={styles.modalTitle}>Message Locked</Text><Text style={styles.modalDescription}>You have no viewing access to this message please enter passcode to view</Text><Text style={styles.inputLabel}>Input Code</Text>{renderPinBoxes()}<TextInput ref={pinInputRef} style={styles.hiddenPinInput} value={pin} onChangeText={(value) => { setPin(value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus />{!!pinError && <Text style={styles.pinError}>{pinError}</Text>}<Pressable style={styles.greenButton} onPress={unlockSelectedMessage}><Text style={styles.greenButtonText}>Unlock</Text></Pressable></View></View></Modal>
      <Modal visible={confirmClearVisible} transparent animationType="fade" onRequestClose={() => setConfirmClearVisible(false)}><View style={styles.modalOverlay}><View style={styles.clearModal}><Text style={styles.modalTitle}>Clear history</Text><Text style={styles.modalDescription}>Are you sure you want to clear your chat history with {chatName}</Text><Pressable style={styles.clearCheckRow} onPress={() => setClearForEveryone((value) => !value)}><View style={[styles.clearCheckBox, clearForEveryone && styles.clearCheckBoxActive]}>{clearForEveryone && <Feather name="check" size={13} color="#FFFFFF" />}</View><Text style={styles.clearCheckText}>Also delete for {chatName}</Text></Pressable><View style={styles.clearActions}><Pressable onPress={() => { setConfirmClearVisible(false); setClearForEveryone(false); }}><Text style={styles.cancelAction}>Cancel</Text></Pressable><Pressable onPress={confirmClearHistory}><Text style={styles.deleteAction}>Delete</Text></Pressable></View></View></View></Modal>
    </KeyboardAvoidingView>
  );
}

function WatermarkLayer({ value }) {
  const items = Array.from({ length: 42 });
  const text = String(value || 'APHENAS').toUpperCase();
  return (
    <View pointerEvents="none" style={styles.watermarkLayer}>
      {items.map((_, index) => (
        <Text key={String(index)} style={[styles.watermarkText, { left: (index % 4) * 96 - 20, top: Math.floor(index / 4) * 72 - 12 }]}>{text}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { height: 56 + (StatusBar.currentHeight || 0), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: StatusBar.currentHeight || 0, backgroundColor: colors.soft, borderBottomWidth: 0 },
  searchHeader: { height: 56 + (StatusBar.currentHeight || 0), flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: StatusBar.currentHeight || 0, backgroundColor: colors.bg },
  chatSearchInput: { flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.soft, paddingHorizontal: 16, color: colors.text, fontSize: 14 },
  backButton: { width: 34, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
  headerAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: '#E6E1E1', backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center', marginLeft: 2 },
  headerAvatarText: { color: colors.text, fontWeight: '900', fontSize: 14 },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  callButton: { width: 36, alignItems: 'center' },
  menuButton: { width: 32, alignItems: 'center' },
  chatSurface: { flex: 1, position: 'relative', overflow: 'hidden' },
  watermarkLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg },
  watermarkText: { position: 'absolute', color: colors.watermark, opacity: 0.56, fontSize: 14, transform: [{ rotate: '-58deg' }] },
  securityBanner: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3EFE0', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, marginTop: 8, zIndex: 2 },
  securityText: { color: colors.text, fontSize: 9, fontWeight: '600', marginLeft: 5 },
  errorBanner: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#FFF0F0', borderRadius: 8, padding: 9 },
  errorText: { color: '#A33A3A', fontSize: 12, textAlign: 'center' },
  callBar: { marginHorizontal: 14, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: '#EAF5E7', flexDirection: 'row', alignItems: 'center' },
  callBarText: { flex: 1, color: '#244D1F', fontSize: 12, fontWeight: '700' },
  endCallText: { color: '#A33A3A', fontWeight: '800' },
  messagesContainer: { flex: 1 },
  messagesContent: { paddingHorizontal: 30, paddingTop: 16, paddingBottom: 18 },
  messageRow: { width: '100%', marginBottom: 18 },
  myMessageRow: { alignItems: 'flex-end' },
  theirMessageRow: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '76%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 3 },
  myBubble: { backgroundColor: colors.bubble, borderTopRightRadius: 0 },
  theirBubble: { backgroundColor: colors.bubble, borderTopLeftRadius: 0 },
  messageText: { fontSize: 13, lineHeight: 18 },
  myMessageText: { color: '#FFF' },
  theirMessageText: { color: '#FFF' },
  messageTime: { fontSize: 9, marginTop: 4 },
  myTime: { color: '#B7B7B7', textAlign: 'right' },
  theirTime: { color: '#B7B7B7' },
  statusTicks: { color: '#DCDCDC', fontSize: 11, fontWeight: '900' },
  statusTicksRead: { color: '#6DD17A' },
  replyPreview: { borderLeftWidth: 2, borderLeftColor: '#B6D5AF', paddingLeft: 8, marginBottom: 6 },
  replyPreviewLabel: { color: '#B6D5AF', fontSize: 10, fontWeight: '800' },
  replyPreviewText: { color: '#D5D5D5', fontSize: 11, marginTop: 2 },
  lockedBubble: { minWidth: 136, alignItems: 'flex-start', backgroundColor: colors.bubble, paddingVertical: 9 },
  lockedText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  unlockHint: { color: '#D0D0D0', fontSize: 10, marginTop: 4 },
  typingLabel: { color: colors.green, fontSize: 11, marginTop: 2, marginBottom: 8 },
  emptyChat: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 40 },
  emptyChatTitle: { color: '#244D1F', fontSize: 17, fontWeight: '800' },
  emptyChatText: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  lockedChatState: { alignItems: 'center', paddingTop: 100, paddingHorizontal: 38 },
  lockedChatIcon: { color: colors.green, fontSize: 28 },
  lockedChatTitle: { color: '#244D1F', fontSize: 20, fontWeight: '800', marginTop: 12 },
  lockedChatText: { color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 9, paddingBottom: 11, backgroundColor: colors.bg },
  attachButton: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  input: { flex: 1, minHeight: 44, maxHeight: 96, borderRadius: 8, backgroundColor: colors.soft, paddingHorizontal: 18, paddingVertical: 11, color: colors.text, fontSize: 14 },
  sendButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendButtonActive: { backgroundColor: colors.green },
  composerContext: { marginHorizontal: 14, padding: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: '#EAF5E7', flexDirection: 'row', alignItems: 'center' },
  contextBody: { flex: 1 },
  contextTitle: { color: '#244D1F', fontSize: 11, fontWeight: '800' },
  contextText: { color: '#6D786B', fontSize: 11, marginTop: 2 },
  contextClose: { color: '#244D1F', fontSize: 22, paddingHorizontal: 4 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
  menuPanel: { position: 'absolute', top: (StatusBar.currentHeight || 0) + 56, right: 16, width: 220, backgroundColor: '#FFF', borderRadius: 14, padding: 8, elevation: 8 },
  menuTitle: { color: '#888', fontSize: 12, paddingHorizontal: 12, paddingVertical: 10 },
  menuOption: { paddingHorizontal: 12, paddingVertical: 14 },
  menuOptionText: { color: '#111', fontWeight: '700' },
  dangerText: { color: '#A43C3C' },
  menuCancel: { color: '#666', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  pinModal: { width: '100%', backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 20, paddingTop: 34, paddingBottom: 26, elevation: 12 },
  messageLockedModal: { width: '74%', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 20, paddingTop: 54, paddingBottom: 48, elevation: 12 },
  clearModal: { width: '82%', backgroundColor: '#FFF', borderRadius: 3, paddingHorizontal: 22, paddingTop: 34, paddingBottom: 22, elevation: 12 },
  modalTitle: { color: colors.green, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  modalDescription: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 10, marginBottom: 26 },
  inputLabel: { color: colors.text, fontSize: 14, marginBottom: 8 },
  pinBoxes: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  pinBox: { flex: 1, height: 48, backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center' },
  pinBoxText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  hiddenPinInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  validityBlock: { marginTop: 4, marginBottom: 4 },
  validityLabel: { color: colors.text, fontSize: 14, marginBottom: 11 },
  validityRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  validityItem: { flexDirection: 'row', alignItems: 'center' },
  checkBox: { width: 18, height: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 2, marginRight: 7, alignItems: 'center', justifyContent: 'center' },
  checkBoxActive: { backgroundColor: colors.green, borderColor: colors.green },
  validityText: { color: colors.muted, fontSize: 14 },
  note: { color: '#235B20', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  pinError: { color: '#AA3939', textAlign: 'center', marginTop: 8 },
  greenButton: { height: 40, borderRadius: 22, backgroundColor: colors.green, justifyContent: 'center', alignItems: 'center', marginTop: 18, paddingHorizontal: 30, alignSelf: 'center', minWidth: 208 },
  greenButtonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  cancelText: { textAlign: 'center', color: '#666', fontWeight: '700', paddingVertical: 16 },
  clearCheckRow: { flexDirection: 'row', alignItems: 'center', marginTop: -8, marginBottom: 22 },
  clearCheckBox: { width: 19, height: 19, borderRadius: 2, borderWidth: 1, borderColor: colors.line, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  clearCheckBoxActive: { backgroundColor: colors.green, borderColor: colors.green },
  clearCheckText: { color: colors.muted, fontSize: 13 },
  clearActions: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  cancelAction: { color: colors.green, fontWeight: '900', paddingVertical: 10 },
  deleteAction: { color: '#C02D2D', fontWeight: '900', paddingVertical: 10 },
});

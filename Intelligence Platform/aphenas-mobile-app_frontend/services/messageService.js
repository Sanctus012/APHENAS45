import { API_URL } from '../config/api';
import { authHeaders } from './apiClient';

async function parse(response) {
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

export async function createConversation(type, members, createdBy, title, authToken) {
  return parse(await fetch(`${API_URL}/messages/create`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ type, members, createdBy, title }),
  }));
}

export async function sendMessage({ conversationId, senderId, content, messageType = 'TEXT', clientId, replyToId, authToken }) {
  return parse(await fetch(`${API_URL}/messages/send`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ conversationId, senderId, content, messageType, clientId, replyToId }),
  }));
}

export async function getMessages(conversationId, userId, authToken) {
  return parse(await fetch(`${API_URL}/messages/${conversationId}?userId=${userId}`, {
    headers: authHeaders(authToken),
  }));
}

export async function markDelivered(messageId, recipientId, authToken) {
  return parse(await fetch(`${API_URL}/messages/${messageId}/delivered`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ recipientId }),
  }));
}

export async function markRead(messageId, recipientId, authToken) {
  return parse(await fetch(`${API_URL}/messages/${messageId}/read`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ recipientId }),
  }));
}

export async function editMessage(messageId, senderId, content, authToken) {
  return parse(await fetch(`${API_URL}/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeaders(authToken),
    body: JSON.stringify({ senderId, content }),
  }));
}

export async function deleteMessage(messageId, senderId, authToken) {
  return parse(await fetch(`${API_URL}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeaders(authToken),
    body: JSON.stringify({ senderId }),
  }));
}

export async function lockMessage(messageId, locked, authToken) {
  return parse(await fetch(`${API_URL}/messages/${messageId}/lock`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ locked }),
  }));
}

export async function unlockMessage(messageId, pin, authToken) {
  return parse(await fetch(`${API_URL}/messages/${messageId}/unlock`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ pin }),
  }));
}

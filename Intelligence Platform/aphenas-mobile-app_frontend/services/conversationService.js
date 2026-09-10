import { API_URL } from '../config/api';
import { authHeaders } from './apiClient';

async function parse(response) {
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

export async function getConversations(userId, authToken) {
  return parse(await fetch(`${API_URL}/conversations/${userId}`, {
    headers: authHeaders(authToken),
  }));
}

export async function getGroups(userId, authToken) {
  return parse(await fetch(`${API_URL}/groups/${userId}`, {
    headers: authHeaders(authToken),
  }));
}

export async function createDirectConversation(userId, participantId, authToken) {
  return parse(await fetch(`${API_URL}/conversations/direct`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userId, participantId }),
  }));
}

export async function createGroupConversation(userId, memberIds, name, authToken) {
  return parse(await fetch(`${API_URL}/conversations/group`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userId, memberIds, name }),
  }));
}

export async function leaveConversation(conversationId, userId, authToken) {
  return parse(await fetch(`${API_URL}/conversations/${conversationId}/leave`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userId }),
  }));
}

export async function clearHistory(conversationId, userId, authToken) {
  return parse(await fetch(`${API_URL}/conversations/${conversationId}/history`, {
    method: 'DELETE',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userId }),
  }));
}

export async function getConversationUnlockStatus(conversationId, authToken) {
  return parse(await fetch(`${API_URL}/conversations/${conversationId}/unlock-status`, {
    headers: authHeaders(authToken),
  }));
}

export async function unlockConversation(conversationId, pin, validityPeriod, authToken) {
  return parse(await fetch(`${API_URL}/conversations/${conversationId}/unlock`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ pin, validityPeriod }),
  }));
}

export async function relockConversation(conversationId, authToken) {
  return parse(await fetch(`${API_URL}/conversations/${conversationId}/relock`, {
    method: 'POST',
    headers: authHeaders(authToken),
  }));
}
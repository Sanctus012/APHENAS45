import { API_URL } from '../config/api';
import { authHeaders } from './apiClient';

async function parse(response) {
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || 'Chat PIN request failed');
  return data;
}

export async function setChatPin(userId, pin, authToken) {
  return parse(await fetch(`${API_URL}/users/${userId}/chat-pin`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ pin }),
  }));
}

export async function verifyChatPin(userId, pin, authToken) {
  return parse(await fetch(`${API_URL}/users/${userId}/chat-pin/verify`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ pin }),
  }));
}

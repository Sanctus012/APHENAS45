import { API_URL } from '../config/api';
import { authHeaders } from './apiClient';

async function parse(response) {
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.message || 'Signal request failed');
  return data;
}

export async function getSitreps(authToken, status = '') {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return parse(await fetch(`${API_URL}/signal/sitreps${query}`, {
    headers: authHeaders(authToken),
  }));
}

export async function sendSitrep(authToken, payload) {
  return parse(await fetch(`${API_URL}/signal/sitreps`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify(payload),
  }));
}

export async function getBroadcasts(authToken) {
  return parse(await fetch(`${API_URL}/signal/broadcasts`, {
    headers: authHeaders(authToken),
  }));
}

export async function sendBroadcast(authToken, payload) {
  return parse(await fetch(`${API_URL}/signal/broadcasts`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify(payload),
  }));
}

export async function acknowledgeBroadcast(authToken, broadcastId) {
  return parse(await fetch(`${API_URL}/signal/broadcasts/${broadcastId}/ack`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({}),
  }));
}

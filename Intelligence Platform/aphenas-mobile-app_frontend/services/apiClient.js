import { API_URL, NGROK_SKIP_BROWSER_WARNING_HEADER } from '../config/api';
import { getCachedDeviceId } from './deviceService';

export function authHeaders(authToken, extraHeaders = {}) {
  const deviceId = getCachedDeviceId();
  return {
    'Content-Type': 'application/json',
    ...NGROK_SKIP_BROWSER_WARNING_HEADER,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(deviceId ? { 'X-Aphenas-Device-Id': deviceId } : {}),
    ...extraHeaders,
  };
}


export async function apiRequest(
  endpoint,
  options = {}
) {
  try {
    const response = await fetch(
      `${API_URL}${endpoint}`,
      {
        ...options,

        headers: {
          ...authHeaders(),
          ...options.headers,
        },
      }
    );


    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }


    if (!response.ok) {
      throw new Error(
        data?.message ||
        `Request failed with status ${response.status}`
      );
    }


    return data;

  } catch (error) {

    if (
      error instanceof TypeError &&
      error.message === 'Network request failed'
    ) {
      throw new Error(
        'Unable to connect to the Aphenas server.'
      );
    }


    throw error;
  }
}

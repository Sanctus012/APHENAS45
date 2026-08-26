const NGROK_BASE_URL = 'https://duffel-treble-cube.ngrok-free.dev';
const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const baseUrl = (configuredBaseUrl || NGROK_BASE_URL).replace(/\/$/, '');

export const API_BASE_URL = baseUrl;
export const API_URL = `${API_BASE_URL}/api`;
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || API_BASE_URL;

export const NGROK_SKIP_BROWSER_WARNING_HEADER = {
  'ngrok-skip-browser-warning': 'true',
};

export function buildApiUrl(path = '') {
  return `${API_URL}/${String(path).replace(/^\//, '')}`;
}

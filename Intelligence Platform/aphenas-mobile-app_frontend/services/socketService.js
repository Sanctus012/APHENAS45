import { io } from 'socket.io-client';
import { NGROK_SKIP_BROWSER_WARNING_HEADER, SOCKET_URL } from '../config/api';

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  extraHeaders: NGROK_SKIP_BROWSER_WARNING_HEADER,
  transportOptions: {
    polling: {
      extraHeaders: NGROK_SKIP_BROWSER_WARNING_HEADER,
    },
  },
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  retries: 2,
  ackTimeout: 10000,
});

export default socket;

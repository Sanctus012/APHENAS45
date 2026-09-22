import express from 'express';

import cors from 'cors';

import authRoutes from './routes/authRoutes.js';

import provisioningRoutes from './routes/provisioningRoutes.js';

import recoveryRoutes from './routes/recoveryRoutes.js';

import messageRoutes
from './messaging/routes/messageRoutes.js';

import groupRoutes from './routes/groupRoutes.js';

import conversationRoutes from './routes/conversationRoutes.js';

import userRoutes from './routes/userRoutes.js';
import callRoutes from './routes/callRoutes.js';
import signalRoutes from './routes/signalRoutes.js';


const app = express();


/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

// Media messages are encrypted into the message body as base64 payloads.
// Keep the limit above the client-side 8 MB attachment cap after base64 expansion.
app.use(express.json({ limit: '12mb' }));

app.use(
  express.urlencoded({
    extended: true,
  })
);


/* =========================
   HEALTH CHECK
========================= */

app.get('/api/health', (req, res) => {

  res.status(200).json({

    success: true,

    message:
      'Aphenas backend is running',

  });

});


/* =========================
   ROUTES
========================= */

app.use(
  '/api/auth',
  authRoutes
);


app.use(
  '/api/admin',
  provisioningRoutes
);


app.use(
  '/api/onboarding/recovery',
  recoveryRoutes
);

app.use(
  '/api/messages',
  messageRoutes
);

app.use(
 '/api/conversations',
 conversationRoutes
);

app.use(
  '/api/groups',
  groupRoutes
);

app.use(
'/api/users',
userRoutes
);

app.use(
  '/api/calls',
  callRoutes
);

app.use(
  '/api/signal',
  signalRoutes
);

/* =========================
   404
========================= */

app.use((req, res) => {

  res.status(404).json({

    success: false,

    message:
      'Route not found',

  });

});


export default app;

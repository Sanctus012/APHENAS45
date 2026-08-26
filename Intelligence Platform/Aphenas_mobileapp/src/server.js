import 'dotenv/config';

import http from 'http';

import { Server } from 'socket.io';

import app from './app.js';

import {
  connectDatabase,
} from './config/db.js';


import {
  setupMessagingSocket,
} from './messaging/socket.js';



const PORT =
  process.env.PORT || 5050;



// Create HTTP server
const server =
  http.createServer(app);



// Create Socket.IO server
  const io =
    new Server(server, {

    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },

    cors: {

      origin: '*',

      methods: [
        'GET',
        'POST'
      ]

    }

  });



  app.set('io', io);

  // Setup realtime messaging
setupMessagingSocket(io);



// General realtime connection
io.on(
  'connection',
  (socket) => {

    console.log(
      'Realtime user connected:',
      socket.id
    );


    socket.on(
      'disconnect',
      () => {

        console.log(
          'Realtime user disconnected:',
          socket.id
        );

      }
    );

  }
);





async function startServer() {

  try {

    await connectDatabase();



    server.listen(
      PORT,
      '0.0.0.0',
      () => {


        console.log(
          '=============================='
        );


        console.log(
          'APHENAS BACKEND STARTED'
        );


        console.log(
          `Port: ${PORT}`
        );


        console.log(
          `Health: http://localhost:${PORT}/api/health`
        );


        if (process.env.PUBLIC_URL) {

          console.log(
            `Public Health: ${process.env.PUBLIC_URL.replace(/\/$/, '')}/api/health`
          );

        }


        console.log(
          'Socket.IO: ENABLED'
        );


        console.log(
          'Realtime Messaging: ENABLED'
        );


        console.log(
          '=============================='
        );


      }
    );


  } catch(error) {


    console.error(
      'Unable to start backend:',
      error.message
    );


    process.exit(1);


  }

}



startServer();

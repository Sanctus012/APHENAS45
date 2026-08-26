import { io } from "socket.io-client";


const socket =
  io("https://duffel-treble-cube.ngrok-free.dev");


socket.on(
  "connect",
  () => {

    console.log(
      "Connected:",
      socket.id
    );


    socket.emit(
      "joinConversation",
      1
    );


    setTimeout(() => {

      socket.emit(
        "sendMessage",
        {
          conversationId:1,
          senderId:3,
          content:"Realtime test message",
          messageType:"TEXT"
        }
      );


    },2000);


  }
);



socket.on(
  "newMessage",
  (message)=>{

    console.log(
      "NEW MESSAGE:",
      message
    );

  }
);

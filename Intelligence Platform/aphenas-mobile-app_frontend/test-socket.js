const { io } = require("socket.io-client");
const s = io("https://duffel-treble-cube.ngrok-free.dev", {
  transports: ["websocket"],
  extraHeaders: {
    "ngrok-skip-browser-warning": "true",
  },
});
s.on("connect", () => {
  console.log("connected", s.id);
  s.emit("joinConversation", 1);
  s.emit("sendMessage", { conversationId: 1, senderId: 2, content: "hello", messageType: "TEXT" });
});
s.on("newMessage", (m) => console.log("newMessage", m));
s.on("connect_error", (e) => console.error("connect_error", e.message));

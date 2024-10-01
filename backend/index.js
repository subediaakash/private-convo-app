import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";

const app = express();

const server = createServer(app);
const wss = new WebSocketServer({ server });
const users = new Map();

const broadcast = (msg) => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  });
};

wss.on("connection", (ws) => {
  console.log("A client has been connected to the socket");

  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      console.log("Message:", parsedMessage);

      if (parsedMessage.type === "register") {
        const { userId } = parsedMessage;
        users.set(userId, ws);
        console.log(`User with id ${userId} has been connected`);
        console.log("Current users:", [...users.keys()]); // Log connected users
      } else if (parsedMessage.type === "private_message") {
        const { toUserId, fromUserId, content } = parsedMessage;
        const recipientWs = users.get(toUserId);

        if (recipientWs && recipientWs.readyState === ws.OPEN) {
          recipientWs.send(
            JSON.stringify({ fromUserId, content, type: "private_message" })
          );
          console.log(
            `Private message from ${fromUserId} to ${toUserId}: ${content}`
          );
        } else {
          console.log(`User with id ${toUserId} is not connected`);
        }
      }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });
  ws.on("close", () => {
    users.forEach((connection, userId) => {
      if (connection === ws) {
        users.delete(userId);
        console.log(`user ${userId} deleted`);
      }
    });
  });
});

const httpServer = server.listen(3000, () => {
  console.log("Server running on port 3000");
});

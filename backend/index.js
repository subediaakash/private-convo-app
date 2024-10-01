import express from "express";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { createServer } from "http";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const users = new Map();

wss.on("connection", (ws) => {
  console.log("A client has connected");

  ws.on("message", async (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      console.log("Message:", parsedMessage);

      switch (parsedMessage.type) {
        case "register":
          await handleRegister(ws, parsedMessage);
          break;
        case "private_message":
          await handlePrivateMessage(ws, parsedMessage);
          break;
        default:
          throw new Error("Unknown message type");
      }
    } catch (err) {
      console.error("Error handling message:", err);
      ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  ws.on("close", () => {
    users.forEach((socket, userId) => {
      if (socket === ws) {
        users.delete(userId);
        console.log(`User with id ${userId} disconnected`);
      }
    });
  });
});

async function handleRegister(ws, { userId, userName }) {
  try {
    const userIdInt = parseInt(userId, 10);
    let user = await prisma.user.findUnique({ where: { id: userIdInt } });
    if (!user) {
      user = await prisma.user.create({
        data: { id: userIdInt, name: userName },
      });
      console.log(`Created new user: ${user.name}`);
    }
    users.set(userIdInt, ws);
    ws.send(JSON.stringify({ type: "register_success", userId: userIdInt }));
    console.log(`User with id ${userIdInt} is now connected`);
  } catch (error) {
    console.error("Error in handleRegister:", error);
    ws.send(JSON.stringify({ type: "register_error", message: error.message }));
    throw error;
  }
}

async function handlePrivateMessage(ws, { fromUserId, toUserId, content }) {
  try {
    const fromUserIdInt = parseInt(fromUserId, 10);
    const toUserIdInt = parseInt(toUserId, 10);

    if (isNaN(fromUserIdInt) || isNaN(toUserIdInt)) {
      throw new Error("Invalid user IDs");
    }

    const [fromUser, toUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: fromUserIdInt } }),
      prisma.user.findUnique({ where: { id: toUserIdInt } }),
    ]);

    if (!fromUser || !toUser) {
      throw new Error("One or both users do not exist");
    }

    const message = await prisma.message.create({
      data: {
        content,
        fromUserId: fromUserIdInt,
        toUserId: toUserIdInt,
      },
    });

    const recipientWs = users.get(toUserIdInt);
    if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
      recipientWs.send(
        JSON.stringify({
          type: "private_message",
          fromUserId: fromUserIdInt,
          content,
        })
      );
      console.log(
        `Message from ${fromUserIdInt} to ${toUserIdInt}: ${content}`
      );
    } else {
      console.log(`User with id ${toUserIdInt} is not connected`);
    }

    ws.send(
      JSON.stringify({
        type: "message_sent",
        messageId: message.id,
        toUserId: toUserIdInt,
      })
    );
  } catch (error) {
    console.error("Error in handlePrivateMessage:", error.stack);
    ws.send(
      JSON.stringify({
        type: "message_error",
        error: error.message,
      })
    );
  }
}

const httpServer = server.listen(3000, () => {
  console.log("Server running on port 3000");
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  httpServer.close(() => {
    console.log("Server shut down");
    process.exit(0);
  });
});

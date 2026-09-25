import { Router } from "express";
import {
  createChatConversationController,
  getChatConversationController,
  listChatConversationsController,
  sendChatMessageController,
} from "../controllers/chat.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { chatRateLimit } from "../middlewares/chat-rate-limit.middleware.js";

const chatRouter = Router();
chatRouter.use(authenticate);
chatRouter.get("/conversations", listChatConversationsController);
chatRouter.post("/conversations", createChatConversationController);
chatRouter.get("/conversations/:id", getChatConversationController);
chatRouter.post("/conversations/:id/messages", chatRateLimit, sendChatMessageController);

export { chatRouter };

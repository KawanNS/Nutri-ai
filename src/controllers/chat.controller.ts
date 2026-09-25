import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import {
  chatConversationIdSchema,
  createChatConversationSchema,
  sendChatMessageSchema,
} from "../schemas/chat.schema.js";
import {
  ChatError,
  createChatConversation,
  getChatConversation,
  listChatConversations,
  sendChatMessage,
} from "../services/chat.service.js";

function identity(request: AuthenticatedRequest, response: Response): string | null {
  if (!request.auth?.userId) {
    response.status(401).json({ error: "Authentication is required" });
    return null;
  }
  return request.auth.userId;
}

function handle(error: unknown, response: Response): void {
  if (error instanceof ChatError) {
    response.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
}

export async function listChatConversationsController(request: AuthenticatedRequest, response: Response) {
  const userId = identity(request, response); if (!userId) return;
  try { response.status(200).json({ conversations: await listChatConversations(userId) }); }
  catch (error) { handle(error, response); }
}

export async function createChatConversationController(request: AuthenticatedRequest, response: Response) {
  const userId = identity(request, response); if (!userId) return;
  if (!createChatConversationSchema.safeParse(request.body ?? {}).success) {
    response.status(400).json({ error: "Request body must be empty", code: "INVALID_CHAT_BODY" }); return;
  }
  try { response.status(201).json({ conversation: await createChatConversation(userId) }); }
  catch (error) { handle(error, response); }
}

export async function getChatConversationController(request: AuthenticatedRequest, response: Response) {
  const userId = identity(request, response); if (!userId) return;
  const id = chatConversationIdSchema.safeParse(request.params.id);
  if (!id.success) { response.status(400).json({ error: "Invalid conversation id", code: "INVALID_CONVERSATION_ID" }); return; }
  try { response.status(200).json({ conversation: await getChatConversation(userId, id.data) }); }
  catch (error) { handle(error, response); }
}

export async function sendChatMessageController(request: AuthenticatedRequest, response: Response) {
  const userId = identity(request, response); if (!userId) return;
  const id = chatConversationIdSchema.safeParse(request.params.id);
  const body = sendChatMessageSchema.safeParse(request.body);
  if (!id.success || !body.success) {
    response.status(400).json({ error: "Invalid chat message", code: "INVALID_CHAT_MESSAGE" }); return;
  }
  try { response.status(201).json(await sendChatMessage(userId, id.data, body.data.message)); }
  catch (error) { handle(error, response); }
}

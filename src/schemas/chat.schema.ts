import { z } from "zod";

export const chatConversationIdSchema = z.string().uuid();

export const createChatConversationSchema = z.object({}).strict();

export const sendChatMessageSchema = z
  .object({ message: z.string().trim().min(1).max(2_000) })
  .strict();

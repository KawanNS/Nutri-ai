import { createDefaultAIRouter } from "../ai/ai-router.js";
import { AIRouterError, type AIRouter } from "../ai/ai-router.types.js";
import { prisma } from "../lib/prisma.js";
import {
  buildNutritionAssistantInput,
  nutritionAssistantInstructions,
} from "../prompts/nutrition-assistant.prompt.js";
import { getEffectiveSubscriptionAccess } from "./subscription.service.js";

export class ChatError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface ChatDependencies {
  client?: typeof prisma;
  router?: AIRouter;
  getPremiumAccess?: typeof getEffectiveSubscriptionAccess;
}

async function requirePremium(userId: string, dependencies: ChatDependencies): Promise<void> {
  const access = await (dependencies.getPremiumAccess ?? getEffectiveSubscriptionAccess)(userId);
  if (!access.isPremium) {
    throw new ChatError(403, "PREMIUM_REQUIRED", "Premium subscription is required");
  }
}

function publicAIError(error: unknown): ChatError {
  if (error instanceof ChatError) return error;
  if (error instanceof AIRouterError) {
    if (["AI_RATE_LIMIT", "AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"].includes(error.code)) {
      return new ChatError(503, "CHAT_TEMPORARILY_UNAVAILABLE", "Assistant is temporarily unavailable");
    }
    if (error.code === "AI_INVALID_RESPONSE" || error.code === "AI_SCHEMA_VALIDATION_FAILED") {
      return new ChatError(502, "CHAT_INVALID_RESPONSE", "Assistant returned an invalid response");
    }
  }
  return new ChatError(500, "CHAT_GENERATION_FAILED", "Assistant could not answer");
}

export async function listChatConversations(userId: string, dependencies: ChatDependencies = {}) {
  await requirePremium(userId, dependencies);
  const client = dependencies.client ?? prisma;
  return client.chatConversation.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        where: { role: "USER" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: { content: true, role: true },
      },
    },
  });
}

export async function createChatConversation(userId: string, dependencies: ChatDependencies = {}) {
  await requirePremium(userId, dependencies);
  return (dependencies.client ?? prisma).chatConversation.create({
    data: { userId },
    select: { id: true, createdAt: true, updatedAt: true, messages: true },
  });
}

export async function getChatConversation(
  userId: string,
  conversationId: string,
  dependencies: ChatDependencies = {},
) {
  await requirePremium(userId, dependencies);
  const conversation = await (dependencies.client ?? prisma).chatConversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  });
  if (!conversation) throw new ChatError(404, "CHAT_CONVERSATION_NOT_FOUND", "Conversation not found");
  return conversation;
}

export async function sendChatMessage(
  userId: string,
  conversationId: string,
  message: string,
  dependencies: ChatDependencies = {},
) {
  await requirePremium(userId, dependencies);
  const client = dependencies.client ?? prisma;
  const conversation = await client.chatConversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!conversation) throw new ChatError(404, "CHAT_CONVERSATION_NOT_FOUND", "Conversation not found");

  const [profile, mealPlan, recentDescending] = await Promise.all([
    client.profile.findUnique({
      where: { userId },
      select: {
        goal: true,
        activityLevel: true,
        mealsPerDay: true,
        weeklyFoodBudget: true,
        foodPreferences: true,
        likedFoods: true,
        dislikedFoods: true,
        foodRestrictions: true,
        foodAllergies: true,
      },
    }),
    client.mealPlan.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { content: true },
    }),
    client.chatMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { role: true, content: true },
    }),
  ]);

  const userMessage = await client.chatMessage.create({
    data: { conversationId, role: "USER", content: message },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  await client.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  try {
    const response = await (dependencies.router ?? createDefaultAIRouter()).route({
      task: "NUTRITION_ASSISTANT",
      instructions: nutritionAssistantInstructions,
      input: buildNutritionAssistantInput({
        profile: profile
          ? { ...profile, weeklyFoodBudget: profile.weeklyFoodBudget.toString() }
          : null,
        currentMealPlan: mealPlan?.content ?? null,
        conversation: recentDescending.reverse(),
        message,
      }),
      responseFormat: "TEXT",
      timeoutMs: 45_000,
    });
    const content = response.content.trim();
    if (!content || content.length > 12_000) {
      throw new AIRouterError("AI_INVALID_RESPONSE", false, "AI returned invalid chat content");
    }
    const assistantMessage = await client.chatMessage.create({
      data: { conversationId, role: "ASSISTANT", content },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    await client.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return { userMessage, assistantMessage };
  } catch (error: unknown) {
    throw publicAIError(error);
  }
}

export type { ChatDependencies };

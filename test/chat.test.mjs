import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAIGatewayAdapter } from "../dist/ai/adapters/ai-gateway.adapter.js";
import { createAIRouter } from "../dist/ai/ai-router.js";
import { createAIRoutingPolicy } from "../dist/ai/ai-routing-policy.js";
import { AIRouterError } from "../dist/ai/ai-router.types.js";
import { env } from "../dist/config/env.js";
import { listChatConversationsController } from "../dist/controllers/chat.controller.js";
import { sendChatMessageSchema } from "../dist/schemas/chat.schema.js";
import {
  ChatError,
  createChatConversation,
  getChatConversation,
  listChatConversations,
  sendChatMessage,
} from "../dist/services/chat.service.js";

const premium = async () => ({ isPremium: true });
const free = async () => ({ isPremium: false });

function fakeDatabase() {
  const state = { conversations: [], messages: [] };
  let sequence = 0;
  const date = () => new Date(`2026-09-21T12:00:${String(++sequence).padStart(2, "0")}Z`);
  const client = {
    chatConversation: {
      create: async ({ data }) => {
        const row = { id: `00000000-0000-4000-8000-${String(sequence + 1).padStart(12, "0")}`, ...data, createdAt: date(), updatedAt: date() };
        state.conversations.push(row);
        return { ...row, messages: [] };
      },
      findFirst: async ({ where }) => {
        const row = state.conversations.find((item) => item.id === where.id && item.userId === where.userId);
        if (!row) return null;
        const messages = state.messages.filter((item) => item.conversationId === row.id)
          .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        return where.id ? { ...row, messages } : row;
      },
      findMany: async ({ where, select }) => state.conversations.filter((item) => item.userId === where.userId).map((row) => {
        const query = select.messages;
        const messages = state.messages
          .filter((item) => item.conversationId === row.id && (!query.where?.role || item.role === query.where.role))
          .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        return {
          ...row,
          messages: messages.slice(0, query.take).map(({ content, role }) => ({ content, role })),
        };
      }),
      update: async ({ where, data }) => {
        const row = state.conversations.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    chatMessage: {
      create: async ({ data }) => {
        const row = { id: `message-${++sequence}`, ...data, createdAt: date() };
        state.messages.push(row);
        return row;
      },
      findMany: async ({ where, take }) => state.messages.filter((item) => item.conversationId === where.conversationId).slice(-take).reverse().map(({ role, content }) => ({ role, content })),
    },
    profile: { findUnique: async () => ({ goal: "MAINTENANCE", activityLevel: "MODERATE", mealsPerDay: 3, weeklyFoodBudget: 350, foodPreferences: ["caseira"], likedFoods: ["arroz"], dislikedFoods: [], foodRestrictions: [], foodAllergies: [] }) },
    mealPlan: { findFirst: async () => ({ content: { title: "Plano atual", days: [{ day: 1, meals: [{ name: "Almoço" }] }] } }) },
  };
  return { client, state };
}

test("chat requires authentication before service access", async () => {
  const output = {};
  const response = { status(code) { output.status = code; return this; }, json(body) { output.body = body; return this; } };
  await listChatConversationsController({ headers: {} }, response);
  assert.equal(output.status, 401);
});

test("Free users are blocked by the backend Premium authority", async () => {
  const db = fakeDatabase();
  await assert.rejects(
    () => createChatConversation("free-user", { client: db.client, getPremiumAccess: free }),
    (error) => error instanceof ChatError && error.code === "PREMIUM_REQUIRED" && error.statusCode === 403,
  );
  assert.equal(db.state.conversations.length, 0);
});

test("Premium conversation history is persisted, ordered, and isolated by user", async () => {
  const db = fakeDatabase();
  const conversation = await createChatConversation("user-a", { client: db.client, getPremiumAccess: premium });
  assert.equal((await listChatConversations("user-a", { client: db.client, getPremiumAccess: premium })).length, 1);
  assert.equal((await listChatConversations("user-b", { client: db.client, getPremiumAccess: premium })).length, 0);
  await assert.rejects(
    () => getChatConversation("user-b", conversation.id, { client: db.client, getPremiumAccess: premium }),
    (error) => error instanceof ChatError && error.code === "CHAT_CONVERSATION_NOT_FOUND",
  );

  let routerRequest;
  const router = { health: () => [], route: async (request) => {
    routerRequest = request;
    return { content: "Você pode separar os ingredientes na noite anterior.", provider: "GEMINI", model: "test-model", latencyMs: 1, usage: {}, finishReason: "stop", requestId: null };
  } };
  const sent = await sendChatMessage("user-a", conversation.id, "Como organizar o almoço?", { client: db.client, getPremiumAccess: premium, router });
  assert.equal(sent.userMessage.role, "USER");
  assert.equal(sent.assistantMessage.role, "ASSISTANT");
  assert.equal(routerRequest.task, "NUTRITION_ASSISTANT");
  assert.equal(routerRequest.responseFormat, "TEXT");
  assert.equal(routerRequest.timeoutMs, 45_000);
  assert.match(routerRequest.input, /MAINTENANCE/);
  assert.match(routerRequest.input, /Plano atual/);
  assert.equal(/passwordHash|userId|token|secret/i.test(routerRequest.input), false);
  const loaded = await getChatConversation("user-a", conversation.id, { client: db.client, getPremiumAccess: premium });
  assert.deepEqual(loaded.messages.map((item) => item.role), ["USER", "ASSISTANT"]);
  const summaries = await listChatConversations("user-a", { client: db.client, getPremiumAccess: premium });
  assert.deepEqual(summaries[0].messages, [{ role: "USER", content: "Como organizar o almoço?" }]);
});

test("gateway failure is sanitized and leaves the persisted USER message for history", async () => {
  const db = fakeDatabase();
  const conversation = await createChatConversation("user-a", { client: db.client, getPremiumAccess: premium });
  const router = { health: () => [], route: async () => { throw new AIRouterError("AI_PROVIDER_UNAVAILABLE", true, "private provider details"); } };
  await assert.rejects(
    () => sendChatMessage("user-a", conversation.id, "Mensagem válida", { client: db.client, getPremiumAccess: premium, router }),
    (error) => error instanceof ChatError && error.code === "CHAT_TEMPORARILY_UNAVAILABLE" && !error.message.includes("private"),
  );
  assert.deepEqual(db.state.messages.map((item) => item.role), ["USER"]);
});

test("chat message input rejects empty, extra, and oversized payloads", () => {
  assert.equal(sendChatMessageSchema.safeParse({ message: " dúvida " }).success, true);
  assert.equal(sendChatMessageSchema.safeParse({ message: " " }).success, false);
  assert.equal(sendChatMessageSchema.safeParse({ message: "x".repeat(2001) }).success, false);
  assert.equal(sendChatMessageSchema.safeParse({ message: "ok", userId: "other" }).success, false);
});

test("AI gateway text mode omits JSON response formatting", async () => {
  let received;
  const adapter = createAIGatewayAdapter({
    config: { baseUrl: "http://127.0.0.1:20128/v1", apiKey: "test-key" },
    createClient: () => ({ chat: { completions: { create: async (input) => { received = input; return { choices: [{ message: { content: "Resposta textual" } }] }; } } } }),
  });
  const response = await adapter.generate(
    { task: "NUTRITION_ASSISTANT", instructions: "safe", input: "hello", responseFormat: "TEXT", timeoutMs: 1000 },
    { task: "NUTRITION_ASSISTANT", provider: "GEMINI", model: "test-model" },
  );
  assert.equal(Object.hasOwn(received, "response_format"), false);
  assert.equal(response.content, "Resposta textual");
});

test("NUTRITION_ASSISTANT resolves through the existing AI Router", async () => {
  let calls = 0;
  const adapter = {
    provider: "GEMINI",
    health: () => ({ provider: "GEMINI", status: "CONFIGURED" }),
    generate: async (request, route) => {
      calls += 1;
      assert.equal(request.responseFormat, "TEXT");
      assert.equal(route.task, "NUTRITION_ASSISTANT");
      return { content: "Resposta", provider: "GEMINI", model: route.model, latencyMs: 1, usage: {}, finishReason: "stop", requestId: null };
    },
  };
  const router = createAIRouter({ policy: createAIRoutingPolicy(env.geminiModel), adapters: [adapter] });
  const response = await router.route({ task: "NUTRITION_ASSISTANT", instructions: "safe", input: "hello", responseFormat: "TEXT", timeoutMs: 1000 });
  assert.equal(response.content, "Resposta");
  assert.equal(calls, 1);
});

test("frontend integrates Premium state, history, Enter submission, loading and paywall", async () => {
  const [page, service, app, route] = await Promise.all([
    readFile("frontend/src/pages/ChatPage.tsx", "utf8"),
    readFile("frontend/src/services/chatService.ts", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("src/routes/chat.routes.ts", "utf8"),
  ]);
  assert.match(page, /<Paywall\/>/);
  assert.match(page, /event\.key === 'Enter'/);
  assert.match(page, /Preparando uma resposta/);
  assert.match(page, /scrollIntoView/);
  assert.match(service, /\/api\/chat\/conversations/);
  assert.match(app, /view === 'chat'/);
  assert.match(route, /chatRouter\.use\(authenticate\)/);
  assert.match(route, /chatRateLimit/);
});

test("assistant messages render basic Markdown as safe React elements", async () => {
  const [page, markdown] = await Promise.all([
    readFile("frontend/src/pages/ChatPage.tsx", "utf8"),
    readFile("frontend/src/components/MarkdownMessage.tsx", "utf8"),
  ]);
  assert.match(page, /<MarkdownMessage content=\{item\.content\}/);
  assert.match(markdown, /<strong/);
  assert.match(markdown, /<em/);
  assert.match(markdown, /<ul/);
  assert.match(markdown, /<ol/);
  assert.match(markdown, /<br \/>/);
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML/);
});

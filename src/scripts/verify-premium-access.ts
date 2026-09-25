import { pathToFileURL } from "node:url";

import { prisma } from "../lib/prisma.js";
import { listChatConversations } from "../services/chat.service.js";
import { getEffectiveSubscriptionAccess } from "../services/subscription.service.js";
import { getUsage } from "../services/usage-control.service.js";

async function run(): Promise<void> {
  const owner = await prisma.user.findFirst({
    where: { email: { startsWith: "gamespot", mode: "insensitive" } },
    select: { id: true },
  });
  if (!owner) throw new Error("GAMESPOT_OWNER_NOT_FOUND");

  const before = {
    users: await prisma.user.count(),
    subscriptions: await prisma.subscription.count(),
    usageEvents: await prisma.usageEvent.count(),
    conversations: await prisma.chatConversation.count(),
    mealPlans: await prisma.mealPlan.count(),
  };
  const access = await getEffectiveSubscriptionAccess(owner.id);
  await listChatConversations(owner.id);
  const usage = await getUsage(owner.id);
  const subscriptionBranch = await prisma.subscription.findFirst({
    where: {
      userId: owner.id,
      OR: [
        { status: "ACTIVE" },
        { status: "CANCELED", currentPeriodEnd: { gt: new Date() } },
      ],
    },
    select: { id: true },
  });
  const after = {
    users: await prisma.user.count(),
    subscriptions: await prisma.subscription.count(),
    usageEvents: await prisma.usageEvent.count(),
    conversations: await prisma.chatConversation.count(),
    mealPlans: await prisma.mealPlan.count(),
  };

  process.stdout.write(`${JSON.stringify({
    PREMIUM_CHAT_ACCESS: access.isPremium ? "SIM" : "NAO",
    PREMIUM_MEAL_PLAN_ACCESS: usage.isPremium ? "SIM" : "NAO",
    FREE_LIMIT_BYPASSED: subscriptionBranch ? "SIM" : "NAO",
    ACCESS_CHECK_DATABASE_CHANGED: JSON.stringify(before) === JSON.stringify(after) ? "NAO" : "SIM",
  }, null, 2)}\n`);
}

async function runDirectly(): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    process.stderr.write(`${JSON.stringify({
      error: error instanceof Error ? error.message : "PREMIUM_ACCESS_CHECK_FAILED",
    })}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) await runDirectly();

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRequirePremium } from "../dist/middlewares/premium.middleware.js";
import { ChatError, createChatConversation } from "../dist/services/chat.service.js";
import {
  getPremiumAccess,
  selectPremiumAccess,
  serializePremiumAccess,
} from "../dist/services/subscription.service.js";

const read = (path) => readFile(path, "utf8");
const now = new Date("2026-10-15T12:00:00.000Z");
const paidSubscription = (overrides = {}) => ({
  id: "subscription-paid",
  plan: "MONTHLY",
  status: "ACTIVE",
  currentPeriodEnd: new Date("2026-11-15T12:00:00.000Z"),
  canceledAt: null,
  ...overrides,
});

/** Mimics the Prisma reads used by getPremiumAccess; it has no write methods at all. */
function fakeAccessClient(users, subscriptionsByUser = {}) {
  const reads = [];
  return {
    reads,
    user: {
      findUnique: async ({ where, select }) => {
        reads.push({ model: "user", where, select });
        const role = users[where.id];
        return role ? { role } : null;
      },
    },
    subscription: {
      findMany: async ({ where }) => {
        reads.push({ model: "subscription", where });
        return subscriptionsByUser[where.userId] ?? [];
      },
    },
  };
}

const client = fakeAccessClient(
  { "admin-free": "ADMIN", "admin-paid": "ADMIN", "user-free": "USER", "user-paid": "USER" },
  { "admin-paid": [paidSubscription()], "user-paid": [paidSubscription({ id: "subscription-user" })] },
);
const resolveAccess = (userId) => getPremiumAccess(userId, now, client);

function responseRecorder() {
  const output = {};
  const response = {
    status(code) { output.status = code; return this; },
    json(body) { output.body = body; return this; },
  };
  return { output, response };
}

test("ADMIN without a paid subscription gets Premium flagged as administrative access", async () => {
  const access = await resolveAccess("admin-free");
  assert.equal(access.isPremium, true);
  assert.equal(access.adminAccess, true);
  assert.equal(access.subscriptionId, null);
  assert.equal(access.plan, null);
  assert.equal(access.status, null);
  assert.deepEqual(serializePremiumAccess(access), {
    isPremium: true,
    plan: null,
    status: null,
    currentPeriodEnd: null,
    canceledAt: null,
    adminAccess: true,
  });
});

test("a real paid subscription wins over admin access", async () => {
  const access = await resolveAccess("admin-paid");
  assert.equal(access.isPremium, true);
  assert.equal(access.adminAccess, false);
  assert.equal(access.subscriptionId, "subscription-paid");
  assert.equal(serializePremiumAccess(access).adminAccess, false);
});

test("USER role never receives admin access", async () => {
  assert.deepEqual(
    [await resolveAccess("user-free"), await resolveAccess("user-paid")].map(({ isPremium, adminAccess }) => ({ isPremium, adminAccess })),
    [{ isPremium: false, adminAccess: false }, { isPremium: true, adminAccess: false }],
  );
  assert.equal((await resolveAccess("missing-user")).isPremium, false);
});

test("ADMIN with only an expired subscription still gets administrative access", () => {
  const expired = paidSubscription({ status: "EXPIRED", currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z") });
  const access = selectPremiumAccess("ADMIN", [expired], now);
  assert.equal(access.isPremium, true);
  assert.equal(access.adminAccess, true);
  assert.equal(access.subscriptionId, null);
  assert.equal(access.status, "EXPIRED");
});

test("role is read from the database by user id, not from the request", async () => {
  const reads = fakeAccessClient({ "admin-free": "ADMIN" });
  await getPremiumAccess("admin-free", now, reads);
  assert.deepEqual(reads.reads.find((item) => item.model === "user"), {
    model: "user",
    where: { id: "admin-free" },
    select: { role: true },
  });

  // A USER whose request claims ADMIN stays blocked: the guard only trusts the resolver.
  const guard = createRequirePremium(resolveAccess);
  const { output, response } = responseRecorder();
  let nextCalls = 0;
  await guard({ auth: { userId: "user-free", role: "ADMIN" } }, response, () => { nextCalls += 1; });
  assert.equal(output.status, 403);
  assert.equal(output.body.code, "PREMIUM_REQUIRED");
  assert.equal(nextCalls, 0);
});

test("meal photo Premium guard lets ADMIN through and keeps USER blocked", async () => {
  const guard = createRequirePremium(resolveAccess);

  let adminNext = 0;
  const admin = responseRecorder();
  await guard({ auth: { userId: "admin-free", role: "ADMIN" } }, admin.response, () => { adminNext += 1; });
  assert.equal(adminNext, 1);
  assert.equal(admin.output.status, undefined);

  let userNext = 0;
  const user = responseRecorder();
  await guard({ auth: { userId: "user-free", role: "USER" } }, user.response, () => { userNext += 1; });
  assert.equal(userNext, 0);
  assert.equal(user.output.status, 403);
  assert.equal(user.output.body.code, "PREMIUM_REQUIRED");
});

test("assistant lets ADMIN create a conversation and keeps USER blocked", async () => {
  const created = [];
  const chatClient = {
    chatConversation: {
      create: async ({ data }) => {
        created.push(data);
        return { id: "conversation-admin", createdAt: now, updatedAt: now, messages: [] };
      },
    },
  };

  const conversation = await createChatConversation("admin-free", { client: chatClient, getPremiumAccess: resolveAccess });
  assert.equal(conversation.id, "conversation-admin");
  assert.deepEqual(created, [{ userId: "admin-free" }]);

  await assert.rejects(
    () => createChatConversation("user-free", { client: chatClient, getPremiumAccess: resolveAccess }),
    (error) => error instanceof ChatError && error.code === "PREMIUM_REQUIRED" && error.statusCode === 403,
  );
  assert.equal(created.length, 1);
});

test("Premium gates and the billing endpoint use the role-aware access", async () => {
  const [middleware, chat, billing] = await Promise.all([
    read("src/middlewares/premium.middleware.ts"),
    read("src/services/chat.service.ts"),
    read("src/services/billing.service.ts"),
  ]);
  assert.match(middleware, /resolvePremiumAccess: PremiumAccessResolver = getPremiumAccess/);
  assert.match(chat, /\(dependencies\.getPremiumAccess \?\? getPremiumAccess\)\(userId\)/);
  assert.match(billing, /return serializePremiumAccess\(await getPremiumAccess\(userId\)\);/);
});

test("ADMIN meal plan generations skip the free-use counters while billing flows stay subscription-only", async () => {
  const [usage, mealPlan, webhook, schema, migration] = await Promise.all([
    read("src/services/usage-control.service.ts"),
    read("src/services/meal-plan.service.ts"),
    read("src/services/cakto-webhook.service.ts"),
    read("prisma/schema.prisma"),
    read("prisma/migrations/20261019120000_add_admin_usage_entitlement/migration.sql"),
  ]);
  // getUsage still reports paid access only; the page merges the role-aware billing status.
  assert.match(usage, /getEffectiveSubscriptionAccess\(userId\)/);
  // The role is read from the database inside the reservation, and a paid subscription wins.
  assert.match(usage, /const adminAccess = !subscription && \(await transaction\.user\.findUnique\(\{\s*where: \{ id: userId \},\s*select: \{ role: true \},/);
  assert.match(usage, /const entitlement = subscription \? "SUBSCRIPTION" : adminAccess \? "ADMIN" : "FREE";/);
  assert.match(usage, /if \(entitlement !== "FREE"\) \{/);
  assert.match(usage, /const updatedUsage = transition\.entitlement !== "FREE"/);
  // Saving a generated plan confirms the usage on its own; ADMIN must not decrement free counters there either.
  assert.match(mealPlan, /const updatedUsage = transitioned\[0\]\.entitlement !== "FREE"/);
  assert.doesNotMatch(`${usage}\n${mealPlan}`, /entitlement === "SUBSCRIPTION"/);
  assert.match(schema, /enum UsageEntitlement \{\s*FREE\s*SUBSCRIPTION\s*ADMIN\s*\}/);
  assert.match(migration, /ALTER TYPE "UsageEntitlement" ADD VALUE IF NOT EXISTS 'ADMIN';/);
  assert.match(migration, /\("entitlement"::text IN \('FREE', 'ADMIN'\) AND "subscriptionId" IS NULL\)/);
  assert.match(migration, /\("entitlement"::text = 'SUBSCRIPTION' AND "subscriptionId" IS NOT NULL\)/);
  // The role is decided only at reservation time; saving plans and billing never check it.
  assert.doesNotMatch(mealPlan, /getPremiumAccess|adminAccess|role/);
  assert.doesNotMatch(webhook, /getPremiumAccess|adminAccess|"ADMIN"/);
});

test("profile menu and subscription page show the Premium (admin) badge without a paywall", async () => {
  const [app, context, menu, page, types] = await Promise.all([
    read("frontend/src/App.tsx"),
    read("frontend/src/components/layout/accountMenuContext.ts"),
    read("frontend/src/components/layout/ProfileMenu.tsx"),
    read("frontend/src/pages/SubscriptionPage.tsx"),
    read("frontend/src/types/subscription.ts"),
  ]);
  assert.match(types, /export interface BillingSubscription extends SubscriptionAccess \{ adminAccess: boolean \}/);
  assert.match(context, /export type PremiumState = 'loading' \| 'premium' \| 'admin' \| 'free' \| 'unavailable'/);
  assert.match(app, /setPremium\(subscription\.adminAccess \? 'admin' : subscription\.isPremium \? 'premium' : 'free'\)/);
  assert.match(menu, /if \(premium === 'admin'\) return <Badge[^>]*variant="success">Premium \(admin\)<\/Badge>/);
  assert.match(menu, /\{premium === 'free' && <button/);
  assert.match(page, /premium === 'admin' \? <Badge variant="success">Premium \(admin\)<\/Badge>/);
  assert.match(page, /: premium === 'admin'\s*\? <Alert variant="success" title="Premium \(admin\)">/);
  const adminBranch = page.slice(page.indexOf(": premium === 'admin'"), page.indexOf("<Paywall"));
  assert.doesNotMatch(adminBranch, /Paywall/);
});

test("meal plan summary shows admins as Premium instead of the free-usage limit", async () => {
  const page = await read("frontend/src/pages/MealPlanPage.tsx");
  assert.match(page, /setUsage\(\{ \.\.\.currentUsage, \.\.\.subscription \}\)/);
  assert.match(page, /if \(usage\.adminAccess\) return <div className="mp-usage"><Badge variant="success">Premium \(admin\)<\/Badge>/);
  assert.match(page, /if \(usage\.isPremium\) return <div className="mp-usage"><Badge variant="success">Premium ativo<\/Badge>/);
  assert.match(page, /limitReached = usage\?\.isPremium === false && usage\.freeUsesAvailable === 0/);
});

test("admin panel offers the path into the regular app", async () => {
  const [app, admin] = await Promise.all([
    read("frontend/src/App.tsx"),
    read("frontend/src/pages/AdminRouterPage.tsx"),
  ]);
  assert.match(app, /<AdminRouterPage onApp=\{checkProfile\} onLogout=\{logout\}\/>/);
  assert.match(app, /const checkProfile = \(\) => \{ setView\('checking-profile'\); void loadProfile\(\) \}/);
  assert.match(admin, /<button className="nav-button" type="button" onClick=\{onApp\}>Ir para o app<\/button>/);
});

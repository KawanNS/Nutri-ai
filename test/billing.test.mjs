import assert from "node:assert/strict";
import test from "node:test";

import {
  isSubscriptionPremium,
  selectEffectiveSubscriptionAccess,
} from "../dist/services/subscription.service.js";
import {
  getConfiguredCheckoutUrl,
  prepareCheckout,
} from "../dist/services/billing.service.js";
import {
  getCaktoProviderEventId,
  isValidCaktoSecret,
  recordCaktoWebhook,
} from "../dist/services/cakto-webhook.service.js";
import { generateMealPlan } from "../dist/services/meal-plan-generation.service.js";
import { checkoutBodySchema } from "../dist/schemas/billing.schema.js";

const now = new Date("2026-09-03T12:00:00.000Z");
const subscription = (overrides = {}) => ({
  id: "subscription-a",
  plan: "MONTHLY",
  status: "ACTIVE",
  currentPeriodEnd: new Date("2026-10-03T12:00:00.000Z"),
  canceledAt: null,
  ...overrides,
});

test("ACTIVE subscription grants Premium access", () => {
  assert.equal(isSubscriptionPremium(subscription(), now), true);
});

test("CANCELED subscription remains Premium until its paid period ends", () => {
  assert.equal(isSubscriptionPremium(subscription({ status: "CANCELED" }), now), true);
});

test("CANCELED subscription stops granting access after its period", () => {
  assert.equal(isSubscriptionPremium(subscription({
    status: "CANCELED",
    currentPeriodEnd: new Date("2026-09-03T11:59:59.000Z"),
  }), now), false);
});

test("EXPIRED and PAST_DUE subscriptions do not grant access", () => {
  assert.equal(isSubscriptionPremium(subscription({ status: "EXPIRED" }), now), false);
  assert.equal(isSubscriptionPremium(subscription({ status: "PAST_DUE" }), now), false);
});

test("subscription access is isolated to the records supplied for one user", () => {
  const access = selectEffectiveSubscriptionAccess([subscription()], now);
  const otherUserAccess = selectEffectiveSubscriptionAccess([], now);
  assert.equal(access.isPremium, true);
  assert.equal(otherUserAccess.isPremium, false);
});

test("checkout plans resolve only to the trusted Cakto host", () => {
  for (const plan of ["MONTHLY", "QUARTERLY", "ANNUAL"]) {
    const url = new URL(getConfiguredCheckoutUrl(plan));
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "pay.cakto.com.br");
  }
});

test("checkout fails closed while account correlation is unverified", () => {
  assert.throws(
    () => prepareCheckout("user-a", "MONTHLY"),
    (error) => error.code === "CHECKOUT_CORRELATION_NOT_VERIFIED",
  );
});

test("checkout input rejects prices, URLs, and unknown plans from the frontend", () => {
  assert.equal(checkoutBodySchema.safeParse({ plan: "MONTHLY" }).success, true);
  assert.equal(checkoutBodySchema.safeParse({ plan: "MONTHLY", price: 1 }).success, false);
  assert.equal(checkoutBodySchema.safeParse({ plan: "MONTHLY", checkoutUrl: "https://example.com" }).success, false);
  assert.equal(checkoutBodySchema.safeParse({ plan: "UNKNOWN" }).success, false);
});

test("webhook secret comparison accepts exact values and rejects missing or incorrect ones", () => {
  assert.equal(isValidCaktoSecret("correct", "correct"), true);
  assert.equal(isValidCaktoSecret("incorrect", "correct"), false);
  assert.equal(isValidCaktoSecret(undefined, "correct"), false);
});

test("webhook deduplication key separates lifecycle events for the same order", () => {
  assert.equal(getCaktoProviderEventId("refund", "order-1"), "refund:order-1");
  assert.notEqual(
    getCaktoProviderEventId("purchase_approved", "order-1"),
    getCaktoProviderEventId("chargeback", "order-1"),
  );
});

test("known webhook is recorded without granting access while association is blocked", async () => {
  const created = [];
  const result = await recordCaktoWebhook(
    { secret: "not-persisted", event: "subscription_created", data: { id: "order-1" } },
    { create: async (args) => { created.push(args); return { id: "event-1" }; } },
  );
  assert.equal(result.pendingAssociation, true);
  assert.equal(created[0].data.processingError, "CHECKOUT_ASSOCIATION_NOT_VERIFIED");
  assert.equal(JSON.stringify(created[0]).includes("not-persisted"), false);
});

test("invalid webhook payload does not write an event", async () => {
  let writes = 0;
  await assert.rejects(
    () => recordCaktoWebhook(
      { secret: "secret", event: "refund", data: {} },
      { create: async () => { writes += 1; } },
    ),
    (error) => error.code === "INVALID_WEBHOOK_PAYLOAD",
  );
  assert.equal(writes, 0);
});

test("unknown webhook never grants access and is marked processed", async () => {
  const created = [];
  const result = await recordCaktoWebhook(
    { secret: "secret", event: "unknown_event", data: { id: "order-2" } },
    { create: async (args) => { created.push(args); return { id: "event-2" }; } },
  );
  assert.equal(result.pendingAssociation, false);
  assert.equal(created[0].data.processingError, "UNSUPPORTED_EVENT");
  assert.ok(created[0].data.processedAt instanceof Date);
});

test("duplicate and concurrent webhook deliveries produce one persistence effect", async () => {
  let calls = 0;
  const persistence = {
    create: async () => {
      calls += 1;
      if (calls > 1) throw Object.assign(new Error("duplicate"), { code: "P2002" });
      return { id: "event-1" };
    },
  };
  const payload = { secret: "secret", event: "refund", data: { id: "order-3" } };
  const [first, duplicate] = await Promise.all([
    recordCaktoWebhook(payload, persistence),
    recordCaktoWebhook(payload, persistence),
  ]);
  assert.equal([first, duplicate].filter((item) => !item.duplicate).length, 1);
  assert.equal([first, duplicate].filter((item) => item.duplicate).length, 1);
});

function generationDependencies({ premium, fail = false }) {
  const counters = { limit: 3, consumed: premium ? 3 : 0, reserved: 0 };
  const keys = new Map();
  return {
    counters,
    dependencies: {
      prepare: async () => ({ profileSnapshot: { mealsPerDay: 3 }, prompt: {} }),
      reserve: async (_userId, _action, key) => {
        if (keys.has(key)) return { event: keys.get(key), usage: counters, reservationCreated: false };
        if (!premium && counters.consumed + counters.reserved >= counters.limit) {
          throw Object.assign(new Error("limit"), { code: "FREE_USAGE_LIMIT_REACHED" });
        }
        if (!premium) counters.reserved += 1;
        const event = { id: `event-${keys.size + 1}`, status: "PENDING", entitlement: premium ? "SUBSCRIPTION" : "FREE" };
        keys.set(key, event);
        return { event, usage: counters, reservationCreated: true };
      },
      generate: async () => {
        if (fail) throw new Error("provider failure");
        return { plan: {}, model: "mock", provider: "gemini" };
      },
      persist: async ({ usageEventId }) => {
        const event = [...keys.values()].find((item) => item.id === usageEventId);
        event.status = "CONSUMED";
        if (!premium) { counters.reserved -= 1; counters.consumed += 1; }
        return { mealPlan: { id: `plan-${usageEventId}` }, usage: { ...counters } };
      },
      findExisting: async () => ({ mealPlan: { id: "existing" }, usage: { ...counters } }),
      getState: async (_userId, eventId) => {
        const event = [...keys.values()].find((item) => item.id === eventId);
        return event ? { status: event.status, mealPlan: null } : null;
      },
      fail: async (_userId, eventId) => {
        const event = [...keys.values()].find((item) => item.id === eventId);
        event.status = "FAILED";
        if (!premium) counters.reserved -= 1;
      },
    },
  };
}

test("three free generations work, the fourth is blocked, and retries remain idempotent", async () => {
  const { counters, dependencies } = generationDependencies({ premium: false });
  for (const key of ["one", "two", "three"]) await generateMealPlan("user-a", key, dependencies);
  assert.equal(counters.consumed, 3);
  const retry = await generateMealPlan("user-a", "three", dependencies);
  assert.equal(retry.outcome, "EXISTING");
  await assert.rejects(() => generateMealPlan("user-a", "four", dependencies));
  assert.equal(counters.consumed, 3);
});

test("Premium generation works at zero free quota without changing free counters", async () => {
  const { counters, dependencies } = generationDependencies({ premium: true });
  const before = { ...counters };
  const result = await generateMealPlan("user-a", "premium-one", dependencies);
  assert.equal(result.outcome, "CREATED");
  assert.deepEqual(counters, before);
});

test("Premium provider failure does not change free counters", async () => {
  const { counters, dependencies } = generationDependencies({ premium: true, fail: true });
  const before = { ...counters };
  await assert.rejects(() => generateMealPlan("user-a", "premium-failure", dependencies));
  assert.deepEqual(counters, before);
});

test("free provider failure releases its reservation", async () => {
  const { counters, dependencies } = generationDependencies({ premium: false, fail: true });
  await assert.rejects(() => generateMealPlan("user-a", "free-failure", dependencies));
  assert.deepEqual(counters, { limit: 3, consumed: 0, reserved: 0 });
});

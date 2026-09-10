import assert from "node:assert/strict";
import test from "node:test";

import {
  isSubscriptionPremium,
  selectEffectiveSubscriptionAccess,
} from "../dist/services/subscription.service.js";
import {
  CHECKOUT_ATTEMPT_TTL_MS,
  buildCorrelatedCheckoutUrl,
  createCorrelatedCheckoutAttempt,
  generateCheckoutCorrelationToken,
  getConfiguredCheckoutUrl,
  hashCheckoutCorrelationToken,
  prepareCheckout,
} from "../dist/services/billing.service.js";
import {
  getCaktoProviderEventId,
  isValidCaktoSecret,
  recordCaktoWebhook,
} from "../dist/services/cakto-webhook.service.js";
import { caktoCorrelationTokenSchema } from "../dist/schemas/cakto-webhook.schema.js";
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

test("checkout correlation tokens are opaque, URL-safe, random, and contain no PII", () => {
  const userId = "5d789ca7-a7a5-41a8-8fc7-f89ea5f93ce7";
  const email = "person@example.com";
  const first = generateCheckoutCorrelationToken();
  const second = generateCheckoutCorrelationToken();

  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(Buffer.from(first, "base64url").byteLength >= 16);
  assert.notEqual(first, second);
  assert.equal(first.includes(userId), false);
  assert.equal(first.includes(email), false);
  assert.equal(first.split(".").length, 1);
});

test("correlated checkout persists only the token hash and a pending short-lived attempt", async () => {
  const token = "opaque_token-with-url_safe-characters";
  const tokenHash = hashCheckoutCorrelationToken(token);
  const fixedNow = new Date("2026-09-04T12:00:00.000Z");
  const writes = [];

  const result = await createCorrelatedCheckoutAttempt("user-a", "MONTHLY", {
    now: () => fixedNow,
    generateToken: () => token,
    persistence: {
      create: async (args) => {
        writes.push(args);
        return { id: "attempt-a" };
      },
    },
  });

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].select, { id: true });
  assert.equal(writes[0].data.userId, "user-a");
  assert.equal(writes[0].data.plan, "MONTHLY");
  assert.equal(writes[0].data.status, "PENDING");
  assert.equal(writes[0].data.token, tokenHash);
  assert.equal(writes[0].data.token.includes(token), false);
  assert.equal(writes[0].data.checkoutUrl.includes(token), false);
  assert.equal(writes[0].data.expiresAt.getTime(), fixedNow.getTime() + CHECKOUT_ATTEMPT_TTL_MS);
  assert.equal(result.checkoutAttemptId, "attempt-a");
  assert.equal(result.expiresAt.getTime(), fixedNow.getTime() + CHECKOUT_ATTEMPT_TTL_MS);
});

test("correlated checkout preserves trusted query parameters and safely replaces sck", async () => {
  const url = buildCorrelatedCheckoutUrl(
    "https://pay.cakto.com.br/example?campaign=safe&sck=old",
    "opaque token/+?",
  );
  const parsed = new URL(url);

  assert.equal(parsed.origin, "https://pay.cakto.com.br");
  assert.equal(parsed.searchParams.get("campaign"), "safe");
  assert.equal(parsed.searchParams.getAll("sck").length, 1);
  assert.equal(parsed.searchParams.get("sck"), "opaque token/+?");
  assert.match(url, /sck=opaque(?:\+|%20)token%2F%2B%3F/);
});

test("correlation preparation creates no subscription, Premium, or usage mutation", async () => {
  const effects = { checkoutAttempts: 0, subscriptions: 0, premium: 0, usage: 0 };
  await createCorrelatedCheckoutAttempt("user-a", "ANNUAL", {
    generateToken: () => "opaque-token",
    persistence: {
      create: async () => {
        effects.checkoutAttempts += 1;
        return { id: "attempt-a" };
      },
    },
  });

  assert.deepEqual(effects, { checkoutAttempts: 1, subscriptions: 0, premium: 0, usage: 0 });
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

test("subscription renewal refusal remains known and fail-closed", async () => {
  const created = [];
  const result = await recordCaktoWebhook(
    { secret: "not-persisted", event: "subscription_renewal_refused", data: { id: "order-1" } },
    { create: async (args) => { created.push(args); return { id: "event-1" }; } },
  );

  assert.equal(result.pendingAssociation, true);
  assert.equal(result.checkoutCorrelationCandidate, false);
  assert.equal(created[0].data.processingError, "CHECKOUT_ASSOCIATION_NOT_VERIFIED");
  assert.equal(created[0].data.processedAt, null);
});

const validCaktoCorrelationToken = "A".repeat(43);
const webhookCorrelationNow = new Date("2026-09-08T12:00:00.000Z");

async function recordWebhookWithCorrelationCandidate({ sck, attempt }) {
  const checkoutQueries = [];
  const checkoutOperations = [];
  const webhookWrites = [];
  const data = { id: "order-correlation", email: "private@example.com" };
  if (sck !== undefined) data.sck = sck;

  const checkoutAttempts = new Proxy(
    {
      findUnique: async (args) => {
        checkoutQueries.push(args);
        return attempt;
      },
    },
    {
      get(target, property, receiver) {
        checkoutOperations.push(String(property));
        return Reflect.get(target, property, receiver);
      },
    },
  );

  const result = await recordCaktoWebhook(
    { secret: "webhook-secret", event: "purchase_approved", data },
    {
      create: async (args) => {
        webhookWrites.push(args);
        return { recorded: true };
      },
    },
    {
      checkoutAttempts,
      now: () => webhookCorrelationNow,
    },
  );

  return { checkoutOperations, checkoutQueries, result, webhookWrites };
}

test("Cakto sck accepts the internal Base64URL format, null, or absence", () => {
  assert.equal(caktoCorrelationTokenSchema.safeParse(validCaktoCorrelationToken).success, true);
  assert.equal(caktoCorrelationTokenSchema.safeParse(null).success, true);
  assert.equal(caktoCorrelationTokenSchema.safeParse(undefined).success, true);
  assert.equal(caktoCorrelationTokenSchema.safeParse("invalid token").success, false);
});

for (const [name, sck] of [
  ["absent", undefined],
  ["null", null],
  ["invalid", "invalid token"],
]) {
  test(`Cakto sck ${name} remains uncorrelated and does not query CheckoutAttempt`, async () => {
    const { checkoutQueries, result } = await recordWebhookWithCorrelationCandidate({
      sck,
      attempt: null,
    });

    assert.equal(checkoutQueries.length, 0);
    assert.equal(result.checkoutCorrelationCandidate, false);
    assert.equal(result.pendingAssociation, true);
  });
}

test("valid but unknown Cakto sck remains uncorrelated", async () => {
  const { checkoutQueries, result } = await recordWebhookWithCorrelationCandidate({
    sck: validCaktoCorrelationToken,
    attempt: null,
  });

  assert.equal(checkoutQueries.length, 1);
  assert.equal(result.checkoutCorrelationCandidate, false);
  assert.equal(result.pendingAssociation, true);
});

test("expired CheckoutAttempt remains uncorrelated", async () => {
  const { result } = await recordWebhookWithCorrelationCandidate({
    sck: validCaktoCorrelationToken,
    attempt: {
      userId: "user-a",
      plan: "MONTHLY",
      status: "PENDING",
      expiresAt: webhookCorrelationNow,
    },
  });

  assert.equal(result.checkoutCorrelationCandidate, false);
  assert.equal(result.pendingAssociation, true);
});

test("non-PENDING CheckoutAttempt remains uncorrelated", async () => {
  const { result } = await recordWebhookWithCorrelationCandidate({
    sck: validCaktoCorrelationToken,
    attempt: {
      userId: "user-a",
      plan: "MONTHLY",
      status: "COMPLETED",
      expiresAt: new Date(webhookCorrelationNow.getTime() + 60_000),
    },
  });

  assert.equal(result.checkoutCorrelationCandidate, false);
  assert.equal(result.pendingAssociation, true);
});

test("matching unexpired PENDING CheckoutAttempt is only a fail-closed candidate", async () => {
  const { checkoutOperations, checkoutQueries, result, webhookWrites } =
    await recordWebhookWithCorrelationCandidate({
      sck: validCaktoCorrelationToken,
      attempt: {
        userId: "user-a",
        plan: "MONTHLY",
        status: "PENDING",
        expiresAt: new Date(webhookCorrelationNow.getTime() + 60_000),
      },
    });

  assert.deepEqual(checkoutOperations, ["findUnique"]);
  assert.equal(result.checkoutCorrelationCandidate, true);
  assert.equal(result.pendingAssociation, true);
  assert.deepEqual(Object.keys(result).sort(), [
    "checkoutCorrelationCandidate",
    "duplicate",
    "pendingAssociation",
    "webhookEvent",
  ]);
  assert.deepEqual(Object.keys(webhookWrites[0].data).sort(), [
    "eventType",
    "payloadHash",
    "processedAt",
    "processingError",
    "provider",
    "providerEventId",
  ]);
  assert.equal(webhookWrites[0].data.processingError, "CHECKOUT_ASSOCIATION_NOT_VERIFIED");
  assert.deepEqual(checkoutQueries[0].select, {
    userId: true,
    plan: true,
    status: true,
    expiresAt: true,
  });
  assert.equal(
    checkoutQueries[0].where.token,
    hashCheckoutCorrelationToken(validCaktoCorrelationToken),
  );
  assert.notEqual(checkoutQueries[0].where.token, validCaktoCorrelationToken);
  assert.equal(JSON.stringify(result).includes(validCaktoCorrelationToken), false);
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
  assert.equal(JSON.stringify(webhookWrites).includes(validCaktoCorrelationToken), false);
  assert.equal(JSON.stringify(webhookWrites).includes("private@example.com"), false);
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

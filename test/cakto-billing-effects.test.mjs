import assert from "node:assert/strict";
import test from "node:test";

import { hashCheckoutCorrelationToken } from "../dist/services/billing.service.js";
import { processCaktoWebhook } from "../dist/services/cakto-webhook.service.js";
import { isSubscriptionPremium } from "../dist/services/subscription.service.js";

const token = "E".repeat(43);
const allowlist = {
  MONTHLY: { productId: "product-monthly", offerId: "offer-monthly" },
  QUARTERLY: { productId: "product-quarterly", offerId: "offer-quarterly" },
  ANNUAL: { productId: "product-annual", offerId: "offer-annual" },
};

function provider(event, overrides = {}) {
  const orderId = overrides.orderId ?? "00000000-0000-4000-8000-000000000001";
  const dates = {
    paidAt: "2026-09-10T12:00:00Z",
    refundedAt: null,
    chargedbackAt: null,
    canceledAt: null,
  };
  let orderStatus = "paid";
  let subscriptionStatus = "active";
  if (event === "refund") {
    orderStatus = "refunded";
    dates.refundedAt = overrides.occurredAt ?? "2026-09-20T12:00:00Z";
  }
  if (event === "chargeback") {
    orderStatus = "chargedback";
    dates.chargedbackAt = overrides.occurredAt ?? "2026-09-21T12:00:00Z";
  }
  if (event === "subscription_canceled") {
    subscriptionStatus = "canceled";
    dates.canceledAt = overrides.occurredAt ?? "2026-09-15T12:00:00Z";
  }
  if (event === "subscription_renewed") {
    dates.paidAt = overrides.occurredAt ?? "2026-10-10T12:00:00Z";
  }

  const order = {
    id: orderId,
    status: overrides.orderStatus ?? orderStatus,
    type: "subscription",
    product: { id: overrides.productId ?? "product-monthly" },
    subscription: overrides.providerSubscriptionId ?? "subscription-1",
    sck: overrides.sck === undefined ? token : overrides.sck,
    ...dates,
  };
  const subscription = {
    amount: "19.90",
    parent_order: orderId,
    paymentMethod: "credit_card",
    customer: overrides.customerId ?? "customer-1",
    product: overrides.productId ?? "product-monthly",
    offer: overrides.offerId ?? "offer-monthly",
    orders: [orderId],
    createdAt: "2026-09-10T12:00:00Z",
    updatedAt: overrides.occurredAt ?? "2026-09-10T12:00:00Z",
    id: overrides.providerSubscriptionId ?? "subscription-1",
    status: overrides.subscriptionStatus ?? subscriptionStatus,
    next_payment_date: overrides.periodEnd ?? "2026-11-10T12:00:00Z",
    canceledAt: event === "subscription_canceled" ? dates.canceledAt : null,
  };
  const offer = {
    id: subscription.offer,
    name: "Monthly",
    price: overrides.price ?? 19.9,
    default: true,
    product: subscription.product,
  };
  const calls = [];
  return {
    orderId,
    calls,
    api: {
      getOrder: async (id) => { calls.push(["order", id]); return order; },
      getSubscription: async (id) => { calls.push(["subscription", id]); return subscription; },
      getOffer: async (id) => { calls.push(["offer", id]); return offer; },
    },
  };
}

function clone(value) {
  return structuredClone(value);
}

function fakeBillingClient(options = {}) {
  const state = {
    events: [],
    subscriptions: clone(options.subscriptions ?? []),
    attempts: clone(options.attempts ?? [{
      id: "attempt-1",
      userId: "user-1",
      plan: "MONTHLY",
      status: "PENDING",
      token: hashCheckoutCorrelationToken(token),
      completedAt: null,
    }]),
  };

  function facade(target, transactional = false) {
    return {
      paymentWebhookEvent: {
        create: async ({ data }) => {
          if (target.events.some((item) => item.provider === data.provider && item.providerEventId === data.providerEventId)) {
            throw Object.assign(new Error("duplicate"), { code: "P2002" });
          }
          const event = { id: `event-${target.events.length + 1}`, ...data };
          target.events.push(event);
          return clone(event);
        },
        findUnique: async ({ where }) => {
          const event = where.id
            ? target.events.find((item) => item.id === where.id)
            : target.events.find((item) =>
                item.provider === where.provider_providerEventId.provider &&
                item.providerEventId === where.provider_providerEventId.providerEventId);
          return event ? clone(event) : null;
        },
        update: async ({ where, data }) => {
          if (transactional && options.failTransactionOnEventUpdate) {
            throw new Error("synthetic transaction failure");
          }
          const event = target.events.find((item) => item.id === where.id);
          Object.assign(event, data);
          return clone(event);
        },
      },
      subscription: {
        findUnique: async ({ where }) => {
          const found = target.subscriptions.find((item) =>
            item.providerSubscriptionId === where.providerSubscriptionId);
          return found ? clone(found) : null;
        },
        create: async ({ data }) => {
          if (target.subscriptions.some((item) => item.providerSubscriptionId === data.providerSubscriptionId)) {
            throw Object.assign(new Error("duplicate subscription"), { code: "P2002" });
          }
          const subscription = { id: `subscription-local-${target.subscriptions.length + 1}`, ...data };
          target.subscriptions.push(subscription);
          return { id: subscription.id };
        },
        update: async ({ where, data }) => {
          const subscription = target.subscriptions.find((item) => item.id === where.id);
          Object.assign(subscription, data);
          return { id: subscription.id };
        },
      },
      checkoutAttempt: {
        findUnique: async ({ where }) => {
          const attempt = target.attempts.find((item) => item.token === where.token);
          return attempt ? clone(attempt) : null;
        },
        update: async ({ where, data }) => {
          const attempt = target.attempts.find((item) => item.id === where.id);
          Object.assign(attempt, data);
          return clone(attempt);
        },
      },
    };
  }

  const client = facade(state);
  client.$transaction = async (operation, transactionOptions) => {
    assert.deepEqual(transactionOptions, { isolationLevel: "Serializable" });
    const draft = clone(state);
    const result = await operation(facade(draft, true));
    state.events = draft.events;
    state.subscriptions = draft.subscriptions;
    state.attempts = draft.attempts;
    return result;
  };
  return { client, state };
}

async function deliver(event, db, providerOverrides = {}, payloadData = {}) {
  const remote = provider(event, providerOverrides);
  const result = await processCaktoWebhook(
    { secret: "not-persisted", event, data: { id: remote.orderId, ...payloadData } },
    { client: db.client, apiClient: remote.api, allowlist, now: () => new Date("2026-12-01T00:00:00Z") },
  );
  return { result, remote };
}

function existingSubscription(overrides = {}) {
  return {
    id: "subscription-local-1",
    userId: "user-1",
    provider: "CAKTO",
    plan: "MONTHLY",
    status: "ACTIVE",
    providerSubscriptionId: "subscription-1",
    providerCustomerId: "customer-1",
    providerProductId: "product-monthly",
    providerOfferId: "offer-monthly",
    currentPeriodStart: new Date("2026-09-10T12:00:00Z"),
    currentPeriodEnd: new Date("2026-10-10T12:00:00Z"),
    canceledAt: null,
    lastEventOccurredAt: new Date("2026-09-10T12:00:00Z"),
    ...overrides,
  };
}

for (const event of ["purchase_approved", "subscription_created"]) {
  test(`${event} creates one active Subscription and completes CheckoutAttempt`, async () => {
    const db = fakeBillingClient();
    const { result } = await deliver(event, db);
    assert.equal(result.pendingAssociation, false);
    assert.equal(db.state.subscriptions.length, 1);
    assert.equal(db.state.subscriptions[0].status, "ACTIVE");
    assert.equal(db.state.attempts[0].status, "COMPLETED");
    assert.equal(db.state.events[0].processingError, null);
    assert.ok(db.state.events[0].processedAt instanceof Date);
  });
}

test("subscription_renewed updates the authoritative period exactly once", async () => {
  const db = fakeBillingClient({ subscriptions: [existingSubscription()] });
  const first = await deliver("subscription_renewed", db, {
    orderId: "00000000-0000-4000-8000-000000000002",
    periodEnd: "2026-11-10T12:00:00Z",
  });
  const duplicate = await deliver("subscription_renewed", db, {
    orderId: "00000000-0000-4000-8000-000000000002",
    periodEnd: "2026-11-10T12:00:00Z",
  });
  assert.equal(first.result.pendingAssociation, false);
  assert.equal(duplicate.result.duplicate, true);
  assert.equal(duplicate.remote.calls.length, 0);
  assert.equal(db.state.subscriptions.length, 1);
  assert.equal(db.state.subscriptions[0].currentPeriodEnd.toISOString(), "2026-11-10T12:00:00.000Z");
});

test("concurrent identical deliveries create one receipt and one Subscription", async () => {
  const db = fakeBillingClient();
  const remote = provider("purchase_approved");
  const payload = {
    secret: "not-persisted",
    event: "purchase_approved",
    data: { id: remote.orderId, nested: { b: 2, a: 1 } },
  };
  const dependencies = {
    client: db.client,
    apiClient: remote.api,
    allowlist,
    now: () => new Date("2026-12-01T00:00:00Z"),
  };
  const results = await Promise.all([
    processCaktoWebhook(payload, dependencies),
    processCaktoWebhook(payload, dependencies),
  ]);
  assert.equal(results.filter((item) => item.duplicate).length, 1);
  assert.equal(db.state.events.length, 1);
  assert.equal(db.state.subscriptions.length, 1);
});

test("semantically identical object key order is not a divergent replay", async () => {
  const db = fakeBillingClient();
  const remote = provider("purchase_approved");
  const dependencies = { client: db.client, apiClient: remote.api, allowlist };
  await processCaktoWebhook(
    { secret: "not-persisted", event: "purchase_approved", data: { id: remote.orderId, a: 1, b: 2 } },
    dependencies,
  );
  const duplicate = await processCaktoWebhook(
    { secret: "not-persisted", event: "purchase_approved", data: { b: 2, a: 1, id: remote.orderId } },
    dependencies,
  );
  assert.equal(duplicate.duplicate, true);
});

test("subscription_canceled preserves paid access until the existing period end", async () => {
  const end = new Date("2026-10-10T12:00:00Z");
  const db = fakeBillingClient({ subscriptions: [existingSubscription({ currentPeriodEnd: end })] });
  await deliver("subscription_canceled", db);
  assert.equal(db.state.subscriptions[0].status, "CANCELED");
  assert.equal(db.state.subscriptions[0].currentPeriodEnd.toISOString(), end.toISOString());
  assert.equal(isSubscriptionPremium(db.state.subscriptions[0], new Date("2026-09-20T00:00:00Z")), true);
});

for (const event of ["refund", "chargeback"]) {
  test(`${event} revokes Premium without creating another Subscription`, async () => {
    const db = fakeBillingClient({ subscriptions: [existingSubscription()] });
    await deliver(event, db);
    assert.equal(db.state.subscriptions.length, 1);
    assert.equal(db.state.subscriptions[0].status, "EXPIRED");
    assert.equal(isSubscriptionPremium(db.state.subscriptions[0]), false);
  });
}

test("divergent replay fails closed and leaves the applied effect unchanged", async () => {
  const db = fakeBillingClient();
  await deliver("purchase_approved", db, {}, { delivery: "original" });
  await assert.rejects(
    () => deliver("purchase_approved", db, {}, { delivery: "changed" }),
    (error) => error.code === "DIVERGENT_WEBHOOK_REPLAY",
  );
  assert.equal(db.state.subscriptions.length, 1);
});

test("late lifecycle event uses durable provider subscription correlation", async () => {
  const db = fakeBillingClient({
    subscriptions: [existingSubscription()],
    attempts: [{
      id: "attempt-1",
      userId: "user-1",
      plan: "MONTHLY",
      status: "COMPLETED",
      token: hashCheckoutCorrelationToken(token),
      completedAt: new Date("2026-09-10T12:00:00Z"),
    }],
  });
  await deliver("subscription_renewed", db, {
    orderId: "00000000-0000-4000-8000-000000000003",
    sck: null,
  });
  assert.equal(db.state.subscriptions[0].status, "ACTIVE");
  assert.equal(db.state.events[0].processingError, null);
});

test("out-of-order event is recorded but cannot regress a newer state", async () => {
  const newer = existingSubscription({
    status: "EXPIRED",
    lastEventOccurredAt: new Date("2026-11-20T12:00:00Z"),
  });
  const db = fakeBillingClient({ subscriptions: [newer] });
  const { result } = await deliver("subscription_renewed", db, {
    orderId: "00000000-0000-4000-8000-000000000004",
    occurredAt: "2026-10-10T12:00:00Z",
  });
  assert.equal(result.ignored, true);
  assert.equal(db.state.subscriptions[0].status, "EXPIRED");
  assert.equal(db.state.events[0].processingError, "STALE_OR_OUT_OF_ORDER_EVENT");
});

test("invalid first correlation does not create Subscription", async () => {
  const db = fakeBillingClient({ attempts: [] });
  const { result } = await deliver("purchase_approved", db);
  assert.equal(result.pendingAssociation, true);
  assert.equal(db.state.subscriptions.length, 0);
  assert.equal(db.state.events[0].processingError, "CHECKOUT_ASSOCIATION_NOT_VERIFIED");
});

test("provider read failure leaves Subscription and Premium unchanged", async () => {
  const db = fakeBillingClient();
  const remote = provider("purchase_approved");
  remote.api.getOrder = async () => { throw new Error("synthetic provider failure"); };
  const result = await processCaktoWebhook(
    { secret: "not-persisted", event: "purchase_approved", data: { id: remote.orderId } },
    { client: db.client, apiClient: remote.api, allowlist },
  );
  assert.equal(result.pendingAssociation, true);
  assert.equal(db.state.subscriptions.length, 0);
  assert.equal(db.state.events[0].processingError, "PROVIDER_CONFIRMATION_FAILED");
});

test("transaction failure rolls back Subscription and CheckoutAttempt together", async () => {
  const db = fakeBillingClient({ failTransactionOnEventUpdate: true });
  await assert.rejects(() => deliver("purchase_approved", db), /synthetic transaction failure/);
  assert.equal(db.state.subscriptions.length, 0);
  assert.equal(db.state.attempts[0].status, "PENDING");
  assert.equal(db.state.events[0].processedAt, null);
});

test("commercial identity and price mismatches fail closed", async () => {
  for (const overrides of [
    { offerId: "offer-other" },
    { productId: "product-other" },
    { price: 49.9 },
  ]) {
    const db = fakeBillingClient();
    const { result } = await deliver("purchase_approved", db, overrides);
    assert.equal(result.pendingAssociation, true);
    assert.equal(db.state.subscriptions.length, 0);
  }
});

test("durable identity mismatch fails closed without changing Premium", async () => {
  const original = existingSubscription({ providerCustomerId: "customer-original" });
  const db = fakeBillingClient({ subscriptions: [original] });
  const { result } = await deliver("subscription_renewed", db, {
    orderId: "00000000-0000-4000-8000-000000000005",
    customerId: "customer-other",
  });
  assert.equal(result.pendingAssociation, true);
  assert.equal(db.state.subscriptions[0].providerCustomerId, "customer-original");
  assert.equal(db.state.events[0].processingError, "DURABLE_CORRELATION_MISMATCH");
});

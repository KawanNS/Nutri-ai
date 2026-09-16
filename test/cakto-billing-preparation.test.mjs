import assert from "node:assert/strict";
import test from "node:test";

import { hashCheckoutCorrelationToken } from "../dist/services/billing.service.js";
import {
  decideCaktoBillingLifecycle,
  prepareCaktoBillingDecision,
  resolveCaktoEntitlementPeriod,
  validateCaktoCheckoutAttempt,
  validateCaktoOffer,
  validateCaktoOrderCorrelation,
  validateCaktoOrderSubscription,
} from "../dist/services/cakto-billing-preparation.service.js";

const rawCorrelationToken = "S".repeat(43);
const tokenHash = hashCheckoutCorrelationToken(rawCorrelationToken);
const order = {
  id: "order-synthetic",
  status: "paid",
  type: "subscription",
  product: { id: "product-synthetic" },
  subscription: "subscription-synthetic",
  sck: rawCorrelationToken,
};
const subscription = {
  amount: "19.90",
  parent_order: "order-synthetic",
  paymentMethod: "credit_card",
  customer: "customer-synthetic",
  product: "product-synthetic",
  offer: "offer-monthly",
  orders: ["order-synthetic"],
  createdAt: "2026-09-10T12:00:00Z",
  updatedAt: "2026-09-10T12:00:01Z",
  id: "subscription-synthetic",
  status: "active",
};
const offer = {
  id: "offer-monthly",
  name: "Synthetic monthly offer",
  price: 19.9,
  default: true,
  product: "product-synthetic",
};
const expectedOrder = {
  orderId: order.id,
  tokenHash,
  eligibleStatuses: ["paid"],
  type: "subscription",
  requireSubscription: true,
};
const allowlist = {
  MONTHLY: { productId: "product-synthetic", offerId: "offer-monthly" },
  QUARTERLY: { productId: "product-synthetic", offerId: "offer-quarterly" },
  ANNUAL: { productId: "product-synthetic", offerId: "offer-annual" },
};
const authoritativePeriod = {
  authoritativePeriod: {
    start: new Date("2026-09-10T12:00:00Z"),
    end: new Date("2026-10-10T12:00:00Z"),
    source: "CAKTO_AUTHORITATIVE_PERIOD",
  },
};
const preparationNow = new Date("2026-09-10T12:00:00Z");

test("CheckoutAttempt confirmation requires PENDING status, valid hash, and future expiry", () => {
  const attempt = {
    tokenHash,
    plan: "MONTHLY",
    status: "PENDING",
    expiresAt: new Date("2026-09-10T12:01:00Z"),
  };
  assert.deepEqual(validateCaktoCheckoutAttempt(attempt, preparationNow), { ok: true });
  assert.deepEqual(
    validateCaktoCheckoutAttempt({ ...attempt, status: "COMPLETED" }, preparationNow),
    { ok: false, reason: "CHECKOUT_ATTEMPT_NOT_PENDING" },
  );
  assert.deepEqual(
    validateCaktoCheckoutAttempt({ ...attempt, expiresAt: preparationNow }, preparationNow),
    { ok: false, reason: "CHECKOUT_ATTEMPT_EXPIRED" },
  );
  assert.deepEqual(
    validateCaktoCheckoutAttempt({ ...attempt, tokenHash: "invalid" }, preparationNow),
    { ok: false, reason: "INVALID_EXPECTED_TOKEN_HASH" },
  );
});

test("Order correlation rejects absent, null, and empty sck", () => {
  for (const sck of [undefined, null, ""]) {
    assert.deepEqual(validateCaktoOrderCorrelation({ ...order, sck }, expectedOrder), {
      ok: false,
      reason: "ORDER_SCK_NOT_AVAILABLE",
    });
  }
});

test("Order correlation rejects invalid expected hash and incompatible sck without returning raw data", () => {
  assert.deepEqual(
    validateCaktoOrderCorrelation(order, { ...expectedOrder, tokenHash: "invalid" }),
    { ok: false, reason: "INVALID_EXPECTED_TOKEN_HASH" },
  );
  const result = validateCaktoOrderCorrelation(
    { ...order, sck: "X".repeat(43) },
    expectedOrder,
  );
  assert.deepEqual(result, { ok: false, reason: "ORDER_SCK_MISMATCH" });
  assert.equal(JSON.stringify(result).includes(rawCorrelationToken), false);
});

test("Order correlation rejects sck outside the internal correlation-token format", () => {
  assert.deepEqual(
    validateCaktoOrderCorrelation({ ...order, sck: "invalid token" }, expectedOrder),
    { ok: false, reason: "ORDER_SCK_INVALID" },
  );
});

test("Order correlation rejects mismatched id, status, type, and required subscription", () => {
  const cases = [
    [{ ...order, id: "order-other" }, "ORDER_ID_MISMATCH"],
    [{ ...order, status: "waiting_payment" }, "ORDER_STATUS_NOT_ELIGIBLE"],
    [{ ...order, type: "unique" }, "ORDER_TYPE_MISMATCH"],
    [{ ...order, subscription: null }, "ORDER_SUBSCRIPTION_NOT_AVAILABLE"],
  ];
  for (const [candidate, reason] of cases) {
    assert.deepEqual(validateCaktoOrderCorrelation(candidate, expectedOrder), { ok: false, reason });
  }
});

test("Order correlation accepts only the hash-backed eligible candidate", () => {
  assert.deepEqual(validateCaktoOrderCorrelation(order, expectedOrder), { ok: true });
});

test("Order and Subscription validation rejects identity, product, offer, and relation mismatches", () => {
  const cases = [
    [{ ...subscription, id: "subscription-other" }, "SUBSCRIPTION_ID_MISMATCH"],
    [{ ...subscription, product: "product-other" }, "SUBSCRIPTION_PRODUCT_MISMATCH"],
    [{ ...subscription, offer: "" }, "SUBSCRIPTION_OFFER_NOT_AVAILABLE"],
    [{ ...subscription, parent_order: "order-other", orders: ["order-other"] }, "ORDER_SUBSCRIPTION_LINK_MISMATCH"],
  ];
  for (const [candidate, reason] of cases) {
    assert.deepEqual(validateCaktoOrderSubscription(order, candidate), { ok: false, reason });
  }
});

test("Order and Subscription validation accepts parent_order or unordered orders membership", () => {
  assert.deepEqual(validateCaktoOrderSubscription(order, subscription), { ok: true });
  assert.deepEqual(
    validateCaktoOrderSubscription(order, {
      ...subscription,
      parent_order: "order-original",
      orders: ["order-renewal", order.id, "order-other"],
    }),
    { ok: true },
  );
});

test("Offer validation requires the exact Subscription offer and product", () => {
  assert.deepEqual(validateCaktoOffer(offer, subscription), { ok: true });
  assert.deepEqual(validateCaktoOffer({ ...offer, id: "offer-other" }, subscription), {
    ok: false,
    reason: "OFFER_ID_MISMATCH",
  });
  assert.deepEqual(validateCaktoOffer({ ...offer, product: "product-other" }, subscription), {
    ok: false,
    reason: "OFFER_PRODUCT_MISMATCH",
  });
});

test("Entitlement period remains blocked for non-authoritative date hints", () => {
  for (const input of [
    { nextPaymentDate: "2026-10-10T12:00:00Z" },
    { recurrencePeriod: 30 },
    { billingCycleDueDate: "2026-10-10T12:00:00Z" },
    {
      nextPaymentDate: "2026-10-10T12:00:00Z",
      recurrencePeriod: 30,
      billingCycleDueDate: "2026-10-10T12:00:00Z",
    },
  ]) {
    assert.deepEqual(resolveCaktoEntitlementPeriod(input), {
      ok: false,
      reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE",
    });
  }
});

test("Entitlement period accepts only explicit valid authoritative evidence", () => {
  assert.deepEqual(resolveCaktoEntitlementPeriod(authoritativePeriod), {
    ok: true,
    ...authoritativePeriod.authoritativePeriod,
  });
  assert.deepEqual(resolveCaktoEntitlementPeriod({
    authoritativePeriod: {
      start: new Date("2026-10-10T12:00:00Z"),
      end: new Date("2026-09-10T12:00:00Z"),
      source: "CAKTO_AUTHORITATIVE_PERIOD",
    },
  }), { ok: false, reason: "INVALID_AUTHORITATIVE_PERIOD" });
});

const fullyConfirmedContext = {
  checkoutConfirmed: true,
  orderConfirmed: true,
  subscriptionConfirmed: true,
  subscriptionStatus: "active",
  commercialMappingConfirmed: true,
  period: resolveCaktoEntitlementPeriod(authoritativePeriod),
};

test("Lifecycle produces candidates for confirmed activation, renewal, cancellation, and revocation", () => {
  const expected = {
    purchase_approved: "ACTIVATE_CANDIDATE",
    subscription_created: "ACTIVATE_CANDIDATE",
    subscription_renewed: "RENEW_CANDIDATE",
    subscription_canceled: "CANCEL_CANDIDATE",
    refund: "REVOKE_CANDIDATE",
    chargeback: "REVOKE_CANDIDATE",
  };
  for (const [event, kind] of Object.entries(expected)) {
    const context = event === "subscription_canceled"
      ? { ...fullyConfirmedContext, subscriptionStatus: "canceled" }
      : fullyConfirmedContext;
    assert.equal(decideCaktoBillingLifecycle(event, context).kind, kind);
  }
});

test("Current provider state takes precedence over webhook arrival order", () => {
  assert.deepEqual(
    decideCaktoBillingLifecycle("subscription_canceled", fullyConfirmedContext),
    { kind: "NO_CHANGE", reason: "PROVIDER_STATE_TAKES_PRECEDENCE" },
  );
  assert.deepEqual(
    decideCaktoBillingLifecycle("subscription_renewed", {
      ...fullyConfirmedContext,
      subscriptionStatus: "canceled",
    }),
    { kind: "BLOCKED", reason: "PROVIDER_SUBSCRIPTION_STATE_NOT_ELIGIBLE" },
  );
});

test("Lifecycle never promotes renewal refusal or unknown events", () => {
  assert.deepEqual(
    decideCaktoBillingLifecycle("subscription_renewal_refused", fullyConfirmedContext),
    { kind: "BLOCKED", reason: "RENEWAL_REFUSAL_POLICY_NOT_CONFIRMED" },
  );
  assert.deepEqual(decideCaktoBillingLifecycle("future_event", fullyConfirmedContext), {
    kind: "BLOCKED",
    reason: "UNSUPPORTED_EVENT",
  });
  for (const event of ["subscription_paused", "subscription_resumed"]) {
    assert.deepEqual(decideCaktoBillingLifecycle(event, fullyConfirmedContext), {
      kind: "BLOCKED",
      reason: "UNSUPPORTED_EVENT",
    });
  }
});

test("Lifecycle blocks every documented non-entitling Subscription status", () => {
  for (const subscriptionStatus of ["inactive", "expired", "paused", "late", "trial"]) {
    assert.deepEqual(
      decideCaktoBillingLifecycle("subscription_renewed", {
        ...fullyConfirmedContext,
        subscriptionStatus,
      }),
      { kind: "BLOCKED", reason: "PROVIDER_SUBSCRIPTION_STATE_NOT_ELIGIBLE" },
      subscriptionStatus,
    );
  }
});

test("Lifecycle blocks activation and cancellation without complete confirmation or period", () => {
  assert.deepEqual(
    decideCaktoBillingLifecycle("purchase_approved", {
      ...fullyConfirmedContext,
      commercialMappingConfirmed: false,
    }),
    { kind: "BLOCKED", reason: "INCOMPLETE_CONFIRMATION" },
  );
  assert.deepEqual(
    decideCaktoBillingLifecycle("subscription_canceled", {
      ...fullyConfirmedContext,
      subscriptionStatus: "canceled",
      period: { ok: false, reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" },
    }),
    { kind: "BLOCKED", reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" },
  );
});

test("Revocation candidates still require secure CheckoutAttempt and Order association", () => {
  for (const event of ["refund", "chargeback"]) {
    assert.deepEqual(
      decideCaktoBillingLifecycle(event, { ...fullyConfirmedContext, checkoutConfirmed: false }),
      { kind: "BLOCKED", reason: "INCOMPLETE_CONFIRMATION" },
    );
  }
});

function fakeApi(overrides = {}) {
  const calls = [];
  return {
    calls,
    client: {
      getOrder: async (id) => { calls.push(["order", id]); return overrides.order ?? order; },
      getSubscription: async (id) => { calls.push(["subscription", id]); return overrides.subscription ?? subscription; },
      getOffer: async (id) => { calls.push(["offer", id]); return overrides.offer ?? offer; },
    },
  };
}

function preparationInput(overrides = {}) {
  return {
    event: "purchase_approved",
    orderId: order.id,
    checkoutAttempt: {
      tokenHash,
      plan: "MONTHLY",
      status: "PENDING",
      expiresAt: new Date("2026-09-10T12:01:00Z"),
    },
    eligibleOrderStatuses: ["paid"],
    allowlist,
    entitlementPeriod: authoritativePeriod,
    now: preparationNow,
    ...overrides,
  };
}

test("Preparation orchestrates only read methods and returns an activation candidate", async () => {
  const api = fakeApi();
  const result = await prepareCaktoBillingDecision(preparationInput(), api.client);
  assert.deepEqual(result, { kind: "ACTIVATE_CANDIDATE" });
  assert.deepEqual(api.calls, [
    ["order", order.id],
    ["subscription", subscription.id],
    ["offer", offer.id],
  ]);
  assert.deepEqual(Object.keys(api.client).sort(), ["getOffer", "getOrder", "getSubscription"]);
});

test("Preparation fails closed before provider calls without an explicit order status policy", async () => {
  const api = fakeApi();
  const result = await prepareCaktoBillingDecision(
    preparationInput({ eligibleOrderStatuses: [] }),
    api.client,
  );
  assert.deepEqual(result, { kind: "BLOCKED", reason: "ORDER_STATUS_POLICY_NOT_CONFIGURED" });
  assert.deepEqual(api.calls, []);
});

test("Preparation fails closed before provider calls without a complete plan configuration", async () => {
  const api = fakeApi();
  const result = await prepareCaktoBillingDecision(
    preparationInput({ allowlist: null }),
    api.client,
  );
  assert.deepEqual(result, { kind: "BLOCKED", reason: "PLAN_CONFIGURATION_NOT_AVAILABLE" });
  assert.deepEqual(api.calls, []);
});

test("Preparation fails closed on provider errors and incomplete commercial mapping", async () => {
  const failingApi = fakeApi();
  failingApi.client.getOrder = async () => { throw new Error("synthetic provider failure"); };
  assert.deepEqual(await prepareCaktoBillingDecision(preparationInput(), failingApi.client), {
    kind: "BLOCKED",
    reason: "PROVIDER_CONFIRMATION_FAILED",
  });

  const commercialApi = fakeApi();
  assert.deepEqual(
    await prepareCaktoBillingDecision(
      preparationInput({
        allowlist: {
          ...allowlist,
          MONTHLY: { productId: "product-other", offerId: "offer-monthly" },
        },
      }),
      commercialApi.client,
    ),
    { kind: "BLOCKED", reason: "PLAN_NOT_RESOLVED" },
  );
});

test("Preparation blocks plan mismatch and unavailable authoritative period", async () => {
  const planApi = fakeApi();
  assert.deepEqual(
    await prepareCaktoBillingDecision(
      preparationInput({
        checkoutAttempt: {
          tokenHash,
          plan: "ANNUAL",
          status: "PENDING",
          expiresAt: new Date("2026-09-10T12:01:00Z"),
        },
      }),
      planApi.client,
    ),
    { kind: "BLOCKED", reason: "CHECKOUT_PLAN_MISMATCH" },
  );

  const periodApi = fakeApi();
  assert.deepEqual(
    await prepareCaktoBillingDecision(
      preparationInput({ entitlementPeriod: { nextPaymentDate: subscription.next_payment_date } }),
      periodApi.client,
    ),
    { kind: "BLOCKED", reason: "AUTHORITATIVE_PERIOD_NOT_AVAILABLE" },
  );
});

test("Preparation blocks an offer price that disagrees with the resolved internal plan", async () => {
  const api = fakeApi({ offer: { ...offer, price: 49.9 } });
  assert.deepEqual(await prepareCaktoBillingDecision(preparationInput(), api.client), {
    kind: "BLOCKED",
    reason: "OFFER_PRICE_MISMATCH",
  });
});

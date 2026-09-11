import assert from "node:assert/strict";
import test from "node:test";

import {
  createUnknownCaktoSandboxEvidence,
  validateCaktoSandboxEvidence,
} from "../dist/services/cakto-sandbox-evidence.service.js";

const completeEvidence = {
  officialStagingEnvironmentVerified: "TRUE",
  hostedCheckoutSckObserved: "TRUE",
  webhookSckPresent: "TRUE",
  webhookDataIdType: "UUID",
  webhookDataIdMatchesOrderId: "TRUE",
  orderSckMatchesCheckoutAttempt: "TRUE",
  orderHasSubscription: "TRUE",
  orderSubscriptionMatchesFetchedSubscription: "TRUE",
  initialParentOrderMatches: "TRUE",
  initialOrderPresentInSubscriptionOrders: "TRUE",
  renewalParentOrderRemainsInitial: "TRUE",
  renewalOrderPresentInSubscriptionOrders: "TRUE",
  subscriptionProductMatchesExpected: "TRUE",
  subscriptionOfferMatchesExpected: "TRUE",
  offerProductMatchesSubscription: "TRUE",
  offerPriceMatchesPlan: "TRUE",
  offerRecurrenceVerified: "TRUE",
  allConfiguredPlansVerified: "TRUE",
  authoritativePeriodSource: "VERIFIED",
  nativeProviderEventIdObserved: "TRUE",
  eventIdentityStrategyVerified: "TRUE",
  eventOrderingReplayPolicyVerified: "TRUE",
  premiumMutationOccurred: false,
};

function expectBlock(overrides, blocker) {
  const result = validateCaktoSandboxEvidence({ ...completeEvidence, ...overrides });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes(blocker));
}

test("all unknown evidence is blocked and contains no identifiers", () => {
  const evidence = createUnknownCaktoSandboxEvidence();
  const result = validateCaktoSandboxEvidence(evidence);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.length > 10);
  assert.equal(JSON.stringify(result).includes("token"), false);
});

test("the sanitized evidence factory exposes no free-form sensitive properties", () => {
  const forbiddenProperties = new Set([
    "rawsck",
    "sckhash",
    "jwt",
    "accesstoken",
    "authorization",
    "webhooksecret",
    "name",
    "email",
    "phone",
    "cpf",
    "document",
    "card",
    "payload",
    "url",
    "notes",
    "metadata",
  ]);
  const propertyNames = Object.keys(createUnknownCaktoSandboxEvidence());
  assert.equal(
    propertyNames.some((propertyName) => forbiddenProperties.has(propertyName.toLowerCase())),
    false,
  );
});

test("each required tri-state evidence blocks readiness when it alone is UNKNOWN or FALSE", () => {
  const requiredEvidence = {
    officialStagingEnvironmentVerified: "OFFICIAL_CAKTO_STAGING_ACCESS_MISSING",
    hostedCheckoutSckObserved: "HOSTED_CHECKOUT_SCK_NOT_VERIFIED",
    webhookSckPresent: "WEBHOOK_SCK_NOT_VERIFIED",
    webhookDataIdMatchesOrderId: "WEBHOOK_DATA_ID_ORDER_MATCH_NOT_VERIFIED",
    orderSckMatchesCheckoutAttempt: "ORDER_SCK_CORRELATION_NOT_VERIFIED",
    orderHasSubscription: "ORDER_SUBSCRIPTION_ID_NOT_AVAILABLE",
    orderSubscriptionMatchesFetchedSubscription:
      "ORDER_SUBSCRIPTION_ID_MATCH_NOT_VERIFIED",
    initialParentOrderMatches: "INITIAL_PARENT_ORDER_RELATION_NOT_VERIFIED",
    initialOrderPresentInSubscriptionOrders: "INITIAL_ORDER_MEMBERSHIP_NOT_VERIFIED",
    renewalParentOrderRemainsInitial: "RENEWAL_PARENT_ORDER_SEMANTICS_NOT_VERIFIED",
    renewalOrderPresentInSubscriptionOrders: "RENEWAL_ORDER_MEMBERSHIP_NOT_VERIFIED",
    subscriptionProductMatchesExpected: "SUBSCRIPTION_PRODUCT_NOT_VERIFIED",
    subscriptionOfferMatchesExpected: "SUBSCRIPTION_OFFER_NOT_VERIFIED",
    offerProductMatchesSubscription: "OFFER_PRODUCT_RELATION_NOT_VERIFIED",
    offerPriceMatchesPlan: "OFFER_PRICE_NOT_VERIFIED",
    offerRecurrenceVerified: "OFFER_RECURRENCE_NOT_VERIFIED",
    allConfiguredPlansVerified: "ALL_CONFIGURED_PLANS_NOT_VERIFIED",
    eventIdentityStrategyVerified: "EVENT_IDENTITY_STRATEGY_NOT_VERIFIED",
    eventOrderingReplayPolicyVerified: "EVENT_ORDERING_REPLAY_POLICY_NOT_VERIFIED",
  };

  for (const [propertyName, blocker] of Object.entries(requiredEvidence)) {
    for (const state of ["UNKNOWN", "FALSE"]) {
      expectBlock({ [propertyName]: state }, blocker);
    }
  }
});

test("absent hosted checkout sck blocks readiness", () => {
  expectBlock({ hostedCheckoutSckObserved: "FALSE" }, "HOSTED_CHECKOUT_SCK_NOT_VERIFIED");
});

test("absent webhook sck blocks readiness", () => {
  expectBlock({ webhookSckPresent: "FALSE" }, "WEBHOOK_SCK_NOT_VERIFIED");
});

test("non-UUID webhook data.id blocks readiness", () => {
  expectBlock({ webhookDataIdType: "STRING" }, "WEBHOOK_DATA_ID_TYPE_NOT_UUID");
});

test("webhook data.id mismatch blocks readiness", () => {
  expectBlock(
    { webhookDataIdMatchesOrderId: "FALSE" },
    "WEBHOOK_DATA_ID_ORDER_MATCH_NOT_VERIFIED",
  );
});

test("Order sck mismatch with CheckoutAttempt blocks readiness", () => {
  expectBlock(
    { orderSckMatchesCheckoutAttempt: "FALSE" },
    "ORDER_SCK_CORRELATION_NOT_VERIFIED",
  );
});

test("order without subscription blocks readiness", () => {
  expectBlock({ orderHasSubscription: "FALSE" }, "ORDER_SUBSCRIPTION_ID_NOT_AVAILABLE");
});

test("order and fetched subscription mismatch blocks readiness", () => {
  expectBlock(
    { orderSubscriptionMatchesFetchedSubscription: "FALSE" },
    "ORDER_SUBSCRIPTION_ID_MATCH_NOT_VERIFIED",
  );
});

test("initial parent_order and orders without association block readiness", () => {
  const result = validateCaktoSandboxEvidence({
    ...completeEvidence,
    initialParentOrderMatches: "FALSE",
    initialOrderPresentInSubscriptionOrders: "FALSE",
  });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes("INITIAL_PARENT_ORDER_RELATION_NOT_VERIFIED"));
  assert.ok(result.blockers.includes("INITIAL_ORDER_MEMBERSHIP_NOT_VERIFIED"));
});

test("renewal association semantics must be verified", () => {
  expectBlock(
    { renewalOrderPresentInSubscriptionOrders: "UNKNOWN" },
    "RENEWAL_ORDER_MEMBERSHIP_NOT_VERIFIED",
  );
});

test("subscription product mismatch blocks readiness", () => {
  expectBlock(
    { subscriptionProductMatchesExpected: "FALSE" },
    "SUBSCRIPTION_PRODUCT_NOT_VERIFIED",
  );
});

test("subscription offer mismatch blocks readiness", () => {
  expectBlock(
    { subscriptionOfferMatchesExpected: "FALSE" },
    "SUBSCRIPTION_OFFER_NOT_VERIFIED",
  );
});

test("offer product mismatch blocks readiness", () => {
  expectBlock(
    { offerProductMatchesSubscription: "FALSE" },
    "OFFER_PRODUCT_RELATION_NOT_VERIFIED",
  );
});

test("offer price mismatch blocks readiness", () => {
  expectBlock({ offerPriceMatchesPlan: "FALSE" }, "OFFER_PRICE_NOT_VERIFIED");
});

test("unknown offer recurrence blocks readiness", () => {
  expectBlock({ offerRecurrenceVerified: "UNKNOWN" }, "OFFER_RECURRENCE_NOT_VERIFIED");
});

test("missing authoritative period blocks readiness", () => {
  expectBlock(
    { authoritativePeriodSource: "MISSING" },
    "AUTHORITATIVE_PERIOD_SOURCE_NOT_VERIFIED",
  );
});

test("ambiguous authoritative period blocks readiness", () => {
  expectBlock(
    { authoritativePeriodSource: "AMBIGUOUS" },
    "AUTHORITATIVE_PERIOD_SOURCE_NOT_VERIFIED",
  );
});

test("every non-verified authoritative period classification blocks readiness", () => {
  for (const authoritativePeriodSource of ["UNKNOWN", "MISSING", "AMBIGUOUS", "UNSAFE"]) {
    expectBlock(
      { authoritativePeriodSource },
      "AUTHORITATIVE_PERIOD_SOURCE_NOT_VERIFIED",
    );
  }
});

test("unknown event identity blocks readiness", () => {
  expectBlock(
    { nativeProviderEventIdObserved: "UNKNOWN", eventIdentityStrategyVerified: "UNKNOWN" },
    "EVENT_IDENTITY_STRATEGY_NOT_VERIFIED",
  );
});

test("observing a native event id does not replace identity strategy verification", () => {
  expectBlock(
    { nativeProviderEventIdObserved: "TRUE", eventIdentityStrategyVerified: "UNKNOWN" },
    "EVENT_IDENTITY_STRATEGY_NOT_VERIFIED",
  );
});

test("unknown event ordering and replay policy blocks readiness", () => {
  expectBlock(
    { eventOrderingReplayPolicyVerified: "UNKNOWN" },
    "EVENT_ORDERING_REPLAY_POLICY_NOT_VERIFIED",
  );
});

test("verified fallback identity strategy allows absent native event id", () => {
  const result = validateCaktoSandboxEvidence({
    ...completeEvidence,
    nativeProviderEventIdObserved: "FALSE",
    eventIdentityStrategyVerified: "TRUE",
  });
  assert.deepEqual(result, { status: "READY_FOR_LIFECYCLE_DESIGN", blockers: [] });
});

test("detected Premium mutation blocks readiness", () => {
  expectBlock({ premiumMutationOccurred: true }, "PREMIUM_MUTATION_DETECTED");
});

test("fully verified evidence is ready for lifecycle design", () => {
  const result = validateCaktoSandboxEvidence(completeEvidence);
  assert.deepEqual(result, {
    status: "READY_FOR_LIFECYCLE_DESIGN",
    blockers: [],
  });
  assert.notEqual(result.status, "READY_FOR_PREMIUM");
});

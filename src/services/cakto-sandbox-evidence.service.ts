export const caktoEvidenceStates = ["UNKNOWN", "TRUE", "FALSE"] as const;

export type CaktoEvidenceState = (typeof caktoEvidenceStates)[number];

export type CaktoWebhookDataIdType = "UNKNOWN" | "UUID" | "STRING" | "OTHER";

export type CaktoAuthoritativePeriodSource =
  | "UNKNOWN"
  | "MISSING"
  | "AMBIGUOUS"
  | "UNSAFE"
  | "VERIFIED";

/**
 * Sanitized, identifier-free evidence gathered by a future controlled Cakto
 * sandbox/staging experiment. This type intentionally has no free-text fields:
 * it cannot carry tokens, provider IDs, customer data, payloads, or URLs.
 */
export interface CaktoSandboxEvidence {
  officialStagingEnvironmentVerified: CaktoEvidenceState;
  hostedCheckoutSckObserved: CaktoEvidenceState;
  webhookSckPresent: CaktoEvidenceState;
  webhookDataIdType: CaktoWebhookDataIdType;
  webhookDataIdMatchesOrderId: CaktoEvidenceState;
  orderSckMatchesCheckoutAttempt: CaktoEvidenceState;
  orderHasSubscription: CaktoEvidenceState;
  orderSubscriptionMatchesFetchedSubscription: CaktoEvidenceState;
  initialParentOrderMatches: CaktoEvidenceState;
  initialOrderPresentInSubscriptionOrders: CaktoEvidenceState;
  renewalParentOrderRemainsInitial: CaktoEvidenceState;
  renewalOrderPresentInSubscriptionOrders: CaktoEvidenceState;
  subscriptionProductMatchesExpected: CaktoEvidenceState;
  subscriptionOfferMatchesExpected: CaktoEvidenceState;
  offerProductMatchesSubscription: CaktoEvidenceState;
  offerPriceMatchesPlan: CaktoEvidenceState;
  offerRecurrenceVerified: CaktoEvidenceState;
  allConfiguredPlansVerified: CaktoEvidenceState;
  authoritativePeriodSource: CaktoAuthoritativePeriodSource;
  nativeProviderEventIdObserved: CaktoEvidenceState;
  eventIdentityStrategyVerified: CaktoEvidenceState;
  eventOrderingReplayPolicyVerified: CaktoEvidenceState;
  premiumMutationOccurred: boolean;
}

export type CaktoEvidenceBlocker =
  | "OFFICIAL_CAKTO_STAGING_ACCESS_MISSING"
  | "HOSTED_CHECKOUT_SCK_NOT_VERIFIED"
  | "WEBHOOK_SCK_NOT_VERIFIED"
  | "WEBHOOK_DATA_ID_TYPE_NOT_UUID"
  | "WEBHOOK_DATA_ID_ORDER_MATCH_NOT_VERIFIED"
  | "ORDER_SCK_CORRELATION_NOT_VERIFIED"
  | "ORDER_SUBSCRIPTION_ID_NOT_AVAILABLE"
  | "ORDER_SUBSCRIPTION_ID_MATCH_NOT_VERIFIED"
  | "INITIAL_PARENT_ORDER_RELATION_NOT_VERIFIED"
  | "INITIAL_ORDER_MEMBERSHIP_NOT_VERIFIED"
  | "RENEWAL_PARENT_ORDER_SEMANTICS_NOT_VERIFIED"
  | "RENEWAL_ORDER_MEMBERSHIP_NOT_VERIFIED"
  | "SUBSCRIPTION_PRODUCT_NOT_VERIFIED"
  | "SUBSCRIPTION_OFFER_NOT_VERIFIED"
  | "OFFER_PRODUCT_RELATION_NOT_VERIFIED"
  | "OFFER_PRICE_NOT_VERIFIED"
  | "OFFER_RECURRENCE_NOT_VERIFIED"
  | "ALL_CONFIGURED_PLANS_NOT_VERIFIED"
  | "AUTHORITATIVE_PERIOD_SOURCE_NOT_VERIFIED"
  | "EVENT_IDENTITY_STRATEGY_NOT_VERIFIED"
  | "EVENT_ORDERING_REPLAY_POLICY_NOT_VERIFIED"
  | "PREMIUM_MUTATION_DETECTED";

export type CaktoEvidenceDecision =
  | { status: "READY_FOR_LIFECYCLE_DESIGN"; blockers: [] }
  | { status: "BLOCKED"; blockers: CaktoEvidenceBlocker[] };

export function createUnknownCaktoSandboxEvidence(): CaktoSandboxEvidence {
  return {
    officialStagingEnvironmentVerified: "UNKNOWN",
    hostedCheckoutSckObserved: "UNKNOWN",
    webhookSckPresent: "UNKNOWN",
    webhookDataIdType: "UNKNOWN",
    webhookDataIdMatchesOrderId: "UNKNOWN",
    orderSckMatchesCheckoutAttempt: "UNKNOWN",
    orderHasSubscription: "UNKNOWN",
    orderSubscriptionMatchesFetchedSubscription: "UNKNOWN",
    initialParentOrderMatches: "UNKNOWN",
    initialOrderPresentInSubscriptionOrders: "UNKNOWN",
    renewalParentOrderRemainsInitial: "UNKNOWN",
    renewalOrderPresentInSubscriptionOrders: "UNKNOWN",
    subscriptionProductMatchesExpected: "UNKNOWN",
    subscriptionOfferMatchesExpected: "UNKNOWN",
    offerProductMatchesSubscription: "UNKNOWN",
    offerPriceMatchesPlan: "UNKNOWN",
    offerRecurrenceVerified: "UNKNOWN",
    allConfiguredPlansVerified: "UNKNOWN",
    authoritativePeriodSource: "UNKNOWN",
    nativeProviderEventIdObserved: "UNKNOWN",
    eventIdentityStrategyVerified: "UNKNOWN",
    eventOrderingReplayPolicyVerified: "UNKNOWN",
    premiumMutationOccurred: false,
  };
}

export function validateCaktoSandboxEvidence(
  evidence: CaktoSandboxEvidence,
): CaktoEvidenceDecision {
  const blockers: CaktoEvidenceBlocker[] = [];
  const requireTrue = (
    state: CaktoEvidenceState,
    blocker: CaktoEvidenceBlocker,
  ): void => {
    if (state !== "TRUE") blockers.push(blocker);
  };

  requireTrue(
    evidence.officialStagingEnvironmentVerified,
    "OFFICIAL_CAKTO_STAGING_ACCESS_MISSING",
  );
  requireTrue(evidence.hostedCheckoutSckObserved, "HOSTED_CHECKOUT_SCK_NOT_VERIFIED");
  requireTrue(evidence.webhookSckPresent, "WEBHOOK_SCK_NOT_VERIFIED");
  if (evidence.webhookDataIdType !== "UUID") {
    blockers.push("WEBHOOK_DATA_ID_TYPE_NOT_UUID");
  }
  requireTrue(
    evidence.webhookDataIdMatchesOrderId,
    "WEBHOOK_DATA_ID_ORDER_MATCH_NOT_VERIFIED",
  );
  requireTrue(
    evidence.orderSckMatchesCheckoutAttempt,
    "ORDER_SCK_CORRELATION_NOT_VERIFIED",
  );
  requireTrue(evidence.orderHasSubscription, "ORDER_SUBSCRIPTION_ID_NOT_AVAILABLE");
  requireTrue(
    evidence.orderSubscriptionMatchesFetchedSubscription,
    "ORDER_SUBSCRIPTION_ID_MATCH_NOT_VERIFIED",
  );
  requireTrue(
    evidence.initialParentOrderMatches,
    "INITIAL_PARENT_ORDER_RELATION_NOT_VERIFIED",
  );
  requireTrue(
    evidence.initialOrderPresentInSubscriptionOrders,
    "INITIAL_ORDER_MEMBERSHIP_NOT_VERIFIED",
  );
  requireTrue(
    evidence.renewalParentOrderRemainsInitial,
    "RENEWAL_PARENT_ORDER_SEMANTICS_NOT_VERIFIED",
  );
  requireTrue(
    evidence.renewalOrderPresentInSubscriptionOrders,
    "RENEWAL_ORDER_MEMBERSHIP_NOT_VERIFIED",
  );
  requireTrue(
    evidence.subscriptionProductMatchesExpected,
    "SUBSCRIPTION_PRODUCT_NOT_VERIFIED",
  );
  requireTrue(
    evidence.subscriptionOfferMatchesExpected,
    "SUBSCRIPTION_OFFER_NOT_VERIFIED",
  );
  requireTrue(
    evidence.offerProductMatchesSubscription,
    "OFFER_PRODUCT_RELATION_NOT_VERIFIED",
  );
  requireTrue(evidence.offerPriceMatchesPlan, "OFFER_PRICE_NOT_VERIFIED");
  requireTrue(evidence.offerRecurrenceVerified, "OFFER_RECURRENCE_NOT_VERIFIED");
  requireTrue(evidence.allConfiguredPlansVerified, "ALL_CONFIGURED_PLANS_NOT_VERIFIED");
  if (evidence.authoritativePeriodSource !== "VERIFIED") {
    blockers.push("AUTHORITATIVE_PERIOD_SOURCE_NOT_VERIFIED");
  }
  if (evidence.eventIdentityStrategyVerified !== "TRUE") {
    blockers.push("EVENT_IDENTITY_STRATEGY_NOT_VERIFIED");
  }
  requireTrue(
    evidence.eventOrderingReplayPolicyVerified,
    "EVENT_ORDERING_REPLAY_POLICY_NOT_VERIFIED",
  );
  if (evidence.premiumMutationOccurred !== false) {
    blockers.push("PREMIUM_MUTATION_DETECTED");
  }

  if (blockers.length > 0) return { status: "BLOCKED", blockers };
  return { status: "READY_FOR_LIFECYCLE_DESIGN", blockers: [] };
}

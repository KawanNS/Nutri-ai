export const caktoLifecycleDesignEvents = [
  "purchase_approved",
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
  "subscription_paused",
  "subscription_resumed",
  "subscription_renewal_refused",
  "refund",
  "chargeback",
] as const;

export type CaktoLifecycleDesignEvent = (typeof caktoLifecycleDesignEvents)[number];
export type CaktoDeliveryIdentity =
  | "NEW"
  | "IDENTICAL_DUPLICATE"
  | "DIVERGENT_DUPLICATE"
  | "UNKNOWN";
export type CaktoOrderingEvidence = "CURRENT" | "STALE" | "OUT_OF_ORDER" | "UNKNOWN";
export type CaktoProviderStateConsistency = "MATCH" | "MISMATCH" | "UNKNOWN";
export type CaktoBusinessEffectState = "NOT_APPLIED" | "ALREADY_APPLIED" | "UNKNOWN";
export type CaktoLifecycleCandidateAction =
  | "ACTIVATE"
  | "RENEW"
  | "CANCEL_AT_PERIOD_END"
  | "REVOKE";

export interface CaktoLifecycleDesignInput {
  event: string;
  deliveryIdentity: CaktoDeliveryIdentity;
  ordering: CaktoOrderingEvidence;
  providerStateConsistency: CaktoProviderStateConsistency;
  businessEffectState: CaktoBusinessEffectState;
  eventSemanticsVerified: boolean;
  orderSubscriptionRelationshipVerified: boolean;
  commercialMappingVerified: boolean;
  authoritativePeriodVerified: boolean;
  orderReversalEffectVerified: boolean;
}

export type CaktoLifecycleDesignDecision =
  | {
      disposition: "BLOCK";
      reason:
        | "UNSUPPORTED_EVENT"
        | "EVENT_IDENTITY_NOT_VERIFIED"
        | "EVENT_SEMANTICS_NOT_VERIFIED"
        | "ORDER_SUBSCRIPTION_RELATIONSHIP_NOT_VERIFIED"
        | "COMMERCIAL_MAPPING_NOT_VERIFIED"
        | "BUSINESS_EFFECT_STATE_NOT_VERIFIED"
        | "ORDERING_NOT_VERIFIED"
        | "AUTHORITATIVE_PERIOD_NOT_VERIFIED";
      canExecuteToday: false;
    }
  | {
      disposition: "REVIEW";
      reason:
        | "DIVERGENT_REPLAY"
        | "STALE_OR_OUT_OF_ORDER_EVENT"
        | "PROVIDER_READ_BACK_REQUIRED"
        | "ORDER_REVERSAL_EFFECT_NOT_VERIFIED"
        | "BUSINESS_POLICY_NOT_DEFINED";
      canExecuteToday: false;
    }
  | {
      disposition: "NO_CHANGE";
      reason: "IDENTICAL_REDELIVERY" | "BUSINESS_EFFECT_ALREADY_APPLIED";
      canExecuteToday: false;
    }
  | {
      disposition: "CANDIDATE";
      candidateAction: CaktoLifecycleCandidateAction;
      reason: "STAGING_EVIDENCE_REQUIRED_FOR_EXECUTION";
      canExecuteToday: false;
    };

const knownEvents = new Set<string>(caktoLifecycleDesignEvents);
const periodDependentEvents = new Set<string>([
  "purchase_approved",
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
]);

/**
 * Design-only classifier. It performs no transition and deliberately never
 * authorizes execution. Provider semantics and persistence remain blocked by
 * official staging evidence and a future reviewed transactional design.
 */
export function decideCaktoLifecycleDesign(
  input: CaktoLifecycleDesignInput,
): CaktoLifecycleDesignDecision {
  if (!knownEvents.has(input.event)) {
    return { disposition: "BLOCK", reason: "UNSUPPORTED_EVENT", canExecuteToday: false };
  }
  if (input.deliveryIdentity === "UNKNOWN") {
    return {
      disposition: "BLOCK",
      reason: "EVENT_IDENTITY_NOT_VERIFIED",
      canExecuteToday: false,
    };
  }
  if (input.deliveryIdentity === "IDENTICAL_DUPLICATE") {
    return {
      disposition: "NO_CHANGE",
      reason: "IDENTICAL_REDELIVERY",
      canExecuteToday: false,
    };
  }
  if (input.deliveryIdentity === "DIVERGENT_DUPLICATE") {
    return { disposition: "REVIEW", reason: "DIVERGENT_REPLAY", canExecuteToday: false };
  }
  if (!input.eventSemanticsVerified) {
    return {
      disposition: "BLOCK",
      reason: "EVENT_SEMANTICS_NOT_VERIFIED",
      canExecuteToday: false,
    };
  }
  if (!input.orderSubscriptionRelationshipVerified) {
    return {
      disposition: "BLOCK",
      reason: "ORDER_SUBSCRIPTION_RELATIONSHIP_NOT_VERIFIED",
      canExecuteToday: false,
    };
  }
  if (!input.commercialMappingVerified) {
    return {
      disposition: "BLOCK",
      reason: "COMMERCIAL_MAPPING_NOT_VERIFIED",
      canExecuteToday: false,
    };
  }
  if (input.businessEffectState === "UNKNOWN") {
    return {
      disposition: "BLOCK",
      reason: "BUSINESS_EFFECT_STATE_NOT_VERIFIED",
      canExecuteToday: false,
    };
  }
  if (input.businessEffectState === "ALREADY_APPLIED") {
    return {
      disposition: "NO_CHANGE",
      reason: "BUSINESS_EFFECT_ALREADY_APPLIED",
      canExecuteToday: false,
    };
  }
  if (input.ordering === "UNKNOWN") {
    return { disposition: "BLOCK", reason: "ORDERING_NOT_VERIFIED", canExecuteToday: false };
  }
  if (input.ordering === "STALE" || input.ordering === "OUT_OF_ORDER") {
    return {
      disposition: "REVIEW",
      reason: "STALE_OR_OUT_OF_ORDER_EVENT",
      canExecuteToday: false,
    };
  }
  if (input.providerStateConsistency !== "MATCH") {
    return {
      disposition: "REVIEW",
      reason: "PROVIDER_READ_BACK_REQUIRED",
      canExecuteToday: false,
    };
  }
  if (periodDependentEvents.has(input.event) && !input.authoritativePeriodVerified) {
    return {
      disposition: "BLOCK",
      reason: "AUTHORITATIVE_PERIOD_NOT_VERIFIED",
      canExecuteToday: false,
    };
  }
  if (
    (input.event === "refund" || input.event === "chargeback") &&
    !input.orderReversalEffectVerified
  ) {
    return {
      disposition: "REVIEW",
      reason: "ORDER_REVERSAL_EFFECT_NOT_VERIFIED",
      canExecuteToday: false,
    };
  }

  switch (input.event as CaktoLifecycleDesignEvent) {
    case "purchase_approved":
    case "subscription_created":
      return {
        disposition: "CANDIDATE",
        candidateAction: "ACTIVATE",
        reason: "STAGING_EVIDENCE_REQUIRED_FOR_EXECUTION",
        canExecuteToday: false,
      };
    case "subscription_renewed":
      return {
        disposition: "CANDIDATE",
        candidateAction: "RENEW",
        reason: "STAGING_EVIDENCE_REQUIRED_FOR_EXECUTION",
        canExecuteToday: false,
      };
    case "subscription_canceled":
      return {
        disposition: "CANDIDATE",
        candidateAction: "CANCEL_AT_PERIOD_END",
        reason: "STAGING_EVIDENCE_REQUIRED_FOR_EXECUTION",
        canExecuteToday: false,
      };
    case "refund":
    case "chargeback":
      return {
        disposition: "CANDIDATE",
        candidateAction: "REVOKE",
        reason: "STAGING_EVIDENCE_REQUIRED_FOR_EXECUTION",
        canExecuteToday: false,
      };
    case "subscription_paused":
    case "subscription_resumed":
    case "subscription_renewal_refused":
      return {
        disposition: "REVIEW",
        reason: "BUSINESS_POLICY_NOT_DEFINED",
        canExecuteToday: false,
      };
  }
}

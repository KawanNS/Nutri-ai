import assert from "node:assert/strict";
import test from "node:test";

import { decideCaktoLifecycleDesign } from "../dist/design/cakto-lifecycle-design.js";

const verified = {
  event: "subscription_renewed",
  deliveryIdentity: "NEW",
  ordering: "CURRENT",
  providerStateConsistency: "MATCH",
  businessEffectState: "NOT_APPLIED",
  eventSemanticsVerified: true,
  orderSubscriptionRelationshipVerified: true,
  commercialMappingVerified: true,
  authoritativePeriodVerified: true,
  orderReversalEffectVerified: true,
};

test("unknown event identity blocks", () => {
  assert.deepEqual(
    decideCaktoLifecycleDesign({ ...verified, deliveryIdentity: "UNKNOWN" }),
    { disposition: "BLOCK", reason: "EVENT_IDENTITY_NOT_VERIFIED", canExecuteToday: false },
  );
});

test("identical duplicate produces no change", () => {
  assert.deepEqual(
    decideCaktoLifecycleDesign({ ...verified, deliveryIdentity: "IDENTICAL_DUPLICATE" }),
    { disposition: "NO_CHANGE", reason: "IDENTICAL_REDELIVERY", canExecuteToday: false },
  );
});

test("divergent duplicate requires review", () => {
  assert.deepEqual(
    decideCaktoLifecycleDesign({ ...verified, deliveryIdentity: "DIVERGENT_DUPLICATE" }),
    { disposition: "REVIEW", reason: "DIVERGENT_REPLAY", canExecuteToday: false },
  );
});

test("stale and out-of-order events cannot reverse current state", () => {
  for (const ordering of ["STALE", "OUT_OF_ORDER"]) {
    assert.deepEqual(decideCaktoLifecycleDesign({ ...verified, ordering }), {
      disposition: "REVIEW",
      reason: "STALE_OR_OUT_OF_ORDER_EVENT",
      canExecuteToday: false,
    });
  }
});

test("provider mismatch or unknown state requires future read-back", () => {
  for (const providerStateConsistency of ["MISMATCH", "UNKNOWN"]) {
    assert.deepEqual(
      decideCaktoLifecycleDesign({ ...verified, providerStateConsistency }),
      { disposition: "REVIEW", reason: "PROVIDER_READ_BACK_REQUIRED", canExecuteToday: false },
    );
  }
});

test("unknown business effect blocks cross-event double application", () => {
  assert.deepEqual(
    decideCaktoLifecycleDesign({ ...verified, businessEffectState: "UNKNOWN" }),
    {
      disposition: "BLOCK",
      reason: "BUSINESS_EFFECT_STATE_NOT_VERIFIED",
      canExecuteToday: false,
    },
  );
});

test("an already applied ProviderOrder effect produces no change", () => {
  assert.deepEqual(
    decideCaktoLifecycleDesign({ ...verified, businessEffectState: "ALREADY_APPLIED" }),
    {
      disposition: "NO_CHANGE",
      reason: "BUSINESS_EFFECT_ALREADY_APPLIED",
      canExecuteToday: false,
    },
  );
});

test("missing relationship, mapping, semantics, ordering, or period blocks", () => {
  const cases = [
    ["eventSemanticsVerified", false, "EVENT_SEMANTICS_NOT_VERIFIED"],
    [
      "orderSubscriptionRelationshipVerified",
      false,
      "ORDER_SUBSCRIPTION_RELATIONSHIP_NOT_VERIFIED",
    ],
    ["commercialMappingVerified", false, "COMMERCIAL_MAPPING_NOT_VERIFIED"],
    ["ordering", "UNKNOWN", "ORDERING_NOT_VERIFIED"],
    ["authoritativePeriodVerified", false, "AUTHORITATIVE_PERIOD_NOT_VERIFIED"],
  ];
  for (const [field, value, reason] of cases) {
    assert.deepEqual(decideCaktoLifecycleDesign({ ...verified, [field]: value }), {
      disposition: "BLOCK",
      reason,
      canExecuteToday: false,
    });
  }
});

test("unknown provider event blocks", () => {
  assert.deepEqual(decideCaktoLifecycleDesign({ ...verified, event: "future_event" }), {
    disposition: "BLOCK",
    reason: "UNSUPPORTED_EVENT",
    canExecuteToday: false,
  });
});

test("verified lifecycle events yield candidates that still cannot execute today", () => {
  const cases = {
    purchase_approved: "ACTIVATE",
    subscription_created: "ACTIVATE",
    subscription_renewed: "RENEW",
    subscription_canceled: "CANCEL_AT_PERIOD_END",
    refund: "REVOKE",
    chargeback: "REVOKE",
  };
  for (const [event, candidateAction] of Object.entries(cases)) {
    assert.deepEqual(decideCaktoLifecycleDesign({ ...verified, event }), {
      disposition: "CANDIDATE",
      candidateAction,
      reason: "STAGING_EVIDENCE_REQUIRED_FOR_EXECUTION",
      canExecuteToday: false,
    });
  }
});

test("pause, resume, and renewal refusal require undefined business policy review", () => {
  for (const event of [
    "subscription_paused",
    "subscription_resumed",
    "subscription_renewal_refused",
  ]) {
    assert.deepEqual(decideCaktoLifecycleDesign({ ...verified, event }), {
      disposition: "REVIEW",
      reason: "BUSINESS_POLICY_NOT_DEFINED",
      canExecuteToday: false,
    });
  }
});

test("refund or chargeback without a proven Order effect requires review", () => {
  for (const event of ["refund", "chargeback"]) {
    assert.deepEqual(
      decideCaktoLifecycleDesign({
        ...verified,
        event,
        authoritativePeriodVerified: false,
        orderReversalEffectVerified: false,
      }),
      {
        disposition: "REVIEW",
        reason: "ORDER_REVERSAL_EFFECT_NOT_VERIFIED",
        canExecuteToday: false,
      },
    );
  }
});

test("refund of an older Order is a non-executable candidate only after its effect is proven", () => {
  assert.deepEqual(
    decideCaktoLifecycleDesign({
      ...verified,
      event: "refund",
      authoritativePeriodVerified: false,
      orderReversalEffectVerified: true,
    }),
    {
      disposition: "CANDIDATE",
      candidateAction: "REVOKE",
      reason: "STAGING_EVIDENCE_REQUIRED_FOR_EXECUTION",
      canExecuteToday: false,
    },
  );
});

test("no decision can authorize execution today", () => {
  const inputs = [
    verified,
    { ...verified, deliveryIdentity: "UNKNOWN" },
    { ...verified, deliveryIdentity: "IDENTICAL_DUPLICATE" },
    { ...verified, deliveryIdentity: "DIVERGENT_DUPLICATE" },
    { ...verified, ordering: "STALE" },
  ];
  for (const input of inputs) {
    assert.equal(decideCaktoLifecycleDesign(input).canExecuteToday, false);
  }
});

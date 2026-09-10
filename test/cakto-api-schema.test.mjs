import assert from "node:assert/strict";
import test from "node:test";

import {
  caktoApiBillingAttemptSchema,
  caktoApiBillingCycleSchema,
  caktoApiOfferSchema,
  caktoApiOrderSchema,
  caktoApiSubscriptionSchema,
} from "../dist/schemas/cakto-api.schema.js";

const orderStatuses = [
  "processing",
  "authorized",
  "paid",
  "refund_requested",
  "in_settlement",
  "acquirer_error",
  "refunded",
  "waiting_payment",
  "refused",
  "blocked",
  "chargedback",
  "canceled",
  "in_protest",
  "partially_paid",
  "prechargeback",
  "scheduled",
  "retrying",
  "MED",
];

const minimumOrder = {
  id: "order-id",
  status: "paid",
  type: "unique",
  product: { id: "product-id" },
};

const minimumOffer = {
  id: "offer-id",
  name: "Offer name",
  price: 19.9,
  default: false,
  product: "product-id",
};

const minimumSubscription = {
  amount: "19.90",
  parent_order: "order-id",
  paymentMethod: "credit_card",
  customer: "customer-id",
  product: "product-id",
  offer: "offer-id",
  orders: ["order-id"],
  createdAt: "2026-09-10T12:00:00Z",
  updatedAt: "2026-09-10T12:01:00-03:00",
  id: "subscription-id",
  status: "active",
};

const billingAttempt = {
  id: "d9abeb29-6c7d-46fa-938a-4fbce40be05d",
  attempt_number: 1,
  amount: "19.90",
  result: "success",
  failure_reason: null,
  scheduled_for: "2026-09-10T12:00:00Z",
  started_at: "2026-09-10T12:00:01Z",
  completed_at: "2026-09-10T12:00:02Z",
  created_at: "2026-09-10T12:00:00Z",
};

const billingCycle = {
  id: "f15d1962-bba0-4e66-a147-f59a48935f29",
  cycle_number: 1,
  due_date: "2026-09-10T12:00:00Z",
  amount: "19.90",
  status: "paid",
  total_attempts: 1,
  created_at: "2026-09-10T12:00:00Z",
  attempts: [billingAttempt],
  completed_at: "2026-09-10T12:00:02Z",
};

test("Cakto API order accepts every documented status and rejects an invented status", () => {
  for (const status of orderStatuses) {
    assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, status }).success, true);
  }
  assert.equal(
    caktoApiOrderSchema.safeParse({ ...minimumOrder, status: "invented" }).success,
    false,
  );
});

test("Cakto API order accepts only documented order types", () => {
  for (const type of ["unique", "subscription"]) {
    assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, type }).success, true);
  }
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, type: "other" }).success, false);
});

test("Cakto API order requires product with a valid id", () => {
  const { product: _product, ...withoutProduct } = minimumOrder;
  assert.equal(caktoApiOrderSchema.safeParse(withoutProduct).success, false);
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, product: null }).success, false);
  assert.equal(
    caktoApiOrderSchema.safeParse({ ...minimumOrder, product: { id: "" } }).success,
    false,
  );
  assert.equal(
    caktoApiOrderSchema.safeParse({ ...minimumOrder, product: { id: "product-id" } }).success,
    true,
  );
});

test("Cakto API order applies the documented refId limit without inventing nullability", () => {
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, refId: "reference-id" }).success, true);
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, refId: null }).success, false);
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, refId: "x".repeat(256) }).success, false);
});

test("Cakto API order validates documented nullable date-time fields", () => {
  for (const field of ["paidAt", "refundedAt", "chargedbackAt", "canceledAt"]) {
    assert.equal(
      caktoApiOrderSchema.safeParse({ ...minimumOrder, [field]: "2026-09-10T12:00:00-03:00" })
        .success,
      true,
    );
    assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, [field]: null }).success, true);
    assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, [field]: "arbitrary" }).success, false);
  }
});

test("Cakto API order validates documented nullable integer fields", () => {
  assert.equal(
    caktoApiOrderSchema.safeParse({ ...minimumOrder, checkout: 1, subscription_period: 2 }).success,
    true,
  );
  assert.equal(
    caktoApiOrderSchema.safeParse({ ...minimumOrder, checkout: null, subscription_period: null }).success,
    true,
  );
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, checkout: 1.5 }).success, false);
});

test("Cakto API order accepts documented sck values and enforces 255 characters", () => {
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, sck: "tracking-code" }).success, true);
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, sck: null }).success, true);
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, sck: "x".repeat(256) }).success, false);
});

test("Cakto API order strips unknown root and product fields", () => {
  const result = caktoApiOrderSchema.parse({
    ...minimumOrder,
    undocumented: "discarded",
    product: { id: "product-id", undocumented: "discarded" },
  });
  assert.equal("undocumented" in result, false);
  assert.equal("undocumented" in result.product, false);
});

test("Cakto API offer validates its documented required fields", () => {
  assert.equal(caktoApiOfferSchema.safeParse(minimumOffer).success, true);
  for (const field of ["id", "name", "price", "default", "product"]) {
    const invalid = { ...minimumOffer };
    delete invalid[field];
    assert.equal(caktoApiOfferSchema.safeParse(invalid).success, false);
  }
  assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, price: Number.NaN }).success, false);
  assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, name: "x".repeat(256) }).success, false);
});

test("Cakto API offer accepts every documented currency and rejects unknown or null", () => {
  for (const currency of ["BRL", "EUR", "MXN", "PEN", "USD", "CLP", "COP", "ARS", "BOB", "UYU"]) {
    assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, currency }).success, true);
  }
  assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, currency: "GBP" }).success, false);
  assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, currency: null }).success, false);
});

test("Cakto API offer validates documented status, type, and intervalType enums", () => {
  for (const status of ["active", "disabled", "deleted"]) {
    assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, status }).success, true);
  }
  for (const type of ["unique", "subscription"]) {
    assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, type }).success, true);
  }
  for (const intervalType of ["week", "month", "year", "lifetime"]) {
    assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, intervalType }).success, true);
  }
  assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, status: "other" }).success, false);
  assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, type: "other" }).success, false);
  assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, intervalType: "day" }).success, false);
});

test("Cakto API offer interval fields are optional integers but not nullable", () => {
  for (const field of ["interval", "recurrence_period", "quantity_recurrences", "trial_days"]) {
    assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, [field]: 1 }).success, true);
    assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, [field]: 1.5 }).success, false);
    assert.equal(caktoApiOfferSchema.safeParse({ ...minimumOffer, [field]: null }).success, false);
  }
  assert.equal(
    caktoApiOfferSchema.safeParse({ ...minimumOffer, quantity_recurrences: -1 }).success,
    true,
  );
});

test("Cakto API offer strips unknown fields", () => {
  const result = caktoApiOfferSchema.parse({ ...minimumOffer, undocumented: "discarded" });
  assert.equal("undocumented" in result, false);
});

test("Cakto API subscription accepts documented fields and all documented statuses", () => {
  for (const status of ["active", "inactive", "canceled", "expired", "paused", "trial"]) {
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, status }).success, true);
  }
  assert.equal(
    caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, status: "past_due" }).success,
    false,
  );
});

test("Cakto API subscription validates identifiers, decimal amount, and date-times", () => {
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, id: "" }).success, false);
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, amount: 19.9 }).success, false);
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, amount: "" }).success, false);
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, amount: "19.999" }).success, false);
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, createdAt: "invalid" }).success, false);
});

test("Cakto API subscription keeps next payment and cancellation nullable without treating either as period end", () => {
  assert.equal(
    caktoApiSubscriptionSchema.safeParse({
      ...minimumSubscription,
      next_payment_date: null,
      canceledAt: null,
    }).success,
    true,
  );
  assert.equal(
    caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, next_payment_date: "invalid" }).success,
    false,
  );
});

test("Cakto API billing attempt validates documented result and date-times", () => {
  for (const result of ["success", "failure"]) {
    assert.equal(caktoApiBillingAttemptSchema.safeParse({ ...billingAttempt, result }).success, true);
  }
  assert.equal(caktoApiBillingAttemptSchema.safeParse({ ...billingAttempt, result: "pending" }).success, false);
  assert.equal(caktoApiBillingAttemptSchema.safeParse({ ...billingAttempt, started_at: "invalid" }).success, false);
});

test("Cakto API billing cycle validates documented fields and nullable completion", () => {
  assert.equal(caktoApiBillingCycleSchema.safeParse(billingCycle).success, true);
  assert.equal(caktoApiBillingCycleSchema.safeParse({ ...billingCycle, completed_at: null }).success, true);
  assert.equal(caktoApiBillingCycleSchema.safeParse({ ...billingCycle, due_date: "invalid" }).success, false);
  assert.equal(caktoApiBillingCycleSchema.safeParse({ ...billingCycle, cycle_number: 1.5 }).success, false);
});

test("Cakto API subscription and billing schemas strip unknown fields", () => {
  const subscription = caktoApiSubscriptionSchema.parse({
    ...minimumSubscription,
    undocumented: "discarded",
  });
  const cycle = caktoApiBillingCycleSchema.parse({ ...billingCycle, undocumented: "discarded" });
  assert.equal("undocumented" in subscription, false);
  assert.equal("undocumented" in cycle, false);
});

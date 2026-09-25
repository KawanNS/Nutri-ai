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
  id: "3d5ab3d1-94af-4e96-8470-1b8659b87001",
  status: "paid",
  type: "unique",
  product: { id: "product-id" },
};

test("Cakto API order preserves documented audit identifiers without accepting unknown data", () => {
  const parsed = caktoApiOrderSchema.parse({
    ...minimumOrder,
    product: { id: "product-id", name: "Nutri-AI Mensal", price: 19.9 },
    offer: { id: "offer-id", name: "Mensal", price: 19.9, ignored: "removed" },
    paymentMethod: "pix",
    amount: "19.90",
    customer: { email: "owner@example.com", phone: "removed" },
    ignored: "removed",
  });
  assert.deepEqual(parsed.product, { id: "product-id", name: "Nutri-AI Mensal", price: 19.9 });
  assert.deepEqual(parsed.offer, { id: "offer-id", name: "Mensal", price: 19.9 });
  assert.equal(parsed.paymentMethod, "pix");
  assert.equal(parsed.amount, "19.90");
  assert.deepEqual(parsed.customer, { email: "owner@example.com" });
  assert.equal("ignored" in parsed, false);
});

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

test("Cakto API order requires its documented UUID identifier", () => {
  assert.equal(caktoApiOrderSchema.safeParse(minimumOrder).success, true);
  assert.equal(caktoApiOrderSchema.safeParse({ ...minimumOrder, id: "order-id" }).success, false);
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

test("Cakto API offer recurrence fields are optional integers but not nullable", () => {
  for (const field of [
    "interval",
    "recurrence_period",
    "quantity_recurrences",
    "trial_days",
    "max_retries",
    "retry_interval",
  ]) {
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

test("Cakto API subscription accepts a complete documented response", () => {
  const completeSubscription = {
    ...minimumSubscription,
    current_period: 1,
    recurrence_period: 30,
    quantity_recurrences: -1,
    trial_days: 0,
    max_retries: 3,
    retry_interval: 2,
    paid_payments_quantity: 1,
    retention: "30 days",
    next_payment_date: "2026-10-10T12:00:00Z",
    canceledAt: null,
  };
  assert.deepEqual(caktoApiSubscriptionSchema.parse(completeSubscription), completeSubscription);
});

test("Cakto API subscription accepts the observed customer object and retains only email", () => {
  const parsed = caktoApiSubscriptionSchema.parse({
    ...minimumSubscription,
    customer: {
      name: "Discarded",
      email: "owner@example.com",
      phone: "discarded",
      docNumber: "discarded",
    },
  });
  assert.deepEqual(parsed.customer, { email: "owner@example.com" });
});

test("Cakto API subscription requires every documented required field", () => {
  for (const field of [
    "amount",
    "parent_order",
    "paymentMethod",
    "customer",
    "product",
    "offer",
    "orders",
    "createdAt",
    "updatedAt",
  ]) {
    const invalid = { ...minimumSubscription };
    delete invalid[field];
    assert.equal(caktoApiSubscriptionSchema.safeParse(invalid).success, false, field);
    assert.equal(
      caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: null }).success,
      false,
      `${field} null`,
    );
  }
});

test("Cakto API subscription accepts all documented statuses and rejects unknown status", () => {
  for (const status of ["active", "inactive", "canceled", "expired", "paused", "late", "trial"]) {
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, status }).success, true);
  }
  assert.equal(
    caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, status: "past_due" }).success,
    false,
  );
});

test("Cakto API subscription validates identifiers and non-empty provider references", () => {
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, id: "" }).success, false);
  for (const field of ["parent_order", "paymentMethod", "customer", "product", "offer"]) {
    assert.equal(
      caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: "" }).success,
      false,
      field,
    );
  }
});

test("Cakto API subscription validates the documented decimal string format", () => {
  for (const amount of [
    "0",
    "19",
    "19.9",
    "19.90",
    "-1",
    "-0.50",
    "00000001",
    "99999999.99",
  ]) {
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, amount }).success, true, amount);
  }
  for (const amount of [
    "19.999",
    19.9,
    null,
    "",
    ".",
    "-",
    "-.5",
    ".50",
    "19.",
    "000000000",
    "123456789",
    "123456789.00",
    "NaN",
    "Infinity",
  ]) {
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, amount }).success, false, String(amount));
  }
  const { amount: _amount, ...withoutAmount } = minimumSubscription;
  assert.equal(caktoApiSubscriptionSchema.safeParse(withoutAmount).success, false);
});

test("Cakto API subscription validates its order ID array without inventing a minimum size", () => {
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, orders: [] }).success, true);
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, orders: ["order-a", "order-b"] }).success, true);
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, orders: "order-a" }).success, false);
  assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, orders: [""] }).success, false);
});

test("Cakto API subscription validates required and nullable date-times", () => {
  for (const field of ["createdAt", "updatedAt"]) {
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: "2026-09-10T12:00:00-03:00" }).success, true);
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: "invalid" }).success, false);
  }
  for (const field of ["next_payment_date", "canceledAt"]) {
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: "2026-09-10T12:00:00Z" }).success, true);
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: null }).success, true);
    assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: "invalid" }).success, false);
  }
});

test("Cakto API subscription integer fields accept signed integers only", () => {
  for (const field of [
    "current_period",
    "recurrence_period",
    "quantity_recurrences",
    "trial_days",
    "max_retries",
    "retry_interval",
    "paid_payments_quantity",
  ]) {
    for (const value of [1, 0, -1]) {
      assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: value }).success, true, `${field}: ${value}`);
    }
    for (const value of [1.5, "1", null]) {
      assert.equal(caktoApiSubscriptionSchema.safeParse({ ...minimumSubscription, [field]: value }).success, false, `${field}: ${value}`);
    }
  }
});

test("Cakto API subscription strips unknown fields", () => {
  const parsed = caktoApiSubscriptionSchema.parse({
    ...minimumSubscription,
    undocumented: "discarded",
  });
  assert.equal("undocumented" in parsed, false);
});

test("Cakto API subscription date hints remain data only and are not converted to period end", () => {
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

test("Cakto API billing schemas strip unknown fields", () => {
  const cycle = caktoApiBillingCycleSchema.parse({ ...billingCycle, undocumented: "discarded" });
  assert.equal("undocumented" in cycle, false);
});

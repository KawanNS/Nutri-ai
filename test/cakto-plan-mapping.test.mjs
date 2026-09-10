import assert from "node:assert/strict";
import test from "node:test";

import { resolveCaktoPlan } from "../dist/services/cakto-plan-mapping.service.js";

const allowlist = {
  MONTHLY: { productId: "product-a", offerId: "offer-monthly" },
  QUARTERLY: { productId: "product-a", offerId: "offer-quarterly" },
  ANNUAL: { productId: "product-a", offerId: "offer-annual" },
};

test("Cakto plan mapping requires an exact product and offer pair", () => {
  assert.equal(
    resolveCaktoPlan(allowlist, { productId: "product-a", offerId: "offer-quarterly" }),
    "QUARTERLY",
  );
  assert.equal(
    resolveCaktoPlan(allowlist, { productId: "product-a", offerId: "offer-unknown" }),
    null,
  );
  assert.equal(
    resolveCaktoPlan(allowlist, { productId: "product-unknown", offerId: "offer-quarterly" }),
    null,
  );
});

test("Cakto plan mapping rejects missing identifiers", () => {
  assert.equal(resolveCaktoPlan(allowlist, { productId: "", offerId: "offer-monthly" }), null);
  assert.equal(resolveCaktoPlan(allowlist, { productId: "product-a", offerId: "" }), null);
});

test("Cakto plan mapping fails closed when a provider pair is ambiguous", () => {
  const ambiguous = {
    ...allowlist,
    QUARTERLY: { ...allowlist.MONTHLY },
  };

  assert.equal(
    resolveCaktoPlan(ambiguous, { productId: "product-a", offerId: "offer-monthly" }),
    null,
  );
});

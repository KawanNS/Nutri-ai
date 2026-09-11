import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCaktoPlanAllowlist,
  caktoOfferPriceToCents,
  matchesCaktoPlanPrice,
  resolveCaktoPlan,
} from "../dist/services/cakto-plan-mapping.service.js";

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

test("Cakto plan configuration requires every explicit product and offer identifier", () => {
  const configuration = {
    MONTHLY: { productId: "product-a", offerId: "offer-monthly" },
    QUARTERLY: { productId: "product-a", offerId: null },
    ANNUAL: { productId: "product-a", offerId: "offer-annual" },
  };

  assert.equal(buildCaktoPlanAllowlist(configuration), null);
});

test("Cakto plan configuration trims identifiers and rejects duplicate pairs", () => {
  const configuration = {
    MONTHLY: { productId: " product-a ", offerId: " offer-monthly " },
    QUARTERLY: { productId: "product-a", offerId: "offer-quarterly" },
    ANNUAL: { productId: "product-a", offerId: "offer-annual" },
  };
  assert.deepEqual(buildCaktoPlanAllowlist(configuration)?.MONTHLY, {
    productId: "product-a",
    offerId: "offer-monthly",
  });

  configuration.QUARTERLY = { ...configuration.MONTHLY };
  assert.equal(buildCaktoPlanAllowlist(configuration), null);
});

test("Cakto plan resolution has no fallback based on commercial display data", () => {
  assert.equal(
    resolveCaktoPlan(allowlist, {
      productId: "Monthly plan at 19.90",
      offerId: "MONTHLY",
    }),
    null,
  );
});

test("Cakto plan prices are compared deterministically in integer cents", () => {
  assert.equal(caktoOfferPriceToCents(19.9), 1990);
  assert.equal(caktoOfferPriceToCents(49.9), 4990);
  assert.equal(matchesCaktoPlanPrice("MONTHLY", 19.9), true);
  assert.equal(matchesCaktoPlanPrice("QUARTERLY", 49.9), true);
  assert.equal(matchesCaktoPlanPrice("ANNUAL", 159.9), true);
  assert.equal(matchesCaktoPlanPrice("MONTHLY", 49.9), false);
});

test("Cakto price conversion rejects unsafe, negative, and over-precise numbers", () => {
  for (const price of [Number.NaN, Number.POSITIVE_INFINITY, -1, 19.999, 1e21]) {
    assert.equal(caktoOfferPriceToCents(price), null, String(price));
  }
});

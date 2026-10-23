import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("an open meal stays right of the time rail on phones", async () => {
  const css = await readFile("frontend/src/pages/MealPlanPage.css", "utf8");
  const phone = css.slice(css.indexOf("@media (max-width: 34rem)"), css.indexOf("@media (max-width: 22rem)"));
  // With no left padding the rail line ran through the ingredients and the nutrition numbers.
  assert.match(phone, /\.mp-meal__body,\s+\.mp-meal__swap-status,\s+\.mp-meal__swap-feedback \{ padding-left: calc\(var\(--rail-x\) \+ var\(--space-3\)\); \}/);
  assert.doesNotMatch(phone, /\.mp-meal__body \{ padding-left: 0; \}/);
});

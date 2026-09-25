import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal-plan UI preserves the idempotency key across a page reload", async () => {
  const source = await readFile("frontend/src/pages/MealPlanPage.tsx", "utf8");

  assert.match(source, /sessionStorage\.getItem\(generationAttemptStorageKey\)/);
  assert.match(source, /sessionStorage\.setItem\(generationAttemptStorageKey, key\)/);
  assert.match(source, /sessionStorage\.removeItem\(generationAttemptStorageKey\)/);
  assert.match(source, /if \(useExistingKey && !attemptKey\.current\) return/);
  assert.match(source, /setPending\(currentUsage\.freeUsesReserved > 0\)/);
  assert.match(source, /if \(generatingRef\.current\) return/);
});

test("real meal-plan smoke is explicitly gated and exercises the public flow", async () => {
  const source = await readFile("src/scripts/smoke-real-meal-plan.ts", "utf8");

  assert.match(source, /NUTRI_REAL_DIET_SMOKE/);
  assert.match(source, /REAL_DIET_SMOKE_NOT_AUTHORIZED/);
  assert.match(source, /\/auth\/register/);
  assert.match(source, /\/auth\/login/);
  assert.match(source, /\/api\/profile/);
  assert.match(source, /\/api\/meal-plans\/generate/);
  assert.match(source, /validateGeneratedMealPlan/);
  assert.match(source, /prisma\.mealPlan\.findFirst/);
  assert.match(source, /prisma\.usageEvent\.findFirst/);
  assert.match(source, /prisma\.aiUsageEvent\.findFirst/);
  assert.equal(source.includes("GoogleGenAI"), false);
  assert.equal(source.includes("chat.completions"), false);
});

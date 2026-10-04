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

test("meal-plan redesign presents every real state without inventing product behavior", async () => {
  const [source, styles] = await Promise.all([
    readFile("frontend/src/pages/MealPlanPage.tsx", "utf8"),
    readFile("frontend/src/pages/MealPlanPage.css", "utf8"),
  ]);

  for (const primitive of ["PageHeader", "Surface", "Alert", "Badge", "Button", "LoadingState"]) {
    assert.match(source, new RegExp(`import \\{ ${primitive} \\}`));
  }

  assert.match(source, /title="Seu plano alimentar"/);
  assert.match(source, /<EmptyPlanState\/>/);
  assert.match(source, /Seu plano começa aqui\./);
  assert.match(source, /label="Montando seu plano alimentar…"/);
  assert.doesNotMatch(source, /\d+% concluído/);
  assert.match(source, /<Alert variant="error"/);
  assert.match(source, /shouldStartFreshAfter/);

  assert.match(source, /const \[selectedDayNumber, setSelectedDayNumber\] = useState/);
  assert.match(source, /plan\.days\.find\(\(day\) => day\.day === selectedDayNumber\)/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /day\.meals\.map/);
  assert.match(source, /meal\.suggestedTime && <time>/);
  assert.match(source, /meal\.foods\.map/);
  assert.match(source, /meal\.estimatedNutrition/);
  assert.match(source, /plan\.dailyTargets/);
  assert.match(source, /plan\.shoppingList\.map/);

  assert.match(source, /usage\.freeUsesAvailable/);
  assert.match(source, /usage\.isPremium/);
  assert.match(source, /limitReached && <Paywall\/>/);
  assert.match(source, /generateMealPlan\(key\)/);
  assert.match(source, /getUsage\(\), listLatestMealPlan\(\), getSubscription\(\)/);

  assert.match(styles, /\.mp-day-nav button \{[^}]*min-height: 4rem/s);
  assert.match(styles, /\.mp-day-nav \{[^}]*overflow-x: auto/s);
  for (const breakpoint of ["62rem", "47.99rem", "34rem", "22rem"]) {
    assert.match(styles, new RegExp(`@media \\(max-width: ${breakpoint.replace(".", "\\.")}\\)`));
  }
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

  for (const fabricatedFeature of ["checkbox", "Substituir refeição", "score nutricional", "hidratação", "streak"]) {
    assert.equal(source.includes(fabricatedFeature), false);
  }
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

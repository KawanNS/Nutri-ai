import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

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

  assert.match(source, /title="Plano alimentar"/);
  assert.doesNotMatch(source, /eyebrow|mp-kicker/);
  assert.match(source, /<EmptyPlanState\/>/);
  assert.match(source, /Seu plano começa aqui\./);
  assert.match(source, /label="Montando seu plano alimentar…"/);
  assert.doesNotMatch(source, /\d+% concluído/);
  assert.match(source, /<Alert variant="error"/);
  assert.match(source, /shouldStartFreshAfter/);

  // Opens on today's day with the next meal highlighted; the rest of the week stays one tap away.
  assert.match(source, /todayPlanDay\(ordered, mealPlan\.createdAt, now\)/);
  assert.match(source, /const \[selectedDayNumber, setSelectedDayNumber\] = useState\(todayNumber \?\?/);
  assert.match(source, /plan\.days\.find\(\(day\) => day\.day === selectedDayNumber\)/);
  assert.match(source, /const next = isToday \? nextMealIndex\(selectedDay\.meals, now\) : null/);
  assert.match(source, /typeof next === 'number' && <NextMeal/);
  assert.match(source, /role="tablist" aria-label="Dias do plano alimentar"/);
  assert.match(source, /role="tab"\s+aria-selected=\{selected\}/);
  assert.match(source, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(source, /event\.key === 'ArrowRight'/);
  assert.match(source, /selectedDay\.meals\.map/);
  assert.match(source, /meal\.suggestedTime && <time>/);
  assert.match(source, /meal\.foods\.map/);
  assert.match(source, /meal\.estimatedNutrition/);
  assert.match(source, /plan\.dailyTargets/);
  assert.match(source, /plan\.shoppingList\.map/);

  assert.match(source, /usage\.freeUsesAvailable/);
  assert.match(source, /usage\.isPremium/);
  assert.match(source, /limitReached && <Paywall\/>/);
  assert.match(source, /generateMealPlan\(key, firstDayMeals\)/);
  assert.match(source, /getUsage\(\), listLatestMealPlan\(\), getSubscription\(\)/);

  // All seven days fit at iPhone width (no sideways scrolling) and every tab is a full touch target.
  assert.match(styles, /\.mp-day-tabs \{[^}]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/s);
  assert.doesNotMatch(styles, /\.mp-day-tabs \{[^}]*overflow-x/s);
  assert.match(styles, /\.mp-day-tabs \[role="tab"\] \{[^}]*min-height: var\(--touch-target\)/s);
  for (const breakpoint of ["47.99rem", "34rem", "22rem"]) {
    assert.match(styles, new RegExp(`@media \\(max-width: ${breakpoint.replace(".", "\\.")}\\)`));
  }
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

  for (const fabricatedFeature of ["checkbox", "score nutricional", "hidratação", "streak"]) {
    assert.equal(source.includes(fabricatedFeature), false);
  }
});

test("meal-plan schedule picks today's day and the next meal", { skip: !process.features.typescript && "needs Node with TypeScript type stripping" }, async () => {
  const { nextMealIndex, shortDayLabel, todayPlanDay, mealMinutes } = await import(pathToFileURL("frontend/src/utils/mealPlanSchedule.ts").href);
  const labels = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
  const named = labels.map((label, index) => ({ day: index + 1, label, meals: [], estimatedDailyCost: 0 }));
  const numbered = labels.map((_, index) => ({ day: index + 1, label: `Dia ${index + 1}`, meals: [], estimatedDailyCost: 0 }));

  // Weekday labels follow the calendar: 2026-10-21 is a Wednesday.
  assert.equal(todayPlanDay(named, "2026-10-01T12:00:00", new Date(2026, 9, 21, 9)), 3);
  assert.equal(todayPlanDay(named, "2026-10-01T12:00:00", new Date(2026, 9, 25, 9)), 7);
  // Other labels count from the generation day and repeat weekly.
  assert.equal(todayPlanDay(numbered, new Date(2026, 9, 19, 22).toISOString(), new Date(2026, 9, 19, 23)), 1);
  assert.equal(todayPlanDay(numbered, new Date(2026, 9, 19, 22).toISOString(), new Date(2026, 9, 28, 8)), 3);
  assert.equal(shortDayLabel(named[5]), "Sáb");
  assert.equal(shortDayLabel(numbered[2]), "Dia 3");

  assert.equal(mealMinutes("07:30"), 450);
  assert.equal(mealMinutes("12h"), 720);
  assert.equal(mealMinutes("19h30"), 1170);
  assert.equal(mealMinutes("Antes de dormir"), null);
  const meals = ["07:30", "12:30", "19:30"].map((suggestedTime) => ({ suggestedTime }));
  assert.equal(nextMealIndex(meals, new Date(2026, 9, 19, 11, 50)), 1);
  assert.equal(nextMealIndex(meals, new Date(2026, 9, 19, 12, 55)), 1, "a meal stays next for a short while after its time");
  assert.equal(nextMealIndex(meals, new Date(2026, 9, 19, 22, 0)), "done");
  assert.equal(nextMealIndex([{ suggestedTime: null }], new Date()), null);
});

test("meal swap is a per-meal action with inline loading and errors", async () => {
  const [source, service, styles] = await Promise.all([
    readFile("frontend/src/pages/MealPlanPage.tsx", "utf8"),
    readFile("frontend/src/services/mealPlanService.ts", "utf8"),
    readFile("frontend/src/pages/MealPlanPage.css", "utf8"),
  ]);

  assert.match(service, /\/api\/meal-plans\/\$\{encodeURIComponent\(mealPlanId\)\}\/days\/\$\{day\}\/meals\/\$\{mealIndex\}\/swap/);
  assert.match(source, /swapMeal\(mealPlan\.id, day, mealIndex\)/);
  assert.match(source, /onPlanUpdated\(response\.mealPlan\)/);
  assert.match(source, /canSwap=\{usage\?\.isPremium === true\}/);
  assert.match(source, /if \(swappingRef\.current\) return/);
  assert.match(source, /className="mp-meal__swap" variant="ghost" loading=\{swapping\}/);
  assert.match(source, /aria-busy=\{swapping \|\| undefined\}/);
  assert.match(source, /role="alert">\{feedback\.message\}/);
  for (const code of ["PREMIUM_REQUIRED", "MEAL_SWAP_RATE_LIMIT_EXCEEDED", "MEAL_SWAP_TEMPORARILY_UNAVAILABLE", "MEAL_CHANGED_DURING_SWAP", "MEAL_PLAN_NOT_SWAPPABLE"]) {
    assert.match(source, new RegExp(`case '${code}'`));
  }
  assert.match(styles, /\.mp-meal--swapping \.mp-meal__body \{ opacity: \.45; \}/);
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

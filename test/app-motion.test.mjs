import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("the React Bits spotlight card keeps its attribution and stays still for reduced motion", async () => {
  const [card, styles] = await Promise.all([
    read("frontend/src/components/motion/SpotlightCard.tsx"),
    read("frontend/src/components/motion/SpotlightCard.css"),
  ]);
  assert.match(card, /adapted from React Bits \(https:\/\/reactbits\.dev/);
  assert.match(card, /MIT \+ Commons Clause/);
  assert.match(styles, /adapted from React Bits/);
  assert.match(card, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
  // Decorative layers are hidden from assistive tech and never catch the pointer.
  assert.equal((card.match(/aria-hidden="true"/g) ?? []).length, 4);
  assert.match(styles, /pointer-events: none/);
});

test("counting numbers read as their final value and do not move with reduced motion", async () => {
  const countUp = await read("frontend/src/components/motion/CountUp.tsx");
  assert.match(countUp, /<span aria-hidden="true">\{format\(reduced \? value : shown\)\}<\/span>/);
  assert.match(countUp, /<span className="ui-visually-hidden">\{format\(value\)\}<\/span>/);
  assert.match(countUp, /if \(reduced\) return/);
  assert.match(countUp, /cancelAnimationFrame\(frame\)/);
  assert.doesNotMatch(countUp, /from 'motion|framer-motion|gsap/);
});

test("the macro bar weighs grams by calories and explains itself in text", async () => {
  const [bar, styles] = await Promise.all([
    read("frontend/src/components/motion/MacroBar.tsx"),
    read("frontend/src/components/motion/MacroBar.css"),
  ]);
  assert.match(bar, /kcal: proteinGrams \* 4/);
  assert.match(bar, /kcal: carbohydrateGrams \* 4/);
  assert.match(bar, /kcal: fatGrams \* 9/);
  assert.match(bar, /if \(proteinGrams === null \|\| carbohydrateGrams === null \|\| fatGrams === null\) return null/);
  assert.match(bar, /aria-label=\{legend \? undefined : `De onde vêm as calorias: \$\{summary\}`\}/);
  assert.match(styles, /@keyframes macro-bar-fill \{ from \{ transform: scaleX\(0\); \}/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.macro-bar__fill \{ animation: none; \}/);
});

test("meal plan and diary use the motion pieces and switch every animation off for reduced motion", async () => {
  const [plan, planStyles, diary, diaryStyles] = await Promise.all([
    read("frontend/src/pages/MealPlanPage.tsx"),
    read("frontend/src/pages/MealPlanPage.css"),
    read("frontend/src/pages/DiaryPage.tsx"),
    read("frontend/src/pages/DiaryPage.css"),
  ]);

  // Meal plan: day summary card, sliding day pill, timeline that rebuilds per day.
  assert.match(plan, /<DaySummary key=\{selectedDay\.day\} day=\{selectedDay\} isToday=\{isToday\}\/>/);
  assert.match(plan, /<CountUp value=\{totals\.caloriesKcal\} format=\{formatWhole\}\/>/);
  assert.match(plan, /<span className="mp-day-tabs__indicator" aria-hidden="true" style=\{\{ '--index': selectedIndex \} as CSSProperties\}\/>/);
  assert.match(plan, /key=\{`meals-\$\{selectedDay\.day\}`\}/);
  assert.match(plan, /const past = next === 'done' \|\| \(typeof next === 'number' && index < next\)/);
  const planReduced = planStyles.slice(planStyles.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(planReduced, /\.mp-day-tabs__indicator,/);
  assert.match(planReduced, /\.mp-meal,\s*\.mp-disclosure\[open\] \.mp-shopping > section,\s*\.mp-meal--next \.mp-meal__dot::after,\s*\.mp-next__pulse::after \{ animation: none; \}/);

  // Diary: total card counting up, macro split, timeline of logged meals.
  assert.match(diary, /<SpotlightCard as="section" className="diary-summary"/);
  assert.match(diary, /<CountUp className="diary-summary__big" value=\{totals\.calories\} format=\{formatWhole\}\/>/);
  assert.match(diary, /<MacroBar proteinGrams=\{totals\.protein\} carbohydrateGrams=\{totals\.carbohydrates\} fatGrams=\{totals\.fat\}\/>/);
  assert.match(diary, /<ol key=\{`entries-\$\{date\}`\}>/);
  assert.match(diaryStyles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.diary-day-picker strong,\.diary-empty__icon,\.diary-entry \{ animation: none; \}/);

  // Still the app's own look: no serif, no spaced caps, no new animation library.
  for (const styles of [planStyles, diaryStyles]) {
    assert.doesNotMatch(styles, /--font-display|text-transform: uppercase/);
  }
  const pkg = JSON.parse(await read("frontend/package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["react", "react-dom"]);
});

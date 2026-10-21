import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");
const screens = ["DiaryPage", "MealPhotoPage", "MealPlanPage", "ProfilePage", "ProgressPage", "SubscriptionPage"];
const styledScreens = ["DiaryPage", "MealPhotoPage", "MealPlanPage", "ProgressPage"];

test("internal screens use a direct title instead of the landing-style eyebrow and display heading", async () => {
  const header = await read("frontend/src/components/layout/PageHeader.tsx");
  assert.doesNotMatch(header, /eyebrow/);

  for (const screen of screens) {
    const source = await read(`frontend/src/pages/${screen}.tsx`);
    assert.match(source, /<PageHeader title=|<PageHeader\s+className="[^"]+"\s+title=/, screen);
    assert.doesNotMatch(source, /eyebrow|kicker|page-heading|className="panel/, screen);
  }

  const primitives = await read("frontend/src/styles/primitives.css");
  assert.match(primitives, /\.ui-page-header__title \{[^}]*font-family: var\(--font-interface\)[^}]*font-size: var\(--type-app-title-size\)/);
  assert.doesNotMatch(primitives, /\.ui-page-header__eyebrow/);
});

test("internal screen styles keep the serif and spaced caps out of the app", async () => {
  for (const screen of styledScreens) {
    const styles = await read(`frontend/src/pages/${screen}.css`);
    assert.doesNotMatch(styles, /--font-display|Georgia/, screen);
    assert.doesNotMatch(styles, /text-transform: uppercase/, screen);
  }
});

test("tool screens sit in one narrow column that fits an iPhone", async () => {
  const app = await read("frontend/src/App.css");
  assert.match(app, /\.page\.page--narrow \{ width: min\(48rem,calc\(100% - 40px\)\); \}/);
  assert.match(app, /@media \(max-width:560px\) \{[^\n]*\.page\.page--narrow \{ width: min\(100% - 24px,48rem\); \}/);
  for (const screen of screens) {
    const source = await read(`frontend/src/pages/${screen}.tsx`);
    assert.match(source, /<main className="page page--narrow /, screen);
  }
});

test("diary and meal plan put the logging action in the header", async () => {
  const [diary, mealPlan, photo] = await Promise.all([
    read("frontend/src/pages/DiaryPage.tsx"),
    read("frontend/src/pages/MealPlanPage.tsx"),
    read("frontend/src/pages/MealPhotoPage.tsx"),
  ]);
  assert.match(diary, /<PageHeader title="Diário alimentar" actions=\{<Button onClick=\{onMealPhoto\}>Registrar refeição<\/Button>\}\/>/);
  assert.match(mealPlan, /actions=\{<Button variant="secondary" onClick=\{onMealPhoto\}>Foto do prato<\/Button>\}/);
  assert.match(mealPlan, /<Button variant="secondary" onClick=\{onMealPhoto\}>Registrar com foto<\/Button>/);
  // The confirmation bar stays reachable while the user scrolls through the editable foods.
  assert.match(await read("frontend/src/pages/MealPhotoPage.css"), /\.mp-photo-confirm \{[^}]*position: sticky;[^}]*bottom: 0;/s);
  assert.match(photo, /<div className="mp-photo-confirm">/);
});

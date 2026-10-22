import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("the first visit downloads light images and only the public screens", async () => {
  const [main, app, api] = await Promise.all([
    readFile("frontend/src/main.tsx", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/services/api.ts", "utf8"),
  ]);
  // The API sleeps when idle; the site wakes it up as soon as it opens.
  assert.match(api, /export function wakeApi\(\): void \{\s+fetch\(`\$\{API_URL\}\/health`, \{ cache: 'no-store' \}\)/);
  assert.match(main, /wakeApi\(\)/);
  assert.match(main, /<Suspense fallback=/);
  // Screens behind sign-in are split out of the first bundle.
  for (const page of ["AdminRouterPage", "MealPlanPage", "ProfilePage", "ProgressPage", "ChatPage", "MealPhotoPage", "DiaryPage", "SubscriptionPage"]) {
    assert.ok(app.includes(`const ${page} = lazy(() => import('./pages/${page}')`), `${page} is lazy`);
  }
  for (const page of ["LandingPage", "OnboardingPage", "PlanPreviewPage", "LoginPage", "RegisterPage"]) {
    assert.ok(app.includes(`import { ${page} } from './pages/${page}'`), `${page} ships in the first bundle`);
  }
  // Images are sized for how they are shown (they were 0.1-0.5 MB each).
  for (const [file, maxKb] of [
    ["frontend/src/assets/alyvora/alyvora-logo-horizontal.webp", 30],
    ["frontend/src/assets/landing/differentials-food-photo.webp", 100],
  ]) {
    assert.ok((await stat(file)).size <= maxKb * 1024, `${file} should stay under ${maxKb} KB`);
  }
});

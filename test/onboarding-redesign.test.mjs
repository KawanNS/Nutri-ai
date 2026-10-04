import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("onboarding redesign preserves the four-field draft and profile handoff", async () => {
  const [onboarding, styles, app, profile, service, types] = await Promise.all([
    readFile("frontend/src/pages/OnboardingPage.tsx", "utf8"),
    readFile("frontend/src/pages/OnboardingPage.css", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/pages/ProfilePage.tsx", "utf8"),
    readFile("frontend/src/services/profileService.ts", "utf8"),
    readFile("frontend/src/types/profile.ts", "utf8"),
  ]);

  for (const field of ["goal", "activityLevel", "mealsPerDay", "weeklyFoodBudget"]) {
    assert.match(onboarding, new RegExp(`${field}:`));
    assert.match(types, new RegExp(`'${field}'`));
  }
  assert.match(onboarding, /const totalSteps = 4/);
  assert.match(onboarding, /Etapa \{step \+ 1\} de \{totalSteps\}/);
  assert.match(onboarding, /role="progressbar"/);
  assert.match(onboarding, /type="radio"/);
  assert.match(onboarding, /<fieldset/);
  assert.match(onboarding, /<legend/);
  assert.match(onboarding, /<FormField/);
  assert.match(onboarding, /<Surface/);
  assert.match(onboarding, /<Button/);
  assert.match(onboarding, /Salvar e criar conta/);
  assert.equal((onboarding.match(/type="number"/g) ?? []).length, 1);
  assert.match(onboarding, /weeklyFoodBudget: weeklyFoodBudget\.trim\(\)/);

  assert.match(app, /setOnboardingDraft\(draft\)/);
  assert.match(app, /draft=\{profile \? undefined : onboardingDraft\}/);
  assert.match(profile, /draft\?\.goal/);
  assert.match(profile, /draft\?\.activityLevel/);
  assert.match(profile, /draft \? String\(draft\.mealsPerDay\)/);
  assert.match(profile, /draft\?\.weeklyFoodBudget/);
  assert.match(service, /'\/api\/profile', \{ method: 'PUT'/);
  assert.match(styles, /min-height: var\(--touch-target\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("landing edge-food structure waits safely for approved transparent assets and preserves the phone cycle", async () => {
  const [page, styles, showcase] = await Promise.all([
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.css", "utf8"),
    readFile("frontend/src/components/landing/PhoneShowcase.tsx", "utf8"),
  ]);

  assert.match(page, /differentials-food-photo\.png/);
  assert.match(page, /<HeroFoodDecor\/>/);
  assert.match(page, /aria-hidden="true"/);
  assert.match(page, /data-required-asset="tomato-transparent"/);
  assert.match(page, /data-required-asset="avocado-transparent"/);
  assert.match(page, /data-required-asset="green-leaf-transparent"/);
  assert.match(styles, /public-hero-food__crop--tomato/);
  assert.match(styles, /public-hero-food__crop--avocado/);
  assert.match(styles, /public-hero-food__crop:empty \{ display: none; \}/);
  assert.match(styles, /filter: blur\(5px\)/);
  assert.match(styles, /pointer-events: none/);
  assert.match(styles, /@media \(max-width: 34rem\)/);
  assert.match(showcase, /public-phone-screen--home/);
  assert.match(showcase, /public-phone-screen--camera/);
  assert.match(showcase, /public-phone-screen--analysis/);
  assert.match(showcase, /public-phone-screen--success/);
  assert.match(styles, /9\.6s/);
});

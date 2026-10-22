import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("free users see the Premium offer where they hit the free limits", async () => {
  const [page, app, css] = await Promise.all([
    readFile("frontend/src/pages/MealPlanPage.tsx", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/pages/MealPlanPage.css", "utf8"),
  ]);
  // 1. Next to the free counter, with a bar of what is used.
  assert.match(page, /className="mp-usage__bar"/);
  assert.match(page, /usage\.freeUsesAvailable > 0 && <button className="mp-usage__premium" type="button" onClick=\{onSubscription\}>Conhecer o Premium/);
  // 2. When the free plans run out: an offer that leads to the plans on the same page.
  assert.match(page, /Seus \{usage\?\.freeUsesLimit \?\? 3\} cardápios grátis acabaram/);
  assert.match(page, /A partir de <strong>\{premiumFromPerMonth\}<\/strong>\/mês/);
  assert.match(page, /getElementById\('paywall-title'\)\?\.scrollIntoView/);
  assert.match(page, /limitReached && <Paywall\/>/);
  // 3. When a free user tries to swap a meal.
  assert.match(page, /'Trocar só esta refeição é do Premium\. O resto do plano continua igual\.', showPlans: true/);
  assert.match(page, /feedback\.showPlans && <button className="mp-meal__swap-plans" type="button" onClick=\{onPlans\}>Ver planos<\/button>/);
  assert.match(app, /<MealPlanPage onSubscription=\{\(\) => setView\('subscription'\)\}/);
  assert.match(css, /\.mp-offer \{/);
});

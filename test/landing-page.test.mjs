import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public landing page presents only implemented Nutri-AI capabilities", async () => {
  const [app, page, onboarding, profile] = await Promise.all([
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/pages/OnboardingPage.tsx", "utf8"),
    readFile("frontend/src/pages/ProfilePage.tsx", "utf8"),
  ]);
  assert.match(app, /view === 'landing'/);
  for (const implemented of ["sete dias", "lista de compras", "Histórico de peso", "Três gerações gratuitas"]) {
    assert.equal(page.includes(implemented), true, implemented);
  }
  for (const unsupportedClaim of ["chatbot", "foto do prato", "áudio", "depoimento", "clientes satisfeitos"]) {
    assert.equal(page.toLowerCase().includes(unsupportedClaim), false, unsupportedClaim);
  }
  assert.match(page, /não substituem orientação individual/);
  assert.match(page, /Comece sem cadastro/);
  assert.match(app, /view === 'onboarding'/);
  assert.match(app, /setOnboardingDraft\(draft\)/);
  assert.match(profile, /draft\?\.goal/);
  assert.match(profile, /draft\?\.activityLevel/);
  assert.match(onboarding, /aria-pressed/);
  assert.match(onboarding, /Salvar e criar conta/);
  assert.equal((onboarding.match(/type="number"/g) ?? []).length, 1);
});

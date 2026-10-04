import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public landing presents the real product without fabricated social proof", async () => {
  const [app, page, showcase, styles, plans, paywall, mealPhoto, chat, progress, onboarding, profile, brand, metadata] = await Promise.all([
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/components/landing/PhoneShowcase.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.css", "utf8"),
    readFile("frontend/src/data/subscriptionPlans.ts", "utf8"),
    readFile("frontend/src/components/Paywall.tsx", "utf8"),
    readFile("frontend/src/pages/MealPhotoPage.tsx", "utf8"),
    readFile("frontend/src/pages/ChatPage.tsx", "utf8"),
    readFile("frontend/src/pages/ProgressPage.tsx", "utf8"),
    readFile("frontend/src/pages/OnboardingPage.tsx", "utf8"),
    readFile("frontend/src/pages/ProfilePage.tsx", "utf8"),
    readFile("frontend/src/components/BrandLogo.tsx", "utf8"),
    readFile("frontend/index.html", "utf8"),
  ]);

  assert.match(app, /view === 'landing'/);
  assert.match(app, /onStart=\{\(\) => setView\('onboarding'\)\}/);

  for (const link of ["Início", "Funcionalidades", "Como funciona", "Planos", "FAQ"]) {
    assert.equal(page.includes(link), true, link);
  }
  assert.match(page, /Sua alimentação/);
  assert.match(page, /cabe na sua vida/);
  assert.match(page, /Plano alimentar personalizado/);
  assert.match(page, /Foto do prato/);
  assert.match(page, /Assistente/);
  assert.match(page, /Evolução/);
  assert.match(page, /<PhoneShowcase\/>/);

  assert.match(mealPhoto, /analyzeMealPhoto/);
  assert.match(chat, /sendChatMessage/);
  assert.match(progress, /createProgress/);
  assert.doesNotMatch(page.toLowerCase(), /depoimento|clientes satisfeitos|estrelas|perdi kg|emagreci kg/);
  assert.doesNotMatch(page, /<video|<iframe/);
  assert.match(page, /não substitui orientação de nutricionista ou profissional de saúde/);

  assert.match(page, /aria-expanded=\{open\}/);
  assert.match(page, /aria-controls=\{menuId\}/);
  assert.match(page, /aria-expanded=\{isOpen\}/);
  assert.match(page, /role="region"/);
  assert.match(page, /public-mobile-menu/);

  for (const stage of [
    "public-phone-screen--home",
    "public-phone-screen--camera",
    "public-phone-screen--analysis",
    "public-phone-screen--success",
  ]) assert.match(showcase, new RegExp(stage));
  assert.match(showcase, /Analisando sua refeição/);
  assert.match(showcase, /Refeição registrada/);
  assert.match(styles, /9\.6s/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation: none !important/);
  assert.match(styles, /overflow-x: clip/);

  for (const commercialValue of ["Alyvora Mensal", "R$ 19,90", "Alyvora Trimestral", "R$ 49,90", "Alyvora Anual", "R$ 159,90"]) {
    assert.equal(plans.includes(commercialValue), true, commercialValue);
  }
  for (const verifiedPremiumFeature of [
    "Gerações liberadas durante a assinatura",
    "Plano personalizado de 7 dias",
    "Refeições com preparo e estimativas nutricionais",
    "Lista de compras organizada por categoria",
    "Estimativas de custo diário e semanal",
  ]) {
    assert.equal(plans.includes(verifiedPremiumFeature), true, verifiedPremiumFeature);
  }
  assert.match(page, /subscriptionPlans\.map/);
  assert.match(page, /premiumFeatures\.map/);
  assert.match(paywall, /startCheckout/);
  assert.doesNotMatch(page, /startCheckout/);
  assert.match(page, /checkout seguro é apresentado somente depois que você entra na sua conta/);
  assert.match(page, /Nenhum pagamento é realizado nesta página/);

  assert.match(brand, /alyvora-logo-horizontal\.png/);
  assert.match(brand, /<img/);
  assert.match(brand, /alt="Alyvora"/);
  assert.doesNotMatch(brand, /<span[^>]*>Alyvora<\/span>|assets\/brand|nutri-ai/i);
  assert.match(metadata, /<title>Alyvora \| Sua alimentação cabe na sua vida<\/title>/);
  assert.match(metadata, /Alyvora ajuda você a organizar sua alimentação/);
  assert.doesNotMatch(metadata, /nutri-ai/i);
  assert.match(app, /view === 'onboarding'/);
  assert.match(app, /setOnboardingDraft\(draft\)/);
  assert.match(profile, /draft\?\.goal/);
  assert.match(profile, /draft\?\.activityLevel/);
  assert.match(onboarding, /type="radio"/);
  assert.match(onboarding, /<fieldset/);
  assert.match(onboarding, /Salvar e criar conta/);
  assert.equal((onboarding.match(/type="number"/g) ?? []).length, 1);
});

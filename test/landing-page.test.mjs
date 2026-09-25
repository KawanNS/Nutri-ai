import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public landing page presents only implemented Nutri-AI capabilities", async () => {
  const [app, page, onboarding, profile, brand, plans, paywall] = await Promise.all([
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/pages/OnboardingPage.tsx", "utf8"),
    readFile("frontend/src/pages/ProfilePage.tsx", "utf8"),
    readFile("frontend/src/components/BrandLogo.tsx", "utf8"),
    readFile("frontend/src/data/subscriptionPlans.ts", "utf8"),
    readFile("frontend/src/components/Paywall.tsx", "utf8"),
  ]);
  assert.match(app, /view === 'landing'/);
  for (const implemented of ["sete dias", "lista de compras", "Histórico de peso", "Três gerações gratuitas"]) {
    assert.equal(page.includes(implemented), true, implemented);
  }
  for (const unsupportedClaim of ["chatbot", "foto do prato", "áudio", "clientes satisfeitos", "perdi kg", "emagreci kg"]) {
    assert.equal(page.toLowerCase().includes(unsupportedClaim), false, unsupportedClaim);
  }
  assert.match(page, /\['Depoimentos', '#depoimentos'\]/);
  assert.match(page, /<section[^>]+id="depoimentos"/i);
  assert.match(page, /Conteúdo demonstrativo/);
  assert.match(page, /Nenhuma fala abaixo é atribuída a uma pessoa real/);
  assert.match(page, /Exemplo demonstrativo/);
  assert.doesNotMatch(page, /Histórias reais,<br\/><em>resultados reais/);
  assert.match(page, /não substituem orientação individual/);
  assert.match(page, /Comece sem cadastro/);
  assert.match(page, /className="landing-benefits"/);
  assert.match(page, /Do seu objetivo/);
  assert.match(page, /Conte seus objetivos/);
  assert.match(page, /Receba seu plano/);
  assert.match(page, /Acompanhe e evolua/);
  assert.match(page, /Mais do que dietas/);
  assert.match(page, /DIFFERENTIALS_FOOD_PHOTO/);
  assert.match(page, /hero-food-photo\.png/);
  assert.match(page, /differentials-food-photo\.png/);
  assert.match(page, /<BrandLogo className="landing-brand-logo"\/>/);
  assert.doesNotMatch(page, /brand__mark|FOTOGRAFIA OFICIAL|Fotografia oficial/);
  assert.match(brand, /nutri-ai-logo\.png/);
  assert.match(brand, /nutri-ai-symbol\.png/);
  assert.equal((page.match(/onClick=\{onStart\}/g) ?? []).length, 4);
  assert.equal((page.match(/onClick=\{onLogin\}/g) ?? []).length, 3);
  for (const commercialValue of ["Nutri-AI Mensal", "R$ 19,90", "Nutri-AI Trimestral", "R$ 49,90", "Nutri-AI Anual", "R$ 159,90"]) {
    assert.equal(plans.includes(commercialValue), true, commercialValue);
  }
  assert.match(page, /subscriptionPlans\.map/);
  for (const verifiedPremiumFeature of [
    "Gerações liberadas durante a assinatura",
    "Plano personalizado de 7 dias",
    "Refeições com preparo e estimativas nutricionais",
    "Lista de compras organizada por categoria",
    "Estimativas de custo diário e semanal",
  ]) {
    assert.equal(plans.includes(verifiedPremiumFeature), true, verifiedPremiumFeature);
  }
  assert.match(page, /premiumFeatures\.map/);
  assert.match(page, /<section className="landing-faq" id="faq"/);
  assert.match(page, /faqItems\.map/);
  assert.match(page, /<details key=\{item\.question\}>/);
  assert.match(page, /não realiza diagnóstico, tratamento ou prescrição clínica/);
  assert.doesNotMatch(page, /Política de Privacidade|Termos de uso|reembolso garantido/);
  assert.match(page, /className="landing-final-cta"/);
  assert.match(page, /Começar agora gratuitamente/);
  assert.match(page, /className="landing-footer"/);
  assert.match(page, /Navegação do rodapé/);
  assert.match(paywall, /subscriptionPlans\.map/);
  assert.equal((page.match(/onClick=\{onRegister\}/g) ?? []).length, 1);
  assert.match(app, /view === 'onboarding'/);
  assert.match(app, /setOnboardingDraft\(draft\)/);
  assert.match(profile, /draft\?\.goal/);
  assert.match(profile, /draft\?\.activityLevel/);
  assert.match(onboarding, /aria-pressed/);
  assert.match(onboarding, /Salvar e criar conta/);
  assert.equal((onboarding.match(/type="number"/g) ?? []).length, 1);
});

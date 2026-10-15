import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = ["ChatPage", "DiaryPage", "MealPhotoPage", "MealPlanPage", "ProfilePage", "ProgressPage", "SubscriptionPage"];

const read = (path) => readFile(path, "utf8");

test("every authenticated page renders the shared topbar instead of its own copy", async () => {
  for (const page of pages) {
    const source = await read(`frontend/src/pages/${page}.tsx`);
    assert.match(source, /import \{ AppTopbar \} from '\.\.\/components\/layout\/AppTopbar'/, page);
    assert.match(source, /<AppTopbar /, page);
    assert.doesNotMatch(source, /className="topbar"/, page);
    assert.doesNotMatch(source, /logout-button/, page);
    assert.doesNotMatch(source, /onLogout/, page);
  }

  const profile = await read("frontend/src/pages/ProfilePage.tsx");
  assert.match(profile, /<AppTopbar onboarding=\{required\}/);
});

test("main navigation keeps only the four sections, without Perfil or Sair", async () => {
  const topbar = await read("frontend/src/components/layout/AppTopbar.tsx");

  assert.match(topbar, /<nav className="topbar__actions app-topbar__nav" aria-label="Navegação principal">/);
  assert.match(topbar, /navButton\('meal-plan', 'Plano alimentar', onMealPlan\)/);
  assert.match(topbar, /navButton\('chat', 'Assistente', onChat\)/);
  assert.match(topbar, /<DiaryNavButton active=\{active === 'diary'\}/);
  assert.match(topbar, /navButton\('progress', 'Evolução', onProgress\)/);
  assert.match(topbar, /\{active === 'meal-photo' && navButton\('meal-photo', 'Foto do prato'\)\}/);
  assert.match(topbar, /aria-current=\{current \? 'page' : undefined\}/);
  assert.doesNotMatch(topbar, /Perfil|Sair/);

  // First-profile setup hides the sections and leaves only logout in the menu.
  assert.match(topbar, /\{!onboarding && <nav /);
  assert.match(topbar, /<ProfileMenu logoutOnly=\{onboarding\}\/>/);
});

test("profile menu exposes the account actions with menu-button semantics", async () => {
  const menu = await read("frontend/src/components/layout/ProfileMenu.tsx");

  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /aria-controls=\{open \? menuId : undefined\}/);
  assert.match(menu, /role="menu" aria-labelledby=\{triggerId\}/);
  assert.equal(menu.match(/role="menuitem" tabIndex=\{-1\}/g)?.length, 4);
  assert.match(menu, /role="separator"/);

  assert.match(menu, /<strong>\{account\?\.name \|\| 'Sua conta'\}<\/strong>\{account\?\.email && <span>\{account\.email\}<\/span>\}/);
  assert.match(menu, /choose\(onProfile\)\}><UserIcon\/><span>Meu perfil<\/span>/);
  assert.match(menu, /choose\(onSubscription\)\}><CardIcon\/><span>Minha assinatura<\/span>/);
  assert.match(menu, /\{premium === 'free' && <button[^>]*onClick=\{\(\) => choose\(onSubscription\)\}><SparkIcon\/><span>Assinar Premium<\/span>/);
  assert.match(menu, /choose\(onLogout\)\}><LogoutIcon\/><span>Sair<\/span>/);
  assert.match(menu, /\{!logoutOnly && <>/);
});

test("profile menu closes on outside press, Escape, Tab and selection, and supports arrow keys", async () => {
  const menu = await read("frontend/src/components/layout/ProfileMenu.tsx");

  assert.match(menu, /document\.addEventListener\('pointerdown', handlePointerDown\)/);
  assert.match(menu, /return \(\) => document\.removeEventListener\('pointerdown', handlePointerDown\)/);
  assert.match(menu, /if \(!rootRef\.current\?\.contains\(event\.target as Node\)\) setOpen\(false\)/);
  assert.match(menu, /event\.key === 'Escape' && open\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); closeMenu\(\) \}/);
  assert.match(menu, /const closeMenu = \(\) => \{ setOpen\(false\); triggerRef\.current\?\.focus\(\) \}/);
  assert.match(menu, /const choose = \(action: \(\) => void\) => \{ setOpen\(false\); action\(\) \}/);
  assert.match(menu, /event\.key === 'Tab'\) setOpen\(false\)/);

  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    assert.match(menu, new RegExp(`event\\.key === '${key}'`));
  }
  assert.match(menu, /openMenu\(event\.key === 'ArrowDown' \? 'first' : 'last'\)/);
  assert.match(menu, /items\[\(index \+ items\.length\) % items\.length\]\.focus\(\)/);
});

test("avatar uses the initial today and is ready for a future picture URL", async () => {
  const [menu, context] = await Promise.all([
    read("frontend/src/components/layout/ProfileMenu.tsx"),
    read("frontend/src/components/layout/accountMenuContext.ts"),
  ]);

  assert.match(context, /pictureUrl\?: string \| null/);
  assert.match(menu, /source\.charAt\(0\)\.toLocaleUpperCase\('pt-BR'\)/);
  assert.match(menu, /account\?\.pictureUrl && !pictureFailed/);
  assert.match(menu, /onError=\{\(\) => setPictureFailed\(true\)\}/);
});

test("Premium status never shows Gratuito while loading or after a failed check", async () => {
  const menu = await read("frontend/src/components/layout/ProfileMenu.tsx");

  assert.match(menu, /if \(premium === 'loading'\) return <Badge[^>]*aria-busy="true">Verificando…<\/Badge>/);
  assert.match(menu, /if \(premium === 'premium'\) return <Badge[^>]*variant="success">Premium<\/Badge>/);
  assert.match(menu, /if \(premium === 'free'\) return <Badge[^>]*>Gratuito<\/Badge>/);
  assert.match(menu, /return <Badge[^>]*>Indisponível<\/Badge>/);
  assert.equal(menu.match(/Gratuito/g)?.length, 1);
});

test("App reuses the existing subscription endpoint and syncs it with the checkout return", async () => {
  const [app, billing, menu, topbar, context] = await Promise.all([
    read("frontend/src/App.tsx"),
    read("frontend/src/services/billingService.ts"),
    read("frontend/src/components/layout/ProfileMenu.tsx"),
    read("frontend/src/components/layout/AppTopbar.tsx"),
    read("frontend/src/components/layout/accountMenuContext.ts"),
  ]);

  assert.match(app, /import \{ getSubscription, waitForPremiumConfirmation \} from '\.\/services\/billingService'/);
  assert.match(app, /useState<PremiumState>\('loading'\)/);
  assert.match(app, /setPremium\(subscription\.adminAccess \? 'admin' : subscription\.isPremium \? 'premium' : 'free'\)/);
  assert.match(app, /if \(request === premiumRequest\.current\) setPremium\('unavailable'\)/);
  assert.match(app, /premiumConfirmed = await waitForPremiumConfirmation\(\)/);
  assert.match(app, /if \(premiumConfirmed\) \{ premiumRequest\.current \+= 1; setPremium\('premium'\) \}\s*else void refreshPremium\(\)/);
  assert.match(app, /const logout = \(\) => \{ removeToken\(\); setProfile\(undefined\); resetAccount\(\);/);
  assert.match(app, /onLogout: logout,/);
  assert.match(app, /onSubscription: \(\) => setView\('subscription'\)/);
  assert.match(app, /view === 'subscription' && getToken\(\) && profile/);

  const endpoints = billing.match(/'\/api\/[^']+'/g);
  assert.deepEqual(endpoints, ["'/api/billing/subscription'", "'/api/billing/checkout'"]);
  for (const source of [menu, topbar, context]) {
    assert.doesNotMatch(source, /apiRequest|fetch\(|getSubscription/);
  }
});

test("subscription page reuses the Paywall with only heading copy changed", async () => {
  const [page, paywall] = await Promise.all([
    read("frontend/src/pages/SubscriptionPage.tsx"),
    read("frontend/src/components/Paywall.tsx"),
  ]);

  assert.match(page, /<Paywall title="Assine o Alyvora Premium" description=/);
  assert.match(page, /premium === 'loading'\s*\? <Surface><LoadingState/);
  assert.match(page, /premium === 'unavailable'[\s\S]*onClick=\{onRetry\}>Tentar novamente/);
  assert.match(paywall, /title = 'Continue evoluindo com a Alyvora'/);
  assert.match(paywall, /description = 'Seus 3 usos gratuitos terminaram\./);
  assert.match(paywall, /const \{ checkoutUrl \} = await startCheckout\(plan\)/);
  assert.match(paywall, /window\.location\.assign\(checkoutUrl\)/);
});

test("profile menu styles fit small screens and touch targets", async () => {
  const styles = await read("frontend/src/App.css");

  assert.match(styles, /\.profile-menu__panel \{[^}]*width: min\(18\.5rem,calc\(100vw - 2 \* var\(--space-4\)\)\)/);
  assert.match(styles, /\.profile-menu__panel \{[^}]*max-height: calc\(100dvh - 6rem\); overflow-y: auto/);
  assert.match(styles, /\.profile-menu__trigger \{[^}]*width: var\(--touch-target\); height: var\(--touch-target\)/);
  assert.match(styles, /\.profile-menu__item \{[^}]*min-height: var\(--touch-target\)/);
  assert.match(styles, /\.profile-menu__item:focus-visible \{ outline:/);
  assert.match(styles, /@media \(max-width:560px\) \{[^\n]*\.profile-menu \{ margin-left: auto; \}/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{ \.profile-menu__panel \{ animation: none; \}/);
});

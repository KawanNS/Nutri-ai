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
  assert.match(page, /cabe na sua <span className="public-hero__mark">vida\./);
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
  assert.doesNotMatch(page, /experiência conectada|Informações reunidas em um só fluxo|decisões soltas|sem promessas irreais/);
  // One legal notice, in the footer; the FAQ answers the question in its own words.
  assert.equal((page.match(/não substitui/g) ?? []).length, 1);
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
  assert.match(page, /O pagamento só acontece depois que você entra na sua conta/);
  assert.match(page, /Nada é cobrado nesta página/);

  assert.match(brand, /alyvora-logo-horizontal\.png/);
  assert.match(brand, /<img/);
  assert.match(brand, /alt="Alyvora"/);
  assert.doesNotMatch(brand, /<span[^>]*>Alyvora<\/span>|assets\/brand|nutri-ai/i);
  assert.match(metadata, /<title>Alyvora \| Sua alimentação cabe na sua vida<\/title>/);
  assert.match(metadata, /Alyvora monta seu cardápio da semana com IA/);
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

test("landing hero food is framed on purpose and its decorations stay out of the way", async () => {
  const [page, styles, decor, showcase, authLayout] = await Promise.all([
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.css", "utf8"),
    readFile("frontend/src/components/landing/LandingDecor.tsx", "utf8"),
    readFile("frontend/src/components/landing/PhoneShowcase.tsx", "utf8"),
    readFile("frontend/src/components/AuthLayout.tsx", "utf8"),
  ]);

  // The tomato asset is pre-cropped: its left crop sits on the viewport edge and the bottom fades out.
  assert.match(styles, /\.public-hero-food__crop--tomato \{[^}]*left: 0;[^}]*mask-image: linear-gradient\(to top, transparent 4%, #000 46%\)/);
  assert.doesNotMatch(styles, /\.public-hero-food__crop--tomato \{[^}]*rotate/);
  // The avocado is a whole cut-out and must never be pushed past the right edge.
  assert.match(styles, /\.public-hero-food__crop--avocado \{[^}]*right: clamp\(1rem, 2\.5vw, 2\.5rem\)/);
  assert.doesNotMatch(styles, /\.public-hero-food__crop--avocado \{[^}]*right: (clamp\()?-/);
  assert.match(styles, /\.public-hero-food \{[^}]*overflow-x: clip;[^}]*overflow-y: visible/);
  assert.match(styles, /overflow-x: clip/);

  // Above-the-fold images load eagerly, in WebP, with intrinsic sizes to avoid layout shifts.
  for (const asset of ["tomato", "avocado"]) {
    assert.match(page, new RegExp(`import ${asset}Decor from '\.\./assets/landing/${asset}\.webp'`));
  }
  assert.match(page, /src=\{tomatoDecor\} alt="" width=\{1200\} height=\{800\} loading="eager"/);
  assert.match(page, /src=\{avocadoDecor\} alt="" width=\{1200\} height=\{879\} loading="eager"/);
  assert.match(showcase, /differentials-food-photo\.webp/);
  assert.doesNotMatch(showcase, /loading="lazy"/);
  assert.doesNotMatch(page, /Folhas Verdes|\.png'/);
  // Login and registration share the same WebP photo; only the import changed there.
  assert.match(authLayout, /import mealPhoto from '\.\.\/assets\/landing\/differentials-food-photo\.webp'/);

  // Hand-drawn SVG decorations: hidden from assistive tech, inert to pointers, calm under reduced motion.
  assert.equal((decor.match(/aria-hidden="true" focusable="false"/g) ?? []).length, (decor.match(/<svg /g) ?? []).length);
  assert.doesNotMatch(decor, /<image|href=|xlink/);
  assert.match(page, /<div className="public-hero-food" aria-hidden="true">/);
  assert.match(styles, /\.landing-decor \{[^}]*pointer-events: none/);
  assert.match(styles, /@keyframes landing-decor-float \{[\s\S]*?50% \{ transform: translate3d\(0, -6px, 0\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.landing-decor \{ animation: none !important; \}/);
});

test("landing WebP assets keep transparency where the design needs it", async () => {
  const header = async (name) => {
    const bytes = await readFile(`frontend/src/assets/landing/${name}`);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", name);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", name);
    return { chunk: bytes.toString("ascii", 12, 16), flags: bytes[20] };
  };

  for (const name of ["tomato.webp", "avocado.webp"]) {
    const { chunk, flags } = await header(name);
    assert.equal(chunk, "VP8X", name);
    assert.equal(Boolean(flags & 0x10), true, `${name} keeps its alpha channel`);
  }
  await header("differentials-food-photo.webp");
});

test("landing scroll entrance follows the agreed timing and only touches the agreed elements", async () => {
  const [page, styles, hook] = await Promise.all([
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.css", "utf8"),
    readFile("frontend/src/components/landing/useRevealOnScroll.ts", "utf8"),
  ]);

  // Observer: ~15% visible, slightly before the bottom edge, once per element.
  assert.match(hook, /threshold: 0\.15, rootMargin: '0px 0px -10% 0px'/);
  assert.match(hook, /observer\.unobserve\(entry\.target\)/);
  assert.match(hook, /if \(!root \|\| !\('IntersectionObserver' in window\)\) return/);
  assert.match(hook, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) return/);
  assert.match(hook, /root\.classList\.add\('reveal-ready'\)/);
  // Stagger: 80ms per sibling, capped at the 4th card (240ms), then none.
  assert.match(hook, /REVEAL_STEP_MS = 80/);
  assert.match(hook, /REVEAL_MAX_STAGGERED = 3/);
  assert.match(hook, /index <= REVEAL_MAX_STAGGERED \? index \* REVEAL_STEP_MS : 0/);

  // Motion: 28px rise with a fade, 650ms on the agreed curve; hidden only once the hook is active.
  assert.match(styles, /\.reveal-ready \[data-reveal\] \{ opacity: 0; transform: translate3d\(0, 28px, 0\); transition: opacity 650ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\) var\(--reveal-delay, 0ms\), transform 650ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\) var\(--reveal-delay, 0ms\); \}/);
  assert.match(styles, /\.reveal-ready \[data-reveal\]\.is-revealed \{ opacity: 1; transform: none; \}/);
  assert.doesNotMatch(styles, /^\[data-reveal\]/m);

  // What animates: 6 heading blocks, 4 feature cards (one mapped element), 3 steps, the sample day and
  // its shopping list, 4 demo cards, 4 benefit items and the final CTA.
  assert.equal((page.match(/data-reveal/g) ?? []).length, 21);
  for (const heading of ["Funcionalidades", "Como funciona", "Um dia de exemplo", "Veja na prática", "Feito para a vida real", "Planos"]) {
    assert.match(page, new RegExp(`data-reveal[^>]*><(DecorLemon[^>]*/><DecorSeeds[^>]*/><)?p className="public-eyebrow">${heading}</p><h2`), heading);
  }
  assert.match(page, /<section className="public-final-cta" aria-labelledby="public-final-title" data-reveal>/);
  // What never animates: the hero, loose paragraphs, plan cards (prices and buttons), FAQ, per-word effects.
  assert.doesNotMatch(page, /<p[^>]*data-reveal/);
  assert.doesNotMatch(page, /<Button[^>]*data-reveal/);
  assert.doesNotMatch(page, /<article className="public-plan"[^>]*data-reveal/);
  assert.doesNotMatch(page, /className="public-hero[^"]*"[^>]*data-reveal/);
  assert.doesNotMatch(page.slice(page.indexOf("function Faq"), page.indexOf("function HeroFoodDecor")), /data-reveal/);
  assert.doesNotMatch(page, /split\(['"] ['"]\)|split\(['"]['"]\)/);
});

test("landing micro-interactions stay subtle, transform/opacity only, and calm under reduced motion", async () => {
  const [page, styles, decor] = await Promise.all([
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.css", "utf8"),
    readFile("frontend/src/components/landing/LandingDecor.tsx", "utf8"),
  ]);

  // Every transition in the landing stylesheet animates only opacity, transform or translate.
  for (const [, value] of styles.matchAll(/transition: ([^;}]+)/g)) {
    if (/^none/.test(value)) continue;
    for (const part of value.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /^(opacity|transform|translate) /, part);
    }
  }
  const float = styles.match(/@keyframes landing-decor-float \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(float.replace(/transform:/g, ""), /[a-z-]+:/);

  // Feature cards: 4px lift in 250ms and a shadow that only fades, on hover-capable devices.
  assert.match(styles, /@media \(hover: hover\) \{\n  \.public-feature:hover \{ translate: 0 -4px; \}\n  \.public-feature:hover::after \{ opacity: 1; \}/);
  assert.match(styles, /\.public-feature \{ position: relative; isolation: isolate; min-height: 24rem; transition: translate 250ms/);
  assert.match(styles, /\.public-feature::after \{[^}]*box-shadow: var\(--shadow-raised\); opacity: 0;[^}]*transition: opacity 250ms/);
  assert.doesNotMatch(styles, /\.public-feature \{[^}]*overflow: hidden/);

  // Reduced motion switches every one of them off.
  const reduced = styles.slice(styles.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const rule of [
    /\.landing-decor \{ animation: none !important; \}/,
    /\.reveal-ready \[data-reveal\] \{ opacity: 1; transform: none; transition: none; \}/,
    /\.public-feature,\.public-feature::after,\.public-feature__icon::before,\.landing-cta-button__arrow,\.landing-cta-button::after \{ transition: none !important; \}/,
    /\.public-feature:hover \{ translate: none; \}/,
  ]) assert.match(reduced, rule);

  // Organic edges and ornaments: own SVGs, hidden from assistive tech, inert to pointers.
  const svgCount = (decor.match(/<svg /g) ?? []).length;
  assert.equal(svgCount, 7);
  assert.equal((decor.match(/aria-hidden="true" focusable="false"/g) ?? []).length, svgCount);
  assert.doesNotMatch(decor, /<image|href=|xlink|<script/);
  assert.match(styles, /\.landing-wave \{[^}]*pointer-events: none/);
  assert.match(styles, /\.landing-decor \{[^}]*pointer-events: none/);
  assert.equal((page.match(/<DecorWave /g) ?? []).length, 4);
  assert.match(page, /<span className="public-how__number" aria-hidden="true">01<\/span>/);
  assert.match(page, /<DecorStem className="public-how__stem"\/>/);
  // Both dark-section calls to action share the light-green button; the arrow is decorative.
  assert.match(page, /<Button className="landing-cta-button" onClick=\{onStart\}>Quero começar <span className="landing-cta-button__arrow" aria-hidden="true">→<\/span><\/Button>/);
  assert.match(page, /<Button className="landing-cta-button" onClick=\{onStart\}>Começar agora <span className="landing-cta-button__arrow" aria-hidden="true">→<\/span><\/Button>/);
  assert.match(styles, /\.landing-cta-button\.ui-button \{[^}]*color: var\(--green-dark\); background: var\(--brand-green-light\)/);
  // The top-right CTA leaf stays whole inside the card, and the footer shares the paper grain.
  assert.match(styles, /\.public-final-cta__leaf--right \{[^}]*top: clamp\(1rem, 2vw, 1\.75rem\)/);
  assert.match(styles, /\.public-footer \{[^}]*background: var\(--landing-grain\)/);
});

test("landing anchor navigation never lands on hidden content and honors a hash on first load", async () => {
  const [page, hook, html] = await Promise.all([
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/components/landing/useRevealOnScroll.ts", "utf8"),
    readFile("frontend/index.html", "utf8"),
  ]);

  // After mount and after every jump, whatever is on screen or above it is revealed right away.
  assert.match(hook, /querySelectorAll\('\[data-reveal\]:not\(\.is-revealed\)'\)/);
  assert.match(hook, /if \(target\.getBoundingClientRect\(\)\.top >= window\.innerHeight\) return/);
  assert.match(hook, /frame = requestAnimationFrame\(/);
  assert.match(hook, /revealReachedContent\(\)\n\s*window\.addEventListener\('hashchange', revealReachedContent\)/);
  assert.match(hook, /closest\('a\[href\^="#"\]'\)\) revealReachedContent\(\)/);
  assert.match(hook, /root\.addEventListener\('click', handleAnchorClick\)/);
  // Everything registered is cleaned up.
  assert.match(hook, /cancelAnimationFrame\(frame\)\n\s*window\.removeEventListener\('hashchange', revealReachedContent\)\n\s*root\.removeEventListener\('click', handleAnchorClick\)/);
  // The scroll entrance itself keeps the agreed observer settings.
  assert.match(hook, /threshold: 0\.15, rootMargin: '0px 0px -10% 0px'/);

  // A shared link such as /#planos scrolls to its section once React has rendered it.
  assert.match(page, /try \{ id = decodeURIComponent\(window\.location\.hash\.slice\(1\)\) \} catch \{ return \}/);
  assert.match(page, /if \(id\) document\.getElementById\(id\)\?\.scrollIntoView\(\)/);
  assert.match(page, /const revealRoot = useRevealOnScroll<HTMLDivElement>\(\)\n[^\n]*\n\s*useEffect\(scrollToHashSection, \[\]\)/);
  for (const id of ["funcionalidades", "como-funciona", "planos", "faq"]) {
    assert.match(page, new RegExp(`id="${id}"`), id);
    assert.match(page, new RegExp(`'#${id}'`), `menu link #${id}`);
  }

  // Install-to-home-screen metas: the standard one plus Apple's, still needed on iOS.
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
});

test("landing shows a sample day that is labelled as an example and adds up", async () => {
  const [page, styles, showcase] = await Promise.all([
    readFile("frontend/src/pages/LandingPage.tsx", "utf8"),
    readFile("frontend/src/pages/LandingPage.css", "utf8"),
    readFile("frontend/src/components/landing/PhoneShowcase.tsx", "utf8"),
  ]);

  // Clearly an example, never presented as a user's result.
  assert.match(page, /<small>Exemplo<\/small>/);
  assert.match(page, /Este é só um exemplo/);
  assert.match(showcase, /cardápio de exemplo/);
  // The day's numbers add up: meals to the daily total, the daily cost to the weekly estimate.
  const kcal = [...page.matchAll(/kcal: (\d+) \}/g)].map((match) => Number(match[1]));
  assert.deepEqual(kcal, [380, 650, 280, 640]);
  assert.equal(kcal.reduce((total, value) => total + value, 0), 1950);
  assert.match(page, /<strong>1\.950<\/strong> kcal no dia/);
  assert.match(page, /<strong>R\$ 31<\/strong> no dia/);
  assert.match(page, /Estimativa da semana: <strong>R\$ 217<\/strong>/);
  // Checked items are announced, not only drawn.
  assert.match(page, /\{done && <span className="ui-visually-hidden"> \(já comprado\)<\/span>\}/);

  // Inside a revealed card things build up in sequence, only under the reveal hook and only with
  // transform/opacity, and all of it is switched off for reduced motion.
  for (const hidden of [
    /\.reveal-ready \.public-sample__day:not\(\.is-revealed\) li \{ opacity: 0; transform: translate3d\(-16px, 0, 0\); \}/,
    /\.reveal-ready \.public-sample__list:not\(\.is-revealed\) \.is-done \.public-sample__item::after \{ transform: scaleX\(0\); \}/,
    /\.reveal-ready \.public-feature:not\(\.is-revealed\) \.public-feature__chart i,\.reveal-ready \.public-demo__grid > article:not\(\.is-revealed\) \.public-demo__screen--evolution i \{ transform: scaleY\(0\); \}/,
  ]) assert.match(styles, hidden);
  const reduced = styles.slice(styles.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.public-hero__underline,\.public-showcase__tag \{ animation: none !important; \}/);
  assert.match(reduced, /\.public-sample__day li,[^{]*\.public-feature__chart i,[^{]*\.public-demo__screen--evolution i \{ transition: none !important; \}/);
  // The underline is decoration.
  assert.match(page, /className="public-hero__underline"[^>]*aria-hidden="true" focusable="false"/);
});

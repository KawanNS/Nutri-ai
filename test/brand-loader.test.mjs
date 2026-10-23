import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("loading screens draw the Alyvora A piece by piece", async () => {
  const [loader, css, preview, app, main] = await Promise.all([
    readFile("frontend/src/components/AlyvoraLoader.tsx", "utf8"),
    readFile("frontend/src/components/AlyvoraLoader.css", "utf8"),
    readFile("frontend/src/pages/PlanPreviewPage.tsx", "utf8"),
    readFile("frontend/src/App.tsx", "utf8"),
    readFile("frontend/src/main.tsx", "utf8"),
  ]);
  // Three pieces grow in turn. No SVG masks: Safari does not animate inside them, so the A stayed invisible on iPhone.
  assert.doesNotMatch(loader, /<mask /);
  for (const piece of [1, 2, 3]) {
    assert.match(loader, new RegExp(`alyvora-loader__piece--${piece}`));
    assert.match(css, new RegExp(`@keyframes alyvora-piece-${piece} `));
    // The name travels with the duration: a nameless shared shorthand was minified to `animation: none`.
    assert.match(css, new RegExp(`\\.alyvora-loader__piece--${piece} \\{[^}]*animation: alyvora-piece-${piece} 2\\.6s `));
  }
  assert.match(css, /\.alyvora-loader__piece \{ transform-box: fill-box; opacity: 0; \}/);
  assert.match(css, /\.alyvora-loader__piece \{ transform-box: fill-box;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s+\.alyvora-loader__piece \{ opacity: 1; animation: none; \}/);
  assert.match(preview, /<AlyvoraLoader size=\{88\}\/>/);
  assert.match(app, /<AlyvoraLoader size=\{64\} label="Carregando perfil"\/>/);
  assert.match(main, /<AlyvoraLoader size=\{64\} label="Carregando"\/>/);
});

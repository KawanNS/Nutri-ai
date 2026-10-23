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
  // Three pieces (left leaf, right leaf, swoosh), each revealed by its own traced mask.
  assert.equal((loader.match(/<mask /g) ?? []).length, 3);
  for (const piece of [1, 2, 3]) assert.match(css, new RegExp(`@keyframes alyvora-trace-${piece} `));
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*stroke-dashoffset: 0;/);
  assert.match(preview, /<AlyvoraLoader size=\{88\}\/>/);
  assert.match(app, /<AlyvoraLoader size=\{64\} label="Carregando perfil"\/>/);
  assert.match(main, /<AlyvoraLoader size=\{64\} label="Carregando"\/>/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a new deploy replaces the installed app right away, images included", async () => {
  const [config, main] = await Promise.all([
    readFile("frontend/vite.config.ts", "utf8"),
    readFile("frontend/src/main.tsx", "utf8"),
  ]);
  assert.match(config, /registerType: 'autoUpdate'/);
  assert.match(config, /injectRegister: false/);
  for (const flag of ["skipWaiting: true", "clientsClaim: true", "cleanupOutdatedCaches: true"]) assert.ok(config.includes(flag), flag);
  assert.ok(config.includes("globPatterns: ['**/*.{js,css,html,ico}', 'assets/**/*.{webp,png,svg}']"));
  assert.match(main, /import \{ registerSW \} from 'virtual:pwa-register'/);
  assert.match(main, /registerSW\(\{\s+immediate: true,/);
  assert.match(main, /registration\.update\(\)/);
});

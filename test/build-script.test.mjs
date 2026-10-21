import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("a clean checkout builds: the Prisma client is generated before TypeScript compiles", async () => {
  const [pkg, gitignore, schema] = await Promise.all([
    readFile("package.json", "utf8").then(JSON.parse),
    readFile(".gitignore", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
  ]);
  // The generated client is not committed, and nothing else creates it on install, so a deploy
  // (Railway runs `npm run build` on a fresh clone) failed with "Cannot find module
  // '../generated/prisma/client.js'" until the build generated it first.
  assert.match(schema, /output\s+=\s+"\.\.\/src\/generated\/prisma"/);
  assert.match(gitignore, /^\/src\/generated\/prisma$/m);
  assert.equal(pkg.scripts.build, "prisma generate && tsc");
  assert.ok(pkg.devDependencies.prisma || pkg.dependencies.prisma, "the prisma CLI is installed for the build");
});

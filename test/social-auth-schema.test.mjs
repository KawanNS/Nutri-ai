import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import bcrypt from "bcrypt";

import { passwordMatches } from "../dist/services/auth.service.js";

const migrationPath = "prisma/migrations/20261005120000_add_social_auth_identity/migration.sql";

test("local password matching remains compatible with bcrypt hashes", async () => {
  const hash = await bcrypt.hash("local-password", 4);

  assert.equal(await passwordMatches("local-password", hash), true);
  assert.equal(await passwordMatches("wrong-password", hash), false);
});

test("social users fail password matching without calling bcrypt", async () => {
  let compareCalls = 0;
  const matches = await passwordMatches("irrelevant", null, async () => {
    compareCalls += 1;
    return true;
  });

  assert.equal(matches, false);
  assert.equal(compareCalls, 0);
});

test("password login keeps one generic invalid-credentials response", async () => {
  const source = await readFile("src/services/auth.service.ts", "utf8");

  assert.match(source, /!user \|\| !\(await passwordMatches\(input\.password, user\.passwordHash\)\)/);
  assert.match(source, /throw new AuthError\(401, "Invalid email or password"\)/);
  assert.doesNotMatch(source, /social account|social login|Google account/i);
});

test("local registration still requires and persists a bcrypt password hash", async () => {
  const [schema, source] = await Promise.all([
    readFile("src/schemas/auth.schema.ts", "utf8"),
    readFile("src/services/auth.service.ts", "utf8"),
  ]);

  assert.match(schema, /password,/);
  assert.match(source, /bcrypt\.hash\(input\.password, PASSWORD_SALT_ROUNDS\)/);
  assert.match(source, /data:\s*\{[\s\S]*passwordHash,[\s\S]*usageControl:/);
});

test("Prisma schema defines the minimal reusable social identity model", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");

  assert.match(schema, /enum AuthProvider \{\s*GOOGLE\s*APPLE\s*\}/);
  assert.match(schema, /passwordHash\s+String\?/);
  assert.match(schema, /authIdentities\s+AuthIdentity\[\]/);
  assert.match(schema, /model AuthIdentity \{[\s\S]*providerSubject\s+String\s+@db\.VarChar\(255\)/);
  assert.match(schema, /@@unique\(\[provider, providerSubject\]\)/);
  assert.match(schema, /@@unique\(\[userId, provider\]\)/);
  assert.match(schema, /@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
});

test("social auth migration is additive and preserves existing users and hashes", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /CREATE TYPE "AuthProvider" AS ENUM \('GOOGLE', 'APPLE'\)/);
  assert.match(migration, /ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL/);
  assert.match(migration, /CREATE TABLE "AuthIdentity"/);
  assert.match(migration, /UNIQUE INDEX "AuthIdentity_provider_providerSubject_key"[\s\S]*\("provider", "providerSubject"\)/);
  assert.match(migration, /UNIQUE INDEX "AuthIdentity_userId_provider_key"[\s\S]*\("userId", "provider"\)/);
  assert.match(migration, /FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\)[\s\S]*ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE "User"|SET "passwordHash"/i);
});

test("current session contract and auth me route remain unchanged", async () => {
  const [authService, authMiddleware, authRoutes] = await Promise.all([
    readFile("src/services/auth.service.ts", "utf8"),
    readFile("src/middlewares/auth.middleware.ts", "utf8"),
    readFile("src/routes/auth.routes.ts", "utf8"),
  ]);

  assert.match(authService, /jwt\.sign\(\{ sub: user\.id \}, env\.jwtSecret/);
  assert.match(authMiddleware, /jwt\.verify\(token, env\.jwtSecret\)/);
  assert.match(authRoutes, /authRouter\.get\("\/me", authenticate, currentUserController\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import jwt from "jsonwebtoken";

import { loginWithGoogle } from "../dist/services/auth.service.js";
import {
  GoogleCredentialError,
  validateGooglePayload,
  verifyGoogleCredential,
} from "../dist/services/google-auth.service.js";
import { prisma } from "../dist/lib/prisma.js";

const validPayload = {
  iss: "https://accounts.google.com",
  aud: "expected-client-id",
  sub: "google-subject-123",
  email: " Person@Example.com ",
  email_verified: true,
  exp: 2_000,
  iat: 1_000,
};

const publicUser = {
  id: "9a2a2715-a4cb-4334-bf3e-ec0c1a849792",
  name: "Pessoa",
  email: "person@example.com",
  status: "ACTIVE",
  role: "USER",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

async function withPrismaStubs(stubs, run) {
  const originals = {
    identityFindUnique: prisma.authIdentity.findUnique,
    userFindUnique: prisma.user.findUnique,
    transaction: prisma.$transaction,
  };
  prisma.authIdentity.findUnique = stubs.identityFindUnique ?? originals.identityFindUnique;
  prisma.user.findUnique = stubs.userFindUnique ?? originals.userFindUnique;
  prisma.$transaction = stubs.transaction ?? originals.transaction;
  try { return await run(); }
  finally {
    prisma.authIdentity.findUnique = originals.identityFindUnique;
    prisma.user.findUnique = originals.userFindUnique;
    prisma.$transaction = originals.transaction;
  }
}

test("invalid Google credentials are rejected without decoding them locally", async () => {
  const rejectingClient = { verifyIdToken: async () => { throw new Error("bad signature"); } };
  await assert.rejects(
    verifyGoogleCredential("invalid-token", rejectingClient, "expected-client-id"),
    (error) => error instanceof GoogleCredentialError && error.reason === "INVALID",
  );
});

test("Google payload rejects an incorrect audience", () => {
  assert.throws(
    () => validateGooglePayload({ ...validPayload, aud: "another-client" }, "expected-client-id", 1_500),
    (error) => error instanceof GoogleCredentialError && error.reason === "INVALID",
  );
});

test("Google payload requires a verified email", () => {
  assert.throws(
    () => validateGooglePayload({ ...validPayload, email_verified: false }, "expected-client-id", 1_500),
    (error) => error instanceof GoogleCredentialError && error.reason === "EMAIL_NOT_VERIFIED",
  );
});

test("verified Google identity uses sub as its subject and normalizes token email", () => {
  const identity = validateGooglePayload(validPayload, "expected-client-id", 1_500);
  assert.equal(identity.subject, "google-subject-123");
  assert.equal(identity.email, "person@example.com");
  assert.notEqual(identity.subject, identity.email);
});

test("existing Google identity logs into its associated user with the current JWT contract", async () => {
  let emailLookups = 0;
  const response = await withPrismaStubs({
    identityFindUnique: async (query) => {
      assert.deepEqual(query.where.provider_providerSubject, { provider: "GOOGLE", providerSubject: "google-subject-123" });
      return { user: publicUser };
    },
    userFindUnique: async () => { emailLookups += 1; return null; },
  }, () => loginWithGoogle("credential", async () => ({
    subject: "google-subject-123",
    email: "person@example.com",
    name: "Pessoa",
  })));

  assert.equal(emailLookups, 0);
  assert.equal(response.expiresIn, "1h");
  assert.equal(response.user.id, publicUser.id);
  assert.equal(jwt.decode(response.token).sub, publicUser.id);
});

test("new Google user is created transactionally with UsageControl and sub identity", async () => {
  let createData;
  const response = await withPrismaStubs({
    identityFindUnique: async () => null,
    userFindUnique: async () => null,
    transaction: async (callback) => callback({
      authIdentity: { findUnique: async () => null },
      user: {
        findUnique: async () => null,
        create: async ({ data }) => { createData = data; return publicUser; },
      },
    }),
  }, () => loginWithGoogle("credential", async () => ({
    subject: "google-subject-123",
    email: "person@example.com",
    name: "Pessoa",
  })));

  assert.equal(createData.passwordHash, null);
  assert.deepEqual(createData.usageControl, { create: {} });
  assert.deepEqual(createData.authIdentities.create, { provider: "GOOGLE", providerSubject: "google-subject-123" });
  assert.notEqual(createData.authIdentities.create.providerSubject, createData.email);
  assert.equal(jwt.decode(response.token).sub, publicUser.id);
});

test("existing local email returns a safe conflict and never starts account linking", async () => {
  let transactionCalls = 0;
  await assert.rejects(
    withPrismaStubs({
      identityFindUnique: async () => null,
      userFindUnique: async () => ({ id: publicUser.id }),
      transaction: async () => { transactionCalls += 1; throw new Error("must not run"); },
    }, () => loginWithGoogle("credential", async () => ({
      subject: "another-google-subject",
      email: "person@example.com",
      name: "Pessoa",
    }))),
    (error) => error.statusCode === 409 && error.code === "LOCAL_ACCOUNT_EXISTS",
  );
  assert.equal(transactionCalls, 0);
});

test("backend Google flow is transactional, creates required records, and never auto-links by email", async () => {
  const [service, routes, schema] = await Promise.all([
    readFile("src/services/auth.service.ts", "utf8"),
    readFile("src/routes/auth.routes.ts", "utf8"),
    readFile("src/schemas/auth.schema.ts", "utf8"),
  ]);

  assert.match(routes, /post\("\/google", googleLoginController\)/);
  assert.match(schema, /googleLoginBodySchema[\s\S]*credential:/);
  assert.match(service, /providerSubject: identity\.subject/);
  assert.doesNotMatch(service, /providerSubject: identity\.email/);
  assert.match(service, /prisma\.\$transaction/);
  assert.match(service, /passwordHash: null/);
  assert.match(service, /usageControl: \{ create: \{\} \}/);
  assert.match(service, /authIdentities:[\s\S]*provider: "GOOGLE"/);
  assert.match(service, /if \(existingIdentity\) return createSession\(existingIdentity\.user\)/);
  assert.match(service, /if \(existingEmail\)[\s\S]*LOCAL_ACCOUNT_EXISTS/);
  assert.match(service, /jwt\.sign\(\{ sub: user\.id \}, env\.jwtSecret/);
  assert.equal((service.match(/return createSession\(/g) ?? []).length >= 4, true);
});

test("frontend uses GIS credential only and preserves the Alyvora session mechanism", async () => {
  const [button, service, loginPage, registerPage, token] = await Promise.all([
    readFile("frontend/src/components/auth/GoogleSignInButton.tsx", "utf8"),
    readFile("frontend/src/services/authService.ts", "utf8"),
    readFile("frontend/src/pages/LoginPage.tsx", "utf8"),
    readFile("frontend/src/pages/RegisterPage.tsx", "utf8"),
    readFile("frontend/src/services/authToken.ts", "utf8"),
  ]);

  assert.match(button, /import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/);
  assert.match(button, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(button, /ux_mode: 'popup'/);
  assert.match(button, /Continuar com Google/);
  assert.match(service, /'\/auth\/google'[\s\S]*JSON\.stringify\(\{ credential \}\)/);
  assert.match(loginPage + registerPage, /saveToken\(response\.token\)/);
  assert.match(loginPage + registerPage, /onAuthenticated\(response\.user\.role\)/);
  assert.match(token, /nutri_ai_token/);
  assert.doesNotMatch(button + service + loginPage + registerPage, /CLIENT_SECRET|client_secret|access_token/i);
});

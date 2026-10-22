import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import jwt from "jsonwebtoken";

import { googleCodeLoginController } from "../dist/controllers/auth.controller.js";
import { loginWithGoogle, loginWithGoogleCode } from "../dist/services/auth.service.js";
import {
  GoogleCredentialError,
  classifyGoogleCodeExchangeFailure,
  classifyGoogleVerificationFailure,
  validateGooglePayload,
  verifyGoogleAuthorizationCode,
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
    (error) => error instanceof GoogleCredentialError && error.reason === "AUDIENCE_MISMATCH",
  );
});

test("Google verifier classifies audience, expiry, issuer, and network failures without logging token data", () => {
  assert.equal(classifyGoogleVerificationFailure(new Error("Wrong recipient, payload audience != requiredAudience")), "AUDIENCE_MISMATCH");
  assert.equal(classifyGoogleVerificationFailure(new Error("Token used too late, 1 > 2")), "EXPIRED");
  assert.equal(classifyGoogleVerificationFailure(new Error("Invalid issuer, expected one of [accounts.google.com]")), "ISSUER_MISMATCH");
  assert.equal(classifyGoogleVerificationFailure(Object.assign(new Error("request failed"), { code: "ETIMEDOUT" })), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyGoogleVerificationFailure(Object.assign(new Error("upstream failed"), { response: { status: 503 } })), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyGoogleVerificationFailure(new Error("Invalid token signature")), "INVALID");
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
  assert.equal(response.expiresIn, "7d");
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

test("Google audience mismatch has a distinct safe response and sanitized log", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values);
  try {
    await assert.rejects(
      loginWithGoogle("must-not-appear-in-log", async () => { throw new GoogleCredentialError("AUDIENCE_MISMATCH"); }),
      (error) => error.statusCode === 401 && error.code === "GOOGLE_AUDIENCE_MISMATCH",
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [["[auth.google] credential rejected", { reason: "AUDIENCE_MISMATCH" }]]);
  assert.doesNotMatch(JSON.stringify(warnings), /must-not-appear-in-log|person@example\.com/);
});

test("unexpected verifier failures are not mislabeled as invalid user credentials", async () => {
  await assert.rejects(
    loginWithGoogle("credential", async () => { throw new Error("unexpected configuration failure"); }),
    /unexpected configuration failure/,
  );
});

test("backend Google flow is transactional, creates required records, and never auto-links by email", async () => {
  const [service, routes, schema] = await Promise.all([
    readFile("src/services/auth.service.ts", "utf8"),
    readFile("src/routes/auth.routes.ts", "utf8"),
    readFile("src/schemas/auth.schema.ts", "utf8"),
  ]);

  assert.match(routes, /post\("\/google", googleLoginController\)/);
  assert.match(routes, /post\("\/google\/code", googleCodeLoginController\)/);
  assert.match(routes, /authRouter\.use\(authRateLimit\)/);
  assert.match(schema, /googleLoginBodySchema[\s\S]*credential:/);
  assert.match(schema, /googleCodeLoginBodySchema[\s\S]*code: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2_048\)[\s\S]*\.strict\(\)/);
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

test("frontend uses a custom GIS code-client button and preserves the Alyvora session mechanism", async () => {
  const [button, styles, service, loginPage, registerPage, token] = await Promise.all([
    readFile("frontend/src/components/auth/GoogleSignInButton.tsx", "utf8"),
    readFile("frontend/src/components/AuthLayout.css", "utf8"),
    readFile("frontend/src/services/authService.ts", "utf8"),
    readFile("frontend/src/pages/LoginPage.tsx", "utf8"),
    readFile("frontend/src/pages/RegisterPage.tsx", "utf8"),
    readFile("frontend/src/services/authToken.ts", "utf8"),
  ]);

  assert.match(button, /import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/);
  assert.match(button, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(button, /oauth2\.initCodeClient\(/);
  assert.match(button, /ux_mode: 'popup'/);
  assert.match(button, /scope: GOOGLE_SCOPES/);
  assert.match(button, /'openid email profile'/);
  assert.match(button, /select_account: true/);
  assert.match(button, /crypto\.getRandomValues/);
  assert.match(button, /state !== expectedState/);
  assert.match(button, /client\.requestCode\(\)/);
  assert.match(button, /popup_failed_to_open/);
  assert.doesNotMatch(button, /accounts\.id\b|renderButton|initialize\(|replaceChildren|innerHTML|Continuar como/);
  assert.match(button, /<button className="google-sign-in" type="button"/);
  assert.match(button, /Continuar com Google/);
  for (const color of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) assert.match(button, new RegExp(color));
  assert.doesNotMatch(button, /Apple/);

  assert.match(styles, /\.google-sign-in \{[\s\S]*width: min\(100%, var\(--auth-control-width\)\)/);
  assert.match(styles, /\.google-sign-in \{[\s\S]*min-height: 3\.25rem/);
  assert.match(styles, /\.auth-shell__form input \{[\s\S]*min-height: 3\.25rem/);
  assert.match(styles, /\.google-sign-in \{[\s\S]*border: 1px solid #747775[\s\S]*border-radius: var\(--radius-md\)[\s\S]*color: #1f1f1f[\s\S]*background: #fff/);
  assert.match(styles, /\.google-sign-in:focus-visible/);
  assert.match(styles, /\.google-sign-in:disabled/);
  assert.doesNotMatch(styles, /social-sign-in|google-sign-in__fallback/);

  assert.match(service, /'\/auth\/google\/code'[\s\S]*JSON\.stringify\(\{ code \}\)/);
  assert.match(loginPage + registerPage, /loginWithGoogleCode\(code\)/);
  assert.match(loginPage + registerPage, /onCode=\{\(code\) => void handleGoogleCode\(code\)\}/);
  assert.match(loginPage + registerPage, /saveToken\(response\.token\)/);
  assert.match(loginPage + registerPage, /onAuthenticated\(response\.user\.role\)/);
  assert.match(token, /nutri_ai_token/);
  for (const code of ["GOOGLE_AUDIENCE_MISMATCH", "GOOGLE_UNAVAILABLE", "GOOGLE_CODE_INVALID", "GOOGLE_CODE_FLOW_UNAVAILABLE"]) {
    assert.match(loginPage, new RegExp(code));
    assert.match(registerPage, new RegExp(code));
  }
  assert.doesNotMatch(button + service + loginPage + registerPage, /CLIENT_SECRET|client_secret|access_token|refresh_token/i);
});

test("backend normalizes the Google client ID before audience validation", async () => {
  const config = await readFile("src/config/env.ts", "utf8");
  assert.match(config, /requireEnvironmentVariable\("GOOGLE_CLIENT_ID"\)\.trim\(\)/);
});

const futurePayload = () => ({ ...validPayload, exp: Math.floor(Date.now() / 1000) + 600 });
const ticketFor = (payload) => ({ getPayload: () => payload });

test("authorization code is exchanged with the backend secret and only the ID token is verified", async () => {
  const exchanged = [];
  const verified = [];
  const identity = await verifyGoogleAuthorizationCode(
    "auth-code",
    "expected-client-id",
    "backend-secret",
    { getToken: async (code) => { exchanged.push(code); return { tokens: { id_token: "id-token", access_token: "discarded" } }; } },
    { verifyIdToken: async (options) => { verified.push(options); return ticketFor(futurePayload()); } },
  );

  assert.deepEqual(exchanged, ["auth-code"]);
  assert.deepEqual(verified, [{ idToken: "id-token", audience: "expected-client-id" }]);
  assert.equal(identity.subject, "google-subject-123");
  assert.equal(identity.email, "person@example.com");
});

test("code flow is unavailable without GOOGLE_CLIENT_SECRET and never calls Google", async () => {
  let exchanges = 0;
  await assert.rejects(
    verifyGoogleAuthorizationCode("auth-code", "expected-client-id", null, {
      getToken: async () => { exchanges += 1; return { tokens: {} }; },
    }),
    (error) => error instanceof GoogleCredentialError && error.reason === "CODE_FLOW_UNAVAILABLE",
  );
  assert.equal(exchanges, 0);
});

test("code exchange failures are classified without exposing the code", async () => {
  const googleError = (status, error) => Object.assign(new Error("request failed"), { response: { status, data: { error } } });
  assert.equal(classifyGoogleCodeExchangeFailure(googleError(400, "invalid_grant")), "CODE_INVALID");
  assert.equal(classifyGoogleCodeExchangeFailure(googleError(400, "invalid_request")), "CODE_INVALID");
  assert.equal(classifyGoogleCodeExchangeFailure(googleError(401, "invalid_client")), "CODE_FLOW_UNAVAILABLE");
  assert.equal(classifyGoogleCodeExchangeFailure(googleError(400, "redirect_uri_mismatch")), "CODE_FLOW_UNAVAILABLE");
  assert.equal(classifyGoogleCodeExchangeFailure(googleError(503, "backend_error")), "PROVIDER_UNAVAILABLE");
  assert.equal(classifyGoogleCodeExchangeFailure(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), "PROVIDER_UNAVAILABLE");

  await assert.rejects(
    verifyGoogleAuthorizationCode("auth-code", "expected-client-id", "backend-secret", {
      getToken: async () => { throw googleError(400, "invalid_grant"); },
    }),
    (error) => error instanceof GoogleCredentialError && error.reason === "CODE_INVALID",
  );
});

test("code exchange without an ID token is rejected before verification", async () => {
  let verifications = 0;
  await assert.rejects(
    verifyGoogleAuthorizationCode(
      "auth-code",
      "expected-client-id",
      "backend-secret",
      { getToken: async () => ({ tokens: { access_token: "only-access" } }) },
      { verifyIdToken: async () => { verifications += 1; return ticketFor(futurePayload()); } },
    ),
    (error) => error instanceof GoogleCredentialError && error.reason === "INVALID",
  );
  assert.equal(verifications, 0);
});

test("ID tokens from the code exchange keep audience, issuer, and email verification checks", async () => {
  const exchange = { getToken: async () => ({ tokens: { id_token: "id-token" } }) };
  for (const [payload, reason] of [
    [{ ...futurePayload(), aud: "another-client" }, "AUDIENCE_MISMATCH"],
    [{ ...futurePayload(), iss: "https://evil.example" }, "ISSUER_MISMATCH"],
    [{ ...futurePayload(), email_verified: false }, "EMAIL_NOT_VERIFIED"],
  ]) {
    await assert.rejects(
      verifyGoogleAuthorizationCode("auth-code", "expected-client-id", "backend-secret", exchange, {
        verifyIdToken: async () => ticketFor(payload),
      }),
      (error) => error instanceof GoogleCredentialError && error.reason === reason,
    );
  }
});

test("code login reuses the account and JWT session flow", async () => {
  const response = await withPrismaStubs({
    identityFindUnique: async (query) => {
      assert.deepEqual(query.where.provider_providerSubject, { provider: "GOOGLE", providerSubject: "google-subject-123" });
      return { user: publicUser };
    },
  }, () => loginWithGoogleCode("auth-code", async (code) => {
    assert.equal(code, "auth-code");
    return { subject: "google-subject-123", email: "person@example.com", name: "Pessoa" };
  }));

  assert.equal(response.expiresIn, "7d");
  assert.equal(jwt.decode(response.token).sub, publicUser.id);
});

test("code login maps failures to safe codes and never logs the code", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values);
  try {
    await assert.rejects(
      loginWithGoogleCode("must-not-appear-in-log", async () => { throw new GoogleCredentialError("CODE_INVALID"); }),
      (error) => error.statusCode === 401 && error.code === "GOOGLE_CODE_INVALID",
    );
    await assert.rejects(
      loginWithGoogleCode("must-not-appear-in-log", async () => { throw new GoogleCredentialError("CODE_FLOW_UNAVAILABLE"); }),
      (error) => error.statusCode === 503 && error.code === "GOOGLE_CODE_FLOW_UNAVAILABLE",
    );
    await assert.rejects(
      loginWithGoogleCode("must-not-appear-in-log", async () => { throw new GoogleCredentialError("PROVIDER_UNAVAILABLE"); }),
      (error) => error.statusCode === 503 && error.code === "GOOGLE_UNAVAILABLE",
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 3);
  assert.doesNotMatch(JSON.stringify(warnings), /must-not-appear-in-log/);
});

function fakeResponse() {
  return {
    statusCode: 0,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("code endpoint rejects non-JSON, missing, blank, oversized, and extra-field bodies", async () => {
  const cases = [
    { is: () => false, body: { code: "auth-code" } },
    { is: () => "application/json", body: {} },
    { is: () => "application/json", body: { code: "   " } },
    { is: () => "application/json", body: { code: "x".repeat(2_049) } },
    { is: () => "application/json", body: { code: "auth-code", credential: "extra" } },
  ];
  for (const request of cases) {
    const response = fakeResponse();
    await googleCodeLoginController(request, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Invalid Google authorization code", code: "GOOGLE_CODE_INVALID" });
  }
});

test("backend reads GOOGLE_CLIENT_SECRET only on the server and uses the popup redirect URI", async () => {
  const [config, googleService, example, frontendExample] = await Promise.all([
    readFile("src/config/env.ts", "utf8"),
    readFile("src/services/google-auth.service.ts", "utf8"),
    readFile(".env.example", "utf8"),
    readFile("frontend/.env.example", "utf8"),
  ]);
  assert.match(config, /process\.env\.GOOGLE_CLIENT_SECRET\?\.trim\(\) \|\| null/);
  assert.match(googleService, /GOOGLE_POPUP_REDIRECT_URI = "postmessage"/);
  assert.match(googleService, /new OAuth2Client\(\{ clientId, clientSecret, redirectUri: GOOGLE_POPUP_REDIRECT_URI \}\)/);
  assert.match(example, /^GOOGLE_CLIENT_SECRET=$/m);
  assert.doesNotMatch(frontendExample, /SECRET/i);
});

import { OAuth2Client, type LoginTicket, type TokenPayload } from "google-auth-library";

import { env } from "../config/env.js";

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const googleClient = new OAuth2Client();

export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string;
}

export class GoogleCredentialError extends Error {
  constructor(
    public readonly reason:
      | "INVALID"
      | "EMAIL_NOT_VERIFIED"
      | "AUDIENCE_MISMATCH"
      | "EXPIRED"
      | "ISSUER_MISMATCH"
      | "PROVIDER_UNAVAILABLE"
      | "CODE_INVALID"
      | "CODE_FLOW_UNAVAILABLE",
  ) {
    super("Google credential validation failed");
  }
}

export interface GoogleTokenClient {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<LoginTicket>;
}

export interface GoogleCodeExchangeClient {
  getToken(code: string): Promise<{ tokens: { id_token?: string | null } }>;
}

// Popup-mode authorization codes are issued for the special "postmessage" redirect URI.
const GOOGLE_POPUP_REDIRECT_URI = "postmessage";
const GOOGLE_CLIENT_CONFIGURATION_ERRORS = new Set(["invalid_client", "unauthorized_client", "redirect_uri_mismatch"]);

export function classifyGoogleVerificationFailure(error: unknown): GoogleCredentialError["reason"] {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;
    if (typeof response === "object" && response !== null && "status" in response) {
      const status = Number(response.status);
      if (status === 429 || status >= 500) return "PROVIDER_UNAVAILABLE";
    }
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code).toUpperCase();
    if (["ECONNRESET", "ENETUNREACH", "ENOTFOUND", "ETIMEDOUT"].includes(code)) {
      return "PROVIDER_UNAVAILABLE";
    }
  }
  if (!(error instanceof Error)) return "INVALID";
  if (error.message.includes("Wrong recipient")) return "AUDIENCE_MISMATCH";
  if (error.message.includes("Token used too late")) return "EXPIRED";
  if (error.message.includes("Invalid issuer")) return "ISSUER_MISMATCH";
  return "INVALID";
}

export function classifyGoogleCodeExchangeFailure(error: unknown): GoogleCredentialError["reason"] {
  if (classifyGoogleVerificationFailure(error) === "PROVIDER_UNAVAILABLE") return "PROVIDER_UNAVAILABLE";
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = error.response;
    if (typeof response === "object" && response !== null && "data" in response) {
      const data = response.data;
      if (typeof data === "object" && data !== null && "error" in data) {
        if (GOOGLE_CLIENT_CONFIGURATION_ERRORS.has(String(data.error))) return "CODE_FLOW_UNAVAILABLE";
      }
    }
  }
  return "CODE_INVALID";
}

export function validateGooglePayload(
  payload: TokenPayload | undefined,
  expectedAudience: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): GoogleIdentity {
  if (payload?.email && payload.email_verified !== true) {
    throw new GoogleCredentialError("EMAIL_NOT_VERIFIED");
  }
  if (!payload || !payload.sub || !payload.email) throw new GoogleCredentialError("INVALID");
  if (payload.aud !== expectedAudience) throw new GoogleCredentialError("AUDIENCE_MISMATCH");
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) throw new GoogleCredentialError("ISSUER_MISMATCH");
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) throw new GoogleCredentialError("EXPIRED");

  const email = payload.email.trim().toLowerCase();
  if (!email) throw new GoogleCredentialError("INVALID");

  return {
    subject: payload.sub,
    email,
    name: payload.name?.trim() || email.split("@", 1)[0] || "Alyvora user",
  };
}

export async function verifyGoogleCredential(
  credential: string,
  client: GoogleTokenClient = googleClient,
  clientId: string = env.googleClientId,
): Promise<GoogleIdentity> {
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    return validateGooglePayload(ticket.getPayload(), clientId);
  } catch (error: unknown) {
    if (error instanceof GoogleCredentialError) throw error;
    throw new GoogleCredentialError(classifyGoogleVerificationFailure(error));
  }
}

export async function verifyGoogleAuthorizationCode(
  code: string,
  clientId: string = env.googleClientId,
  clientSecret: string | null = env.googleClientSecret,
  exchangeClient: GoogleCodeExchangeClient | null = null,
  tokenClient: GoogleTokenClient = googleClient,
): Promise<GoogleIdentity> {
  if (!clientSecret) throw new GoogleCredentialError("CODE_FLOW_UNAVAILABLE");
  const client = exchangeClient
    ?? new OAuth2Client({ clientId, clientSecret, redirectUri: GOOGLE_POPUP_REDIRECT_URI });

  let idToken: string | null | undefined;
  try {
    idToken = (await client.getToken(code)).tokens.id_token;
  } catch (error: unknown) {
    throw new GoogleCredentialError(classifyGoogleCodeExchangeFailure(error));
  }
  if (!idToken) throw new GoogleCredentialError("INVALID");

  // Only the ID token is used; access and refresh tokens from the exchange are discarded.
  return verifyGoogleCredential(idToken, tokenClient, clientId);
}

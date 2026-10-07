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
  constructor(public readonly reason: "INVALID" | "EMAIL_NOT_VERIFIED") {
    super("Google credential validation failed");
  }
}

export interface GoogleTokenClient {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<LoginTicket>;
}

export function validateGooglePayload(
  payload: TokenPayload | undefined,
  expectedAudience: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): GoogleIdentity {
  if (payload?.email && payload.email_verified !== true) {
    throw new GoogleCredentialError("EMAIL_NOT_VERIFIED");
  }
  if (
    !payload ||
    !payload.sub ||
    !payload.email ||
    payload.aud !== expectedAudience ||
    !payload.iss ||
    !GOOGLE_ISSUERS.has(payload.iss) ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowSeconds
  ) {
    throw new GoogleCredentialError("INVALID");
  }

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
    throw new GoogleCredentialError("INVALID");
  }
}

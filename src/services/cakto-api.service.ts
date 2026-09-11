import { z } from "zod";
import { env } from "../config/env.js";
import {
  caktoApiOfferSchema,
  caktoApiOrderSchema,
  caktoApiSubscriptionSchema,
  type CaktoApiOffer,
  type CaktoApiOrder,
  type CaktoApiSubscription,
} from "../schemas/cakto-api.schema.js";

export const CAKTO_API_DEFAULT_TIMEOUT_MS = 10_000;
export const CAKTO_API_DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;

export type CaktoApiErrorCode =
  | "INVALID_CAKTO_API_CONFIGURATION"
  | "CAKTO_API_TIMEOUT"
  | "CAKTO_API_UNAVAILABLE"
  | "CAKTO_API_HTTP_ERROR"
  | "CAKTO_API_RESPONSE_TOO_LARGE"
  | "CAKTO_API_INVALID_JSON"
  | "CAKTO_API_INVALID_RESPONSE";

const errorMessages: Record<CaktoApiErrorCode, string> = {
  INVALID_CAKTO_API_CONFIGURATION: "Cakto API is not configured safely",
  CAKTO_API_TIMEOUT: "Cakto API request timed out",
  CAKTO_API_UNAVAILABLE: "Cakto API request failed",
  CAKTO_API_HTTP_ERROR: "Cakto API returned an unsuccessful response",
  CAKTO_API_RESPONSE_TOO_LARGE: "Cakto API response exceeded the allowed size",
  CAKTO_API_INVALID_JSON: "Cakto API returned invalid JSON",
  CAKTO_API_INVALID_RESPONSE: "Cakto API returned an invalid response",
};

export class CaktoApiError extends Error {
  constructor(
    public readonly code: CaktoApiErrorCode,
    public readonly providerStatus: number | null = null,
  ) {
    super(errorMessages[code]);
  }
}

export interface CaktoApiClient {
  getOrder(id: string): Promise<CaktoApiOrder>;
  getSubscription(id: string): Promise<CaktoApiSubscription>;
  getOffer(id: string): Promise<CaktoApiOffer>;
}

export interface CaktoApiClientOptions {
  baseUrl: string;
  accessToken?: string | null;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CaktoApiError("INVALID_CAKTO_API_CONFIGURATION");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new CaktoApiError("INVALID_CAKTO_API_CONFIGURATION");
  }

  return parsed.origin;
}

function encodeResourceId(id: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) {
    throw new CaktoApiError("INVALID_CAKTO_API_CONFIGURATION");
  }
  return encodeURIComponent(normalized);
}

function encodeOrderId(id: string): string {
  const parsed = z.uuid().safeParse(id.trim());
  if (!parsed.success) {
    throw new CaktoApiError("INVALID_CAKTO_API_CONFIGURATION");
  }
  return encodeURIComponent(parsed.data);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
  );
}

async function readLimitedBody(response: Response, maxResponseBytes: number): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maxResponseBytes) {
    throw new CaktoApiError("CAKTO_API_RESPONSE_TOO_LARGE", response.status);
  }

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = "";
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxResponseBytes) {
        await reader.cancel();
        throw new CaktoApiError("CAKTO_API_RESPONSE_TOO_LARGE", response.status);
      }
      body += decoder.decode(value, { stream: true });
    }

    return body + decoder.decode();
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxResponseBytes) {
    throw new CaktoApiError("CAKTO_API_RESPONSE_TOO_LARGE", response.status);
  }
  return new TextDecoder().decode(bytes);
}

export function createCaktoApiClient(options: CaktoApiClientOptions): CaktoApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? CAKTO_API_DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? CAKTO_API_DEFAULT_MAX_RESPONSE_BYTES;

  if (
    typeof fetchImplementation !== "function" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes <= 0
  ) {
    throw new CaktoApiError("INVALID_CAKTO_API_CONFIGURATION");
  }

  async function request(
    path: string,
    init: RequestInit,
  ): Promise<{ body: string; status: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImplementation(`${baseUrl}${path}`, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new CaktoApiError("CAKTO_API_HTTP_ERROR", response.status);
      }
      return {
        body: await readLimitedBody(response, maxResponseBytes),
        status: response.status,
      };
    } catch (error: unknown) {
      if (error instanceof CaktoApiError) throw error;
      if (isAbortError(error)) throw new CaktoApiError("CAKTO_API_TIMEOUT");
      throw new CaktoApiError("CAKTO_API_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  function parseJson(body: string, status: number): unknown {
    try {
      return JSON.parse(body);
    } catch {
      throw new CaktoApiError("CAKTO_API_INVALID_JSON", status);
    }
  }

  function getAccessToken(): string {
    const configuredToken = options.accessToken?.trim();
    if (configuredToken) return configuredToken;
    throw new CaktoApiError("INVALID_CAKTO_API_CONFIGURATION");
  }

  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const accessToken = getAccessToken();
    const response = await request(path, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const parsed = schema.safeParse(parseJson(response.body, response.status));
    if (!parsed.success) {
      throw new CaktoApiError("CAKTO_API_INVALID_RESPONSE", response.status);
    }
    return parsed.data;
  }

  return {
    getOrder: async (id) => get(`/public_api/orders/${encodeOrderId(id)}/`, caktoApiOrderSchema),
    getSubscription: async (id) =>
      get(`/public_api/subscriptions/${encodeResourceId(id)}/`, caktoApiSubscriptionSchema),
    getOffer: async (id) => get(`/public_api/offers/${encodeResourceId(id)}/`, caktoApiOfferSchema),
  };
}

export function createConfiguredCaktoApiClient(): CaktoApiClient {
  return createCaktoApiClient({
    baseUrl: env.caktoApiBaseUrl,
    accessToken: env.caktoApiAccessToken,
  });
}

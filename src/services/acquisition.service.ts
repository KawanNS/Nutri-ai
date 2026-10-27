import { prisma } from "../lib/prisma.js";

export type AcquisitionKind = "PREVIEW" | "SIGNUP";

const SOURCE_PATTERN = /^[a-z0-9_-]{1,40}$/;
// An account created this recently came from the request that just finished (Google sign-in also logs in).
const NEW_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

/** The ?source= tag a link carried (for example "instagram"), or undefined when absent or malformed. */
export function parseSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const source = value.trim().toLowerCase();
  return SOURCE_PATTERN.test(source) ? source : undefined;
}

export function isNewAccount(createdAt: Date | string, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() <= NEW_ACCOUNT_WINDOW_MS;
}

type Recorder = (data: { kind: AcquisitionKind; source: string; userId?: string }) => Promise<unknown>;
const defaultRecorder: Recorder = (data) => prisma.acquisitionEvent.create({ data });

/**
 * Notes where a preview or a new account came from. Never awaited by the request and never throws:
 * attribution is a nice-to-have and must not slow down or break the preview or the sign-up.
 */
export function recordAcquisition(
  kind: AcquisitionKind,
  source: string | undefined,
  userId?: string,
  record: Recorder = defaultRecorder,
): void {
  if (!source) return;
  void record({ kind, source, userId }).catch(() => {
    // Table missing (migration not applied yet) or database busy: the count is lost, nothing else.
  });
}

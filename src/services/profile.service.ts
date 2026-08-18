import { prisma } from "../lib/prisma.js";
import type { ProfileInput } from "../schemas/profile.schema.js";

export class ProfileError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId } });

  if (!profile) {
    throw new ProfileError(404, "Profile not found");
  }

  return profile;
}

export async function upsertProfile(userId: string, input: ProfileInput) {
  return prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      ...input,
    },
    update: input,
  });
}

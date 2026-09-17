import { z } from "zod";

const email = z.string().trim().email().max(254);
const password = z.string().min(8).max(128);

export const registerBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email,
    password,
  })
  .strict();

export const loginBodySchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();

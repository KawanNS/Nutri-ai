import { z } from "zod";

const weightKgSchema = z
  .union([z.string(), z.number()])
  .transform((value, context) => {
    const normalized = typeof value === "number" ? value.toString() : value.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      context.addIssue({
        code: "custom",
        message: "weightKg must be a valid decimal with up to 2 decimal places",
      });
      return z.NEVER;
    }

    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 9999.99) {
      context.addIssue({
        code: "custom",
        message: "weightKg is outside the allowed range",
      });
      return z.NEVER;
    }

    return normalized;
  });

const recordedAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "recordedAt must use YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "recordedAt must be a valid date")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), {
    message: "recordedAt cannot be in the future",
  })
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const noteSchema = z
  .string()
  .trim()
  .max(1000, "note must contain at most 1000 characters")
  .transform((value) => value || null)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const createProgressEntrySchema = z
  .object({
    weightKg: weightKgSchema,
    recordedAt: recordedAtSchema,
    note: noteSchema,
  })
  .strict();

export const progressEntryIdSchema = z.string().uuid();

export const progressListQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export type CreateProgressEntryInput = z.infer<typeof createProgressEntrySchema>;
export type ProgressListQuery = z.infer<typeof progressListQuerySchema>;

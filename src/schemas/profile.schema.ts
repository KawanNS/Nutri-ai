import { z } from "zod";

function decimalField(options: {
  field: string;
  maximum: number;
  allowZero?: boolean;
}) {
  return z.union([z.string(), z.number()]).transform((value, context) => {
    const normalizedValue =
      typeof value === "number" ? value.toString() : value.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) {
      context.addIssue({
        code: "custom",
        message: `${options.field} must be a valid decimal with up to 2 decimal places`,
      });
      return z.NEVER;
    }

    const numericValue = Number(normalizedValue);
    const minimumIsValid = options.allowZero
      ? numericValue >= 0
      : numericValue > 0;

    if (!Number.isFinite(numericValue) || !minimumIsValid || numericValue > options.maximum) {
      context.addIssue({
        code: "custom",
        message: `${options.field} is outside the allowed range`,
      });
      return z.NEVER;
    }

    return normalizedValue;
  });
}

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must use YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "birthDate must be a valid date")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), {
    message: "birthDate cannot be in the future",
  })
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const profileSchema = z
  .object({
    birthDate: birthDateSchema,
    sex: z.enum(["MALE", "FEMALE", "OTHER"]),
    heightCm: decimalField({ field: "heightCm", maximum: 999.99 }),
    weightKg: decimalField({ field: "weightKg", maximum: 9999.99 }),
    goal: z.enum([
      "WEIGHT_LOSS",
      "MAINTENANCE",
      "WEIGHT_GAIN",
      "MUSCLE_GAIN",
    ]),
    activityLevel: z.enum([
      "SEDENTARY",
      "LIGHT",
      "MODERATE",
      "ACTIVE",
      "VERY_ACTIVE",
    ]),
    mealsPerDay: z.number().int().positive(),
    weeklyFoodBudget: decimalField({
      field: "weeklyFoodBudget",
      maximum: 99_999_999.99,
      allowZero: true,
    }),
  })
  .strict();

export type ProfileInput = z.infer<typeof profileSchema>;

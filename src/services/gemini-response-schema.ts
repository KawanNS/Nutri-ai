import { Type, type Schema } from "@google/genai";
import { z, type ZodType } from "zod";

import { generatedMealPlanSchema } from "../schemas/meal-plan.schema.js";

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableSchema(value: JsonSchema): Schema | undefined {
  if (!Array.isArray(value.anyOf) || value.anyOf.length !== 2) return undefined;
  const schemas = value.anyOf.filter(isRecord);
  const concrete = schemas.find((schema) => schema.type !== "null");
  const hasNull = schemas.some((schema) => schema.type === "null");
  if (!hasNull || !concrete) return undefined;
  const converted = convertJsonSchema(concrete);
  return converted ? { ...converted, nullable: true } : undefined;
}

function convertObject(value: JsonSchema): Schema {
  const properties: Record<string, Schema> = {};
  if (isRecord(value.properties)) {
    for (const [name, property] of Object.entries(value.properties)) {
      if (!isRecord(property)) continue;
      const converted = convertJsonSchema(property);
      if (converted) properties[name] = converted;
    }
  }
  const required = Array.isArray(value.required)
    ? value.required.filter(
        (name): name is string => typeof name === "string" && name in properties,
      )
    : undefined;
  return {
    type: Type.OBJECT,
    properties,
    ...(required?.length ? { required } : {}),
  };
}

function convertArray(value: JsonSchema): Schema {
  const items = isRecord(value.items) ? convertJsonSchema(value.items) : undefined;
  return {
    type: Type.ARRAY,
    ...(items ? { items } : {}),
  };
}

function convertString(value: JsonSchema): Schema {
  const values = Array.isArray(value.enum)
    ? value.enum.filter((item): item is string => typeof item === "string")
    : typeof value.const === "string"
      ? [value.const]
      : [];
  return {
    type: Type.STRING,
    ...(values.length ? { format: "enum", enum: values } : {}),
  };
}

function convertNumber(value: JsonSchema): Schema {
  const literalIsInteger = Number.isSafeInteger(value.const);
  return {
    type:
      value.type === "integer" || literalIsInteger ? Type.INTEGER : Type.NUMBER,
  };
}

function convertJsonSchema(value: JsonSchema): Schema | undefined {
  const nullable = nullableSchema(value);
  if (nullable) return nullable;
  switch (value.type) {
    case "object": return convertObject(value);
    case "array": return convertArray(value);
    case "string": return convertString(value);
    case "number":
    case "integer": return convertNumber(value);
    case "boolean": return { type: Type.BOOLEAN };
    default: return undefined;
  }
}

export function toGeminiResponseSchema(schema: ZodType): Schema {
  const converted = convertJsonSchema(z.toJSONSchema(schema) as JsonSchema);
  if (!converted) throw new Error("Zod schema has no supported Gemini structure");
  return converted;
}

export const mealPlanResponseSchema = toGeminiResponseSchema(
  generatedMealPlanSchema,
);

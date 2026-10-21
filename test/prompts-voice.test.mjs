import assert from "node:assert/strict";
import test from "node:test";

import { buildMealPlanPrompt, MEAL_PLAN_PROMPT_VERSION } from "../dist/prompts/meal-plan.prompt.js";
import { nutritionAssistantInstructions } from "../dist/prompts/nutrition-assistant.prompt.js";

// These rules came out of live runs against the real model: each one fixes something it actually did.

test("the assistant answers short, honestly, and never offers what it cannot do", () => {
  const rules = nutritionAssistantInstructions;
  assert.match(rules, /responda em 2 a 5 frases curtas/);
  assert.match(rules, /Só use títulos, listas ou tabelas quando o usuário pedir algo longo/);
  // It ended answers with "Quer tirar alguma dúvida sobre as refeições...?".
  assert.match(rules, /Não termine com perguntas ou ofertas genéricas como "Quer tirar alguma dúvida\?"/);
  // Asked "você é uma IA?", it implied it was not.
  assert.match(rules, /Se perguntarem se você é uma IA, diga a verdade em uma frase/);
  // Redirects ended with "Quer ver alguma refeição de hoje...?" until this was spelled out.
  assert.match(rules, /numa frase afirmativa e sem pergunta, que por ali você ajuda com a comida/);
  assert.match(rules, /sem comentar se é teste, e pare aí/);
  // It offered to "atualizar seu cardápio", which the chat cannot do.
  assert.match(rules, /Você só conversa: não altera o plano, não registra refeições, não gera planos nem faz compras\. Nunca ofereça fazer isso\./);
  // It sent people to "Trocar refeição" to apply a specific food, which that button cannot do.
  assert.match(rules, /"Trocar refeição" dentro da refeição do plano \(troca por outra opção automática; não dá para escolher o alimento/);
  assert.match(rules, /Nunca comece com fórmulas como "Como assistente, não posso"/);
  // Clinical limits stay.
  assert.match(rules, /Não diagnostique doenças, não prescreva tratamento/);
});

test("meal plans get plain meal names and a summary that talks to the user", () => {
  const { instructions } = buildMealPlanPrompt({
    birthDate: "1995-01-01", ageYears: 31, sex: "MALE", heightCm: 178, weightKg: 76, goal: "MUSCLE_GAIN",
    activityLevel: "ACTIVE", mealsPerDay: 3, weeklyFoodBudget: 250, foodPreferences: [], likedFoods: [],
    dislikedFoods: [], foodRestrictions: [], foodAllergies: [],
  });
  assert.equal(MEAL_PLAN_PROMPT_VERSION, "meal-plan-v3");
  // It named meals "Café da manhã reforçado" and "Jantar anabólico de batata e frango".
  assert.match(instructions, /Meal\.name is the plain name of the meal in Portuguese/);
  assert.match(instructions, /never "reforçado", "completo", "anabólico", "fit"/);
  // Summaries opened with "Estruturamos 3 refeições ... como pilares".
  assert.match(instructions, /No corporate wording such as "Estruturamos", "pilares", "priorizando" or "focando em"/);
  assert.match(instructions, /Never use generic titles such as "Plano Alimentar Semanal para Ganho de Massa Muscular"/);
  assert.match(instructions, /say only once that the plan does not replace a nutritionist/);
});

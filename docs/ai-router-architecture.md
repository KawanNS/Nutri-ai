# AI Router V1

## Estado auditado

Antes desta mudança, o fluxo era `HTTP controller -> meal-plan-generation -> ai-provider.service -> gemini.service/openai.service -> SDK`. O seletor dependia de `AI_PROVIDER`, e cada serviço de provider construía prompt, chamava SDK, interpretava resposta e convertia erros. O domínio de meal plan não importava `@google/genai` diretamente, mas a abstração ainda era uma seleção de provider, não uma decisão por tarefa. O Gemini usava `@google/genai` 2.18.0, `GEMINI_API_KEY`, `GEMINI_MODEL` (padrão `gemini-3.5-flash-lite`), timeout de 60 segundos, `application/json`, schema estruturado derivado do Zod e nenhuma política explícita de retry. Não havia normalização de usage/custo nem health.

## Arquitetura V1

O caminho de produção passa a ser:

```text
HTTP controller
  -> meal-plan-generation.service
  -> ai-provider.service (fachada pública compatível + JSON/Zod)
  -> AI Router
  -> routing policy por tarefa
  -> Gemini adapter
  -> @google/genai
```

Os contratos comuns ficam em `src/ai/ai-router.types.ts`. `AIRouterRequest` contém tarefa, instruções, entrada, formato e timeout; não contém chave, configuração de conta ou objetos do SDK. `AIRouterResponse` contém conteúdo, provider/model, latência, usage normalizado, motivo de término e request ID sanitizado. Nenhum objeto bruto do SDK cruza o adapter.

As tarefas habilitadas ficam em `AI_TASKS`: `MEAL_PLAN_GENERATION`, `NUTRITION_ASSISTANT`, `MEAL_PHOTO_ANALYSIS` e `MEAL_REPLACEMENT`. `PROFILE_INSIGHT` continua como possibilidade futura e falha fechada enquanto não for implementada.

`MEAL_REPLACEMENT` atende `POST /api/meal-plans/:id/days/:day/meals/:index/swap`: troca uma única refeição de um plano salvo, com prompt próprio (`src/prompts/meal-swap.prompt.ts`, `meal-swap-v1`) e schema estruturado próprio (`mealSwapAIResponseSchema`). A troca:

- é exclusiva de Premium (assinatura ativa ou conta ADMIN, via `getPremiumAccess`) e não cria `UsageEvent` nem mexe nos contadores gratuitos; o abuso é contido por um rate limit em memória de 10 trocas a cada 10 minutos por usuário;
- atualiza o `content` do `MealPlan` no lugar (sem nova versão), com concorrência otimista por `updatedAt`: se outra troca salvar antes, o plano é relido e a troca reaplicada, desde que a refeição alvo não tenha mudado;
- recalcula `estimatedDailyCost` do dia e `estimatedWeeklyCost` pela diferença entre o custo estimado da nova refeição e o da antiga, e adiciona os alimentos novos à categoria "Itens de refeições trocadas" da lista de compras;
- revalida o plano inteiro com o mesmo schema da geração antes de salvar.

## Routing e Gemini

A policy central escolhe deterministicamente `MEAL_PLAN_GENERATION -> GEMINI -> modelo configurado atual`. Não há seleção por conta, round-robin, balanceamento, retry ou fallback. O adapter concentra SDK, schema específico, transporte, resposta, usage e erros Gemini. As antigas importações públicas de `gemini.service` e `gemini-response-schema` são fachadas temporárias de compatibilidade; a implementação foi movida para a pasta de adapters.

O structured output permanece `application/json` com o schema atual. Depois da resposta normalizada, a fachada executa `JSON.parse` e a validação Zod existente, incluindo a quantidade de refeições. JSON inválido não é reparado e markdown não é aceito silenciosamente.

## Erros, usage, health e observabilidade

`AIRouterError` classifica autenticação, rate limit, timeout, indisponibilidade, resposta inválida, schema inválido, configuração, tarefa desconhecida e erro desconhecido, sempre com `retryable` explícito. A borda pública converte esses erros para os mesmos códigos/status HTTP já usados pelo controller. A classificação `retryable` é apenas informação: V1 nunca repete a chamada.

Usage conhecido é normalizado como tokens de entrada, saída, total, cache e raciocínio. Campo ausente permanece `null`; custo financeiro não é calculado e permanece desconhecido. Health informa somente `CONFIGURED` ou `NOT_CONFIGURED`, sem ping externo. O observer opcional recebe somente tarefa, provider, modelo, sucesso, latência e categoria de erro; prompt, resposta, dados pessoais, chaves e headers não são incluídos.

## Segurança e evolução futura

A credencial continua vindo da configuração existente e só chega à criação do client dentro do adapter. Ela não integra request, metadata, response, persistência ou erro. O Router não persiste prompt ou conteúdo.

Um provider futuro deve:

1. implementar `AIProviderAdapter` e converter seu SDK para os contratos comuns;
2. mapear erros sem vazar conteúdo ou segredo;
3. declarar health sem inferir disponibilidade real;
4. ser registrado explicitamente e receber uma rota autorizada na policy;
5. adicionar testes locais com fake, incluindo uma única chamada e falha fechada.

Fallback futuro só poderá ocorrer para provider configurado e autorizado, em erros elegíveis, com limite explícito, sem loops e preservando schema/observabilidade. Múltiplas credenciais/projetos só poderão ser consideradas quando pertencerem legitimamente ao operador, forem permitidas pelo provider e não servirem para contornar quotas ou termos. Esta V1 não possui fallback nem pool de credenciais.

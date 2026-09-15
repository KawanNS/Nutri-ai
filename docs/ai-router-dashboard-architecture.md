# AI Router V2 e painel administrativo futuro

## Limites desta fundação

O motor do AI Router permanece dentro da API do Nutri-AI. Esta etapa materializa
localmente o schema, uma migration aditiva ainda não aplicada, o repository
Prisma, a autorização ADMIN server-side, o sink de telemetria e a API
administrativa local. Ela não cria microserviço, frontend, DNS ou deploy. Também
não adiciona OpenAI operacional, fallback ou chamadas de billing.

O mapa futuro de hosts é:

```text
nutriai.com.br        -> site público
app.nutriai.com.br    -> aplicação dos usuários
router.nutriai.com.br -> painel privado hospedado na Vercel
api.nutriai.com.br    -> API e motor interno do AI Router
```

O painel chamará uma API administrativa autenticada e autorizada. A API usará os
contratos seguros da pasta `src/ai/admin`; ela não receberá nem devolverá API
keys, secrets, tokens, credenciais ou o ambiente do processo.

## Configuração e execução

O provider registry declara somente providers realmente suportados. Hoje apenas
`GEMINI` é operacional. O model registry contém uma allowlist explícita; hoje ela
é somente `gemini-3.5-flash-lite`, sem preço configurado.

Cada task pode ter uma configuração `{ task, provider, model, enabled }` obtida
por `AIRouteConfigRepository`. O Router padrão usa a implementação Prisma; a
implementação em memória continua disponível para isolamento e testes. Ausência
real de configuração customizada usa a rota default conhecida:

```text
MEAL_PLAN_GENERATION -> GEMINI -> gemini-3.5-flash-lite
```

Configuração inválida, desabilitada, provider desconhecido ou model fora da
allowlist falha fechada antes do adapter. Uma falha do Gemini nunca seleciona
outro provider e cada geração continua fazendo exatamente uma chamada.

Erro do repository ou registro presente corrompido falha fechado; somente a
ausência confirmada da linha permite o default. A configuração e sua auditoria
são gravadas atomicamente, com concorrência otimista por `expectedVersion`.

## Telemetria e custos

O sink de telemetria recebe somente task, provider, model, horário inicial,
duração, sucesso, categoria de erro, usage normalizado e custo estimado. Prompt,
resposta, perfil nutricional, nome, email, JWT e credenciais são proibidos.

Pricing é configuração separada e versionada. A tabela local não contém preços
criados automaticamente; portanto, sem registro vigente aprovado, o custo
estimado é `null`. Valores persistidos usam inteiros `BigInt` em micros. Billing
oficial do provider é outra fonte e nunca será inferido a partir da estimativa.

## Autorização administrativa

O backend local agora possui role persistida, middleware ADMIN server-side e API
administrativa local registrada em `/api/admin/ai-router`. Nenhum ADMIN real foi
criado. O stash antigo não foi aplicado. JWT comum não concede acesso
administrativo e email hardcoded não é usado como autorização.

A API aplica contratos estritos, erros sanitizados e rate limit por identidade.
Ela herda o CORS global restrito ao frontend oficial configurado. Antes de
publicar ainda será necessário aplicar e validar a migration em ambiente
controlado, provisionar um ADMIN e revisar a proteção distribuída do deploy.

## Telas planejadas

- Dashboard: chamadas, tokens, erros, latência e custo estimado.
- Providers: estado local seguro, capabilities e modelos permitidos.
- Routes: task, provider, model e enabled.
- Usage: filtros por período, task, provider e model.
- Costs: estimativas por provider, model e task, separadas do billing oficial.
- Audit: autor, valores anteriores e novos e timestamp de cada alteração.

OpenAI e `NUTRITION_ASSISTANT` permanecem apenas como evolução futura. Um novo
provider precisará de registry, allowlist, adapter real, credencial segura e
testes; uma nova task precisará de contrato e rota default explícitos.

## Roadmap oficial

- ETAPA A — Router V1: `DONE`.
- ETAPA B — Router V2 Foundation: `DONE` localmente.
- ETAPA C — Persistência + ADMIN: `DONE` localmente, pendente de revisão humana.
- ETAPA D — API administrativa: `DONE` localmente.
- ETAPA E — Consultas e agregações de telemetria/custos: `DONE` localmente para
  os campos atualmente persistidos.
- ETAPA F — Frontend privado Router.
- ETAPA G — Vercel.
- ETAPA H — DNS `router.nutriai.com.br`.
- ETAPA I — Segundo provider real.

A ETAPA C foi materializada conforme o plano detalhado em
`ai-router-persistence-admin-plan.md`, sem aplicar a migration nem criar ADMIN
real. Cada etapa terá revisão própria; nenhuma antecipa endpoint público, deploy
ou provider da etapa seguinte.

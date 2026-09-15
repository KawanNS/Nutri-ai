# Plano de persistência e administração do AI Router

## Estado verificado e limite desta etapa

O projeto foi materializado localmente em schema, uma migration aditiva,
repository Prisma, middleware, services e API administrativa local. A migration
não foi executada e nenhum ADMIN real foi criado. O JWT continua assinando
somente `sub`; role/status são consultados no banco server-side.

O `stash@{0}` foi apenas inspecionado. Ele propõe `UserRole { USER ADMIN }`, campo
`User.role` com default `USER` e `requireAdmin`; é evidência útil, mas não faz
parte do código produtivo e não deve ser aplicado automaticamente.

## Modelo Prisma materializado localmente

O recorte abaixo documenta o modelo local ainda não aplicado. Strings de
task/provider/model continuam sendo validadas pelos registries e allowlists do
domínio, evitando que uma enumeração de banco vire uma segunda fonte de verdade.

```prisma
enum UserRole {
  USER
  ADMIN
}

enum AiRouteAuditAction {
  CREATE
  UPDATE
}

enum AiRouteOrigin {
  DEFAULT
  PERSISTED
}

model User {
  // campos existentes
  role                 UserRole          @default(USER)
  aiRoutesUpdated      AiRouteConfig[]   @relation("AiRouteUpdatedBy")
  aiRouteChanges       AiRouteAuditLog[] @relation("AiRouteChangedBy")
  aiPricingCreated     AiModelPricing[]  @relation("AiPricingCreatedBy")
}

model AiRouteConfig {
  id              String            @id @default(uuid()) @db.Uuid
  task            String            @unique @db.VarChar(64)
  provider        String            @db.VarChar(32)
  model           String            @db.VarChar(120)
  enabled         Boolean           @default(true)
  version         Int               @default(1)
  updatedByUserId String            @db.Uuid
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  updatedBy       User              @relation("AiRouteUpdatedBy", fields: [updatedByUserId], references: [id], onDelete: Restrict)
  auditLogs       AiRouteAuditLog[]

  @@index([updatedByUserId, updatedAt(sort: Desc)])
}

model AiRouteAuditLog {
  id               String             @id @default(uuid()) @db.Uuid
  routeConfigId    String             @db.Uuid
  task             String             @db.VarChar(64)
  action           AiRouteAuditAction
  previousOrigin   AiRouteOrigin
  previousProvider String             @db.VarChar(32)
  previousModel    String             @db.VarChar(120)
  previousEnabled  Boolean
  previousVersion  Int?
  newProvider      String             @db.VarChar(32)
  newModel         String             @db.VarChar(120)
  newEnabled       Boolean
  newVersion       Int
  changedByUserId  String             @db.Uuid
  createdAt        DateTime           @default(now())
  routeConfig      AiRouteConfig      @relation(fields: [routeConfigId], references: [id], onDelete: Restrict)
  changedBy        User               @relation("AiRouteChangedBy", fields: [changedByUserId], references: [id], onDelete: Restrict)

  @@unique([routeConfigId, newVersion])
  @@index([task, createdAt(sort: Desc), id(sort: Desc)])
  @@index([changedByUserId, createdAt(sort: Desc)])
}

model AiModelPricing {
  id                           String         @id @default(uuid()) @db.Uuid
  provider                     String         @db.VarChar(32)
  model                        String         @db.VarChar(120)
  currency                     String         @db.Char(3)
  inputMicrosPerMillionTokens  BigInt         @db.BigInt
  outputMicrosPerMillionTokens BigInt         @db.BigInt
  version                      Int
  validFrom                    DateTime
  validUntil                   DateTime?
  createdByUserId              String         @db.Uuid
  createdAt                    DateTime       @default(now())
  createdBy                    User           @relation("AiPricingCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)
  usageEvents                  AiUsageEvent[]

  @@unique([provider, model, version])
  @@index([provider, model, validFrom(sort: Desc)])
}

model AiUsageEvent {
  id                  String          @id @default(uuid()) @db.Uuid
  task                String?         @db.VarChar(64)
  provider            String?         @db.VarChar(32)
  model               String?         @db.VarChar(120)
  startedAt           DateTime
  durationMs          Int
  success             Boolean
  errorCategory       String?         @db.VarChar(64)
  inputTokens         Int?
  outputTokens        Int?
  totalTokens         Int?
  cachedInputTokens   Int?
  reasoningTokens     Int?
  estimatedCostMicros BigInt?         @db.BigInt
  estimatedCurrency   String?         @db.Char(3)
  pricingVersion      Int?
  createdAt           DateTime        @default(now())
  pricing             AiModelPricing? @relation(fields: [provider, model, pricingVersion], references: [provider, model, version], onDelete: Restrict)

  @@index([createdAt(sort: Desc), id(sort: Desc)])
  @@index([task, createdAt(sort: Desc)])
  @@index([provider, createdAt(sort: Desc)])
  @@index([model, createdAt(sort: Desc)])
}
```

`version` é um inteiro de compare-and-swap; é mais confiável para concorrência
que comparar timestamps. Custos são inteiros em micros, nunca ponto flutuante.
Valores `BigInt` devem sair na API como string decimal. Faixas de pricing não
podem se sobrepor para provider/model; a primeira versão pode garantir isso na
transação e uma evolução pode adicionar constraint de exclusão PostgreSQL.
Pricing publicado não é apagado, para preservar a explicação histórica.

## Autorização ADMIN

1. Migration aditiva cria `UserRole` e `User.role @default(USER)`; todos os
   usuários existentes permanecem sem privilégio.
2. Um procedimento operacional único promove o primeiro administrador por UUID,
   com revisão humana e registro separado. Cadastro/login jamais promovem alguém
   por email, domínio ou variável de ambiente.
3. O JWT pode continuar contendo apenas `sub`. Em cada requisição administrativa,
   `authenticate` consulta `status` e `role` no banco e anexa ambos ao contexto;
   isso torna bloqueio/revogação efetivos sem aguardar expiração do token.
4. `requireAdmin`, sempre depois de `authenticate`, responde `401` sem identidade
   e `403` para identidade válida sem `ADMIN`. Nunca confia em role enviado pelo
   cliente. Testes devem cobrir token ausente/inválido, usuário ausente/bloqueado,
   USER, ADMIN e revogação durante a validade do JWT.

Alterações futuras de papel também precisam de autorização mais forte e trilha
de auditoria própria; não pertencem aos endpoints do Router.

## API administrativa implementada localmente

Prefixo: `/api/admin/ai-router`. O CORS deve permitir explicitamente a origem de
`router.nutriai.com.br`; tokens ficam somente no header Authorization e nunca em
query string ou logs. Aplicar rate limit administrativo e os headers de segurança
usuais. Como a autenticação é Bearer e não cookie, CSRF não é o mecanismo
principal; se cookies forem adotados, exigir SameSite/CSRF token.

- `GET /providers`: status local seguro, capabilities e modelos permitidos.
- `GET /routes`: rota efetiva, origem `DEFAULT|PERSISTED`, enabled e version.
- `GET /routes/:task`: detalhe sanitizado da rota efetiva e sua version.
- `PUT /routes/:task`: body estrito
  `{ provider, model, enabled, expectedVersion }`; `:task` é a única fonte da
  task. Para criar sobre o default, `expectedVersion: 0`.
- `GET /usage?from&to&task&provider&model&status&page&limit`: agregados e eventos
  sanitizados, com limite máximo e paginação limitada.
- `GET /costs?from&to&task&provider&model`: somente estimativas do Router e sua
  cobertura de pricing. Billing oficial, quando integrado, aparece em campo e
  fonte separados.
- `GET /audit?task&from&to&page&limit`: mudanças paginadas, sem prompts,
  respostas ou credenciais.

Todos os DTOs são strict, com limites de tamanho e filtros por registries. A API
deve autenticar/autorizar antes de revelar validações detalhadas e devolver erros
estáveis: `400` input, `401`, `403`, `404`, `409` conflito de versão e `500`
sanitizado.

## Escrita atômica e concorrência

Dentro de uma única transação Prisma:

1. validar provider/model nos registries, existência operacional e allowlist;
2. carregar a rota e conferir `expectedVersion` (`0` representa ausência);
3. em update, executar CAS por `task + version` e incrementar `version`; em create,
   depender também do unique de `task`;
4. inserir `AiRouteAuditLog` com estado anterior, novo, versões e actor obtido do
   middleware;
5. confirmar a transação somente se configuração e auditoria persistirem.

Zero linhas atualizadas ou colisão unique vira `409`, sem retry oculto. Falha da
auditoria reverte a configuração. Só depois do commit o cache local é invalidado;
falha de invalidação não desfaz a escrita, mas gera alerta operacional.

## Repository, cache e falha fechada

`PrismaAIRouteConfigRepository` implementará o contrato atual. Ausência real de
linha usa o default versionado no código. Linha presente desabilitada, corrompida,
com provider/model desconhecido ou falha do banco nunca cai no default: falha
fechada antes do adapter.

Começar sem cache é a opção mais segura. Se métricas justificarem, usar cache
read-through em memória com TTL curto (por exemplo, 15 s), chave por task e um
sentinela explícito para ausência. O write invalida a instância local depois do
commit; em múltiplas instâncias/serverless haverá staleness limitada pelo TTL.
Não prometer invalidação global sem Redis/pub-sub. Um cache distribuído é etapa
posterior, com versionamento, métricas e comportamento de falha documentado.

## Telemetria, retenção e privacidade

`AiUsageEvent` aceita somente o contrato sanitizado existente. São proibidos:
prompt/instructions, input/output do modelo, perfis nutricionais, nome/email,
JWT, API keys, headers, stack traces e mensagens cruas do provider/banco. Task não
reconhecida fica `null`. O identificador do usuário não é necessário para as telas
propostas e não deve ser coletado.

O sink de usage é best-effort e nunca repete a chamada do provider. Antes de
produção, escolher mecanismo durável compatível com o ambiente (fila gerenciada
ou outbox/worker), com backpressure, métricas de descarte e idempotência. Não
transformar falha de telemetria em falha da geração. Auditoria administrativa,
ao contrário, é obrigatória e transacional.

Proposta inicial: eventos detalhados por 90 dias, agregados diários por 13 meses
e auditoria/config/pricing durante toda a vida do produto. Executar purge em
lotes, documentar base legal e permitir ajuste por política. Avaliar partição
mensal de `AiUsageEvent` somente após volume real.

## Migration, deploy e rollback

1. Aprovar schema, política de primeiro ADMIN e testes de migration em cópia
   anonimizada; gerar migration nova, sem editar migrations antigas.
2. Aplicar primeiro a migration aditiva. Não criar rota persistida automaticamente:
   ausência mantém o default conhecido.
3. Promover e verificar o primeiro ADMIN pelo procedimento auditado.
4. Publicar backend com repository Prisma e endpoints protegidos; fazer smoke
   tests de negação antes de conectar o painel.
5. Publicar o painel e observar conflito, erro, latência, descarte de telemetria e
   crescimento de tabelas.

Rollback de aplicação volta ao repository/default anterior sem remover dados.
Rollback de dados prefere uma migration corretiva; não derrubar tabelas, enum ou
coluna role durante incidente. Remoção física só após backup, janela dedicada e
prova de ausência de dependências. Uma configuração perigosa pode ser corrigida
por novo update versionado/auditado; nunca por edição manual silenciosa.

## Riscos e decisões ainda abertas

- Aplicar/revisar a migration em ambiente não produtivo e executar o bootstrap
  operacional antes de qualquer HTTP admin.
- Definir mecanismo durável e orçamento de perda para telemetria best-effort.
- Validar TTL ou decidir por não usar cache com dados reais de carga.
- Aprovar fonte, moeda, vigência e processo editorial de pricing.
- Confirmar retenção/legalidade e acesso operacional à auditoria.
- Definir integração futura de billing oficial sem misturá-lo às estimativas.
- Executar threat model do painel, rate limits e testes de autorização horizontal.

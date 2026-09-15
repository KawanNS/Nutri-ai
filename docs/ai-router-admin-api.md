# API administrativa do AI Router V2

A API administrativa local usa o prefixo `/api/admin/ai-router`. Todas as rotas
passam, nesta ordem, por `authenticate`, `requireAdmin` e um rate limit por
identidade administrativa. A role é relida do banco durante a autenticação; um
campo `role` no JWT ou no corpo da requisição não concede acesso.

## Endpoints

- `GET /routes`: lista as rotas efetivas.
- `GET /routes/:task`: consulta uma rota efetiva.
- `PUT /routes/:task`: altera uma rota com
  `{ provider, model, enabled, expectedVersion }`.
- `GET /providers`: lista estado e capacidades sem expor credenciais.
- `GET /models`: lista a allowlist operacional de modelos.
- `GET /usage`: lista telemetria sanitizada.
- `GET /costs`: agrega estimativas em micros, separando custo conhecido de
  desconhecido.
- `GET /audit`: lista, somente para leitura, as transições auditadas.

As listagens aceitam `page` e `limit`; o limite padrão é 20 e o máximo é 100.
Usage/costs permitem `task`, `provider`, `model`, `status=SUCCESS|FAILURE`,
`from` e `to`. Audit permite `task`, `from` e `to`. Campos e valores fora das
allowlists são rejeitados.

Usage também retorna totais de chamadas, sucesso/falha, tokens e latência para o
conjunto filtrado. Campos sem medição permanecem `null`.

Valores monetários são strings decimais de micros para preservar `BigInt`.
Ausência de pricing resulta em `estimatedCost: null` e incrementa
`callsWithUnknownCost`; ela nunca é apresentada como custo zero.

Os erros públicos são estáveis e sanitizados: 400 para contrato inválido, 401
para ausência de autenticação, 403 para identidade sem ADMIN, 404 para task
inexistente, 409 para conflito de versão, 429 para rate limit e 500 sem detalhes
internos. Nenhum endpoint retorna prompt, resposta, perfil, email, JWT, chave ou
payload privado.

O CORS continua herdando a política global da API, restrita ao frontend oficial
configurado. Não foi adicionado domínio, variável de ambiente ou wildcard.

A migration que sustenta a persistência continua apenas preparada localmente e
não foi executada. A API administrativa local não deve ser ativada em ambiente
sem essa migration e sem um ADMIN provisionado pelo procedimento revisado.

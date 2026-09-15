# Bootstrap operacional do primeiro ADMIN

Este procedimento não é executado pela aplicação, por migration, por seed ou por
deploy. Ele só pode ser usado após a migration de `UserRole` ter sido aplicada ao
ambiente escolhido e depois de revisão humana explícita.

## Pré-requisitos

- janela de mudança aprovada e ambiente confirmado visualmente;
- backup/restauração validados;
- operador autorizado e segundo revisor;
- usuário já cadastrado, ativo e com identidade confirmada fora da aplicação;
- UUID copiado de uma consulta administrativa confiável, nunca recebido do
  frontend, query string ou header;
- ticket registrando ambiente, actor operacional, revisor, motivo e horário.

## Identificação e promoção

Primeiro consulte apenas `id`, `status` e `role` pelo UUID candidato. Confira que
há exatamente um usuário, que o status é `ACTIVE` e que a role é `USER`. Email
pode ajudar a localizar a conta na ferramenta operacional, mas não é condição de
autorização e não entra no comando de promoção.

Na console SQL do ambiente já confirmado, use uma transação e substitua o
parâmetro UUID conscientemente:

```sql
BEGIN;

UPDATE "User"
SET "role" = 'ADMIN', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = :reviewed_user_uuid
  AND "status" = 'ACTIVE'
  AND "role" = 'USER'
RETURNING "id", "status", "role", "updatedAt";

-- Confirme exatamente uma linha antes do COMMIT.
COMMIT;
```

Se o resultado não contiver exatamente uma linha, execute `ROLLBACK`, investigue
e não amplie o predicado. Nunca promova por email, domínio, nome ou em massa.

## Verificação e auditoria

Após o commit, consulte novamente por UUID e confirme `ACTIVE/ADMIN`. Registre no
ticket o UUID, resultado sanitizado, timestamp, identificador da mudança no banco
e os nomes do operador/revisor. Preserve também o audit log nativo do provedor de
banco. Não copie password hash, JWT, sessão ou dados nutricionais.

Teste a autorização com uma nova autenticação: um endpoint administrativo futuro
deve aceitar o ADMIN e continuar devolvendo `403` para USER. A role é conferida no
banco em cada requisição; o JWT continua contendo apenas `sub`.

## Reversão

Para revogar, repita a confirmação de ambiente/UUID e execute outra mudança
auditada e restrita:

```sql
BEGIN;

UPDATE "User"
SET "role" = 'USER', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = :reviewed_user_uuid
  AND "role" = 'ADMIN'
RETURNING "id", "status", "role", "updatedAt";

-- Confirme exatamente uma linha antes do COMMIT.
COMMIT;
```

Bloquear o usuário também impede administração, mas não substitui a revogação de
role quando ela é a ação desejada. Não remover a coluna/enum durante incidente.

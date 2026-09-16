# AI Router V2 -> 9Router

O 9Router e um gateway abaixo do AI Router V2. Ele nao substitui tarefas, rotas,
telemetria, auditoria, modelos permitidos ou administracao do Router V2.

## Configuracao server-side

Defina as tres variaveis abaixo somente no ambiente do backend:

```dotenv
AI_GATEWAY_BASE_URL=http://127.0.0.1:20128/v1
AI_GATEWAY_API_KEY=<chave-rotacionada-do-9router>
GEMINI_MODEL=<id-exato-do-modelo-exibido-pelo-9router>
```

Em producao, `AI_GATEWAY_BASE_URL` deve ser
`https://route.<dominio-real>/v1`. HTTP e aceito apenas para loopback local. URL e
chave precisam ser configuradas juntas; configuracao parcial impede a inicializacao.
O modelo continua usando `GEMINI_MODEL`, que ja era a fonte de configuracao do
Router V2, e nao deve ser decidido por controllers ou pelo frontend.

Quando as variaveis do gateway nao existem, o backend preserva o adapter Gemini
direto para compatibilidade de desenvolvimento. Quando existem, toda chamada que
ja passa pelo AI Router V2 usa `POST /chat/completions` no gateway, sem retry no
SDK e sem expor credenciais ou conteudo em telemetria.

## Checklist para ativacao publica

1. Rotacionar a chave antiga no dashboard do 9Router.
2. Criar uma chave forte e instala-la somente no secret store do backend.
3. Configurar tunnel/reverse proxy HTTPS para `route.<dominio-real>` apontando ao
   9Router, sem publicar o dashboard administrativo.
4. Manter autenticacao obrigatoria, revisar rate limiting e restringir CORS quando
   ele se aplicar ao proxy.
5. Atualizar a rota persistida `MEAL_PLAN_GENERATION` no painel do Router V2 caso
   ela ainda guarde um modelo antigo diferente de `GEMINI_MODEL`.
6. Fazer uma geracao controlada e confirmar no Usage do 9Router o modelo, sucesso
   e a conta usada. Fazer chamadas suficientes para observar alternancia antes de
   declarar Round Robin validado.

O dominio real, DNS/tunnel e a rotacao da chave exigem acao humana e nao devem ser
inferidos nem automatizados sem autorizacao.

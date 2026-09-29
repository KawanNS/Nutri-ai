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

## Operacao local

O 9Router e uma dependencia externa do backend. O backend nao inicia, encerra ou
reinicia esse processo. Isso evita processos duplicados ou orfaos e preserva a
separacao entre o ciclo de vida da aplicacao e o do gateway.

Inicie uma unica instancia local em um terminal supervisionado:

```powershell
9router --host 127.0.0.1 --no-browser --log --skip-update
```

Mantenha o terminal aberto durante o desenvolvimento e encerre com `Ctrl+C`. Nao
use launchers adicionais se a porta `20128` ja estiver ocupada. O comando restringe
o listener a loopback, nao abre navegador e nao altera as variaveis do Nutri-AI.

O backend oferece dois checks distintos:

- `GET /health`: liveness do processo HTTP; nao chama banco, gateway ou provider.
- `GET /ready`: readiness de IA. Quando o gateway esta configurado, consulta
  `GET /v1/models` com timeout curto e sem gerar conteudo pago. Retorna `200` quando
  pronto e `503` com codigo sanitizado quando o gateway esta inacessivel ou rejeita
  autenticacao.

Falha de readiness nao encerra o backend: auth, perfil, historico e demais rotas
continuam disponiveis. Chamadas de IA permanecem fail-closed e retornam os erros
publicos sanitizados ja definidos por Plano, Assistente e Foto.

## Local versus producao

- Local com `AI_GATEWAY_BASE_URL` em loopback: o desenvolvedor inicia o 9Router
  separadamente e usa `/ready` antes de testar IA.
- Sem o par `AI_GATEWAY_*`: o adapter Gemini direto continua sendo selecionado e
  readiness verifica somente se sua configuracao server-side esta presente.
- Producao com gateway: a URL deve ser HTTPS e apontar para um gateway remotamente
  acessivel pelo backend. `127.0.0.1` so funcionaria se ambos estivessem no mesmo
  host/container, o que nao deve ser presumido.

Este repositorio nao possui manifesto do Render nem comprova os valores atualmente
instalados no servico hospedado. A configuracao real de producao deve ser verificada
no secret store e no health check do ambiente, sem copiar ou imprimir credenciais.

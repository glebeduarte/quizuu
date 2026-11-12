# Quizuu · contexto completo para qualquer chat

Atualizado em 12/11/2026. Leia este arquivo antes de mexer em qualquer parte do Quizuu.

## 1. O que é

Ferramenta gratuita (com plano pago) de **quiz ao vivo** no estilo Kahoot e **votações ao vivo** para aulas, cursos, palestras e eventos. O organizador projeta no telão; a plateia responde pelo celular, sem instalar nada. Dono: Glebe Duarte (glebejr@gmail.com, conta admin).

## 2. Onde está cada coisa

| Item | Onde |
|---|---|
| Site no ar | https://quizuubr.vercel.app (domínio antigo quizuu-beryl.vercel.app ainda aponta para o mesmo projeto) |
| Código | GitHub `glebeduarte/quizuu`, branch `main` |
| Hospedagem | Vercel, deploy automático a cada push em `main` (cerca de 1 min). O projeto está na conta pessoal do Glebe; o conector da Vercel do Claude não tem acesso a ele (404/403) |
| Banco, login, funções | Supabase, projeto `ekdffjubkhsrmoprsylw` (região sa-east-1) |
| Painel de etapas | `docs/etapas.html` no repositório (também publicado como artifact) |
| Especificação | `docs/especificacao.md` |
| Design system | Artifact "Quizuu" (Design System) e cópia em `docs/design-system/` |

URL pública do Supabase: `https://ekdffjubkhsrmoprsylw.supabase.co`
Chave publicável (pública, já está no código): `sb_publishable_G9IOb70jywn8RlNjh3kIoA_Pata2ONt`
Nunca coloque no código, no chat ou em docs a service role key, a chave do Gemini ou as chaves do Stripe.

## 3. Como acessar e modificar (o que funciona hoje)

1. **Código e deploy:** clonar `glebeduarte/quizuu`, editar, `npm run build` (o build roda `tsc`, então import sem uso quebra o deploy), commit e push em `main`. A Vercel publica sozinha. Confirme comparando o nome do bundle: `curl -s https://quizuubr.vercel.app/ | grep -o 'assets/index-[^"]*js'` contra `ls dist/assets`.
   - Mensagens de commit terminam com as linhas de coautoria pedidas pela sessão.
2. **Banco (SQL, migrations, edge functions):** o conector Supabase do Claude **perdeu permissão** neste projeto (`You do not have permission`). Por isso:
   - SQL novo vira um arquivo em `supabase/migrations/AAAAMMDDNNNNNN_nome.sql` e o Glebe roda no **SQL Editor** do Supabase.
   - Edge function nova ou alterada: entregar o `index.ts` e o Glebe cola em **Edge Functions** e clica em Deploy (atenção ao Verify JWT de cada uma, ver seção 6).
   - Se o conector voltar a funcionar, use `apply_migration` / `deploy_edge_function` direto.
3. **Testar pelo lado de fora (sem acesso ao banco):** chamar a API REST com a chave publicável. Ex.: RPC com `POST {url}/rest/v1/rpc/<nome>`. "permission denied" (42501) indica que a função existe e está protegida; `PGRST202` indica que não existe ou faltam parâmetros.
4. **Agir na conta do Glebe (criar quiz, votação etc.):** usar o **Claude in Chrome** no navegador dele, que já está logado em quizuubr.vercel.app. Abrir `/painel`, ler o token em `localStorage` (chave que contém `auth-token`), conferir que o e-mail é `glebejr@gmail.com` e chamar a REST com `Authorization: Bearer <access_token>`. Fechar a aba no fim. Receita na seção 9.
5. **Contas de teste:** criar com e-mail `teste.quizuu.<algo>@example.com` (cadastro não pede confirmação). Apagar depois em Admin › Contas.

## 4. Stack

React 18 + Vite 5 + TypeScript, react-router-dom 6, @supabase/supabase-js 2, qrcode.react, motion (animações da home). Sem framework de CSS: `src/styles.css` (tokens e componentes) e `src/home.css` (home). Funções serverless da Vercel em `api/` (Node, ESM). Edge functions do Supabase em Deno.

## 5. Rotas (src/main.tsx)

Públicas: `/` home · `/entrar` · `/criar-conta` · `/jogar` (jogador, aceita `?pin=`) · `/v/:code` (votar) · `/v/:code/tela` (tela de resultado, `?k=chave&p=pergunta`) · `/embed/:code` (página de incorporação via `api/embed.js`).
Logadas (todas dentro do `AppShell`, menu lateral roxo + barra de topo): `/painel` (Início) · `/painel/quizzes` · `/painel/relatorios` · `/quiz/:id` (editor) · `/gerar` (IA) · `/votacoes` · `/votacao/:id` (editor de votação, abas Perguntas e Apresentar) · `/plano` · `/relatorio/:sessionId` · `/host/:sessionId` (telão) · `/admin` e `/admin/:secao` (visao-geral, contas, assinaturas, uso, ia).

Arquivos principais: `src/pages/*.tsx`; `src/lib/AppShell.tsx` (layout), `auth.tsx`, `supabase.ts` (tem fallback com URL e chave públicas), `game.ts` (estado da partida, canal, save do jogador em `localStorage` chave `quizuu:jogador` com `pin` e `at`), `poll.ts`, `plan.ts`, `saveQuiz.ts`, `sound.ts`, `shapes.tsx`.

## 6. Banco de dados

Tabelas: `profiles`, `quizzes` (title ≤120), `questions` (prompt 1..300, kind `multiple_choice`|`true_false`, time_limit_s 5..120, points_multiplier 0|1|2, position), `options` (position 0..3, label 1..120, is_correct), `sessions` (pin 6 dígitos, status lobby|question|reveal|leaderboard|finished), `players` (nickname ≤20, score, streak, correct_time_ms, kicked), `answers`, `ai_generations` (source tema|material, questions, model, tokens_in, tokens_out), `polls` (code 6 chars, host_key), `poll_questions`, `poll_votes`, `admins`, `ai_access`, `ai_settings`, `subscriptions`.

RLS ligado em tudo. Funções principais (security definer):
- Partida: `join_session(pin, apelido)`, `rejoin_session`, `open_question`, `submit_answer`, `my_result`, `calc_points` (pontuação: até 1000 × multiplicador pela velocidade, bônus de sequência até 500; desempate por tempo e ordem de entrada).
- Filtro: `nickname_is_offensive(texto)` (apelidos e palavras da nuvem).
- Votações: `poll_public`, `poll_vote`, `poll_my_votes`, `poll_control`.
- Planos: `plan_of(user)` → admin|pro|free, `plan_limits(plano)`, `my_plan()`, `my_ai_access()`; gatilhos `enforce_quiz_limit` e `enforce_poll_limit` (erros `limite_plano_quizzes` / `limite_plano_votacoes`).
- Admin: `is_admin`, `admin_overview`, `admin_subscriptions`, `admin_ai`, `admin_reset_password`, `admin_set_admin`, `admin_delete_user`, `admin_set_ai_access`, `admin_set_ai_settings`.

Migrations em `supabase/migrations/`, todas aplicadas (a `20261015000001_editor.sql` não é usada). Realtime por broadcast: canal `sala:{sessionId}` (partida) e `poll:{CODE}` (votação). Storage: bucket privado `materiais` (até 30 MB, apagado após a geração).

## 7. Planos e limites

| Plano | Quizzes | Votações | IA |
|---|---|---|---|
| Grátis | 15 | 15 | 3 gerações no total |
| Pro (R$ 25/mês, Stripe) | 50 | 50 | 25 por mês |
| Admin | sem limite prático | | 1000/mês |

O admin pode liberar IA manualmente por conta (`ai_access`). Limites aplicados no banco.

## 8. Integrações e segredos (configurados no Supabase › Edge Functions › Secrets)

- **Gemini** (`gerar-quiz`, Verify JWT ligado): segredo `GEMINI_API_KEY`. Modelo `gemini-flash-latest` com reserva `gemini-flash-lite-latest`. Arquivos vão pela Files API do Gemini. Grava tokens em `ai_generations`.
- **Stripe** (modo produção): `stripe-checkout` (Verify JWT ligado; ações `checkout` e `portal`) e `stripe-webhook` (Verify JWT **desligado**). Segredos `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (aceita `prod_` ou `price_`), `STRIPE_WEBHOOK_SECRET`. Webhook em `https://ekdffjubkhsrmoprsylw.supabase.co/functions/v1/stripe-webhook`.
- **Keepalive** (Supabase grátis pausa após 7 dias): cron diário da Vercel em `api/keepalive` (vercel.json) e reserva a cada 3 dias no GitHub Actions (`.github/workflows/supabase-keepalive.yml`).
- **Canva:** incorporação ao vivo não funciona (Canva só aceita sites aprovados pelo Iframely). A aba Canva usa slide PNG com QR e link. **Keynote:** slides PNG 1920×1080 com QR e link para a tela. **PowerPoint:** suplemento Web Viewer com o link da tela.

## 9. Receita: criar um quiz na conta do Glebe pelo navegador

No Claude in Chrome, abrir `https://quizuubr.vercel.app/painel` e executar no console da página (javascript_tool):

```js
const U='https://ekdffjubkhsrmoprsylw.supabase.co', K='sb_publishable_G9IOb70jywn8RlNjh3kIoA_Pata2ONt';
const t=JSON.parse(localStorage.getItem(Object.keys(localStorage).find(x=>x.includes('auth-token'))));
if(t.user.email!=='glebejr@gmail.com') throw new Error('outra conta');
const H={apikey:K,Authorization:'Bearer '+t.access_token,'Content-Type':'application/json',Prefer:'return=representation'};
const post=async(tb,b)=>{const r=await fetch(U+'/rest/v1/'+tb,{method:'POST',headers:H,body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j));return j};
// Q = [[enunciado, [opções], índiceCerta, segundos, 'multiple_choice'|'true_false'], ...]
// verdadeiro/falso: opções ['Verdadeiro','Falso'], kind 'true_false'
const [quiz]=await post('quizzes',{owner_id:t.user.id,title:'Título'});
const qs=(await post('questions',Q.map((q,i)=>({quiz_id:quiz.id,position:i,kind:q[4],prompt:q[0],time_limit_s:q[3],points_multiplier:1})))).sort((a,b)=>a.position-b.position);
await post('options',qs.flatMap((qq,i)=>Q[i][1].map((l,k)=>({question_id:qq.id,position:k,label:l,is_correct:k===Q[i][2]}))));
```

Regras: enunciado ≤300 caracteres, opção ≤120, no máximo 4 opções. Pergunta aberta vira múltipla escolha com 3 alternativas erradas plausíveis e a certa em posições variadas. Conferir no fim que o número de opções certas é igual ao de perguntas.

## 10. Identidade visual

Cores de resposta (sempre com a forma): vermelho `#e2332b` triângulo, laranja `#e8620c` losango (cor da marca), amarelo `#ffbe1a` círculo (texto escuro `#22103a`), roxo `#7a2fe0` quadrado. Palco/telão `#3d1278`, fundo das telas de gestão `#fff6ee`. Fontes Baloo 2 (títulos) e Nunito (texto). Sombra sólida de 6 px embaixo de botões. Sem gradientes. Logos em `public/` (`logo-wordmark.png`, `logo-wordmark-light.png`, `icon-512.png`). Ícones e imagem de compartilhamento já gerados (`og-image.png`, `site.webmanifest`).

## 11. Comportamentos importantes e decisões

- Login por e-mail e senha, sem confirmação de e-mail.
- Sem upload de imagem ou vídeo nas perguntas.
- Telão confere a lista de jogadores a cada 3 s no lobby. Celular descarta a entrada guardada se o QR trouxer outro PIN ou se a entrada tiver mais de 12 h.
- Pódio mostra até o 5º lugar (ordem na tela 4º, 2º, 1º, 3º, 5º).
- Músicas próprias em `public/audio/` (lobby, pergunta, pódio). Sons respeitam o botão de som.
- Home com animações (motion); com "reduzir movimento" do sistema, só esmaecimentos.

## 12. Como o Glebe quer as respostas

Português do Brasil, direto. Sem travessão (em-dash), sem "não é X, é Y", sem linguagem de venda genérica, sem metáforas ornamentais nem frases de suspense. Ao terminar, dizer o que foi feito e o que ele precisa fazer (por exemplo, rodar um SQL), e o que foi ou não testado.

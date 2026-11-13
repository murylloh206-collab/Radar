# Confiabilidade do WhatsApp — Etapa 1 (design)

Data: 2026-11-12 · Status: aprovado pelo dono em 2026-11-12

## Por quê
O copiador precisa operar sozinho, 24h, sem o PC do dono ligado, para o Radar de Ofertas poder ser vendido.
Diagnóstico com dados reais (48h, leitura somente):
- Nenhum evento chegou entre 07h e 19h de 12/11 e entre 15h e 18h de 11/11. O gateway Evolution está no Render **Free**
  e dorme sem tráfego; ao acordar, o histórico chega velho e 58 ofertas foram descartadas (> 2h).
- Não existe processador contínuo na nuvem (Render não tem worker gratuito). A fila só anda quando chega webhook ou o PC liga.
- 15 ofertas barradas pelo limite de plano (100/dia) aplicado à própria conta do dono; contagem usa `created_at`.
- 24 falhas "Connection Closed" (sessão instável do gateway).
- Título lixo enviado ("Shopping Cart Icon"); nenhuma checagem de que o texto final contém link e preço.
- "Enviados hoje" é calculado de 4 jeitos diferentes (plano, dashboard em UTC, copiador, banco).

## Objetivos (hoje)
1. Gateway sempre acordado e fila processada a cada minuto, sem máquina local.
2. Nenhuma mensagem automática sai sem link de afiliado, sem preço ou com título lixo — vai para revisão.
3. Conta do dono sem limite de plano; contagem diária única (por `sent_at`, fuso America/Sao_Paulo).
4. Rotas de disparo protegidas; nenhuma chave escrita no código.
5. Watchdog atende todas as conexões, não só a primeira.

## Não-objetivos (Etapa 2 — prontidão para venda)
Corrigir os 20 testes já quebrados de outras áreas, multi-cliente completo, migração do gateway para plano pago,
imagens (comportamento atual de mandar para revisão sem foto está correto).

## Anti-objetivos
Qualquer envio real durante desenvolvimento; reenviar automaticamente publicação com resultado "incerto" (geraria duplicata).

## Abordagens consideradas
- **A. Agendador no Supabase (`pg_cron` + `pg_net`) — escolhida pelo dono.** Banco chama gateway (manter acordado)
  e `/api/worker/poll` (processa fila) a cada minuto. Grátis, sem conta nova, substitui o worker inexistente.
- B. Pinger externo (UptimeRobot/cron-job.org): bom como alarme, intervalo mínimo 5 min. Opcional depois.
- C. Gateway no Render pago: definitivo; recomendado antes de vender (Etapa 2).

## Desenho
- **Migração `supabase/migrations/08_cron_keepalive.sql`:** habilita `pg_cron`/`pg_net`; lê URL do painel, URL do gateway
  e `CRON_SECRET` do Supabase Vault; agenda: a cada 1 min `POST /api/worker/poll` (Bearer); a cada 5 min `GET` no gateway
  e `POST /api/cron/process-scheduled` (watchdog + recuperação de histórico). Rodada uma vez pelo dono no SQL Editor.
- **Rotas:** `/api/cron/process-scheduled` passa a exigir `CRON_SECRET` por cabeçalho (mesma regra de `/api/worker/poll`);
  `/api/worker/trigger` perde o segredo padrão embutido; watchdog perde a chave embutida (só variáveis de ambiente).
- **Watchdog:** itera todas as `whatsapp_connections` com credenciais próprias de cada uma.
- **Guarda de conteúdo** (antes de agendar e de novo em `validateJobForDispatch`): exige o link exibido no texto,
  preço "Por R$ x" > 0 e título fora de lista de lixo (ícone, "Shopping Cart", genéricos). Falhou → `aguardando_aprovacao` com motivo.
  Título lixo tenta antes o título extraído da mensagem do grupo.
- **Contagem diária única:** uma função compartilhada (`sent_at` ≥ meia-noite de Brasília, status `enviado`) usada por
  plano, copiador e dashboard. Conta dona (`ADMIN_UUID`/role admin) sem limite de plano; vale `max_daily_messages`.
- **Duplicatas:** teste reproduzindo a mesma oferta com links diferentes de dois remetentes; corrigir se reproduzir
  (comparar por produto/ID externo, não só URL, na janela de 24h).
- **Connection Closed:** reprogramar com espera crescente (20s, 60s, 180s) em vez de marcar recusa.

## Verificação
- Testes automatizados novos para cada item acima (TDD), com gateway simulado — nenhum envio real.
- Suítes do copiador existentes devem continuar como estão (sem novas falhas).
- Simulação ponta a ponta via `/api/copier/test-incoming` em modo prévia.
- Primeiro envio real: só após aprovação do dono, observando o fluxo normal (ou grupo de teste, se indicado).

## Depende do dono
- `CRON_SECRET` **nunca foi criado na Vercel** (existe só no `.env.local`). Gerar um valor novo e forte, cadastrar na Vercel
  (Production) e no Supabase Vault com o mesmo valor; passo a passo entregue pronto ao dono.
- Aprovar o push/deploy e colar a migração 08 no SQL Editor.

## Calls feitos por mim (revisar)
Intervalos 1 min / 5 min; lista de títulos-lixo; espera crescente do Connection Closed; conta dona isenta só do limite de plano.

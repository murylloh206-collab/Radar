# Confiabilidade do WhatsApp — Etapa 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copiador do Radar de Ofertas operando 24h sem o PC do dono: gateway mantido acordado e fila processada pelo agendador do Supabase, envios só com conteúdo completo, contagem diária única e rotas protegidas.

**Architecture:** O Supabase (`pg_cron` + `pg_net`) chama a cada minuto `/api/worker/poll` (fila) e a cada 5 min o gateway e `/api/cron/process-scheduled` (watchdog), autenticados por `CRON_SECRET`. Correções de regra ficam em módulos pequenos e puros (`cron-auth`, `daily-sent-counter`, `offer-content-guard`) usados pelas rotas, copiador, validador e dashboard.

**Tech Stack:** Next.js 15 (rotas App Router), TypeScript, Supabase (Postgres, Vault, pg_cron, pg_net), Evolution API, testes `node:test` via `npx tsx --conditions react-server --test`.

**Spec:** `docs/superpowers/specs/2026-11-12-whatsapp-confiabilidade-design.md`

## Global Constraints

- Nenhum envio real durante o desenvolvimento: todo teste que toca gateway usa `globalThis.fetch` simulado.
- Nunca reenviar automaticamente publicação com `runtime_delivery = 'uncertain'`.
- Nenhuma chave/segredo literal no código (`radar_wa_key_88392104`, `radar_cron_secret_772819034` devem sumir de `src/`).
- Segredo de cron só por cabeçalho: `Authorization: Bearer <CRON_SECRET>` ou `x-cron-secret`; segredo na URL → 400; segredo ausente no servidor → 503; inválido → 401.
- "Enviados hoje" = `status = 'enviado'` e `sent_at >= meia-noite America/Sao_Paulo`.
- Conta dona = `ADMIN_UUID` (`src/lib/server/auth.ts:23`): isenta do limite de plano; continua sujeita a `user_settings.max_daily_messages`.
- Texto e mensagens ao usuário em português do Brasil com acentuação.
- Base de testes antes da mudança: 135 testes, 115 passam, 20 falham (lista em "Task 8"). Nenhuma falha nova é aceitável.

## Review Focus

1. Template de origem sem `{link}` → texto final sem link: deve ir para revisão, nunca `agendado` (teste na Task 4).
2. Preço não encontrado em lugar nenhum (`{preco_por}` vazio, "Por " sem R$) → revisão (Task 4).
3. Navegador do painel chamando `/api/copier/watchdog` com sessão de usuário continua funcionando depois da proteção (Task 1).
4. Virada do dia às 00:00 de Brasília com servidor em UTC (03:00Z): envio às 23:30 BRT do dia anterior não conta hoje (Task 3).
5. Mesma oferta chegando por dois links diferentes (ex.: `meli.la` e link longo do ML do mesmo MLB) para o mesmo destino → só um envio (Task 5).

---

### Task 1: Autenticação única das rotas de disparo

**Files:**
- Create: `src/lib/server/cron-auth.ts`
- Modify: `src/app/api/worker/poll/route.ts` (trocar bloco de validação 1–3 pelo helper)
- Modify: `src/app/api/cron/process-scheduled/route.ts`
- Modify: `src/app/api/worker/trigger/route.ts` (remover fallback `'radar_cron_secret_772819034'`)
- Modify: `src/app/api/copier/watchdog/route.ts`
- Test: `tests/whatsapp_reliability_routes.test.ts`

**Interfaces:**
- Produces: `checkCronSecret(req: NextRequest): NextResponse | null` — `null` = autorizado; senão a resposta de erro pronta (400/401/503 conforme Global Constraints).
- Produces: `/api/copier/watchdog` aceita sessão válida (`getSessionFromRequest(req)` de `auth.ts`) **ou** cron; com sessão roda o watchdog só para `session.userId` (ver Task 2).

- [ ] **Step 1: Write the failing tests** em `tests/whatsapp_reliability_routes.test.ts` (padrão de `tests/isolated_whatsapp_worker.test.ts`: salvar/restaurar `process.env.CRON_SECRET`, `new NextRequest(...)`, `globalThis.fetch` simulado retornando 200):
  - `process-scheduled sem cabeçalho → 401` (com `CRON_SECRET='s3'`)
  - `process-scheduled com ?secret=s3 → 400`
  - `process-scheduled sem CRON_SECRET no servidor → 503`
  - `process-scheduled com Authorization: Bearer s3 → status != 401/400/503`
  - `trigger sem CRON_SECRET e com Bearer radar_cron_secret_772819034 → 401` (ou 503)
  - `copier/watchdog sem sessão e sem cron → 401`
  - `copier/watchdog com cookie de sessão assinado (signSession, SESSION_COOKIE_NAME) → != 401`
- [ ] **Step 2: Run** `npx tsx --conditions react-server --test tests/whatsapp_reliability_routes.test.ts` — Expected: FAIL (rotas abertas).
- [ ] **Step 3: Implement** `checkCronSecret` com comparação `timingSafeEqual` sobre hash SHA-256 (mesmo padrão de `acceptCopierEvent`) e aplicar nas 4 rotas. `trigger`: admin **ou** `checkCronSecret` nulo.
- [ ] **Step 4: Run** o arquivo novo + `tests/isolated_whatsapp_worker.test.ts` — Expected: novos PASS; o arquivo antigo sem falhas além das já listadas na base.
- [ ] **Step 5: Commit** `fix(rotas): exigir CRON_SECRET ou sessão nas rotas de disparo`

### Task 2: Watchdog para todas as conexões, sem chaves embutidas

**Files:**
- Modify: `src/lib/server/copier-watchdog.ts` (remover `DEFAULT_GATEWAY_URL/KEY/INSTANCE`, iterar conexões)
- Modify: `src/lib/server/copier-group-catalog.ts:15-16` (remover fallbacks literais de URL e chave)
- Modify: `src/lib/server/copier-runtime.ts` (exportar `serviceSession`)
- Test: `tests/whatsapp_reliability_watchdog.test.ts`

**Interfaces:**
- Consumes: `scopedCopierRules(session, connectionId)` → `{ connection: { baseUrl, apiKey, instanceName, ownerJid } }` (credencial real de cada conexão).
- Produces: `runCopierWatchdog(forceRestart = false, options?: { userId?: string }): Promise<WatchdogReport>`; `WatchdogReport` mantém os campos atuais (preenchidos pela primeira conexão, para a UI) e ganha `connections: Array<{ connectionId: string; instanceName: string; state: string; restarted: boolean; recoveredFromHistory: number; error?: string }>`.
- Produces: `export function resolveGatewayEnv(): { baseUrl: string; apiKey: string } | null` em `copier-group-catalog.ts` — `null` quando as variáveis não existem.

- [ ] **Step 1: Write failing tests:**
  - `grep` programático: `fs.readFileSync` de `copier-watchdog.ts`, `copier-group-catalog.ts`, `worker/trigger/route.ts` não contém `radar_wa_key_88392104` nem `radar_cron_secret_772819034`.
  - `resolveGatewayEnv()` com env vazio → `null`; com `EVOLUTION_BASE_URL`/`EVOLUTION_API_KEY` → valores aparados.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Watchdog: `select * from whatsapp_connections` (filtrado por `user_id` quando `options.userId`), para cada linha obter credenciais via `scopedCopierRules(serviceSession(row.user_id), row.id)`; erro em uma conexão vai para `connections[i].error` e não interrompe as demais; ciclo `runDurableCopierCycle` roda uma vez ao final. Sem credencial → conexão registrada com `error: 'Gateway não configurado'`.
- [ ] **Step 4: Run** arquivo novo + `tests/copier_dedup_and_recovery.test.ts` — Expected: PASS / sem falhas novas.
- [ ] **Step 5: Commit** `fix(watchdog): atender todas as conexões e remover chaves embutidas`

### Task 3: Contagem diária única + conta dona sem limite de plano

**Files:**
- Create: `src/lib/server/daily-sent-counter.ts`
- Modify: `src/lib/server/plan-guard.ts:386-447` (`getDailyOfferQuotaStatus`)
- Modify: `src/lib/server/copier-activity.ts` (usar `startOfTodaySaoPaulo`)
- Modify: `src/app/api/analytics/dashboard/route.ts:103-114` (`startOfToday`, `startOfMonth` em Brasília; `sentToday` por `sentAt`)
- Test: `tests/whatsapp_reliability_counters.test.ts`

**Interfaces:**
- Produces: `startOfTodaySaoPaulo(now?: Date): Date`
- Produces: `isSentToday(job: { status?: string; sentAt?: string | null }, now?: Date): boolean`
- Produces: `countSentToday(userId: string, opts?: { connectionId?: string }): Promise<number>` (Supabase: `status='enviado'`, `sent_at >= startOfTodaySaoPaulo()`; sem Supabase: `readDatabase().jobs` com `isSentToday`).

- [ ] **Step 1: Write failing tests:**
  - `startOfTodaySaoPaulo(new Date('2026-11-13T02:30:00Z')).toISOString() === '2026-11-12T03:00:00.000Z'`
  - `isSentToday({status:'enviado', sentAt:'2026-11-12T02:30:00Z'}, new Date('2026-11-12T15:00:00Z')) === false` (23:30 BRT do dia 11)
  - `isSentToday({status:'enviado', sentAt:'2026-11-12T03:05:00Z'}, new Date('2026-11-12T15:00:00Z')) === true`
  - `isSentToday({status:'falha', sentAt:'2026-11-12T12:00:00Z'}, ...) === false`
  - `getDailyOfferQuotaStatus(ADMIN_UUID)` → `dailyLimit === null`, `limitReached === false` (rodar em modo isolado, como os testes de `saas_phase*`).
- [ ] **Step 2: Run** — Expected: FAIL (módulo inexistente; admin limitado a 100).
- [ ] **Step 3: Implement.** `getDailyOfferQuotaStatus` usa `countSentToday` (remove contagem por `created_at` e o "complemento" local divergente); se `userId === ADMIN_UUID` → `dailyLimit = null`.
- [ ] **Step 4: Run** arquivo novo + `npm run test:saas` — Expected: PASS / sem falhas novas.
- [ ] **Step 5: Commit** `fix(contadores): contagem diária única em Brasília e conta dona sem limite de plano`

### Task 4: Guarda de conteúdo (link, preço, título)

**Files:**
- Create: `src/lib/server/offer-content-guard.ts`
- Modify: `src/lib/server/copier-service.ts:991-999` (`isGenericStoreTitle` também usa `isJunkProductTitle`), `:1274-1280` (`isAutomaticAllowed` + motivo em `errorDetails`)
- Modify: `src/lib/server/job-validator.ts` (após checagem de "R$ 0,00", linha ~96)
- Test: `tests/whatsapp_reliability_content.test.ts`

**Interfaces:**
- Produces: `isJunkProductTitle(title?: string): boolean` — true para vazio, < 5 caracteres, ou casando `/\b(icon|ícone|logo|shopping cart|carrinho de compras|imagem|image|loading|carregando)\b/i`.
- Produces: `checkOfferContent(input: { messageText: string; displayUrl?: string; title?: string }): { ok: true } | { ok: false; reason: string }` — falha se: `displayUrl` informado e ausente do texto; texto sem `https?://`; sem `/R\$\s?\d/` ou só com `R$ 0,00`; `isJunkProductTitle(title)`.

- [ ] **Step 1: Write failing tests:**
  - `isJunkProductTitle('Shopping Cart Icon') === true`; `('Kit 10 Cuecas Boxer Lisa Polo Wear') === false`; `('') === true`
  - `checkOfferContent({messageText:'*Tênis*\n🔥 *Por R$ 99,90*\nhttps://s.shopee.com.br/x', displayUrl:'https://s.shopee.com.br/x', title:'Tênis Nike'}).ok === true`
  - sem link no texto (template sem `{link}`) → `ok false`, `reason` contém `'link'`
  - `'Por *'` sem R$ → `ok false`, `reason` contém `'preço'`
  - `validateJobForDispatch` com job `copiador` cujo `messageText` não tem `http` → `valid === false` (usar `mockDb` de `tests/copier_definitive_fixes.test.ts` teste 2)
  - Integração: `processIncomingMessage` em modo de teste isolado (padrão de `tests/copier_template_prices_and_coupon.test.ts`) com `templateText` sem `{link}` → job criado com `status === 'aguardando_aprovacao'`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** No copiador: calcular `contentCheck = checkOfferContent({ messageText: formattedMessage, displayUrl: displayAffiliateUrl, title: productData.title })` logo após `buildWhatsAppMessage`; `!contentCheck.ok` impede `isAutomaticAllowed` e grava `contentCheck.reason` em `errorDetails`. No validador: aplicar `checkOfferContent({ messageText })` (sem `displayUrl`, pois o link exibido pode ser encurtado).
- [ ] **Step 4: Run** arquivo novo + `tests/copier_template_prices_and_coupon.test.ts tests/copier_definitive_fixes.test.ts tests/offers_formatting_acceptance.test.ts` — Expected: PASS / sem falhas novas.
- [ ] **Step 5: Commit** `fix(copiador): bloquear envio automático sem link, sem preço ou com título inválido`

### Task 5: Duplicatas por links diferentes da mesma oferta

**Files:**
- Test: `tests/whatsapp_reliability_dedup.test.ts`
- Modify (só se o teste reproduzir): `src/lib/server/copier-service.ts` (`isDuplicateOfferJob` / `extractCanonicalProductId`) e/ou `src/lib/server/copier-runtime.ts` (`acceptCopierEvent`, janela de 50 eventos)

**Interfaces:**
- Consumes: `isDuplicateOfferJob(candidate, existingJobs, windowHours = 24)` e `computeIncomingOfferFingerprint(text)` existentes.

- [ ] **Step 1: Write tests:**
  - Job enviado com `cleanUrl` `https://www.mercadolivre.com.br/.../p/MLB123456` e candidato com `originalUrl` `https://produto.mercadolivre.com.br/MLB-123456-...` mesmo `targetJid` → `true`.
  - Mesmo produto, títulos com emojis/caixa diferentes e URLs distintas sem ID canônico → `true` via título normalizado.
  - Produtos diferentes no mesmo grupo → `false`; mesmo produto em grupo diferente → `false`.
  - `acceptCopierEvent`: 60 eventos recentes distintos + o 61º repetindo o URL do 1º → não inserido (simular cliente Supabase como nos testes de `copier_dedup_and_recovery`).
- [ ] **Step 2: Run** — Registrar quais reproduzem. Se todos passam, nenhum código muda e o relatório final diz que a causa não foi reproduzida (ver Task 8, observação em produção).
- [ ] **Step 3: Implement** apenas o que falhou: aumentar a janela de leitura para 200 eventos e/ou cobrir o formato de ID que escapou.
- [ ] **Step 4: Run** arquivo novo + `tests/copier_dedup_and_recovery.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(copiador): reconhecer a mesma oferta com links diferentes` (ou `test(copiador): cobrir duplicatas por links distintos`)

### Task 6: "Connection Closed" com espera crescente

**Files:**
- Modify: `src/lib/server/copier-runtime.ts` (bloco `isConnectionClosed` em `sendEntry`)
- Test: `tests/whatsapp_reliability_retry.test.ts`

**Interfaces:**
- Produces: `export function connectionClosedRetryDelayMs(attempts: number): number` — `1 → 20000`, `2 → 60000`, `>=3 → 180000`.

- [ ] **Step 1: Write failing test** com os três valores acima e `connectionClosedRetryDelayMs(0) === 20000`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** e usar em `scheduled_for`; manter limite `row.attempts < (row.max_attempts || 3)`; ao esgotar, `runtime_delivery: 'rejected'` com mensagem "Sessão do WhatsApp instável após 3 tentativas."
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `fix(envio): reenvio com espera crescente quando a sessão do WhatsApp oscila`

### Task 7: Agendador no Supabase + roteiro do dono

**Files:**
- Create: `supabase/migrations/08_cron_keepalive.sql`
- Create: `docs/superpowers/runbooks/2026-11-12-ativar-agendador.md`
- Test: `tests/whatsapp_reliability_migration.test.ts`

**Interfaces:**
- Consumes: segredos do Vault `radar_app_url` (ex.: `https://painel-de-ofertas.vercel.app`), `radar_gateway_url`, `radar_cron_secret`.
- Produces: jobs `pg_cron` `radar-fila` (`* * * * *`, `net.http_post` em `<app>/api/worker/poll`, timeout 55000 ms), `radar-gateway-acordar` (`*/5 * * * *`, `net.http_get` em `<gateway>/`), `radar-watchdog` (`*/5 * * * *`, `net.http_post` em `<app>/api/cron/process-scheduled`). Todos com `Authorization: Bearer` lido de `vault.decrypted_secrets` dentro do comando (segredo nunca literal no SQL).

- [ ] **Step 1: Write failing test** que lê o SQL e verifica: `create extension if not exists pg_cron`, `pg_net`, os três nomes de job, `vault.decrypted_secrets`, uso de `cron.unschedule` antes de `cron.schedule` (idempotente) e ausência de qualquer string de 20+ caracteres alfanuméricos que pareça segredo.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write** a migração e o roteiro: (1) gerar segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; (2) Vercel → Settings → Environment Variables → `CRON_SECRET` (Production) e `APP_URL`; redeploy; (3) Supabase → SQL Editor: `select vault.create_secret('<valor>','radar_cron_secret');` e os outros dois; (4) colar `08_cron_keepalive.sql`; (5) conferir com `select jobname, schedule from cron.job;` e `select status_code, created from net._http_response order by created desc limit 5;`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(agendador): manter gateway acordado e processar fila pelo Supabase`

### Task 8: Verificação final e simulação

- [ ] **Step 1:** `npm run typecheck` — Expected: sem erros novos em arquivos tocados.
- [ ] **Step 2:** `npx tsx --conditions react-server --test --test-concurrency=1 tests/*.test.ts` — Expected: os 20 da base continuam sendo as únicas falhas (lista abaixo); todos os `whatsapp_reliability_*` passam.
  Base de falhas: `isolated_whatsapp_worker` (1.1, 1.3, 1.5, 2.6, 3.2, 3.3, 3.4, 5. Sincronização ao vivo), `whatsapp_connections_management` (Cenários 2, 3, 4), `acceptance`/`validate_flow` (1, 2, 3, 4, 5 Idempotência, 6 rota de status, 6 Seleção), `5. Message Builder`, `Fase 4: Alerta de Queda de Preço`. Atenção: a Task 1 muda o 1.1/1.3 — se passarem a passar, ótimo; se mudarem de motivo, registrar.
- [ ] **Step 3:** Simulação sem envio: `/api/copier/test-incoming` em modo prévia com uma mensagem real do grupo de origem (texto colado) → prévia com link, preço e foto; e com template sem `{link}` → revisão.
- [ ] **Step 4:** Atualizar `README.md` (seção do copiador): como o agendador funciona e onde ver o estado.
- [ ] **Step 5: Commit** `docs: agendador e verificação do copiador`. Push/deploy **só com aprovação do dono**; depois, entregar o roteiro da Task 7 e observar o primeiro ciclo real pelo `diag.mjs`.

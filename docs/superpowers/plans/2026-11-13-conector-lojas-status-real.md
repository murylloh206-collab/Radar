# Conector de lojas + status real — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensão conecta Mercado Livre, Rakuten/Netshoes e Amazon com um clique na página da loja, vinculada à conta logada, e painel/extensão mostram status testado de verdade (na hora e diariamente).

**Architecture:** Servidor ganha 3 módulos novos (`store-health`, `rakuten-auth`, `extension-auth`) e rotas sob `/api/extension/*` (token da extensão) e `/api/store-health` (sessão do painel). O conversor passa a usar token Rakuten renovado e deixa de cair em fallback no ML. A extensão ganha extratores puros testáveis e um popup que pareia, lê a página ativa e mostra o status vindo do servidor.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres, pg_cron, pg_net, Vault), Chrome Extension MV3, testes `node:test` via `npx tsx --conditions react-server --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-conector-lojas-status-real-design.md`

## Global Constraints

- Branch `feat/conector-lojas`; nada de push/deploy sem o dono confirmar.
- Linha de base: 20 testes falhando antes desta branch. Ao final: mesmos 20, nenhum novo.
- Nenhum envio real de WhatsApp em teste; chamadas externas sempre com `fetch` mockado nos testes.
- Segredos (Client Secret, cookies, tokens) nunca em logs, respostas de API ou `console.*`; status mostra no máximo "termina em XXXX".
- Campos do cofre para Rakuten: `appId` = Client ID, `appSecret` = Client Secret, `affiliateTag` = SID (7 dígitos), `sessionData.netshoesAdvertiserId` = código da Netshoes descoberto.
- Status por loja, valores exatos: `ok` (✅ Conectado), `falhou` (❌ Falhou), `sem_teste` (🟡 Amazon sem API), `nao_configurado` (⚪).
- Motivos em português simples (ex.: "Sessão do Mercado Livre expirou. Reconecte pela extensão.").
- Rotas que a extensão chama recusam (401) sem token válido — nunca usam `ADMIN_UUID` como fallback.
- Token Rakuten: `POST https://api.linksynergy.com/token`, header `Authorization: Bearer base64(clientId:clientSecret)`, corpo form `scope={SID}`; validade 3600 s; renovar com 5 min de folga.

## Review Focus

1. Token Rakuten em cache rejeitado (401) antes do prazo → descartar cache, gerar novo uma vez e repetir a chamada (teste na Task 2).
2. Token da extensão revogado/inválido → 401 com `code: 'EXTENSION_UNPAIRED'`; popup mostra "Reconecte a extensão ao painel" (testes nas Tasks 5 e 7).
3. Página da loja aberta sem login ou layout mudado → extrator devolve `null` e o popup abre o campo para colar (testes na Task 7).
4. Checagem diária com uma loja lançando exceção ou travando → as outras continuam, cada uma com timeout de 15 s (teste na Task 4).
5. Resposta de status nunca contém segredo, mesmo com cofre cheio (teste na Task 6).

---

### Task 1: Tabela e módulo de saúde por loja

**Files:**
- Create: `supabase/migrations/10_store_connector.sql` (parte 1: tabela `store_health`)
- Create: `src/lib/server/store-health.ts`
- Test: `tests/store_health.test.ts`

**Interfaces:**
- Produces:
  - `type StoreHealthStatus = 'ok' | 'falhou' | 'sem_teste' | 'nao_configurado'`
  - `interface StoreHealth { storeName: StoreName; status: StoreHealthStatus; reason: string | null; lastCheckedAt: string | null; lastOkAt: string | null }`
  - `interface StoreHealthRepo { upsert(userId: string, h: StoreHealth): Promise<void>; list(userId: string): Promise<StoreHealth[]> }`
  - `supabaseStoreHealthRepo(): StoreHealthRepo`, `memoryStoreHealthRepo(): StoreHealthRepo`
  - `recordStoreHealth(userId, storeName, result: { status: StoreHealthStatus; reason?: string }, repo?): Promise<StoreHealth>` — preenche `lastCheckedAt = now`; `lastOkAt = now` só se `ok`, senão mantém o anterior.
  - `getStoreHealthMap(userId, repo?): Promise<Record<StoreName, StoreHealth>>` — lojas sem linha voltam `nao_configurado`.

SQL: `store_health(user_id uuid, store_name text, status text check (status in ('ok','falhou','sem_teste','nao_configurado')), reason text, last_checked_at timestamptz, last_ok_at timestamptz, primary key (user_id, store_name))`, RLS ligada sem políticas públicas (acesso só via service role).

- [ ] **Step 1: Testes** — `recordStoreHealth` com `ok` grava `lastOkAt`; depois `falhou` mantém o `lastOkAt` anterior e grava `reason`; `getStoreHealthMap` de usuário vazio devolve as 5 lojas com `nao_configurado`; dois usuários não enxergam a saúde um do outro (memoryRepo).
- [ ] **Step 2: Rodar** `npx tsx --conditions react-server --test tests/store_health.test.ts` — FAIL (módulo não existe).
- [ ] **Step 3: Implementar** módulo + migração parte 1.
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** `feat(conector): saúde de conexão por loja`

### Task 2: Autenticação Rakuten com renovação

**Files:**
- Create: `src/lib/server/rakuten-auth.ts`
- Test: `tests/rakuten_auth.test.ts`

**Interfaces:**
- Produces:
  - `buildRakutenTokenKey(clientId: string, clientSecret: string): string` — base64 de `clientId:clientSecret`.
  - `getRakutenAccessToken(c: { clientId: string; clientSecret: string; sid: string }, opts?: { forceRefresh?: boolean; now?: () => number }): Promise<string>` — cache em memória por `clientId+sid`; lança `RakutenAuthError(message, code: 'credenciais_invalidas' | 'indisponivel')`.
  - `rakutenFetch(c, url: string, init: RequestInit): Promise<Response>` — injeta Bearer; em 401 refaz token uma vez (`forceRefresh`) e repete.
  - `findNetshoesAdvertiserId(c): Promise<string | null>` — `GET https://api.linksynergy.com/v2/advertisers` via `rakutenFetch`, procura nome que case `/netshoes/i`, devolve `String(id)`. Aceitar resposta com lista em `advertisers` ou na raiz.

- [ ] **Step 1: Testes** (fetch mockado):
  - `buildRakutenTokenKey('abc','xyz') === Buffer.from('abc:xyz').toString('base64')`
  - token pedido com header `Authorization: Bearer <tokenKey>` e corpo contendo `scope=1234567`; segunda chamada dentro de 55 min não chama `/token` de novo; com `now` +56 min chama.
  - `/token` respondendo 401 → `RakutenAuthError` com code `credenciais_invalidas` e mensagem "Client ID, Client Secret ou SID da Rakuten inválidos."
  - Review Focus 1: `rakutenFetch` recebe 401 na primeira chamada à API, gera token novo e a segunda tentativa é feita (2 chamadas a `/token`, 2 à API).
  - `findNetshoesAdvertiserId` com `{advertisers:[{id:111,name:'Outra'},{id:43984,name:'Netshoes BR'}]}` → `'43984'`; sem Netshoes → `null`.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** `feat(rakuten): token renovado automaticamente`

### Task 3: Conversor — Netshoes pela Rakuten nova e ML sem fallback

**Files:**
- Modify: `src/lib/server/affiliate-converter.ts` (ramo `netshoes` ~641; ramo `mercadolivre` com `tryGenerateMercadoLivreMeliLaLink`; `tryGenerateRakutenDeepLink` ~419 passa a receber as credenciais e usar `rakutenFetch`)
- Test: `tests/netshoes_rakuten_conversion.test.ts` (novo nesta branch), `tests/mercadolivre_melila_only.test.ts`

**Interfaces:**
- Consumes: `rakutenFetch`, `getRakutenAccessToken`, `RakutenAuthError` (Task 2); `recordStoreHealth` (Task 1).
- Produces: comportamento do `convertToAffiliateLink` (assinatura inalterada).

Regras: Netshoes exige `appId`, `appSecret`, `affiliateTag` (SID) e `sessionData.netshoesAdvertiserId`; faltando qualquer um → `success:false` com mensagem "Conecte a Rakuten pela extensão (faltando: …)". Deep link OK → `verificado`/auto. ML: sem meli.la → `isAutoDispatchAllowed:false`, `verificationStatus:'nao_verificado'`, `affiliateUrl:null`, motivo "Sessão do Mercado Livre expirou. Reconecte pela extensão." e `recordStoreHealth(userId,'mercadolivre',{status:'falhou',reason})` quando a API do ML responder 401/403 (não em erro de rede). `tryGenerateMercadoLivreMeliLaLink` passa a retornar `{ link: string | null; unauthorized: boolean }`. O `userId` vem de `storeCreds.userId`.

- [ ] **Step 1: Testes** — Netshoes com as 4 informações gera link e libera envio; sem `netshoesAdvertiserId` falha com "faltando"; ML com API 401 → sem link, sem auto-envio, motivo exato acima, saúde gravada como `falhou`; ML com meli.la OK → `https://meli.la/...` e auto-envio; ML com erro de rede → sem link, saúde **não** alterada.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** os dois arquivos + `tests/amazon_tag_conversion.test.ts` — PASS.
- [ ] **Step 5: Commit** `fix(conversor): Netshoes com token renovado e ML só com meli.la`

### Task 4: Testes de conexão por loja + checagem diária

**Files:**
- Create: `src/lib/server/store-health-checks.ts`
- Create: `src/app/api/cron/store-health/route.ts`
- Modify: `supabase/migrations/10_store_connector.sql` (parte 2: job `radar-lojas-saude`, `0 11 * * *` = 08:00 Brasília, mesmo padrão de `08_cron_keepalive.sql`, POST em `/api/cron/store-health`)
- Test: `tests/store_health_checks.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `getStoreCredentialsMapWithSecrets`, `saveStoreCredentials` (cofre); `checkCronSecret`.
- Produces:
  - `checkStoreConnection(userId: string, store: StoreName, deps?): Promise<StoreHealth>` — ML: gera meli.la de `https://www.mercadolivre.com.br/p/MLB39016247`; Rakuten: `getRakutenAccessToken(forceRefresh)` + `findNetshoesAdvertiserId` (salva no `sessionData` se mudou) + deep link de `https://www.netshoes.com.br/`; Amazon: tag casa `/^[a-z0-9][a-z0-9-]{1,60}-2\d$/i` → `sem_teste`, senão `falhou`; sem credencial → `nao_configurado`. Grava via `recordStoreHealth`.
  - `runDailyStoreHealth(opts?: { deadlineAt?: number; perStoreTimeoutMs?: number }): Promise<{ checked: number; failed: number }>` — todos os usuários com credencial ativa; timeout 15 s por loja.
- Rota: `POST` com `checkCronSecret`; 401 sem segredo.

- [ ] **Step 1: Testes** — cada loja nos estados acima (deps mockadas); Review Focus 4: uma loja lança e outra trava >15 s → as demais gravam resultado e o retorno conta `failed`; rota sem segredo → 401.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar** módulo, rota e parte 2 da migração.
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** `feat(conector): teste de conexão na hora e diário`

### Task 5: Pareamento extensão ↔ conta (Supabase)

**Files:**
- Create: `src/lib/server/extension-auth.ts`
- Modify: `supabase/migrations/10_store_connector.sql` (parte 3: `extension_pairing_codes(code_hash text pk, user_id uuid, expires_at timestamptz, used_at timestamptz)`, `extension_tokens(id uuid pk, user_id uuid, token_hash text unique, created_at, last_used_at, revoked_at)`, RLS ligada)
- Modify: `src/app/api/integrations/extension/pair-code/route.ts` (usa o novo módulo)
- Create: `src/app/api/extension/pair/route.ts`
- Modify: `src/middleware.ts` (liberar prefixo `/api/extension/`; as rotas validam o token)
- Delete: `src/lib/server/pairing-vault.ts`, `src/app/api/integrations/extension/pair/route.ts`
- Test: `tests/extension_auth.test.ts`

**Interfaces:**
- Produces:
  - `createPairingCode(userId): Promise<{ code: string; expiresAt: string }>` — 8 caracteres `[A-HJ-NP-Z2-9]`, validade 10 min, guarda só SHA-256.
  - `exchangePairingCode(code): Promise<{ token: string; userId: string } | null>` — uso único; token = 32 bytes base64url; guarda só SHA-256.
  - `resolveExtensionUser(req: Request): Promise<string | null>` — header `Authorization: Bearer <token>`; atualiza `last_used_at`; revogado → `null`.
  - `extensionUnauthorized(): NextResponse` — 401 `{ ok:false, code:'EXTENSION_UNPAIRED', error:'Reconecte a extensão ao painel.' }`.
- Repo injetável (memória nos testes), como na Task 1.

- [ ] **Step 1: Testes** — código troca por token uma vez; segunda troca → `null`; código expirado → `null`; banco só contém hashes (nenhum valor igual ao código/token); Review Focus 2: token revogado → `resolveExtensionUser` `null`; tokens de dois usuários resolvem cada um para o seu `userId`.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar** módulo, rotas, middleware, remoções.
- [ ] **Step 4: Rodar** — PASS; `grep -rn "pairing-vault" src` vazio.
- [ ] **Step 5: Commit** `feat(extensão): pareamento por conta no Supabase`

### Task 6: Rotas de conexão e status

**Files:**
- Create: `src/app/api/extension/connect/route.ts`, `src/app/api/extension/status/route.ts`
- Create: `src/app/api/store-health/route.ts` (sessão do painel: `GET` status, `POST {store}` = "Testar agora")
- Create: `src/lib/server/store-connect.ts`
- Modify: `src/app/api/integrations/mercadolivre/connect/route.ts` (remove fallback `ADMIN_UUID`: sem sessão → 401; aceita também token da extensão)
- Test: `tests/store_connect.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 4, 5; `saveStoreCredentials`.
- Produces:
  - `connectStore(userId, payload: ConnectPayload): Promise<StoreStatusView>` onde
    `ConnectPayload = { store:'mercadolivre'; cookies: string } | { store:'rakuten'; clientId?: string; clientSecret?: string; sid?: string } | { store:'amazon'; tag: string }` — Rakuten aceita conexão parcial (as duas páginas chegam separadas); salva no cofre como `netshoes`; quando os três existirem roda `checkStoreConnection`; parcial devolve `falhou` com motivo "Falta abrir a página do publisher (SID)" ou "Falta abrir a página de desenvolvedor (Client ID/Secret)".
  - `StoreStatusView = { store: StoreName; status: StoreHealthStatus; reason: string | null; lastCheckedAt: string | null; hint: string | null }` — `hint` só do tipo "termina em 1234"; nenhum segredo.
  - `getStoreStatusViews(userId): Promise<StoreStatusView[]>`
- Validação: Client ID/Secret 20–64 `[A-Za-z0-9]`; SID `^\d{5,9}$`; tag regex da Task 4; cookies precisam conter `ssid=`.

- [ ] **Step 1: Testes** — conectar Rakuten em duas chamadas chega a `ok` (deps mockadas); só SID → motivo de falta; tag inválida → 400; Review Focus 5: com cofre contendo segredos conhecidos, `JSON.stringify(getStoreStatusViews())` não contém nenhum deles; rota ML connect sem sessão/token → 401.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — PASS.
- [ ] **Step 5: Commit** `feat(conector): rotas de conexão e status real`

### Task 7: Extensão — extratores, pareamento e popup

**Files:**
- Create: `chrome-extension/extractors.js` (ES module, funções puras)
- Modify: `chrome-extension/manifest.json` (versão `2.2.0`; `permissions` + `scripting`; `host_permissions` + `https://developers.rakutenadvertising.com/*`, `https://publisher.rakutenadvertising.com/*`, `https://associados.amazon.com.br/*`)
- Modify: `chrome-extension/popup.html`, `chrome-extension/popup.js` (`type="module"`), `chrome-extension/background.js`
- Test: `tests/extension_extractors.test.ts`

**Interfaces:**
- Consumes: rotas `/api/extension/pair`, `/connect`, `/status` (Tasks 5–6).
- Produces (puras, recebem dados já coletados da página):
  - `extractRakutenCredentials(table: { headers: string[]; rows: string[][] }): { clientId: string; clientSecret: string } | null` — localiza colunas pelos cabeçalhos "Client ID" / "Client Secret"; primeira linha com ambos válidos.
  - `extractRakutenSid(text: string): string | null` — `/SID[^\d]{0,30}(\d{5,9})/`.
  - `extractAmazonTag(storeIdInputValue: string | null, text: string): string | null` — input primeiro, senão `/StoreID:\s*([a-z0-9][a-z0-9-]{1,60}-2\d)/i`.
  - `detectStorePage(url: string): 'rakuten_dev' | 'rakuten_publisher' | 'amazon' | 'mercadolivre' | null`
- Popup: sem token salvo → tela "Cole o código do painel" (troca em `/api/extension/pair`, guarda token em `chrome.storage.local`); com token → seletor de loja; Conectar roda `chrome.scripting.executeScript` na aba ativa coletando `{headers, rows}`/`innerText`/`input[name=store_id]`, aplica o extrator, envia a `/api/extension/connect`; extrator `null` → mostra campo(s) para colar; status de cada loja vem de `/api/extension/status` (remove o `mlConnection` local); resposta `EXTENSION_UNPAIRED` → apaga token e volta à tela de código.

- [ ] **Step 1: Testes** — tabela com cabeçalhos em outra ordem ainda extrai; tabela sem a coluna Secret → `null`; Review Focus 3: texto da página de login ("Faça login…") → `extractAmazonTag(null, txt) === null` e `extractRakutenSid(txt) === null`; `'SID (ID do Site) 1234567'` → `'1234567'`; `detectStorePage` para as 4 URLs do spec e `null` para outra.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar** extratores e popup.
- [ ] **Step 4: Rodar** — PASS. Verificação manual com o dono: carregar extensão sem empacotar, parear, conectar Amazon e Rakuten nas páginas reais (sem imprimir valores).
- [ ] **Step 5: Commit** `feat(extensão): conectar lojas lendo a página`

### Task 8: Painel — status real e código de pareamento

**Files:**
- Modify: `src/app/conexoes/page.tsx` (aba lojas)
- Test: `tests/store_status_labels.test.ts`
- Create: `src/lib/store-status-labels.ts`

**Interfaces:**
- Consumes: `GET/POST /api/store-health`, `GET /api/integrations/extension/pair-code`.
- Produces: `storeStatusLabel(v: StoreStatusView, now?: Date): { emoji: string; title: string; detail: string }` — `ok` → `✅`, "Conectado", "Testado hoje às HH:MM" (fuso America/Sao_Paulo; "em DD/MM às HH:MM" se não for hoje); `falhou` → `❌`, "Falhou", `reason`; `sem_teste` → `🟡`, "Tag salva", "A Amazon não permite teste sem API"; `nao_configurado` → `⚪`, "Não configurado", "Conecte pela extensão".
- Página: cartão por loja com o rótulo, botão "Testar agora" e botão "Conectar extensão" que mostra o código de 8 caracteres e a validade. Substitui o uso de `connectionStatus` como indicador de "conectado".

- [ ] **Step 1: Testes** dos rótulos (4 estados, hoje vs outro dia, fuso).
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar** labels e página.
- [ ] **Step 4: Rodar** — PASS; `npx next build` sem erros.
- [ ] **Step 5: Commit** `feat(painel): status real das lojas`

### Task 9: Fechamento

- [ ] **Step 1:** Suíte completa `npx tsx --conditions react-server --test "tests/**/*.test.ts"` → exatamente os 20 de antes falhando.
- [ ] **Step 2:** `npx next build` sem erros.
- [ ] **Step 3:** Remover a branch `fix/netshoes-rakuten` (premissa errada; substituída pela Task 3) — só após confirmação do dono.
- [ ] **Step 4:** Runbook curto em `docs/superpowers/runbooks/2026-11-13-conector-lojas.md`: colar a migração 10 no Supabase, deploy, recarregar extensão, parear, conectar ML/Rakuten/Amazon, conferir ✅.
- [ ] **Step 5: Commit** `docs: runbook do conector de lojas`

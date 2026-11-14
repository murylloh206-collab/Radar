# Instagram Pro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Artes profissionais com a identidade de cada cliente, área “Instagram Pro” (story, feed e status do WhatsApp), link pela bio com número da oferta e automático com freio.

**Architecture:** Módulo puro de arte (`offer-art/`: tema, texto vetorial, render) usado pelo renderizador antigo e pelo novo serviço `social-posts.ts`; dados em 3 tabelas novas (migração 09) com espelho no banco JSON local; rotas `/api/social/*` sempre escopadas por `session.userId`; ciclo automático chamado após o copiador no `/api/worker/poll`.

**Tech Stack:** Next.js 15, TypeScript, sharp, opentype.js, Supabase, Evolution API, Meta Graph API; testes `node:test` com `fetch` simulado.

**Spec:** `docs/superpowers/specs/2026-11-13-instagram-pro-design.md`

## Global Constraints
- Nenhuma chamada real a Instagram, Evolution, lojas ou Supabase nos testes (`global.fetch` simulado; `RADAR_DB_PATH` temporário).
- Toda rota usa `session.userId`; nunca `ADMIN_UUID` como fallback para dados de cliente.
- Copiador intocado: nenhum teste existente do copiador pode passar a falhar (base: 20 falhas conhecidas).
- Cota diária em America/Sao_Paulo (`startOfTodaySaoPaulo`).
- Texto ao usuário em pt-BR com acentuação; nada de chaves embutidas.

## Review Focus
1. Cor escolhida muito clara (ex.: #FFFF66) em fundo claro → texto legível (Task 1).
2. Título muito longo / com emoji / sem preço original / sem cupom → layout não quebra (Task 3).
3. Foto do produto inacessível, enorme ou endereço interno (http://127.0.0.1) → erro claro, sem travar (Task 3).
4. Cliente A tentando publicar oferta do cliente B pelo id → 404 (Task 6).
5. Plus no 6º post do dia; Ultimate sem limite; Impulse bloqueado (Task 5).

---

### Task 1: Tema da arte por cliente
**Files:** Create `src/lib/server/offer-art/theme.ts`; Test `tests/offer_art_theme.test.ts`
**Produces:** `buildArtTheme(accentHex: string, background: 'dark' | 'light'): ArtTheme` com `{ background: {top, mid, bottom}, stage: {top, bottom}, text, textMuted, accent, onAccent, accentText, divider }`; `contrastRatio(a, b): number`.
- [ ] Testes: cor inválida → usa #1CCAF2; dark: contraste(text, bg.mid) ≥ 4.5, contraste(accentText, bg.mid) ≥ 3, contraste(onAccent, accent) ≥ 4.5; light com accent #FFFF66 → accentText ajustado ≥ 3 contra bg; laranja e rosa geram fundos diferentes do azul.
- [ ] RED → implementar (HSL, escurecer/clarear até atingir contraste) → GREEN → commit.

### Task 2: Texto vetorial com fonte embutida
**Files:** Create `src/lib/server/offer-art/text.ts`; Modify `next.config.ts` (`outputFileTracingIncludes` com `./assets/fonts/**` para rotas `/api/**` e `/u/**`); Test `tests/offer_art_text.test.ts`
**Produces:** `textPath(text, {x, y, size, weight: 500|700|800, anchor?: 'start'|'middle'|'end', fill, letterSpacing?}): { svg: string; width: number }`; `wrapText(text, {size, weight, maxWidth, maxLines}): string[]` (reticências na última linha).
- [ ] Testes: svg contém `<path` e nenhum `<text`; largura cresce com o texto; acentos (“Ação”) geram path não vazio; wrap de título de 120 caracteres em 2 linhas termina com “…”.
- [ ] RED → GREEN → commit.

### Task 3: Renderização da arte (story/status 9:16 e feed 4:5)
**Files:** Create `src/lib/server/offer-art/render.ts`, `src/lib/server/offer-art/fetch-image.ts`; Modify `src/lib/server/story-renderer.ts` (layouts antigos delegam para `renderOfferArt`); Test `tests/offer_art_render.test.ts`
**Produces:** `renderOfferArt(input: OfferArtInput): Promise<Buffer>` (JPEG); `OfferArtInput = { format: 'story' | 'feed'; theme: ArtTheme; brand: { name: string; handle?: string; logo?: Buffer | null }; product: { title: string; image: Buffer }; pricing: { current: number; original?: number | null; discountPct?: number | null }; coupon?: string; offerNumber?: number; footerCta?: string }`.
`fetchProductImage(url: string): Promise<Buffer>` — só http(s), bloqueia hosts privados/localhost, timeout 8s, máx. 8 MB.
- [ ] Testes: dimensões 1080×1920 e 1080×1350; sem original/cupom/número não lança; título de 200 caracteres não lança; `fetchProductImage('http://127.0.0.1/x.jpg')` rejeita; resposta > 8 MB rejeita.
- [ ] Gerar 4 amostras (azul escuro, laranja escuro, rosa claro, verde claro) em scratchpad e inspecionar visualmente.
- [ ] Commit.

### Task 4: Marca (fundo) + planos + migração 09
**Files:** Modify `src/lib/server/brand-settings.ts` (`artBackground: 'dark' | 'light'`, default 'dark'); Modify `src/lib/plans-config.ts` (feature `instagram_pro` no Plus e Ultimate; `socialDailyPostLimit`: impulse 0, plus 5, ultimate null); Create `supabase/migrations/09_social_posts.sql`; Test `tests/social_plan_and_schema.test.ts`
- [ ] Testes: limites por plano; brand default 'dark'; SQL contém as 3 tabelas, RLS habilitado, `social_next_offer_number`, únicos (user_id, offer_number) e (user_id, source_job_id), coluna `art_background`.
- [ ] RED → GREEN → commit.

### Task 5: Serviço social (ofertas, número, cota)
**Files:** Create `src/lib/server/social-posts.ts`; Test `tests/social_posts_service.test.ts`
**Produces:** `listEligibleOffers(userId): Promise<SocialOfferCandidate[]>`; `ensureSocialOffer(userId, jobId): Promise<SocialOffer>`; `getSocialQuota(userId): Promise<{ limit: number | null; usedToday: number; allowed: boolean; reason?: string }>`; `recordSocialPost(...)`.
- [ ] Testes (banco local): só jobs `copiador` enviados < 48h do próprio usuário; número sequencial por usuário (A: 1,2; B: 1); mesma oferta não ganha 2 números; Impulse → `allowed:false`; Plus 5 usados → `allowed:false`; Ultimate 50 usados → `allowed:true`.
- [ ] RED → GREEN → commit.

### Task 6: Publicação por canal + rotas
**Files:** Modify `src/lib/server/social-posts.ts` (`publishSocialPost(userId, { jobId, channel, connectionId?, origin })`); Create `src/app/api/social/{offers,preview,publish,settings}/route.ts`; Test `tests/social_publish_routes.test.ts`
- [ ] Instagram: `publishStoryToInstagram`/`publishFeedPostToInstagram` com legenda padrão. Status: `POST {baseUrl}/message/sendStatus/{instance}` `{ type:'image', content: artUrl, caption, allContacts: true }` usando a conexão do próprio usuário; sem `key.id` → `incerto`.
- [ ] Testes (fetch simulado): sem sessão → 401; job de outro usuário → 404; cota estourada → 429 com mensagem; status chama a instância da conexão do usuário; erro do Instagram vira `falha` registrada; nenhuma URL real chamada.
- [ ] RED → GREEN → commit.

### Task 7: Página da bio por cliente + busca por número
**Files:** Modify `src/lib/server/public-storefront.ts` (`resolveStorefrontUserId(slug): Promise<string | null>`); Modify `src/app/u/[slug]/page.tsx`; Test `tests/social_bio_page.test.ts`
- [ ] Testes: slug de B mostra ofertas de B, não de A; slug inexistente → página “não encontrada”; `?n=2` destaca a oferta #2; oferta > 48h tem selo “confira disponibilidade”; > 7 dias não aparece.
- [ ] RED → GREEN → commit.

### Task 8: Área “Instagram Pro” no painel
**Files:** Create `src/app/instagram-pro/page.tsx`, `src/components/social/*`; Modify navegação (`Sidebar.tsx`, `BottomNav.tsx` conforme padrão); configuração de cor/fundo/automático em modal.
- [ ] `npm run typecheck` e `npm run build` limpos; teste de fumaça renderizando a rota sem erro de import.
- [ ] Commit.

### Task 9: Automático com freio
**Files:** Modify `src/lib/server/social-posts.ts` (`runSocialAutopostCycle({ budgetMs })`); Modify `src/app/api/worker/poll/route.ts` (depois do copiador, try/catch isolado); Test `tests/social_autopost.test.ts`
- [ ] Testes: desligado → nada; fora do horário → nada; último post há < intervalo → nada; desconto abaixo do mínimo → ignora; elegível → 1 post; erro no social não altera a resposta do copiador.
- [ ] RED → GREEN → commit.

### Task 10: Verificação e relatório
- [ ] Suíte completa: só as 20 falhas da base. typecheck 0. build ok.
- [ ] Revisão final independente; corrigir Critical/Important com teste.
- [ ] `docs/superpowers/RELATORIO-NOITE-2026-11-12.md` para o dono (o que mudou, o que falta aprovar, migração 09 a colar, como testar).

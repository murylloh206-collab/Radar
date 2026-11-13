# Instagram Pro (posts sociais) — design

Data: 2026-11-13 · Status: desenho combinado na conversa de 12/11; dono foi dormir e autorizou execução noturna
em branch separada (sem deploy, sem posts reais). Revisão do dono pela manhã antes de publicar.

## Por quê
Os posts gerados para o Instagram “parecem template feio”, a foto fica estranha e não há caminho clicável até o produto.
Para vender o SaaS, cada cliente precisa que as artes saiam com a identidade dele (não a do Radar).

## Combinado com o dono
- Direção visual **B** (“Radar escuro premium”): palco claro para a foto, tipografia forte, sem brilhos borrados.
- **Identidade por cliente:** canto superior esquerdo com logo + nome da loja + @. O cliente escolhe **1 cor** e
  **fundo escuro ou claro**; o sistema gera o resto da paleta garantindo contraste legível. Sem logo → inicial da loja num círculo.
- **Link pela bio (opção A):** cada post sai com número (“Oferta #128 · link na bio”); a página da bio do cliente mostra
  as ofertas postadas com o link de afiliado certo **e uma busca pelo número**. Ofertas antigas aparecem marcadas.
- **Área “Instagram Pro”** no painel: lista das ofertas copiadas/enviadas; o cliente escolhe a oferta e clica em
  **Story**, **Feed** ou **Status do WhatsApp**, vê a prévia e confirma.
- **Automático com freio** (desligado por padrão): intervalo mínimo entre posts, horário de funcionamento, desconto mínimo.
- **Status do WhatsApp** na mesma área, mesma arte do story, mesmas regras de freio.
- **Planos:** Impulse sem acesso (área bloqueada com convite); **Plus 5 posts/dia** (somando canais, ajustável);
  **Ultimate ilimitado** (respeitando o teto do próprio Instagram, ~100 publicações/24h pela API — mensagem clara se atingir).
- **Sem IA nesta etapa** (legenda por modelo de texto).
- O copiador de grupos não pode ser afetado.

## Restrições verificadas
- Instagram Graph API **não publica adesivo de link** em stories (referência oficial IG User Media) e links em legenda não são clicáveis.
- Evolution API: `POST /message/sendStatus/{instance}` com `type: 'image'`, `content` (URL), `caption`, `allContacts`.
  Formato exato varia por versão — tratar resposta sem `key.id` como falha incerta e não repetir automaticamente.
- Servidor da Vercel não tem fontes do sistema: texto da arte deve virar vetor a partir de fonte embutida (Inter, OFL, `assets/fonts`).

## Fora do escopo (agora)
Checkout; IA; Assistente WhatsApp; adesivo de link; cenário/bancada (gera “produto flutuando”) — a arte nova usa palco limpo.

## Anti-objetivos
Postar algo real durante testes; misturar ofertas/links entre clientes; travar o copiador por causa de renderização; postar em rajada.

## Abordagens consideradas (link)
A. Link na bio com número — **escolhida** (100% automático). B. Story com adesivo manual (fica como evolução). C. “Comente QUERO” + DM (exige aprovação da Meta; depois).

## Desenho
1. **Tema** `src/lib/server/offer-art/theme.ts` — `buildArtTheme(accentHex, background)` gera paleta; corrige cor até contraste ≥ 4.5:1 do texto principal e ≥ 3:1 do destaque.
2. **Texto vetorial** `offer-art/text.ts` — Inter 500/700/800 via opentype.js → `<path>`; quebra de linha por largura real; reticências.
3. **Arte** `offer-art/render.ts` — `renderOfferArt()` 1080×1350 (feed 4:5), 1080×1920 (story/status); produto “contain” no palco claro com sombra suave; selo −X%; preço DE riscado + POR grande; cupom tracejado; rodapé “Oferta #N · link na bio”. Busca da foto com limite de tamanho/tempo e só http(s) público.
   O renderizador antigo (`story-renderer.ts`) passa a delegar para o novo (mesma assinatura de saída), mantendo as rotas atuais funcionando.
4. **Marca** — `brand_settings.art_background` ('dark' | 'light'); usa `panel_name`, `panel_logo_url`, `accent_color`, `watermark_handle`.
5. **Dados** (migração 09):
   - `social_offers` (id, user_id, offer_number por usuário, source_job_id, title, store, image_url, price_current, price_original, discount_pct, coupon, affiliate_url, created_at) — único (user_id, offer_number) e (user_id, source_job_id).
   - `social_posts` (id, user_id, social_offer_id, channel 'instagram_story'|'instagram_feed'|'whatsapp_status', connection_id, art_url, status 'publicado'|'falha'|'incerto', error, external_id, origin 'manual'|'automatico', created_at).
   - `social_autopost_settings` (user_id pk, enabled, channels text[], min_interval_minutes, window_start, window_end, min_discount_pct, connection_id).
   - Função `social_next_offer_number(user)` atômica.
   Sem Supabase (testes/local): mesmo contrato sobre o banco JSON local.
6. **Serviço** `src/lib/server/social-posts.ts` — listar ofertas elegíveis (copiador enviadas nas últimas 48h, do próprio usuário), registrar oferta (número), checar cota diária (Brasília), renderizar, publicar por canal, registrar resultado.
7. **Rotas** (sessão obrigatória, sempre `session.userId`): `GET /api/social/offers`, `POST /api/social/preview`, `POST /api/social/publish`, `GET|PUT /api/social/settings`.
8. **Automático com freio** — `runSocialAutopostCycle()` chamado pelo `/api/worker/poll` **depois** do ciclo do copiador, com orçamento de tempo (≤15s) e no máximo 1 post por usuário por execução.
9. **Bio** `/u/[slug]` — resolve o cliente pelo slug (não mais a conta dona fixa), lista `social_offers` postadas nos últimos 7 dias (mais recentes primeiro), campo “número da oferta”, `?n=128` abre direto; > 48h marcado “confira disponibilidade”.
10. **Painel** `/instagram-pro` — mobile first, cards, modais: lista de ofertas, prévia, botões por canal, contador da cota, configurações (cor, fundo, automático), bloqueio no Impulse; item no menu.

## Decisões minhas (revisar)
- Ofertas elegíveis = enviadas pelo copiador nas últimas 48h; número atribuído na primeira postagem social.
- Cota conta publicações bem-sucedidas + incertas de todos os canais por dia de Brasília.
- Bio mostra 7 dias; após 48h o selo “confira disponibilidade”.
- Defaults do automático: 60 min de intervalo, 09:00–22:00, desconto mínimo 30%, canal story.
- Legenda padrão do feed: título, preço, cupom, “🔗 Oferta #N — link na bio (@loja)”.

# Template de story (Ultimate) + Configurações do Instagram Pro em modal + upload de imagens

Data: 2026-11-14 · Aprovado pelo dono em conversa ("pode começar").

## Decisões do dono
- Template com **fundo próprio** só para o **story do Instagram Pro** (o do copiador virá depois, com outra imagem).
- **Um fundo ativo por vez**; biblioteca de fundos fica para o futuro.
- Liberado **só no Ultimate**.
- Identidade visual e Automático saem das abas e vão para **Configurações em modal bonito**.
- Imagens (logo e fundo) por **arrastar/soltar ou escolher no computador**, não por URL.

## Desenho
- **Página Instagram Pro:** só a lista de ofertas + botão "⚙ Configurações" → modal com abas Identidade visual · Template do story (✦ Ultimate) · Automático.
- **Upload (`POST /api/brand-assets`, sessão estrita):** `kind = logo | story_background`, arquivo PNG/JPG/WebP até 8 MB, conferido com sharp (formato real, não a extensão). Logo → 512×512 PNG (contain, fundo transparente) e grava em `panelLogoUrl`. Fundo do story → 1080×1920 JPEG (cover) em caminho fixo `brand/<userId>/story-background.jpg` no bucket `radar-media` (existência = template ativo; sem migração). `DELETE ?kind=story_background` remove. Fundo exige o recurso `story_template` (Ultimate); senão 403. `GET` informa se há fundo e se o plano permite.
- **Arte:** `renderBrandedOfferArt` com formato story + recurso `story_template` + fundo existente → `renderStoryTemplate`: fundo 1080×1920; cartão branco arredondado em área fixa (x 80–1000, y 480–1500); foto do produto no topo do cartão (contain), selo `-X%` preto no canto; título em até 2 linhas; preço "de" riscado; preço atual grande. Nota/vendidos e "no Pix/ou" não entram (a oferta copiada não traz esses dados).
- **Prévia:** o modal mostra o story com uma oferta real (`/api/social/preview`).

## Plano (tarefas, TDD)
1. Recurso `story_template` só no Ultimate (`plans-config`). Teste: `planHasFeature`.
2. `normalizeBrandAsset(kind, buffer)` (sharp: valida formato/tamanho, gera saída). Testes: PNG → 512×512; fundo → 1080×1920; texto/arquivo grande recusados.
3. `renderStoryTemplate(input)` → PNG 1080×1920 com o fundo preservado nas bordas e cartão branco no centro. Teste por amostragem de pixels.
4. `renderBrandedOfferArt` usa o template quando aplicável; rota `/api/brand-assets` (GET/POST/DELETE). Testes: 401 sem sessão; 403 fundo sem Ultimate.
5. UI: modal de Configurações, componente de arrastar/soltar, prévia; remove o campo de URL do logo. Build + verificação visual da arte gerada.

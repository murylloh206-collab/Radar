# Relatório da noite — 12 → 13/11/2026

Bom dia! Resumo do que foi feito enquanto você dormia. **Nada foi publicado em produção e nenhum post real foi feito.**
Tudo está na branch `feat/instagram-pro`, esperando a sua aprovação.

## Como reabrir a conversa
No terminal, dentro de `C:\projetos\Projeto-afiliados`: `claude --continue` (ou `claude --resume` e escolha a conversa do “Instagram Pro”).

## O que ficou pronto

### 1. Artes novas com a marca de cada cliente (direção B)
- Palco branco para a foto (produto recortado, com sombra suave), selo de desconto, preço grande, “de” riscado, cupom tracejado.
- Canto superior esquerdo: **logo + nome da loja + @** do cliente. Sem logo → inicial da loja num círculo.
- O cliente escolhe **1 cor** e **fundo escuro ou claro**; o sistema monta a paleta e garante texto legível (testado até com amarelo-claro em fundo claro).
- Texto desenhado com a fonte **Inter** embutida no projeto (o servidor da Vercel não tem fontes — era parte do “feio”).
- Título longo, cupom enorme e preço alto se ajustam sozinhos (a foto encolhe o necessário; nada se sobrepõe).
- Amostras para você ver: `C:\projetos\Projeto-afiliados\.superpowers\amostras-arte\` (azul, laranja, rosa e verde; story e feed).
- Os botões antigos de story/feed do painel também passam a gerar a arte nova.

### 2. Área “Instagram Pro” no painel (menu lateral)
- Lista as ofertas que o copiador enviou nas últimas 48h → botões **Story**, **Feed** e **Status do WhatsApp** → prévia → publicar.
- Aba **Identidade visual** (nome, @, logo, cor, fundo) e aba **Automático**.
- **Automático com freio** (desligado de fábrica): intervalo mínimo, horário, desconto mínimo; nunca repete a mesma oferta; falha não vira rajada.
- **Planos:** Impulse bloqueado (convite para o Plus) · **Plus 5 posts/dia** · **Ultimate ilimitado**.
- O limite do dia não pode ser furado nem com várias abas ao mesmo tempo (reserva atômica).

### 3. Link pela bio com número da oferta
- Cada post sai com “Oferta #N · link na bio”. A mesma oferta enviada a vários grupos tem **um número só**.
- Página da bio (`/u/<endereço>`) agora mostra a loja **certa de cada cliente**, com campo **“digite o número da oferta”** (e `?n=128` abre direto). Ofertas com mais de 48h mostram “confira a disponibilidade”.
- **Seu link atual (`radar-ofertas`) continua sendo seu** — é reservado; clientes não conseguem usar esse endereço nem copiar o de outra loja.

### 4. Status do WhatsApp
- Mesma arte do story, enviada pela conexão de WhatsApp do próprio cliente, com o link de afiliado direto na legenda (no status o link é clicável).

## Qualidade
- **229 testes**: 209 passam; as **20 falhas são exatamente as mesmas de antes** (nenhuma nova). 54 testes novos do Instagram Pro.
- Build de produção ok. Revisão independente feita: 1 problema crítico + 6 importantes encontrados e **corrigidos com teste**.
- Isolamento entre clientes verificado em todas as rotas novas (cliente A não vê nem publica oferta do cliente B).

## O que preciso de você (≈10 min, quando aprovar)
1. **Aprovar** a branch `feat/instagram-pro` (posso te mostrar as telas antes).
2. Colar no Supabase → SQL Editor o arquivo `supabase/migrations/09_social_posts.sql` (cria as tabelas, a numeração e a reserva da cota).
3. Eu faço o merge e o deploy, e testamos juntos 1 post real num perfil seu.
4. Para o Instagram: a conta precisa estar conectada em Conexões → Redes sociais (a Meta exige conta profissional).

## Decisões que tomei sozinho (confira)
- Ofertas elegíveis: as enviadas pelo copiador nas últimas 48h; o número é dado na primeira publicação.
- Bio mostra 7 dias de ofertas; após 48h aparece “confira a disponibilidade”.
- Automático: padrão 60 min de intervalo, 9h–22h, desconto mínimo 30%, canal story. Uma oferta por vez, publicada em **cada canal marcado** (cada canal conta na cota) — se preferir 1 canal por vez, ajusto.
- A conta dona (você) não tem limite de posts.
- O formato quadrado antigo (1:1) ainda usa o visual antigo (só telas legadas usam).
- O @ das artes é o mesmo da marca d’água (identidade única por cliente).
- Fiquei sem testar a tela no navegador: rodar o painel aqui usaria o banco de produção.

## Pendências conhecidas (para a etapa de isolamento/venda)
- Clientes antigos com o mesmo endereço de bio (se existirem) ficam com a página indisponível até escolherem outro endereço.
- Cliques da bio dos clientes ainda não são atribuídos a cada cliente nas estatísticas.
- A rota antiga `/api/stories/render` aceita link de foto vindo do navegador (agora protegido contra endereços internos).

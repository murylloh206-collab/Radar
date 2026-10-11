# Painel de Ofertas Afiliadas (MVP local)

Painel para **pesquisar ofertas reais do Mercado Livre**, revisar preço/desconto, colar **seu link oficial de afiliado** e **aprovar ou rejeitar** manualmente.

> ⚠️ Nesta versão **nada é publicado**: não há Telegram, WhatsApp nem envio automático.

---

## 1. Pré‑requisitos

- [Node.js](https://nodejs.org) **20.12 ou mais novo** (teste com `node -v`).
- Um **aplicativo gratuito no Mercado Livre Developers** (a API oficial exige login até para buscas).

### Como criar o aplicativo do Mercado Livre (uma vez só)

1. Acesse <https://developers.mercadolivre.com.br/devcenter> e entre com sua conta do Mercado Livre.
2. Clique em **Criar aplicação**. Preencha nome e descrição (ex.: "Painel de Ofertas").
3. Em **URI de redirect**, pode usar `https://localhost` (não usamos nesta fase).
4. Salve e copie o **Client ID** (ou App ID) e o **Client Secret**.

## 2. Instalação

No terminal, dentro da pasta do projeto:

```bash
npm install
copy .env.example .env.local     # no Windows (PowerShell/CMD)
# cp .env.example .env.local     # no Mac/Linux
```

Abra o arquivo **`.env.local`** e preencha:

```env
ML_CLIENT_ID=seu_client_id
ML_CLIENT_SECRET=seu_client_secret
```

> O `.env.local` fica só no seu computador e é ignorado pelo Git. Nunca compartilhe esses valores.

## 3. Rodar

```bash
npm run dev
```

Abra <http://localhost:3000> (ou a porta definida em `PORT`).

## 4. Como usar

1. Ajuste os termos (chips) se quiser e clique em **Buscar ofertas**. Os produtos chegam como **Pendentes**.
2. Em cada card, gere o link na sua plataforma de afiliados e **cole no campo "Link oficial de afiliado"**.
3. (Opcional) Clique em **Adicionar cupom** e preencha código e regra.
4. Clique em **Aprovar** (verde) ou **Rejeitar** (vermelho). Dá para voltar a "Pendente" depois.
5. Use os filtros **Todos / Pendentes / Aprovados / Rejeitados**, a busca por nome e a ordenação.

Regras importantes (em `src/lib/offer-rules.ts`):

- Só é possível **aprovar** com um link de afiliado colado por você.
- O link é salvo **exatamente como colado**. O sistema nunca cria nem altera parâmetros de afiliado.
- Colar o link comum do produto é recusado (ele não é link de afiliado).
- Buscar de novo **atualiza só preço/título**; seu status, link e cupom são preservados.

## 5. Configurações (`.env.local`)

| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta local | `3000` |
| `SEARCH_TERMS` | Termos padrão, separados por vírgula | `fone bluetooth,air fryer,notebook gamer` |
| `RESULTS_PER_TERM` | Produtos por termo (1–50) | `12` |
| `ML_CLIENT_ID` / `ML_CLIENT_SECRET` | Credenciais do seu app no Mercado Livre | — |
| `ML_ACCESS_TOKEN` | Opcional: token pronto (expira em ~6h) | — |
| `DATA_FILE` | Onde os dados ficam salvos | `data/ofertas.json` |

Após mudar o `.env.local`, pare o servidor (`Ctrl + C`) e rode `npm run dev` de novo.

## 6. Onde ficam os dados?

Em **`data/ofertas.json`** (criado na primeira busca). Para começar do zero, apague esse arquivo. Para backup, copie‑o.

## 7. Estrutura do projeto

```
src/
  app/
    page.tsx                  → página inicial (carrega dados salvos)
    api/offers/route.ts       → GET  lista ofertas
    api/offers/search/route.ts→ POST busca no Mercado Livre
    api/offers/[id]/route.ts  → PATCH salva link/cupom/status
  components/                 → interface (cards, painel, ícones)
  lib/
    types.ts                  → tipos compartilhados
    offer-rules.ts            → regras de status e validação de links
    server/mercadolivre.ts    → cliente da API oficial do Mercado Livre
    server/storage.ts         → armazenamento local em JSON
    server/offers-service.ts  → junta busca + regras + armazenamento
  integrations/               → preparação para Telegram (não ativo)
```

## 8. Verificações

```bash
npm run check   # tipos + lint + build
```

## 9. Problemas comuns

- **"Credenciais do Mercado Livre não configuradas"** → preencha o `.env.local` e reinicie.
- **"invalid client_id or client_secret"** → confira se copiou os valores certos do DevCenter.
- **Erro 403** → verifique se o aplicativo está ativo no DevCenter. O painel já tenta automaticamente o catálogo oficial como alternativa.
- **Porta ocupada** → mude `PORT` no `.env.local`.

## 10. Próximo passo: Telegram

Veja [`src/integrations/telegram/README.md`](src/integrations/telegram/README.md).

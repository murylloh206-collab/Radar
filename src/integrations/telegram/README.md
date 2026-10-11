# Integração com Telegram — FUTURO (não implementada)

Esta pasta está reservada. **Nada aqui é executado nesta versão** e nenhum token é necessário.

Quando você tiver uma conta/número, o plano é:

1. Criar um bot com o [@BotFather](https://t.me/BotFather) e copiar o token.
2. Adicionar o bot como administrador do seu canal e descobrir o `chat_id`.
3. Colocar `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no `.env.local`.
4. Criar aqui um `telegram-publisher.ts` que implemente `OfferPublisher`
   (de `src/integrations/publisher.ts`) chamando `sendPhoto`/`sendMessage`
   da Bot API oficial, usando o texto de `buildOfferMessage()`.
5. Criar a rota `POST /api/offers/[id]/publish` que só aceita ofertas **aprovadas**.
6. Adicionar um botão "Publicar" no card — sempre acionado **manualmente** por você.

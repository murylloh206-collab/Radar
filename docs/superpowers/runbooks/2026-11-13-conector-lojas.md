# Runbook — conector de lojas com status real

1. **Supabase → SQL Editor:** colar e rodar `supabase/migrations/10_store_connector.sql` inteiro (cria `store_health`, `extension_pairing_codes`, `extension_tokens` e o job diário `radar-lojas-saude` às 08:00). Conferir: `select jobname, schedule from cron.job where jobname = 'radar-lojas-saude';` → 1 linha.
2. **Deploy:** merge na `main` + push (a Vercel publica sozinha).
3. **Extensão:** `chrome://extensions` (ou `brave://extensions`) → Radar Conector → **Recarregar**. O navegador pede as permissões novas (Rakuten, Amazon, Shopee) → aceitar.
4. **Vincular:** painel → Conexões → Lojas → **Conectar extensão** → copiar o código de 8 letras → colar no popup → Vincular.
5. **Conectar cada loja** (abrir a página logado, abrir a extensão, escolher a loja, Conectar):
   - Mercado Livre: qualquer página do ML logado (na 1ª vez pede a etiqueta).
   - Shopee: `affiliate.shopee.com.br/open_api` — **não** clicar em "Redefinir".
   - Amazon: `associados.amazon.com.br/home`.
   - Netshoes: `developers.rakutenadvertising.com/default/dashboard/` (Client ID/Secret) **e** `publisher.rakutenadvertising.com` (SID).
6. **Conferir no painel:** cada loja com ✅ (Amazon 🟡). Se ❌, o motivo diz o que fazer.
7. **Se der errado:** reverter o merge na `main` e fazer push; o SQL só cria tabelas novas e um job (para desligar: `select cron.unschedule('radar-lojas-saude');`).

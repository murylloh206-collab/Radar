# Ativar o agendador do copiador (uma vez só, ~10 minutos)

Depois disso, o Supabase passa a acordar o gateway e a processar a fila sozinho, 24h, sem o PC ligado.

## 1. Gerar a senha do agendador

No terminal da pasta do projeto:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado. Ele é o seu **CRON_SECRET**. Não mande para ninguém.

## 2. Conferir as variáveis na Vercel

Vercel → projeto do painel → **Settings → Environment Variables** (ambiente *Production*):

| Variável | Valor |
|---|---|
| `CRON_SECRET` | o valor gerado no passo 1 (crie, ou substitua se já existir) |
| `EVOLUTION_BASE_URL` | `https://radar-whatsapp-gateway.onrender.com` |
| `EVOLUTION_API_KEY` | a chave do gateway (a mesma do `.env.local`) — **obrigatória**: o código não tem mais a chave embutida |
| `REQUIRE_AUTH` | `true` |

Observação: o "Cron" do próprio painel da Vercel (plano grátis) só roda 1 vez por dia, por isso não serve aqui.
Se você já tem um cron configurado lá chamando `/api/cron/process-scheduled`, ele precisa enviar o cabeçalho
`Authorization: Bearer <CRON_SECRET>`, senão passará a receber 401.

Depois de salvar, faça **Redeploy** do último deploy (ou o deploy desta branch, quando aprovado).

## 3. Guardar os segredos no Supabase

Supabase → **SQL Editor** → cole e rode (troque os valores entre `< >`):

```sql
select vault.create_secret('https://painel-de-ofertas.vercel.app', 'radar_app_url');
select vault.create_secret('https://radar-whatsapp-gateway.onrender.com', 'radar_gateway_url');
select vault.create_secret('<CRON_SECRET do passo 1>', 'radar_cron_secret');
```

Se algum já existir e precisar trocar: `select vault.update_secret((select id from vault.secrets where name='radar_cron_secret'), '<novo valor>');`

## 4. Ligar o agendador

Ainda no SQL Editor, cole todo o conteúdo de `supabase/migrations/08_cron_keepalive.sql` e rode.

## 5. Conferir (depois de 2–3 minutos)

```sql
select jobname, schedule, active from cron.job where jobname like 'radar-%';
select status_code, left(content::text, 120) as resposta, created
  from net._http_response order by created desc limit 6;
```

Esperado: 3 agendamentos ativos e respostas com `status_code` 200 (ou 202). Se aparecer 401, o `CRON_SECRET`
da Vercel e o do Vault estão diferentes; 503 significa que a Vercel ainda não tem o `CRON_SECRET` (faça o redeploy).

## Atenção: horas grátis do Render

Manter o gateway acordado 24h consome cerca de 744 das 750 horas grátis por mês da conta do Render.
Se houver **outro serviço grátis** na mesma conta do Render, as horas acabam antes do fim do mês e o gateway é suspenso.
Mantenha só o gateway no plano grátis (ou passe o gateway para o plano pago, recomendado antes de vender).

## Desligar, se precisar

```sql
select cron.unschedule('radar-fila'); select cron.unschedule('radar-gateway-acordar'); select cron.unschedule('radar-watchdog');
```

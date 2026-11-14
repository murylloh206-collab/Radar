# Checkout de assinaturas — Mercado Pago (mensal, ambiente de teste)

Data: 2026-11-14 · Aprovado pelo dono em conversa.

## Por quê
Vender o Radar como SaaS: o cliente escolhe Impulse (R$ 29,90), Plus (R$ 59,90) ou Ultimate (R$ 119,90), paga no checkout hospedado do Mercado Pago e o plano é liberado sozinho, com aviso de venda no celular do dono.

## Decisões do dono
- Só mensal agora; anual parcelado fica para depois. Sem teste grátis.
- **Libera só com pagamento aprovado confirmado no Mercado Pago** (assinatura apenas autorizada não libera; retorno do navegador não libera).
- **Atraso/recusa: 2 dias de tolerância**; depois os envios automáticos param. Nada é apagado.
- **Cancelamento: acesso até o fim do período já pago.**
- **Aviso de venda no celular via app ntfy** (cada pagamento aprovado, uma vez só).
- Nesta etapa só credenciais de **teste** (conta vendedora de teste). Produção é etapa separada.

## Abordagens
- **Assinatura sem plano associado criada pelo servidor (`POST /preapproval`, status `pending`) → checkout hospedado (`init_point`)** — escolhida: preço vem do catálogo do servidor e `external_reference` carrega o ID interno do cliente.
- Link fixo de plano (`preapproval_plan` + `init_point` do plano): descartado — não vincula a compra ao cliente com segurança.
- Bricks/cartão no próprio site: descartado — exige formulário de cartão e mais credenciais; o dono pediu checkout hospedado.

## Desenho
- **Catálogo:** `PLANS_CONFIG[plan].pricing.monthlyPrice` (servidor). Valor enviado pelo navegador é ignorado.
- **Tabelas (migração 11, incremental):** `billing_subscriptions` (cliente, ambiente, plano, valor, id do preapproval, external_reference único, status, próxima cobrança, `paid_until`, cancelada em) e `billing_payments` (id do pagamento do MP **único** → idempotência; status, valor, data de aprovação, aviso enviado).
- **Regra de acesso:** `paid_until` = data do último pagamento aprovado + 1 mês. `user_subscriptions`: `plano` = plano pago, `status` = active, `expira_em` = `paid_until` + 2 dias (tolerância); se cancelada, `expira_em` = `paid_until`. Passado `expira_em`, a conta fica sem plano (status `canceled`) e o copiador não envia automático (cota 0). Dono (ADMIN) isento.
- **Notificações:** `POST /api/webhooks/mercadopago` (pública no middleware). Valida `x-signature` (HMAC-SHA256 do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com a assinatura secreta). Tópicos: `subscription_preapproval`, `subscription_authorized_payment`, `payment`. Sempre consulta o recurso no MP antes de mudar algo; responde 200 rápido; duplicadas/fora de ordem são inofensivas (sincroniza o estado atual, pagamento único por id).
- **Reconciliação:** ao abrir a tela de retorno/assinatura (consulta o MP na hora) e por agendador.
- **Telas:** Planos → redireciona ao checkout; `/assinatura/retorno` (processando → confirmado, consultando o servidor); `/assinatura` (plano, situação, próxima cobrança real, cancelar).
- **Segurança:** Access Token só no servidor (`MERCADOPAGO_ACCESS_TOKEN_TEST`/`_PROD`, nunca `NEXT_PUBLIC_`), nunca em logs/respostas; cada rota usa a sessão estrita do cliente.

## Variáveis
`MERCADOPAGO_ENV` (test|production), `MERCADOPAGO_ACCESS_TOKEN_TEST`, `MERCADOPAGO_WEBHOOK_SECRET_TEST`, `MERCADOPAGO_TEST_PAYER_EMAIL` (e-mail do comprador de teste — exigência do MP em teste), `NTFY_TOPIC` (nome secreto do canal), `APP_URL` (padrão https://painel-de-ofertas.vercel.app).

## Fora desta etapa
Anual parcelado; troca de plano com valor proporcional (não simular: hoje é "cancelar e assinar o novo"); estorno/contestação automáticos (registrar e avisar); ativação de produção.

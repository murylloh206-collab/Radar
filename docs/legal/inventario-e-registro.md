# Inventário de dados pessoais e Registro das Operações de Tratamento

Base: LGPD, art. 37 (registro das operações) e Res. CD/ANPD 2/2022, art. 9º (registro simplificado para agente de pequeno porte).
Controlador: responsável identificado em `src/lib/legal/empresa.ts`. Encarregado: canal `rd.of00@gmail.com`.
Revisar a cada nova funcionalidade que trate dados e, no mínimo, uma vez por ano.

## 1. Inventário (data mapping)

| # | Dado | Categoria | Titular | Origem | Sistema / local | Finalidade | Base legal | Compartilhamento | Retenção |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Nome, e-mail | Cadastral | Cliente | Formulário de cadastro | Supabase Auth | Conta, login, comunicação | Art. 7º, V | Supabase, Vercel | Enquanto a conta existir + 30 dias |
| 2 | Senha | Credencial (hash) | Cliente | Cadastro | Supabase Auth | Autenticação | Art. 7º, V | Supabase | Enquanto a conta existir |
| 3 | Aceite dos termos (data, versão) | Prova | Cliente | Cadastro | Supabase (`user_metadata`, `consent_records`) | Comprovar contratação | Art. 7º, VI | Supabase | 5 anos após o fim |
| 4 | IP, data/hora, navegador do acesso | Registro de acesso | Cliente | Login, cadastro, cancelamento | `access_logs` | Marco Civil art. 15; segurança | Art. 7º, II | Supabase, Vercel | 6 meses (descarte automático) |
| 5 | Número e nome do WhatsApp | Cadastral | Cliente | Pareamento por QR | Gateway (Render) + Supabase | Copiar e publicar | Art. 7º, V | Render, Supabase | Até desconectar |
| 6 | Nomes e IDs de grupos, nº de participantes | Operacional | Cliente / terceiros | WhatsApp | Supabase | Escolher origem e destinos | Art. 7º, V (cliente é controlador) | Supabase | Enquanto a conta existir |
| 7 | Mensagens dos grupos de origem | Conteúdo | Terceiros (autores) | WhatsApp | Supabase (fila e histórico) | Extrair a oferta e montar a publicação | Cliente controlador; Radar operador (art. 39) | Supabase, Google (texto, se IA usada) | Enquanto a conta existir |
| 8 | IDs e chaves de afiliado | Credencial | Cliente | Painel / extensão | Supabase (cifrado AES-256-GCM) | Gerar links e ler vendas | Art. 7º, V | Lojas e programas | Até desconectar |
| 9 | Cliques em /r/ (data, origem, navegador; sem IP) | Estatística | Visitantes | Redirecionador | Supabase | Estatísticas | Art. 7º, IX (dado mínimo) | Supabase | Enquanto a conta existir |
| 10 | Plano, valor, status, IDs do Mercado Pago | Financeiro | Cliente | Mercado Pago | `billing_subscriptions`, `billing_payments` | Cobrança e obrigação fiscal | Art. 7º, II e V | Mercado Pago | 5 anos (CTN art. 173) |
| 11 | Escolha de cookies, ID anônimo | Prova | Visitante / cliente | Aviso de cookies | `consent_records` + navegador | Prova de consentimento | Art. 7º, II e VI | Supabase | 5 anos |
| 12 | Pedidos de titular (e-mail, tipo, texto) | Atendimento | Qualquer titular | Central de Privacidade | `titular_requests` | Atender art. 18 e registrar | Art. 7º, II | Supabase; aviso sem e-mail via ntfy | 5 anos |
| 13 | Logo, nome da vitrine, textos | Conteúdo do cliente | Cliente | Painel | Supabase Storage | Página pública | Art. 7º, V | Supabase, Vercel | Enquanto a conta existir |
| 14 | Avatar e foto de perfil | Imagem | Cliente | Minha conta | **Somente no navegador do cliente** | Personalização | Art. 7º, V | Nenhum | Até o cliente apagar |

Dados sensíveis (art. 5º, II): **não tratados**. Dados de crianças: **não tratados intencionalmente**.

## 2. Registro simplificado das operações (art. 37; Res. 2/2022, art. 9º)

| Operação | Finalidade | Categorias de dados | Titulares | Base legal | Compartilhamento | Transferência internacional | Medidas de segurança | Retenção |
|---|---|---|---|---|---|---|---|---|
| Gestão de contas | Prestar o SaaS | 1, 2, 3, 13, 14 | Clientes | 7º, V e VI | Supabase, Vercel | EUA (cláusulas-padrão, Res. 19/2024) | TLS, hash de senha, RLS | Ver inventário |
| Copiador e publicação | Copiar, converter, publicar | 5, 6, 7, 8 | Clientes e terceiros | 7º, V; art. 39 | Render, Supabase, Google | EUA | TLS, AES-256-GCM, RLS | Ver inventário |
| Estatísticas | Medir cliques e vendas | 9, 10 | Visitantes, clientes | 7º, IX e V | Supabase, programas de afiliados | EUA | Sem IP nos cliques | Ver inventário |
| Cobrança | Assinaturas | 10 | Clientes | 7º, II e V | Mercado Pago | Não | Webhook com assinatura x-signature | 5 anos |
| Segurança e Marco Civil | Registros de acesso | 4 | Clientes | 7º, II | Supabase | EUA | Acesso só pelo servidor | 6 meses |
| Direitos do titular e consentimentos | Atender e provar | 11, 12 | Todos | 7º, II e VI | Supabase, ntfy (sem dado pessoal) | EUA | Acesso só pelo servidor | 5 anos |

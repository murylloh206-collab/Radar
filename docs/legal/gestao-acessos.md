# Política de Gestão de Acessos

Base: LGPD, arts. 46 e 50; Marco Civil, art. 15; boas práticas do Guia de Segurança da ANPD para agentes de pequeno porte.

## 1. Modelo de acesso (RBAC)

| Perfil | Quem | Pode | Não pode |
|---|---|---|---|
| Cliente (titular da conta) | Assinantes | Ver e alterar os próprios dados, conexões e regras | Ver dados de outras contas (bloqueado por RLS) |
| Administrador da plataforma | Responsável pelo Radar | Suporte, configuração, rotinas do servidor | Usar dados de clientes para fins próprios |
| Serviço (service role) | Código do servidor | Gravar registros de auditoria, cobrança, rotinas | Ser exposto no navegador |

## 2. Regras

1. **Menor privilégio:** cada pessoa e cada chave só tem o acesso necessário. Chaves com poder amplo (`SUPABASE_SERVICE_ROLE_KEY`, tokens do Mercado Pago, `CRON_SECRET`, `ENCRYPTION_KEY`) só existem nas variáveis de ambiente do servidor.
2. **MFA obrigatório** nas contas: Vercel, Supabase, GitHub, Mercado Pago, Render, Google Cloud, e-mail do Encarregado.
3. **Contas nominais:** nada de login compartilhado. Se entrar um colaborador, ele recebe acesso próprio e é removido no dia em que sair.
4. **Logs:** acessos ao painel ficam em `access_logs` por 6 meses (descarte automático). Logs da Vercel e do Supabase seguem o prazo de cada plano.
5. **Troca de segredos:** imediatamente se houver suspeita de vazamento e, no mínimo, uma vez por ano.
6. **Revisão trimestral:** em janeiro, abril, julho e outubro, revisar quem tem acesso a cada provedor e anotar abaixo.

## 3. Registro das revisões

| Data | Revisor | Provedores revisados | Acessos removidos | Observações |
|---|---|---|---|---|
| | | | | |

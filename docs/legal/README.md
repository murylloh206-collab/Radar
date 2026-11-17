# Conformidade legal do Radar de Ofertas

Versão dos documentos: **2026-11-17**. Conteúdo gerado com apoio de IA, com a base legal citada em cada item.
**Antes de vender em escala, revise tudo com um advogado especializado em direito digital.** A LGPD prevê multa de até 2% do faturamento, limitada a R$ 50 milhões por infração (art. 52, II).

## Onde está cada item

| Item pedido | Onde está | Situação |
|---|---|---|
| Termos de Uso + Contrato de Prestação (SLA, preço, PI, responsabilidade, término, arrependimento, força maior, foro) | `/termos` (conteúdo em `src/lib/legal/documentos.ts`) | Publicado |
| Política de Privacidade (dados, base legal, finalidade, compartilhamento, retenção, direitos, Encarregado) | `/privacidade` | Publicado |
| Política de Cookies + mecanismo com recusa tão fácil quanto aceite | `/legal/cookies` + aviso `CookieConsent` | Publicado |
| Política de Segurança | `/legal/seguranca` | Publicado |
| Política de Retenção e Descarte | `/legal/retencao` | Publicado |
| Política de Uso Aceitável (UGC, takedown) | `/legal/uso-aceitavel` | Publicado |
| DPA / Aditivo de Tratamento de Dados | `/legal/aditivo-dados` | Publicado |
| Lista de suboperadores e transferência internacional | Privacidade (seção 3) e Aditivo (seção 4) | Publicado |
| Encarregado (DPO): canal publicado e registro de atendimentos | `/legal` (Central de Privacidade) + tabela `titular_requests` | Publicado; falta o nome |
| Registro de consentimentos | tabela `consent_records` (cookies e aceite dos termos) | Precisa rodar a migração 14 |
| Trilha de auditoria e logs de acesso por 6 meses | tabela `access_logs` + descarte automático diário | Precisa rodar a migração 14 |
| Direito de arrependimento (7 dias) | `/api/billing/cancel` avisa o responsável para estornar | Implementado |
| Inventário de dados e Registro das Operações (art. 37) | `inventario-e-registro.md` | Interno |
| Plano de Resposta a Incidentes | `plano-incidentes.md` | Interno |
| Política de Gestão de Acessos | `gestao-acessos.md` | Interno |
| RIPD (art. 38) | `ripd.md` | Interno |
| MSA para empresas, NDA, cláusulas com operadores | `modelos-contratos.md` | Modelos |
| Pentest documentado | `pentest-e-auditoria.md` | **Não realizado** (plano pronto) |

## Pendências que só o responsável pode resolver

1. **Identificação do prestador.** Preencher `responsavelNome`, `documento`, `endereco`, `cidade`, `uf` e `encarregadoNome` em `src/lib/legal/empresa.ts`. O Decreto 7.962/2013 (art. 2º) exige nome, CPF/CNPJ e endereço visíveis para quem vende pela internet. Enquanto estiver vazio, as páginas mostram um aviso. Recomendação: abrir MEI/ME para não expor o CPF.
2. **Rodar a migração** `supabase/migrations/14_lgpd_compliance.sql` no SQL Editor do Supabase.
3. **Ligar MFA** (autenticação em dois fatores) nas contas da Vercel, Supabase, GitHub, Mercado Pago, Render e Google. A Política de Segurança afirma que isso é obrigatório.
4. **Contratos com operadores:** aceitar o DPA de cada fornecedor no painel dele (Vercel, Supabase, Render, Google Cloud, Resend) e guardar o PDF em local seguro.
5. **Pentest:** contratar um teste externo (ver `pentest-e-auditoria.md`). Não declare que houve pentest antes de ele existir.
6. **Revisão jurídica** de todos os documentos.
7. **Rotina:** responder pedidos de titular em até 15 dias; revisar acessos a cada trimestre; simular um incidente uma vez por ano.

# Relatório de Impacto à Proteção de Dados Pessoais (RIPD)

Base: LGPD, arts. 5º, XVII, e 38; Res. CD/ANPD 2/2022, art. 4º (critérios de alto risco).
Versão: 2026-11-17. Revisar quando houver nova funcionalidade relevante ou ao menos uma vez por ano.

## 1. É obrigatório?

A Res. 2/2022 considera alto risco o tratamento que reúna um critério geral (larga escala ou efeito significativo sobre direitos) e um específico (tecnologia nova, vigilância de áreas públicas, decisão automatizada, dados sensíveis, crianças ou idosos).

| Critério | Situação no Radar |
|---|---|
| Larga escala | Possível: o Copiador lê mensagens de grupos com centenas de participantes |
| Dados sensíveis | Não tratados |
| Crianças e adolescentes | Não intencionalmente |
| Decisão automatizada que afete o titular | Não (a automação decide o que publicar, não decide sobre pessoas) |
| Perfilamento ou monitoramento sistemático de pessoas | Não: o sistema extrai ofertas, não analisa autores |
| Tecnologia emergente | Uso pontual de IA generativa para legendas, só com o texto da oferta |

Conclusão preliminar: **sem critério específico de alto risco hoje**, então o RIPD não é obrigatório pela Res. 2/2022. Este relatório é mantido como boa prática (art. 50) e porque a ANPD pode solicitá-lo (art. 38).

## 2. Descrição do tratamento de maior risco: Copiador

- **O quê:** mensagens de grupos de origem escolhidos pelo cliente são recebidas pelo gateway, filtradas para extrair a oferta (texto, link, foto) e republicadas nos grupos do cliente com o link de afiliado dele.
- **Titulares afetados:** autores e participantes dos grupos de origem; participantes dos grupos de destino.
- **Necessidade:** só o conteúdo da oferta é necessário. Nomes e números dos autores não são publicados.

## 3. Riscos e medidas

| Risco | Probabilidade | Impacto | Medida existente | Medida recomendada |
|---|---|---|---|---|
| Republicar dado pessoal que estava numa mensagem de oferta (ex.: telefone) | Média | Médio | Filtro de conteúdo antes de publicar; modo revisão | Filtro automático de telefones/e-mails no texto copiado |
| Vazamento do histórico de mensagens | Baixa | Alto | RLS, TLS, acesso só pelo servidor | Descartar mensagens de origem após 90 dias |
| Uso em grupos sem autorização do cliente | Média | Médio | Termos e Uso Aceitável proíbem; cliente é controlador | Aviso no Copiador ao escolher a origem |
| Bloqueio do número do cliente pelo WhatsApp | Média | Médio (não é dado pessoal, mas afeta o cliente) | Limites de envio, aviso nos Termos | Manter |
| Envio do texto ao provedor de IA no exterior | Baixa | Baixo | Só o texto da oferta | Não enviar nomes ou números à IA |

## 4. Parecer do Encarregado

Riscos residuais aceitáveis com as medidas existentes, desde que as medidas recomendadas de prioridade alta (filtro de telefones/e-mails e descarte após 90 dias) entrem no planejamento. Assinatura e data: __________________

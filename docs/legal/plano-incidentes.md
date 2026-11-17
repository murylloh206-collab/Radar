# Plano de Resposta a Incidentes de Segurança

Base: LGPD, arts. 46 a 48; Res. CD/ANPD 15/2024 (Regulamento de Comunicação de Incidente de Segurança).
Responsável pela resposta: o Encarregado. Canal: `rd.of00@gmail.com`.

## 1. Classificação de severidade

| Nível | Exemplo | Comunicar ANPD e titulares? | Tempo para conter |
|---|---|---|---|
| Crítico | Vazamento de senhas, chaves de afiliado, dados de pagamento ou da base inteira; acesso indevido a várias contas | Sim | Imediato (até 4 h) |
| Alto | Acesso indevido a uma conta; exposição de e-mails de clientes; chave de serviço vazada | Provavelmente sim (avaliar risco) | Até 24 h |
| Médio | Falha que expõe dados sem evidência de acesso; indisponibilidade prolongada | Avaliar | Até 48 h |
| Baixo | Tentativa bloqueada; falha sem dado pessoal | Não; só registrar | Até 5 dias |

Comunicar quando o incidente puder causar **risco ou dano relevante** aos titulares (Res. 15/2024, art. 5º), por exemplo envolvendo dados financeiros, credenciais, dados em larga escala ou que permitam fraude.

## 2. Passo a passo (playbook)

1. **Detectar e abrir registro**: anotar data/hora do conhecimento (o prazo conta a partir daqui), quem detectou e o que se sabe.
2. **Conter**: revogar e trocar chaves (Vercel → Environment Variables; Supabase → API keys; Mercado Pago; Evolution/gateway; segredo do webhook), encerrar sessões (trocar `SESSION_SECRET` derruba todas), bloquear a conta afetada, tirar a funcionalidade do ar se preciso.
3. **Preservar evidências**: exportar `access_logs`, logs da Vercel e do Supabase do período. Não apagar nada.
4. **Avaliar**: quais dados, quantos titulares, se foram acessados ou só expostos, se estavam cifrados, qual o risco.
5. **Comunicar** (se risco relevante): ANPD e titulares em até **3 dias úteis** do conhecimento (Res. 15/2024, art. 6º). Usar o formulário do site da ANPD (gov.br/anpd). Se faltar informação, comunicar o que houver e complementar depois.
6. **Corrigir a causa** e verificar.
7. **Encerrar**: registro final com cronologia, causa, medidas e lições. Guardar por **no mínimo 5 anos** (Res. 15/2024, art. 10), mesmo para incidentes não comunicados.

## 3. Fluxo de comunicação

- Interno: responsável → Encarregado (mesma pessoa hoje) → fornecedor envolvido (Vercel, Supabase, Render, Mercado Pago), pelo canal de segurança de cada um.
- ANPD: formulário oficial, em até 3 dias úteis.
- Titulares: e-mail individual (ou aviso no painel e no site se não for possível individualizar), em linguagem simples.
- Clientes como controladores (dados de terceiros nos grupos): avisar em até 2 dias úteis (Aditivo de Dados, seção 5).

## 4. Modelo de comunicação ao titular

> Assunto: Aviso de incidente de segurança no Radar de Ofertas
>
> Olá, [nome]. Em [data], identificamos [o que aconteceu, em uma frase]. Os dados envolvidos foram: [lista]. [Não há/Há] indícios de uso indevido.
> Já fizemos: [medidas]. Recomendamos que você: [trocar a senha / revisar acessos / ficar atento a mensagens suspeitas].
> Riscos possíveis: [riscos]. Dúvidas: rd.of00@gmail.com (Encarregado). Protocolo: [nº].

## 5. Conteúdo mínimo da comunicação à ANPD (Res. 15/2024, art. 6º)

Descrição da natureza e da categoria dos dados; número de titulares (incluindo crianças, se houver); medidas técnicas de proteção usadas; riscos; motivo de eventual demora; medidas adotadas para reverter ou reduzir; data do incidente e do conhecimento; dados do Encarregado.

## 6. Simulação anual

Uma vez por ano, simular um cenário (ex.: "a chave de serviço do Supabase vazou num print") e cronometrar os passos 1 a 5. Registrar data, cenário, tempo gasto e o que melhorar.

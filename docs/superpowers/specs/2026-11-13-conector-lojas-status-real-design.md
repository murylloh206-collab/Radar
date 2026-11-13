# Conector de lojas em um clique + status real de conexão

Data: 2026-11-13 · Aprovado pelo dono em conversa (abordagem C).

## Por quê

- Conectar loja hoje exige copiar chaves à mão (Rakuten, Amazon) e o dono quer vender o painel para gente sem conhecimento técnico.
- O painel diz "conectado" quando algo foi **salvo**, não quando **funciona**. Em 13/11 a sessão do Mercado Livre venceu e as ofertas saíram com is.gd sem ninguém saber; a Netshoes nunca funcionou porque o token salvo era o temporário de 60 min da Rakuten.

## Objetivos

1. Na extensão Radar Conector: o dono abre a página da loja, abre a extensão, escolhe a loja, clica **Conectar** e a extensão lê os dados da tela.
2. Se a leitura falhar, o popup mostra o campo para colar (rede de segurança).
3. Toda conexão é **testada na hora** gerando um link real, e retestada **diariamente**.
4. Painel e extensão mostram o mesmo status real por loja: ✅ Conectado (último teste às HH:MM) · ❌ Falhou (motivo em português) · 🟡 Amazon "tag salva — sem teste possível sem API" · ⚪ Não configurado.
5. Loja com status ❌ não envia oferta com link errado: a oferta fica parada com o motivo (vale para meli.la — sem fallback para is.gd nem link longo).
6. Cada conexão vai para a conta de **quem está logado no painel** (base do isolamento).

## Não objetivos (agora)

- Shopee (credenciais indisponíveis; segue no modo atual, digitado no painel).
- Notificação no celular / PWA (etapa seguinte; ver memória "alertas pendentes").
- Outras lojas (Nike, Centauro, Magalu).
- Login automático nas lojas ou guardar senhas — nunca.

## Antiobjetivos (seria fracasso mesmo funcionando)

- Mostrar ✅ sem teste real recente.
- Uma conexão de um cliente cair na conta de outro (inclusive na conta do dono).
- Segredos aparecendo em logs, respostas de API ou no popup depois de salvos.

## Abordagens consideradas

- **A — extensão lê a tela.** Simples, mas quebra se a loja mudar o layout.
- **B — extensão usa a sessão do navegador e chama APIs internas da loja.** Independe do layout, mas usa caminhos não documentados; mais frágil e arriscado.
- **C — A + campo para colar + teste ao vivo e diário (escolhida).** Mantém o um-clique e nunca deixa o dono sem saída; o teste garante que o status é verdadeiro.

## O que cada loja precisa e onde a extensão lê

| Loja | Dados salvos | Página | Onde está na tela |
|---|---|---|---|
| Mercado Livre | cookies da sessão (como hoje) | qualquer página do ML logada | `chrome.cookies` |
| Rakuten/Netshoes | Client ID, Client Secret | `developers.rakutenadvertising.com/default/dashboard/` | tabela "API Credentials" (`table.Table tbody tr td.Table__TableData`, colunas "Client ID" e "Client Secret", 32 chars cada) |
| Rakuten/Netshoes | SID (Account ID, 7 dígitos) | `publisher.rakutenadvertising.com/` | botão da conta: texto "SID (ID do Site) NNNNNNN" (`button.AccountAction`) |
| Amazon | Tracking ID (`xxx-20`) | `associados.amazon.com.br/home` | `input[name=store_id]` ou texto "StoreID: xxx-20" |

Leitura por **rótulo de texto** (cabeçalho da coluna, "SID", "StoreID"), com seletor CSS só como apoio — sobrevive a mudanças de classe.

## Rakuten: token renovado pelo painel

Segundo o guia oficial (Access Tokens): token-key = base64(`client_id:client_secret`); `POST https://api.linksynergy.com/token` com `Authorization: Bearer {token-key}` e corpo `scope={SID}` → `access_token` (expira em 3600 s) + `refresh_token`.
- O painel guarda Client ID, Client Secret e SID cifrados no cofre; gera o access token sob demanda e o mantém em cache até ~5 min antes de expirar.
- O código da Netshoes (advertiser ID) é descoberto pela API de parcerias/anunciantes e salvo; não é mais digitado.
- A correção anterior (branch `fix/netshoes-rakuten`) partiu de premissa errada (o campo "Merchant ID" continha o Client ID) e será descartada.

## Vínculo extensão ↔ conta

Problemas encontrados: a rota de conexão do ML usa a conta do dono quando não há sessão; o código de pareamento fica em arquivo local (`.data/pairing_codes.json`), que não sobrevive na Vercel.
- Pareamento passa para o Supabase: o painel logado gera um código curto; a extensão troca o código por um **token da extensão** (longo, por usuário, revogável, guardado só como hash no banco).
- Todas as rotas que a extensão chama exigem esse token (ou sessão do painel) e **recusam** sem ele — sem cair na conta do dono.

## Status real

- Tabela de saúde por (usuário, loja): status, motivo, `last_checked_at`, `last_ok_at`.
- Teste por loja: ML gera um meli.la de um produto fixo; Rakuten gera token + um deep link da Netshoes; Amazon só valida o formato da tag (🟡).
- Roda: ao conectar, ao clicar "Testar agora", e diariamente pelo agendador já existente (pg_cron → rota protegida por `CRON_SECRET`).
- O conversor consulta o status: loja ❌ → oferta fica parada com o motivo; ML sem meli.la → parada (não usa is.gd).
- Uma API de status serve painel e extensão.

## Restrições

- Nada vai para produção sem confirmação do dono; testes automatizados antes; nenhum envio real em teste.
- Segredos nunca voltam ao cliente depois de salvos (só "salvo, termina em …").
- Extensão precisa de permissão de host nova para os sites da Rakuten e da Amazon (o Chrome pede confirmação ao atualizar).

## Decisões deixadas para quem constrói

- Formato exato das tabelas/migração e nomes de rotas.
- Produto fixo usado nos testes de cada loja.
- Layout do status no painel, seguindo o visual atual.

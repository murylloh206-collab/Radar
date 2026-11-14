# Diagnóstico somente leitura — Radar de Ofertas

Este pacote entrega `scripts/diagnostics/diag.mjs`. Nenhum teste deste pacote precisa conectar ao banco. O arquivo não carrega `.env`, não importa o aplicativo, não usa a API REST do Supabase e não aceita SQL fornecido pelo usuário. A execução em produção exige a flag `--authorize-production-read` em cada chamada.

## Instalação no Windows PowerShell 5.1 ou 7

1. Extraia o ZIP e copie a pasta `scripts/diagnostics` para a raiz de `C:\projetos\Projeto-afiliados`. Preserve eventuais arquivos existentes antes de substituir.
2. Use Node.js 22 ou superior. Na raiz do projeto:

```powershell
node --version
npm --prefix .\scripts\diagnostics install --ignore-scripts --no-audit --no-fund
node --check .\scripts\diagnostics\diag.mjs
node --test .\scripts\diagnostics\diag.test.mjs
node .\scripts\diagnostics\diag.mjs --help
```

O pacote fixa o driver `pg` em `8.16.3`, isolado do `package.json` principal. A instalação cria um `package-lock.json`: preserve-o e use `npm --prefix .\scripts\diagnostics ci --ignore-scripts --no-audit --no-fund` nas instalações seguintes para fixar também as dependências transitivas. Não versione `node_modules` nem credenciais. A versão do driver deve ser revisada conforme a política de dependências do projeto.

## Antes de autorizar uma consulta real

Solicite ao administrador uma credencial PostgreSQL dedicada de leitura; não use `postgres`, `service_role`, chave anon, JWT ou a senha operacional do aplicativo. A criação da credencial e suas permissões são tarefas separadas: este pacote não executa GRANT, REVOKE, CREATE, ALTER, SET, BEGIN, RPC, ANALYZE ou VACUUM.

O administrador deve conceder somente conexão, USAGE do esquema e SELECT nas tabelas necessárias; revisar papéis herdados/assumíveis, funções EXECUTE e políticas RLS. O papel não deve possuir objetos nem permissões de escrita/criação, BYPASSRLS ou atributos administrativos. Permissões CREATE herdadas de PUBLIC também causam recusa. TEMP não é usado pelo script. A checagem automática não é uma auditoria completa de funções SECURITY DEFINER, políticas RLS ou extensões: essas devem ser confiáveis e sem efeitos externos. SELECT arbitrário não é uma garantia universal de ausência de efeitos; por isso o conjunto de consultas aqui é fechado e não invoca funções do aplicativo.

Use conexão direta ou pooler em modo de sessão que preserve os parâmetros de inicialização PostgreSQL. Poolers incompatíveis devem falhar; não remova os controles para contornar a recusa. O script confirma read-only, timeouts, search_path e RLS antes de consultar tabelas de negócio. Os parâmetros são enviados na conexão, sem comandos SQL de configuração.

## Execução autorizada

Execute o bloco abaixo **somente quando houver autorização para a leitura de produção**. Ele solicita a URL com entrada oculta para evitar colocá-la no histórico do PowerShell. Não cole a credencial no chat. A URL deve ter a forma `postgresql://usuario:senha@host:porta/banco`, sem `?sslmode=...` nem outros parâmetros. Codifique caracteres especiais de usuário/senha com percent-encoding; use o usuário de leitura apropriado ao endpoint. O host esperado deve vir de uma referência confiável, conferida separadamente.

```powershell
$env:DIAG_EXPECTED_HOST = Read-Host 'Host de producao autorizado (sem porta)'
$secretUrl = Read-Host 'URL PostgreSQL da credencial SOMENTE LEITURA' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretUrl)
try {
    $env:DIAG_READONLY_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $secretUrl.Dispose()
}

# Opcional: CA confiavel fornecida pelo administrador/Supabase, em PEM.
# $env:DIAG_CA_FILE = 'C:\certificados\supabase-ca.pem'
$env:DIAG_ROW_LIMIT = '10000'

try {
    node .\scripts\diagnostics\diag.mjs --authorize-production-read
    $diagnosticExit = $LASTEXITCODE
    Write-Host "Codigo de saida: $diagnosticExit"
} finally {
    Remove-Item Env:DIAG_READONLY_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DIAG_EXPECTED_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:DIAG_ROW_LIMIT -ErrorAction SilentlyContinue
    Remove-Item Env:DIAG_CA_FILE -ErrorAction SilentlyContinue
}
```

A variável de ambiente contém a credencial em memória durante a execução; use uma estação confiável. TLS valida cadeia e identidade do certificado (`rejectUnauthorized: true`). Não desative validação TLS; se necessário configure a CA correta. O script rejeita `NODE_TLS_REJECT_UNAUTHORIZED=0` e parâmetros na URL para impedir substituição das opções TLS.

## Esquema encontrado e interpretação

Referência local inspecionada em 12/11/2026: projeto `radar-ofertas`, migrações `supabase/migrations/02_core_schema.sql`, `06_copier_durable_runtime.sql` e `20261026000000_radar_initial.sql`. Isso confirma o esquema versionado local, não quais migrações foram aplicadas em produção.

| Tabela public | Significado do contador |
| --- | --- |
| products_catalog | Registros de produtos; não necessariamente ofertas ativas |
| offer_evaluations | Avaliações de ofertas; `is_approved_true` conta aprovadas |
| offer_deduplication | Chaves de deduplicação, não histórico completo de envios |
| incoming_messages | Mensagens recebidas, agrupadas por status conhecido quando disponível |
| publication_jobs | Trabalhos de publicação, status, `sent_at_last_24h` e `is_demo_true` |
| copier_inbox | Eventos persistidos do copiador, status e `received_at_last_24h` |

Existência, tipo de relação, permissão SELECT e tipos das colunas são conferidos no banco antes dos contadores. Colunas ausentes ou com tipos incompatíveis não geram métricas correspondentes; ausência não significa zero. Somente tabelas ordinárias são contadas; views, tabelas externas e pais particionados são ignorados. Uma mudança de esquema durante a execução pode encerrar o diagnóstico com erro sanitizado.

- Metadados incluem RLS, número de índices e índices inválidos, estimativas de linhas vivas/mortas e datas de analyze/autovacuum. Não consulta `pg_stats`, amostras de valores ou textos de consultas.
- Estimativas são globais, podem estar desatualizadas e não obedecem ao recorte RLS das contagens. `-1` significa estimativa desconhecida e `null` significa informação indisponível.
- Contagens respeitam a visibilidade da credencial. RLS pode retornar zero mesmo com registros existentes. Não há bypass de RLS ou identidade de usuário fabricada. Confirme o escopo com o administrador antes de interpretar como total de produção.
- `exact_for_visible_rows: true` significa que toda a tabela visível coube no limite naquela consulta. `truncated: true` significa contadores parciais sobre no máximo limite + 1 registros; o registro extra detecta truncamento e também entra nos contadores. Não há extrapolação.
- A seleção limitada tem ordem indefinida, não é uma amostra representativa nem corresponde aos registros mais recentes. Métricas de 24h são parciais se houver truncamento. Cada consulta tem seu próprio snapshot; não há consistência transacional entre tabelas.
- Estados conhecidos são os únicos textos de status retornados. Qualquer outro conteúdo vira `__other__`; NULL vira `__null__`. Não são retornados IDs, telefones, destinos, mensagens, URLs, payloads, tokens, erros armazenados ou nomes de usuários. Rótulos de tabela e colunas estão em lista fixa.
- Registros de demonstração são incluídos no total; `is_demo_true` os identifica em agregado. Não confunda trabalhos com entregas confirmadas: `sent_at` e status dependem da semântica do aplicativo. Não some produtos, avaliações e trabalhos como se fossem a mesma entidade.

## Limites e falhas

5s por consulta no servidor, 1s de espera por bloqueio, 5s para conexão, 7s de espera no cliente e 60s para o processo completo. `DIAG_ROW_LIMIT` aceita inteiros de 1 a 10000; a consulta lê até limite + 1 linhas visíveis e devolve no máximo 32 grupos. LIMIT limita registros selecionados, não o número de páginas/linhas físicas que PostgreSQL pode examinar sob RLS; o timeout limita esse custo. As verificações de privilégios também estão sujeitas ao timeout.

O relatório só é impresso após a coleta terminar. Uma falha interrompe a execução; não vira contador zero ou sucesso parcial silencioso. O encerramento normal fecha a conexão em `finally`; o prazo global encerra o processo e seu socket. Os timeouts no servidor continuam sendo a proteção para consultas em andamento.

| Código | Ação |
| --- | --- |
| Saída 0 | Coleta concluída; conferir truncamento e RLS |
| Saída 1 | Falha ou recusa; nenhum relatório completo |
| Saída 2 | Relatório concluído com tabela ausente ou ignorada |
| AUTHORIZATION_REQUIRED | Falta a flag explícita; nenhuma conexão aberta |
| READONLY_ROLE_REQUIRED | Administrador deve revisar privilégios da credencial |
| SESSION_NOT_SAFE | Endpoint não preservou os controles; não prossiga removendo-os |
| DRIVER_NOT_INSTALLED | Instale dependências na pasta diagnostics |
| DATABASE_57014 | Timeout: reduza escopo/limite ou peça análise ao administrador |
| DATABASE_42501 | Permissão insuficiente; revisar SELECT/RLS sem elevar para service_role |
| DIAGNOSTIC_FAILED_DETAILS_REDACTED | Verifique configuração, rede, CA e endpoint com o administrador |

Nenhuma mensagem bruta de erro, stack, detalhe do servidor ou aviso é impressa. Apenas códigos de erro aprovados são expostos. Logs do serviço PostgreSQL e instrumentação externa são controlados pela sua infraestrutura, não pelo script.

## Adaptação e verificação

Se o esquema mudar, revise a lista TABLES, as colunas permitidas em `columnsFor`, os tipos em `counterExpressions` e a lista STATUSES. Mantenha consultas fixas, funções internas de `pg_catalog`, parâmetros para valores e identificadores estritamente permitidos. Ajuste também o LIMIT de metadados se ampliar a lista. Nunca inclua colunas livres de texto na saída. Reexecute a checagem de sintaxe e os testes locais antes de autorizar uma nova execução.

Os testes usam clientes simulados e um subprocesso sem autorização. Eles verificam bloqueios, limites e sanitização, mas não substituem um teste de integração em banco descartável administrado por você. Não houve conexão real, validação da credencial, teste de RLS em produção ou instalação do driver durante a preparação deste pacote.

Referências oficiais: [parâmetros de sessão PostgreSQL](https://www.postgresql.org/docs/current/runtime-config-client.html) e [TLS do node-postgres](https://node-postgres.com/features/ssl).

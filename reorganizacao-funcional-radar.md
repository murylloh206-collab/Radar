# Radar de Ofertas — organização funcional proposta

Inspeção visual do painel publicado em https://painel-de-ofertas.vercel.app/, em 30/10/2026. Foram abertas as 14 entradas da navegação, incluindo as três abas da Central de Automação. A análise considera os controles e conteúdos exibidos; não comprova conversões, envios, comissões ou processamento em segundo plano. Nenhuma mensagem foi disparada e nenhuma configuração de produção foi salva.

## Navegação: 14 entradas atuais → 8 entradas principais

| Nova entrada | Conteúdo dentro dela | Telas atuais incorporadas |
|---|---|---|
| Início | Carrossel aprovado, atalhos úteis e resumo da operação | Página inicial |
| Copiador | Origem e destinos, tratamento da oferta, ativar/pausar, últimas mensagens e atividade da captura | Copiador WhatsApp |
| Criar conteúdo | Abas Oferta por link, Mensagem livre, Story e Templates | Gerar Postagem, Mensagem Avulsa, Gerador Stories 9:16; editor de template hoje embutido no Copiador |
| Ofertas | Catálogo, Busca automática e Curadoria | Catálogo de Ofertas; Fila/Garimpo e Curador Estratégico da Central de Automação; critérios de qualidade de Ajustes |
| Envios | Revisão, Agenda, Campanhas e Histórico | Agenda de Envios; Lista/Lote da Central de Automação; aprovação e histórico de publicações hoje distribuídos na inicial e no Copiador |
| Resultados | Abas Grupos e Vendas/Comissões, com período comum | Analytics de Grupos e Relatórios de Performance |
| Página pública | Perfil, endereço público, blocos de links e prévia | Bio Link Público |
| Conexões | WhatsApp e grupos; Lojas e afiliados; diagnóstico avançado recolhido | Conexão WhatsApp, Conectar Lojas e credenciais de Ajustes |

Preferências da conta, ajuda e saída ficam no menu do perfil, no rodapé da barra lateral esquerda. Configurações técnicas de integração ficam em Conexões, com controle de acesso apropriado. Critérios de qualidade ficam em Ofertas; não criar uma segunda configuração concorrente.

## Decisões baseadas nas telas observadas

**Criar conteúdo:** Gerar Postagem e Mensagem Avulsa repetem destino, prévia, agendamento e envio. Um editor compartilhado pode ter modos de entrada distintos, mantendo esses controles comuns. Story usa dados de produto semelhantes, mas deve ter prévia e exportação próprias: só apresentar exportação/publicação quando realmente implementadas. Converter um link não autoriza publicar. Criar um story não significa enviá-lo automaticamente ao Status.

**Ofertas:** o catálogo é a biblioteca dos produtos; Busca automática é uma origem de novos produtos; Curadoria decide o que é adequado ao público. São três etapas complementares. A função atualmente chamada Fila (Garimpo) deve passar a se chamar Busca automática. A fila de disparos pertence a Envios. A interface deve deixar claro se os filtros gerais são herdados ou substituídos em uma regra específica.

**Envios:** centralizar a visão de revisões, agendamentos, campanhas e resultados de entrega. O lote programado é uma campanha composta por vários envios. Início e Copiador podem mostrar contadores e atalhos filtrados, usando os mesmos registros. Não criar uma segunda fila, nem duplicar tarefas ao mudar de tela. Recebimento de mensagens permanece como atividade do Copiador; confirmação de publicação pertence ao histórico de Envios.

**Resultados:** grupos medem participação e entrega; vendas medem cliques, pedidos e comissões. Usar abas e filtros compartilhados sem misturar conceitos. Taxa de sucesso com zero tentativas deve ser “Sem dados”, não 100%. Credenciais ausentes devem produzir “Conectar loja” ou “Dados indisponíveis”, não zeros que pareçam resultados reais.

**Conexões:** Ajustes contém credenciais de várias lojas e parâmetros do WhatsApp; Conectar Lojas está centrada no Mercado Livre; Conexão WhatsApp também contém lista de grupos. Unificar a navegação e o estado dessas informações. Pareamento, sincronização de grupos e credenciais são administrados aqui; seleção de origem/destino continua próxima da tarefa no Copiador e no editor. Não presumir que “sessão conectada”, “API autorizada” e “link confirmado” são a mesma condição.

**Página pública:** manter separada por ser uma página persistente compartilhável, com identidade e blocos próprios. Ela não é uma mensagem de WhatsApp nem um item da fila de envios.

## Experiência do Copiador

O Copiador continua acessível diretamente na lateral. O usuário vê de qual grupo copia, para quais destinos envia, o modo de operação e o estado do recebimento. “Ver últimas mensagens” abre uma área secundária. “Revisar ofertas” abre Envios já filtrado por aquele fluxo. “Editar template” abre Criar conteúdo na aba Templates, mantendo contexto para voltar. Os filtros de qualidade têm uma origem única e eventuais substituições por fluxo ficam explícitas.

## Direção visual aprovada

- Barra lateral sempre à esquerda. Perfil no rodapé da própria barra; no celular, dentro do menu que abre pela esquerda.
- Fundo grafite e superfícies neutras; azul discreto em seleção, foco, hover e borda inferior.
- Primeiro slide do carrossel dedicado ao Copiador, sem marcas das lojas. Segundo slide com imagem de compras online, marcas agrupadas e ação Acessar lojas.
- Links para lojas abrem seus sites; gerenciar a integração de afiliados é outra ação, em Conexões. O acesso ao site não pode parecer confirmação de uma API conectada.
- Quatro atalhos principais: Copiador, Criar conteúdo, Envios e Ofertas.
- Navegação adaptada ao espaço disponível. Layout de uma coluna no celular; organização intermediária no tablet; lateral e conteúdo em colunas no computador.
- Fotografias da prévia são imagens geradas para o conceito. A marca Netshoes ainda usa um símbolo temporário N, a substituir por um ativo oficial apropriado.

## Implementação a orientar no Antigravity

1. Inventariar os componentes, rotas, serviços e registros atuais antes de mover telas. A inspeção visual não permite concluir quais funções usam persistência real ou dados de exemplo.
2. Criar o novo shell e agrupamento de páginas, reaproveitando as integrações existentes. Extrair os controles compartilhados do editor, dos destinos, da prévia e do agendamento.
3. Estabelecer uma única origem para grupos, estado de conexão, credenciais, critérios de qualidade, templates e tarefas de envio. Compartilhar leitura entre telas; evitar efeitos colaterais de carregamento.
4. Compatibilizar os endereços antigos com a nova organização e preservar parâmetros de contexto. Rotas antigas de geração, mensagem e stories devem abrir o modo correspondente de Criar conteúdo; analytics e relatórios devem abrir a aba correta em Resultados; agenda deve abrir Envios; automação deve encaminhar para a função adequada, respeitando a aba anterior quando disponível.
5. Toda ação visível precisa ter destino e comportamento reais. Remover atalhos duplicados e textos internos como “worker”, “job” e “gateway” do uso comum, mantendo diagnóstico técnico acessível a quem precisa dele.
6. Usar estados de carregamento, vazio, erro e dados indisponíveis distintos. Não apresentar “Desconectado” apenas porque a consulta ainda está carregando, nem afirmar API validada sem evidência correspondente.
7. Preservar conexão, grupos, regras, links, históricos e isolamento entre usuários. Não executar resets de banco ou recriar sessões como parte da reorganização visual.
8. Validar navegação antiga/nova, celular/tablet/computador, permissões, estado de formulários, origem/destino e ausência de duplicação de tarefas. Testes automatizados de envio devem usar ambiente isolado; nenhum disparo de produção decorre da simples abertura de uma página.

Esta é a organização funcional proposta para a refatoração. O painel publicado ainda mantém as telas originais.

# Refatoração completa do Radar de Ofertas — executar conforme o design aprovado

Você vai implementar a nova interface do **Radar de Ofertas**, no projeto real aberto neste workspace. O objetivo é entregar um painel SaaS profissional, responsivo e funcional, reproduzindo com fidelidade as telas aprovadas neste pacote e reorganizando as funções atuais sem perder integrações, registros ou comportamentos úteis.

**O design já foi escolhido. Não crie outra proposta visual. Implemente este modelo.** As capturas mostram a aparência desejada; o protótipo permite conferir navegação, abas, composição e estados. Seus dados são ilustrativos e devem ser substituídos por dados reais da aplicação.

## 1. Leia as referências antes de implementar

1. Abra `prototipo/index.html` em um navegador e navegue pelas oito áreas, pelas abas e pelos dois slides da inicial.
2. Examine todas as imagens de `referencias/`. `GUIA-DAS-TELAS.md` identifica cada arquivo. Compare principalmente os pares de computador e celular.
3. Leia `reorganizacao-funcional-radar.md`, que explica o agrupamento das funções anteriormente distribuídas em 14 entradas.
4. Consulte `prototipo/fragmento.html` para extrair medidas, estilos, textos e proporções. `assets/` contém as fotografias do conceito. `design-tokens.css` resume a paleta aprovada.
5. Leia as instruções do repositório e inventarie rotas, componentes, autenticação, APIs, persistência, tarefas em segundo plano e integrações existentes. Confirme qual é o projeto atual; não trabalhe automaticamente no antigo Painel de Ofertas. O painel publicado usado como referência funcional foi `https://painel-de-ofertas.vercel.app/`.

Prioridade: este documento define comportamento e restrições; o protótipo e as capturas definem aparência. Quando o protótipo simplificar uma função real, preserve a função e use os mesmos componentes visuais para os campos adicionais. Informe diferenças inevitáveis. Não use as imagens de telas como fundo de uma interface falsa nem incorpore o protótipo inteiro em um iframe na aplicação final.

## 2. Direção visual obrigatória

- Base grafite, superfícies neutras, bordas discretas, textos claros e bastante organização. Preserve o aspecto editorial das fotografias e o equilíbrio do modelo.
- Use o azul/ciano da marca **como detalhe**: hover, foco, seleção, pequenos ícones, indicadores e linha inferior de abas/modais. Não transforme o fundo, todos os cartões ou todos os botões em azul. Sem brilho neon e sem grandes gradientes azuis.
- Paleta de referência: fundo `#1a1d20`, lateral `#171a1d`, painéis `#24282c`, borda `#363c41`, texto `#f2f4f5`, texto secundário `#aab2b7`, acento `#39bee6`. Extraia os demais estados do protótipo e centralize-os em tokens.
- Preserve hierarquia tipográfica, espaçamento, alinhamentos, proporções das colunas, bordas arredondadas e tratamento de fotos. Use a fonte da referência, com fallback coerente. Ajustes para legibilidade, contraste e toque são permitidos sem mudar o estilo.
- Use uma biblioteca consistente de ícones de interface já disponível no projeto. Substitua os caracteres provisórios do protótipo por ícones equivalentes. Para WhatsApp e lojas, use arquivos de marca apropriados, com texto alternativo. O símbolo `N` da Netshoes é provisório: substitua pelo ativo correto, sem desenhar uma marca inventada.
- Use as fotografias fornecidas na inicial, com o mesmo enquadramento e cobertura escura que permite ler o texto. Evite imagens genéricas que mudem a proposta aprovada.
- As fotos do fone, almofada e luminária são produtos fictícios para visualizar o layout. Não semeie esses produtos no banco nem os apresente como ofertas reais.

## 3. Estrutura comum e lateral

Crie um shell compartilhado para todas as páginas. A **barra lateral fica sempre à esquerda**. A conta/perfil fica **dentro da lateral, no rodapé inferior esquerdo**, com avatar, identificação real e menu de conta, preferências, ajuda e saída. Não coloque o perfil no topo ou no canto inferior direito. Não substitua o perfil por avisos permanentes sobre WhatsApp ou validação de links.

Organização da lateral, nesta ordem:

- Visão geral: **Início**.
- Operação: **Copiador**, **Criar conteúdo**, **Ofertas**, **Envios**.
- Gestão: **Resultados**, **Página pública**, **Conexões**.

O item ativo usa superfície neutra e detalhe azul como no modelo. O topo do conteúdo tem caminho de navegação discreto. Ações da página ficam à direita do cabeçalho no computador; no celular se reorganizam sem cortar textos. Há uma única lateral para todo o painel, sem duas cópias concorrentes de layout ou margens calculadas duas vezes.

No computador, mantenha navegação visível e conteúdo ao lado. A lateral deve caber na altura disponível: região de navegação pode rolar e perfil continua acessível no rodapé. Use `min-width: 0` no conteúdo para impedir que tabelas e nomes longos empurrem a lateral.

## 4. Responsividade real

Use a largura disponível com CSS e container/media queries; não dependa de reconhecer o nome do aparelho ou apenas de user-agent.

- **Celular:** referência em 390 px, mas validar também 360 e 430 px. Uma coluna, controles fáceis de tocar, prévia abaixo do formulário, fluxo origem/destino vertical. O menu abre **pela esquerda**, com sobreposição, fechamento acessível e perfil dentro dele. Preserve os atalhos móveis do modelo sem duplicar o perfil.
- **Tablet:** referência em 820 px; valide também 768 e 1024 px. Reduza colunas quando o conteúdo não couber. A referência mantém lateral à esquerda em 820 px e empilha painéis principais. Ajuste o limiar conforme espaço real, mantendo o mesmo raciocínio visual.
- **Computador:** valide 1280 e 1440 px. Lateral à esquerda, formulários e prévias em colunas conforme as capturas; largura de leitura equilibrada, sem esticar tudo desnecessariamente.
- O protótipo usa 760 px para a transição móvel e uma faixa intermediária até 950 px para empilhar painéis. Use isso como ponto de partida, conferindo a largura interna do conteúdo.
- Sem rolagem horizontal da página, sobreposição de campos, corte de botões, textos sobre fotos ilegíveis ou menus fora da tela. Rolagem horizontal, se necessária, deve ficar limitada à tabela ou à faixa de abas.
- Modais devem caber na tela, rolar internamente quando necessário e manter botão de fechar. Respeite área segura do celular, teclado virtual, foco, Escape, navegação por teclado e movimento reduzido. Em mobile, alvos principais com pelo menos 44 px e campos de texto com fonte de pelo menos 16 px.

## 5. Implemente as oito áreas

### Início

Reproduza `01a` e `01b`: carrossel com duas fotografias, texto sobreposto, CTA, indicadores e setas. **Primeiro slide: Copiador, sem ícones das lojas. Segundo slide: lojas, com Shopee, Netshoes e Amazon agrupadas/sobrepostas da esquerda para a direita.** O ícone do WhatsApp aparece no atalho do Copiador, conforme a proposta.

O primeiro CTA abre Copiador. O segundo abre a janela “Escolha uma loja”, com links explícitos para os sites das lojas. Abrir uma loja não significa conectar uma integração. O cartão “Suas lojas em um só lugar” abre Conexões na aba de afiliados. Preserve quatro atalhos: Copiador, Criar conteúdo, Envios e Ofertas. O recurso Histórico abre a aba correspondente em Envios. Não crie cartões decorativos sem destino.

Preserve navegação manual do carrossel. Caso use avanço automático, permita pausar e respeite movimento reduzido. Não acrescente métricas inventadas para preencher espaço.

### Copiador

Reproduza `02` e `10a`. A tela precisa responder imediatamente: **de qual grupo copiar, em quais grupos publicar, em qual modo operar e se o copiador está ativo**.

Use grupos reais da conta WhatsApp conectada, com busca e seleção. Permita selecionar os destinos suportados pelo sistema; a prévia simplificada com um destino não é motivo para remover múltiplos destinos já existentes. Mostre resumo origem → destinos, modo “Revisar antes de enviar” ou “Enviar automaticamente após validar”, template, filtros, lojas e horários em seção avançada recolhida. Mostre prévia de imagem/texto/link e controle principal “Ativar Copiador” / “Pausar Copiador”.

“Últimas mensagens” fica em botão separado, abrindo a área secundária de atividade como em `09a`; não transforme a tela inicial em um depurador de mensagens. Mostre origem, horário e resultado do processamento, com motivo quando ignorada ou bloqueada. Diferencie regra ativa, recebimento recente e processamento; regra ativa não comprova que uma nova mensagem chegou.

Ativar deve persistir a regra real e conectar o fluxo de recebimento existente. Pausar deve impedir novos disparos dessa regra, respeitando tarefas já assumidas pelo processamento e explicando seu estado. Reabrir a página não deve reativar ou duplicar tarefas. Novas mensagens elegíveis do grupo escolhido devem ser recebidas pelo mecanismo real já adotado pelo projeto; não use listas fixas ou temporizadores que fingem mensagens. Confirme o vínculo entre sessão, conta, regra e eventos recebidos. Evite copiar a própria saída novamente e duplicar mensagens reentregues pelo provedor.

“Ver revisão” abre Envios filtrado pela regra. “Editar templates” abre Criar conteúdo/ Templates. “Ajustar filtros” abre Ofertas/ Curadoria. Preserve o contexto para voltar. Não exija um “grupo de homologação” para o uso normal do produto. Testes técnicos ficam separados. A permissão para publicar deve refletir a configuração real do grupo: ser administrador só é obrigatório quando as restrições do WhatsApp exigirem isso.

### Criar conteúdo

Reproduza as quatro abas `03a` a `03d`: **Oferta por link**, **Mensagem livre**, **Story** e **Templates**. Reaproveite controles compartilhados de dados, destinos, prévia, rascunho e agendamento.

Oferta por link busca produto real, mostra título/preço/cupom/imagem e o estado da conversão. Mensagem livre permite texto e imagem. Story tem prévia vertical 9:16 e exportação real quando suportada; exportar arte não significa publicá-la no Status. Templates têm listagem, editor, campos dinâmicos, prévia e persistência. Mantenha variáveis existentes e valide campos desconhecidos sem quebrar modelos salvos.

“Continuar para envio” leva conteúdo e contexto para a mesma central de Envios. Mudar de aba não deve apagar silenciosamente um rascunho nem publicar. Não espalhe três implementações diferentes do mesmo agendador.

### Ofertas

Reproduza `04a` a `04c`: **Catálogo**, **Busca automática** e **Curadoria**. Catálogo com produtos reais, imagens, busca, filtros de loja e ação para criar postagem. Busca automática configura fontes, categorias, intervalo e encaminhamento dos achados. Curadoria concentra interesses, nota/avaliações mínimas, limites, variedade e repetição.

A antiga Fila/Garimpo passa a se chamar Busca automática. A fila de publicação pertence a Envios. Mantenha uma única configuração de qualidade; substituições por regra devem aparecer claramente como substituições. Informação ausente de avaliação não pode ser tratada como nota alta. Não invente avaliações nem ofertas de exemplo quando uma API falhar.

### Envios

Reproduza `05a` a `05d`: **Revisão**, **Agenda**, **Campanhas** e **Histórico**. Centralize os registros existentes de aprovação, agendamento, lotes e entrega. Campanha é um conjunto de publicações com destinos e intervalos; não crie outra fila independente.

Revisão permite conferir/editar/aprovar conforme validações. Agenda permite agendar, editar e cancelar com estado persistido. Histórico informa enviado, falha, cancelado ou em processamento conforme evidência real e permite inspecionar o motivo. Repetir uma ação ou reabrir a página não pode causar envio duplicado. Mostre fuso horário usado; não altere silenciosamente o horário salvo durante a migração.

Confirme conteúdo e destinos no ponto da ação. Aprovação, agendamento e envio imediato devem ter efeitos explícitos. Uma prévia nunca dispara mensagem e nenhum destino alternativo é escolhido automaticamente em caso de erro.

### Resultados

Reproduza `06a` e `06b`: **Grupos** e **Vendas e comissões**, com período comum. Grupos usa dados reais de publicações/entregas e métricas disponíveis; vendas usa o que cada integração efetivamente disponibiliza. Não misture entrega de mensagem com venda atribuída.

Quando não houver consulta configurada ou dados disponíveis, mostre “Dados indisponíveis” e a ação de conectar a loja. Zero só aparece quando há um resultado real igual a zero. Sem tentativas, taxa de sucesso deve ser “Sem dados”, nunca 100%. Não copie números e gráficos ilustrativos das capturas.

### Página pública

Reproduza `07`: editor de perfil, descrição, endereço e blocos de links, com prévia ao lado no computador e abaixo no celular. Reaproveite o Bio Link atual, valide o endereço no servidor, preserve a propriedade da página e diferencie salvar rascunho de tornar alterações públicas conforme o comportamento existente. A prévia deve representar o que a página pública realmente renderiza.

### Conexões

Reproduza `08a` e `08b`: **WhatsApp e grupos** e **Lojas e afiliados**. WhatsApp permite conectar/parear no painel, verificar estado e sincronizar grupos reais. Nome e identificação vêm da conta conectada; o nome técnico de uma instância como `radar_ofertas` não deve substituir a identidade de um WhatsApp pessoal. Trocar a conta exige atualizar o vínculo dos grupos e verificar regras incompatíveis, sem reutilizar silenciosamente grupos da sessão anterior.

Separe carregando, conectado, desconectado e falha de verificação. Um timeout não comprova desconexão ou “servidor dormindo”. Quando exibir último estado conhecido, identifique-o e mostre a data da última confirmação. Configuração técnica, nome de instância e diagnóstico ficam em área avançada, sem pedir Render ou chave global ao usuário no fluxo comum.

Lojas concentra as integrações existentes: Mercado Livre, Shopee, Netshoes/Rakuten e outras realmente suportadas. Amazon e Magalu podem aparecer no conceito, mas não devem ganhar um falso botão de conexão funcionando se o backend ainda não existe. Use estado honesto e identifique a capacidade ausente; preserve o cartão e o estilo. Diferencie conta configurada, autorização válida, link gerado, link confirmado e relatórios disponíveis. Preserve conectores/OAuth já funcionais. Não invente um novo conector que extraia senhas ou exporte cookies para simular integração automática.

## 6. Regras de negócio que a nova interface deve preservar

- Conversão: receber link → resolver redirecionamentos com validação de destinos → identificar loja/produto → gerar pela integração do usuário → confirmar conforme evidência suportada pela plataforma → inserir link final no template → liberar publicação. Não declare confirmação apenas pela presença/tamanho de token. Encurtamento ocorre depois da geração do link de afiliado quando necessário. Falha de conversão bloqueia a oferta para revisão; nunca reutiliza o link afiliado do grupo de origem como alternativa.
- Imagens: preserve ou melhore o fluxo de obter a melhor imagem oficial disponível do produto. Evite miniaturas pequenas, ampliação artificial e recompressão excessiva. Use composição própria da marca quando esse recurso existir, sem copiar a arte com marca d’água do grupo de origem. Mostre indisponibilidade e permita revisão quando a qualidade for insuficiente. Não prometa que apenas aumentar dimensões recupera detalhes.
- Credenciais ficam no servidor, protegidas e vinculadas ao usuário/organização. Respostas de leitura retornam apenas metadados e indicadores. Não exponha tokens, segredos, chave global do WhatsApp ou dados de outra conta no navegador, logs, URLs ou relatório final.
- Preserve autenticação, isolamento entre clientes, permissões e dados. Não resolva erros de autorização removendo verificações. Não faça reset de banco, drop de schema, recriação de sessão WhatsApp ou limpeza de históricos para viabilizar a interface.
- A abertura de qualquer página é somente leitura. Ativar automações, autorizar envio, publicar página e desconectar conta exigem ações explícitas nos respectivos controles. Durante o desenvolvimento, não envie mensagens a grupos reais nem ative regras reais apenas para produzir capturas.

## 7. Rotas antigas e compatibilidade

Use rotas canônicas coerentes com o roteador atual. Uma sugestão é `/`, `/copiador`, `/criar-conteudo`, `/ofertas`, `/envios`, `/resultados`, `/pagina-publica` e `/conexoes`, com abas e filtros na URL. Preserve os endereços antigos por redirecionamento ou encaminhamento compatível:

| Endereço anterior | Novo destino funcional |
|---|---|
| `/gerar-postagem` | Criar conteúdo / Oferta por link |
| `/mensagem-avulsa` | Criar conteúdo / Mensagem livre |
| `/stories` | Criar conteúdo / Story |
| `/agenda` | Envios / Agenda |
| `/analytics` | Resultados / Grupos |
| `/relatorios` | Resultados / Vendas e comissões |
| `/bio-link` | Página pública |
| `/conexao-whatsapp` | Conexões / WhatsApp e grupos |
| `/conectar-lojas` | Conexões / Lojas e afiliados |
| `/automacao` | Conforme aba anterior: Fila/Garimpo → Busca automática; Lista/Lote → Campanhas; Curador → Curadoria |
| `/ajustes` | Encaminhar seção de credenciais para Conexões, qualidade para Curadoria e conta/preferências para o menu do perfil |

Preserve parâmetros úteis, identificadores e retorno ao fluxo anterior. Voltar/avançar, link direto, recarregar e abrir uma aba específica precisam funcionar. Não mantenha telas antigas duplicadas com lógica concorrente apenas para preservar o endereço.

## 8. Forma de implementação e verificação

Trabalhe na stack atual e reaproveite componentes/serviços úteis. Separe o shell, componentes visuais reutilizáveis e lógica de domínio. Transfira estilos para a estrutura do projeto; não cole o HTML inteiro como uma página monolítica. Hospede os assets usados pela aplicação em caminhos locais apropriados, com dimensões e carregamento otimizado.

Implemente por etapas verificáveis: shell/lateral → inicial → páginas e abas → integração com serviços atuais → compatibilidade de rotas → revisão visual e funcional. Não encerre com apenas um plano ou com uma inicial bonita enquanto as demais páginas continuam antigas.

Confira todas as oito áreas e suas abas, menu do perfil, ambos os slides, modal de lojas, estados vazios/carregando/erro, formulários, navegação contextual e persistência. Compare capturas da implementação com as referências no mesmo tamanho de tela. Se usar dados de demonstração em testes visuais, mantenha-os isolados e explicitamente identificados fora da produção.

Execute build, checagem de tipos/lint conforme scripts disponíveis e testes relevantes de autorização, regras, conversão e envio. Testes de entrega usam ambiente isolado/provedor simulado; registre separadamente o que foi validado contra serviços reais sem disparo. Verifique que carregar a página não publica, que links não confirmados ficam bloqueados, que a identidade/grupos correspondem à conta atual e que tarefas não se duplicam.

**Critério de conclusão:** aparência correspondente ao pacote, oito áreas responsivas, funções anteriores úteis preservadas e reagrupadas, ações ligadas aos serviços reais, estados honestos, endereços antigos compatíveis e nenhuma regressão conhecida ocultada.

Ao terminar, entregue: resumo das mudanças, mapa de rotas final, capturas de computador/celular/tablet, verificações executadas, funcionalidades realmente integradas e eventuais dependências externas pendentes. Não afirme “100% funcional” quando uma etapa externa não pôde ser comprovada. Prepare a implementação para revisão antes de qualquer publicação fora do fluxo já autorizado do projeto.

# Implementar o Radar Conector — desenho aprovado

Implemente no projeto atual o desenho aprovado deste pacote. O usuário aprovou as três telas e pediu sua aplicação: popup da extensão, página Conexões e tutorial de instalação. Preserve o restante do painel e o trabalho funcional em andamento.

## Referência visual

Abra `design/index.html` e navegue pelas abas **Extensão**, **Página de Conexões** e **Tutorial de instalação**. Na página Conexões, teste o botão superior **Baixar extensão**, que abre o tutorial em modal. No popup, selecione as quatro lojas para observar as mudanças de ação e texto.

Use `design/fragmento.html` como fonte de medidas, composição, cores e textos. Reproduza o visual; porte os controles para os componentes e serviços reais. A nota externa “Prévia de design”, as abas de apresentação das três telas e as mensagens demonstrativas pertencem somente à referência.

O desenho usa grafite, superfícies neutras, detalhes discretos em ciano, marcas reais, botão principal claro e hierarquia simples. Preserve a lateral esquerda e o perfil no rodapé da lateral. O popup é compacto, com aproximadamente 390 px de largura e 540 px de altura no estado principal; confira os limites do navegador e estados com textos maiores.

## 1. Popup da extensão

Refatore a extensão existente em `chrome-extension/`, confirmando os arquivos atuais antes de editar. Mantenha Manifest V3 e os comportamentos úteis existentes.

Implemente o cabeçalho Radar Conector, vínculo com o painel, seletor das lojas, seção de ação contextual e rodapé conforme o desenho. Use os arquivos autênticos de `assets/brands/`, armazenados em caminhos locais da extensão; ícones e fontes também precisam estar disponíveis localmente na versão instalável.

O protótipo usa scripts internos e recursos fornecidos pelo ambiente de prévia. A implementação MV3 deve ter scripts externos locais, sem copiar scripts inline, eval ou dependências remotas do protótipo. Use o estilo e o comportamento como referência, adaptando à estrutura correta da extensão.

A ação principal muda conforme a loja. Distingua claramente:

- painel vinculado;
- conta da loja configurada;
- autorização válida;
- link gerado ou confirmado.

Não use identificadores fixos, nome de conta fixo, número de dias fixo ou conexão fictícia. Se a validade não for fornecida pela integração, não invente prazo. Quando o painel não estiver vinculado, apresente primeiro a ação de vincular; quando falhar a verificação, mostre o erro e permita repetir.

Deixe o ambiente online como padrão do uso normal. Configuração de desenvolvimento local fica em opções avançadas ou nas configurações apropriadas, sem disputar espaço com a ação principal.

## 2. Integração por loja

A inspeção anterior encontrou somente domínios e fluxo de Mercado Livre no manifest/popup da extensão. Reconfirme o estado atual. Não transforme o seletor visual de lojas em uma declaração de que todas já conectam.

Para Mercado Livre, preserve e revise o fluxo existente. Para Shopee, Amazon e Netshoes/Rakuten, localize os adaptadores reais e confira a documentação oficial das plataformas antes de implementar autorização ou conversão. Cada uma deve usar o mecanismo realmente disponível para aquela conta/programa. O caminho pode ser uma autorização própria ou a configuração de API no painel; não prometa OAuth ou conexão automática quando a plataforma não os fornecer.

Conforme a referência aprovada, as lojas que dependem de configuração no painel têm ação contextual **Configurar [loja] no painel**, abrindo diretamente a configuração correta. O usuário deve conseguir concluir a integração real por esse caminho. Se faltar um adaptador, implemente a capacidade suportada ou identifique explicitamente a dependência externa pendente.

Não copie o mecanismo de sessão do Mercado Livre indiscriminadamente para as demais lojas. Limite permissões e domínios aos necessários. Não amplie coleta de dados de navegação. Proteja o vínculo entre extensão, painel e usuário, valide origens e destinos das mensagens e não permita enviar credenciais para uma URL arbitrária recebida por mensagem. Segredos não podem aparecer no popup, logs, URLs ou respostas públicas.

## 3. Página Conexões

Na aba **Lojas e afiliados**, implemente o cabeçalho aprovado, com **Baixar extensão** no canto superior direito no computador. No celular, reorganize o botão abaixo do título, sem rolagem horizontal.

Adicione o bloco de orientação “Seu navegador, conectado ao Radar”, com os três passos: instalar a extensão, entrar na loja e vincular ao Radar. As duas ações **Baixar extensão** e **Como instalar** abrem o mesmo tutorial. Preserve os cartões das integrações existentes, seus dados e funções; o conceito não autoriza remover uma loja já suportada, como Magalu.

Cada cartão deve mostrar seu caminho real de configuração. Os links do popup para o painel devem preservar a loja escolhida e abrir sua configuração diretamente, evitando que o usuário precise procurar novamente.

As logos fornecidas têm margens e proporções diferentes: ajuste o tamanho óptico como no desenho. Não redesenhe símbolos, use iniciais ou substitua uma marca por outra.

## 4. Tutorial e instalação manual

Reproduza o modal aprovado com quatro etapas:

1. Baixar o ZIP e extrair a pasta.
2. Abrir a página de extensões do navegador.
3. Ativar Modo do desenvolvedor e usar Carregar sem compactação, selecionando a pasta que contém `manifest.json`.
4. Fixar o Radar Conector e seguir o fluxo da loja.

Implemente o seletor de Chrome, Brave e Edge, com endereços `chrome://extensions`, `brave://extensions` e `edge://extensions`. Oriente a instalação pelo navegador do computador, mantendo o painel utilizável no celular.

O botão **Baixar arquivo ZIP** precisa baixar um pacote real da extensão atualizada, contendo manifest, popup, scripts, ícones e todos os assets necessários. Não inclua `.env`, tokens, credenciais ou arquivos do servidor. Gere o pacote no processo de build/release ou por um script apropriado; não gere um arquivo vazio para simular download.

O botão final segue o estilo claro do painel. Sites comuns não conseguem abrir endereços `chrome://` diretamente. **Não implemente um simples link interno de navegador e declare que funciona.** No contexto permitido da extensão, a abertura pode ser implementada e testada pela API do navegador. No site, disponibilize o endereço e cópia funcional com instrução curta. Se não houver um canal permitido para abrir a página, o botão deve assumir uma ação honesta como **Copiar endereço das extensões**, preservando a composição visual. Só confirme a cópia após sucesso da API de clipboard; forneça alternativa de seleção manual se falhar.

A versão atual será distribuída por instalação manual. Prepare um ponto de configuração para futuramente trocar o destino pela página real da Chrome Web Store. Não invente URL, ID de extensão, publicação ou aprovação. Não é necessário pagar uma taxa para testar a pasta local em modo desenvolvedor.

Referência oficial de instalação: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world

## 5. Interações e acessibilidade

O modal deve abrir e fechar corretamente, funcionar com Escape, controlar o foco, devolver o foco ao botão de origem e caber no celular com rolagem interna quando necessário. Controle a rolagem da página de fundo. Use nomes acessíveis para botões e tabs, texto legível, alvos de toque adequados e contraste no tema escuro.

Preserve a seleção da loja enquanto fizer sentido no fluxo. Não execute leitura de sessão, vínculo de conta ou envio ao servidor apenas por abrir o popup; ações sensíveis de vinculação devem decorrer do controle correspondente e do fluxo autorizado. Não dispare mensagens WhatsApp durante estes testes.

## 6. Critérios de conclusão

- Popup e página reproduzem a aparência aprovada em computador e celular.
- Estados exibidos são obtidos de dados reais ou identificados honestamente como indisponíveis.
- Os quatro caminhos de loja têm comportamento real e destino correto.
- O ZIP entregue instala em modo desenvolvedor em um perfil de teste e inclui todas as imagens.
- O tutorial oferece download, cópia do endereço e instruções que funcionam; sem link interno quebrado.
- Não há permissões excessivas, segredos nos arquivos distribuídos ou mensagens aceitas de origens arbitrárias.
- Build/checagem de tipos do painel e verificações da extensão passam. Teste carregamento do manifest, popup, assets, erros e vínculo com o painel em ambiente isolado.

Entregue capturas comparativas, caminho do ZIP instalável gerado e um relatório por loja: método de integração, etapa implementada, verificação executada e dependência pendente. Diferencie código implementado de integração realmente comprovada. Não encerre com somente uma nova versão visual ou mensagens de sucesso simuladas.

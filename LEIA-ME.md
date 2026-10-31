# Pacote de implementação — Radar de Ofertas

Preparado em 31/10/2026 para orientar a implementação no Antigravity.

## Como usar

1. Extraia este pacote em uma pasta que o Antigravity consiga acessar, preferencialmente dentro do projeto atual.
2. Abra `PROMPT-ANTIGRAVITY.md` e cole seu conteúdo no Antigravity, ou peça explicitamente que ele leia e execute esse arquivo.
3. Anexe `VISAO-GERAL-DAS-TELAS.jpg` e as capturas desejadas de `referencias/`. Se ele tiver acesso à pasta, peça que abra todas as referências.
4. Peça que navegue por `prototipo/index.html` para conferir os estados e as interações antes de implementar.

## Conteúdo

- `PROMPT-ANTIGRAVITY.md`: instrução completa para implementar aparência, organização e comportamento.
- `GUIA-DAS-TELAS.md`: galeria com as **34 capturas**, incluindo oito áreas, abas, dois slides, celular, tablet, menu e janela de lojas.
- `VISAO-GERAL-DAS-TELAS.jpg`: montagem das oito áreas principais, feita a partir das capturas reais.
- `referencias/`: imagens JPG individuais em resolução completa. As telas longas são capturas de página inteira.
- `prototipo/index.html`: prévia navegável exportada; pode ser aberta no navegador sem instalar dependências.
- `prototipo/fragmento.html`: fonte editável do conceito, com estilos e interações. O produto final deve ser implementado na estrutura do projeto, sem iframe.
- `assets/`: quatro fotografias usadas no conceito.
- `design-tokens.css`: cores e medidas básicas para adaptar aos tokens da aplicação.
- `reorganizacao-funcional-radar.md`: justificativa do agrupamento das funções.
- `manifesto-capturas.json`: dimensões e relação dos arquivos de referência.

## O que é referência e o que é produção

O protótipo é local e demonstrativo. Seus botões não conectam contas, consultam produtos nem enviam mensagens reais. O Antigravity deve ligar a interface aos serviços existentes e apresentar capacidades ausentes com estados honestos. Não deve copiar dados fictícios para o banco.

As quatro fotografias foram geradas para o conceito. `radar-hero-editorial.jpg` é a sala do primeiro slide, `radar-lojas-editorial.jpg` é a cena de compras do segundo slide, `radar-explore-editorial.jpg` é a mesa de trabalho do recurso Histórico e `radar-produtos-previa.jpg` contém três produtos fictícios. As fotos de produtos são apenas referências de composição; ofertas reais precisam das próprias imagens oficiais.

A marca Netshoes ainda aparece como `N` em algumas partes do conceito; o implementador deve usar o ativo correto. Outros cartões técnicos de lojas usam abreviações como referência de espaço. Reaproveite também o logo real do Radar disponível no projeto, mantendo sua posição e proporção.

A prévia pode carregar ícones de marcas de CDN. O produto deve usar assets apropriados, estáveis e preferencialmente locais. Ausência de um ícone no modo offline não autoriza mudar a composição.

Remova do produto final a nota externa de demonstração, o selo de prévia e as mensagens que dizem que o protótipo não executa ações. Estados de produção, porém, só podem afirmar sucesso com dados reais.

## Verificação deste pacote

As oito áreas e suas 15 abas foram conferidas estruturalmente. As capturas foram feitas em navegador, com referência de computador, celular e tablet. A galeria e os arquivos JPG foram verificados quanto à integridade. Essa verificação cobre o conceito e a entrega visual; não comprova funcionamento das integrações, envio WhatsApp, conversão de links ou persistência do sistema real.

Este pacote foi preparado para você entregar ao Antigravity. Nenhuma mensagem foi enviada a ele automaticamente e nenhum arquivo do projeto publicado foi alterado nesta preparação.

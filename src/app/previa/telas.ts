/** Lista das telas da PRÉVIA LOCAL do redesenho (só em desenvolvimento, com NEXT_PUBLIC_PREVIA=1). */
export interface TelaPrevia {
  slug: string;
  titulo: string;
  rota: string;
  /** nome do arquivo da foto do "antes" (sem -d/-m.jpg); vazio quando a tela não tinha foto */
  foto: string;
  nota: string;
  estados?: { rotulo: string; rota: string }[];
}

export const CATEGORIAS: { nome: string; telas: TelaPrevia[] }[] = [
  {
    nome: 'Acesso e conta',
    telas: [
      { slug: 'login', titulo: 'Login', rota: '/login', foto: 'login', nota: 'Inclui "Esqueci minha senha" na mesma tela (link abaixo do campo de senha).' },
      { slug: 'cadastro', titulo: 'Cadastro', rota: '/cadastro', foto: 'cadastro', nota: 'Criação de conta, com escolha de plano quando vem da página de planos.' },
      { slug: 'termos', titulo: 'Termos de uso', rota: '/termos', foto: 'termos', nota: 'Texto legal com índice.' },
      { slug: 'privacidade', titulo: 'Privacidade', rota: '/privacidade', foto: 'privacidade', nota: 'Texto legal com índice.' },
      { slug: 'ajuda', titulo: 'Ajuda', rota: '/ajuda', foto: 'ajuda', nota: 'Perguntas frequentes e contato.' },
    ],
  },
  {
    nome: 'Planos e pagamento',
    telas: [
      { slug: 'planos', titulo: 'Planos e preços', rota: '/planos', foto: 'planos', nota: 'O botão de escolher plano abre a confirmação; na prévia não há Mercado Pago configurado, então nada é cobrado.' },
      {
        slug: 'assinatura', titulo: 'Minha assinatura', rota: '/assinatura?demo=ativa', foto: 'assinatura', nota: 'Estados de demonstração (não consultam nem cobram nada).',
        estados: [
          { rotulo: 'Ativa', rota: '/assinatura?demo=ativa' },
          { rotulo: 'Em atraso', rota: '/assinatura?demo=atraso' },
          { rotulo: 'Recusada', rota: '/assinatura?demo=recusada' },
          { rotulo: 'Cancelada', rota: '/assinatura?demo=cancelada' },
          { rotulo: 'Vencida', rota: '/assinatura?demo=vencida' },
          { rotulo: 'Carregando', rota: '/assinatura?demo=carregando' },
          { rotulo: 'Sem assinatura', rota: '/assinatura' },
        ],
      },
      {
        slug: 'retorno', titulo: 'Retorno do pagamento', rota: '/assinatura/retorno?demo=confirmando', foto: 'assinatura_retorno', nota: 'Tela para onde o Mercado Pago devolve o cliente.',
        estados: [
          { rotulo: 'Confirmando', rota: '/assinatura/retorno?demo=confirmando' },
          { rotulo: 'Aprovado', rota: '/assinatura/retorno?demo=aprovado' },
          { rotulo: 'Recusado', rota: '/assinatura/retorno?demo=recusado' },
          { rotulo: 'Em análise', rota: '/assinatura/retorno?demo=analise' },
        ],
      },
    ],
  },
  {
    nome: 'Painel interno',
    telas: [
      { slug: 'inicio', titulo: 'Início', rota: '/painel', foto: 'painel', nota: 'Primeiros passos, acesso rápido e lojas.' },
      { slug: 'copiador', titulo: 'Copiador', rota: '/copiador', foto: 'copiador', nota: 'A foto do "antes" saiu com erro de carregamento (a prévia ainda não tinha grupos de demonstração).' },
      {
        slug: 'criar', titulo: 'Criar conteúdo', rota: '/criar-conteudo', foto: 'criar-conteudo', nota: 'Oferta por link, mensagem livre, story e modelos.',
        estados: [
          { rotulo: 'Oferta por link', rota: '/criar-conteudo?aba=oferta-link' },
          { rotulo: 'Mensagem livre', rota: '/criar-conteudo?aba=mensagem-livre' },
          { rotulo: 'Story', rota: '/criar-conteudo?aba=story' },
        ],
      },
      { slug: 'instagram', titulo: 'Instagram Pro', rota: '/instagram-pro', foto: 'instagram-pro', nota: 'Publicação automática e identidade visual.' },
      { slug: 'ofertas', titulo: 'Ofertas', rota: '/ofertas', foto: 'ofertas', nota: 'Catálogo, busca automática e curadoria. Produtos de demonstração.' },
      {
        slug: 'envios', titulo: 'Envios', rota: '/envios', foto: 'envios', nota: 'Revisão, agenda, campanhas e histórico.',
        estados: [
          { rotulo: 'Revisão', rota: '/envios' },
          { rotulo: 'Agenda', rota: '/envios?aba=agenda' },
          { rotulo: 'Histórico', rota: '/envios?aba=historico' },
        ],
      },
      {
        slug: 'estatisticas', titulo: 'Estatísticas', rota: '/estatisticas', foto: 'resultados', nota: 'Grupos, cliques e vendas.',
        estados: [
          { rotulo: 'Grupos', rota: '/resultados?aba=grupos' },
          { rotulo: 'Vendas', rota: '/resultados?aba=vendas' },
        ],
      },
      { slug: 'pagina-publica', titulo: 'Página pública (editor)', rota: '/pagina-publica', foto: 'pagina-publica', nota: 'Configuração da vitrine / link da bio.' },
      {
        slug: 'conexoes', titulo: 'Conexões', rota: '/conexoes', foto: 'conexoes', nota: 'WhatsApp, lojas, marca d\'água e redes sociais.',
        estados: [
          { rotulo: 'WhatsApp', rota: '/conexoes?aba=whatsapp' },
          { rotulo: 'Lojas', rota: '/conexoes?aba=lojas' },
        ],
      },
    ],
  },
  {
    nome: 'Páginas públicas',
    telas: [
      { slug: 'home', titulo: 'Página inicial', rota: '/', foto: 'inicio', nota: 'Apresentação do serviço. Mantida no visual azul-noite atual.' },
      { slug: 'grupo', titulo: 'Entrar no grupo', rota: '/grupo', foto: 'grupo', nota: 'Página dos anúncios. Mantida como está (está em uso no tráfego pago).' },
    ],
  },
];

export const TODAS = CATEGORIAS.flatMap(c => c.telas);

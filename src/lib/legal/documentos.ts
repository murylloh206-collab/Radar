import { EMPRESA, foro, identificacao } from './empresa';

export type Bloco =
  | string
  | { lista: string[] }
  | { tabela: { cabecalho: string[]; linhas: string[][] } }
  | { aviso: string };

export interface Secao { id: string; titulo: string; blocos: Bloco[] }

export interface DocumentoLegal {
  slug: string;
  titulo: string;
  resumo: string;
  base: string;
  secoes: Secao[];
}

const E = EMPRESA;
const contato = `${E.emailPrivacidade}`;

const SUBOPERADORES: string[][] = [
  ['Vercel Inc.', 'Hospedagem do site e do painel; registros técnicos de requisição', 'Estados Unidos', 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)'],
  ['Supabase Inc.', 'Banco de dados, autenticação e armazenamento de arquivos', 'Região do projeto contratada no provedor', 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)'],
  ['Render Services Inc.', 'Servidor do gateway de conexão com o WhatsApp', 'Estados Unidos', 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)'],
  ['Mercado Pago (MercadoPago.com Representações Ltda.)', 'Processamento de pagamentos e assinaturas', 'Brasil', 'Não há transferência internacional'],
  ['Google LLC (Gemini API)', 'Geração de legendas com IA a partir do texto da oferta, quando o recurso é usado', 'Estados Unidos', 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)'],
  ['ntfy.sh', 'Avisos operacionais enviados ao celular do responsável (vendas do plano, lojas desconectadas); sem dados de contato de clientes', 'Exterior', 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)'],
  ['Resend Inc.', 'E-mails transacionais, quando ativado', 'Estados Unidos', 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)'],
];

export const DOCUMENTOS: DocumentoLegal[] = [
  /* ------------------------------------------------------------------ TERMOS */
  {
    slug: 'termos',
    titulo: 'Termos de Uso e Contrato de Prestação de Serviços',
    resumo: 'Regras de uso do Radar de Ofertas, o que entregamos, preços, cancelamento e direito de arrependimento.',
    base: 'Lei 8.078/1990 (CDC), Decreto 7.962/2013, Lei 12.965/2014 (Marco Civil), Lei 13.709/2018 (LGPD), Código Civil.',
    secoes: [
      { id: 'partes', titulo: '1. Quem somos e aceite', blocos: [
        `Estes Termos regulam o uso do ${E.marca}, serviço prestado por ${identificacao()} ("Radar", "nós"). Contato: ${E.emailSuporte}.`,
        'Ao criar uma conta você declara ter lido e aceito estes Termos e a Política de Privacidade. Guardamos a data, a hora e a versão do documento aceito. Se não concordar, não use o serviço.',
        'O serviço é destinado a maiores de 18 anos e a pessoas jurídicas regularmente constituídas.',
      ] },
      { id: 'servico', titulo: '2. Definição do serviço', blocos: [
        'O Radar é um software como serviço (SaaS) para afiliados: organiza ofertas, converte links para os seus códigos de afiliado, monta mensagens e publica nos canais que você conecta (grupos de WhatsApp, Telegram, Instagram e sua página pública).',
        { lista: [
          'Não somos parceiros oficiais, nem temos vínculo com WhatsApp, Meta, Telegram, Mercado Livre, Shopee, Amazon, Netshoes, Magalu ou outras lojas.',
          'A conexão com o WhatsApp usa uma integração não oficial. Ela pode ser limitada ou bloqueada pelo WhatsApp a qualquer momento, e o risco de restrição do seu número existe mesmo usando os limites de envio do painel.',
          'Preços, estoques e comissões são definidos pelas lojas e programas de afiliados. Não garantimos vendas, comissões ou resultados.',
        ] },
      ] },
      { id: 'conta', titulo: '3. Sua conta e suas obrigações', blocos: [
        { lista: [
          'Manter seus dados corretos e sua senha em sigilo. Atos feitos com seu login são de sua responsabilidade.',
          'Usar apenas grupos, contas e fontes de ofertas a que você tem acesso legítimo, respeitando as regras desses grupos e dos programas de afiliados.',
          'Cumprir a Política de Uso Aceitável. Você é o responsável pelo conteúdo que publica e pelos destinatários que escolhe.',
          'Tratar de forma lícita os dados pessoais de terceiros que passarem pela sua conta (por exemplo, participantes dos seus grupos), como controlador desses dados (ver Aditivo de Tratamento de Dados).',
        ] },
      ] },
      { id: 'precos', titulo: '4. Planos, preços e pagamento', blocos: [
        'Os planos (Impulse, Plus e Ultimate), seus recursos e preços vigentes estão publicados em /planos e são os que valem no momento da contratação. Não há período de teste gratuito.',
        'A cobrança é recorrente e antecipada, processada pelo Mercado Pago, no meio de pagamento que você escolher. A assinatura renova automaticamente a cada ciclo até ser cancelada.',
        'Reajustes de preço serão avisados por e-mail ou no painel com pelo menos 30 dias de antecedência e só valem a partir do ciclo seguinte. Você pode cancelar antes se não concordar.',
        'Se um pagamento for recusado, os recursos pagos podem ser suspensos até a regularização. Seus dados não são apagados por causa da suspensão.',
      ] },
      { id: 'arrependimento', titulo: '5. Direito de arrependimento (CDC, art. 49)', blocos: [
        'Na primeira contratação feita pela internet você pode desistir em até 7 (sete) dias corridos contados do pagamento, sem justificativa, e recebe de volta o valor integral pago, pelo mesmo meio de pagamento (Decreto 7.962/2013, art. 5º).',
        `Para exercer: use "Cancelar assinatura" em Minha assinatura dentro do prazo ou escreva para ${E.emailSuporte}. Confirmamos o recebimento imediatamente e pedimos o estorno ao Mercado Pago; o prazo de crédito depende da operadora do cartão.`,
      ] },
      { id: 'sla', titulo: '6. Nível de serviço (SLA)', blocos: [
        { tabela: { cabecalho: ['Métrica', 'Compromisso'], linhas: [
          ['Disponibilidade mensal do painel', '99% do tempo, medido mês a mês'],
          ['Manutenção programada', 'Avisada no painel com 48 horas de antecedência; não conta como indisponibilidade'],
          ['Primeira resposta do suporte (e-mail)', 'Até 2 dias úteis'],
          ['Incidente que impeça todos os envios', 'Início do atendimento em até 1 dia útil'],
        ] } },
        'Não contam como indisponibilidade: falhas, bloqueios ou mudanças do WhatsApp, Meta, Telegram, lojas e programas de afiliados; falhas da sua internet ou do seu aparelho; suspensão por falta de pagamento ou por violação destes Termos; casos de força maior.',
        'Se a disponibilidade mensal ficar abaixo de 99%, você pode pedir, em até 30 dias, crédito de 10% da mensalidade daquele mês no ciclo seguinte. Esse crédito é a compensação específica pelo descumprimento do SLA, sem prejuízo dos direitos que a lei garante ao consumidor.',
      ] },
      { id: 'pi', titulo: '7. Propriedade intelectual', blocos: [
        'O software, a marca, o visual e os textos do Radar pertencem ao prestador e são protegidos pelas Leis 9.609/1998 e 9.610/1998. Você recebe uma licença pessoal, não exclusiva e intransferível de uso enquanto a assinatura estiver ativa.',
        'O conteúdo que você cria ou envia (textos, imagens, logotipo, configurações) continua seu. Você nos autoriza a armazená-lo e processá-lo somente para prestar o serviço.',
        'É proibido copiar, revender, fazer engenharia reversa ou criar serviço concorrente a partir do Radar.',
      ] },
      { id: 'responsabilidade', titulo: '8. Limitação de responsabilidade', blocos: [
        'Respondemos pelos danos que causarmos na prestação do serviço, nos termos da lei. Não respondemos por: decisões e regras de terceiros (WhatsApp, lojas, programas de afiliados), bloqueio do seu número, comissões não pagas pelas lojas, conteúdo publicado por você, nem por lucros cessantes ou danos indiretos decorrentes desses fatos.',
        'Para clientes pessoa jurídica que contratam para uso na própria atividade empresarial, a responsabilidade total do prestador fica limitada ao valor pago nos 12 meses anteriores ao fato, excluídos danos indiretos e lucros cessantes, salvo dolo ou culpa grave.',
        'Para consumidores pessoa física, nada nestes Termos exclui ou atenua a responsabilidade prevista no CDC (arts. 25 e 51, I).',
      ] },
      { id: 'forca-maior', titulo: '9. Caso fortuito e força maior', blocos: [
        'Nenhuma das partes responde por atrasos ou falhas causados por eventos fora do seu controle razoável, como quedas gerais de energia ou internet, falhas de provedores de nuvem, ataques em larga escala, atos de autoridade ou desastres naturais (Código Civil, art. 393). O prazo das obrigações afetadas fica suspenso enquanto o evento durar.',
      ] },
      { id: 'termino', titulo: '10. Cancelamento e término', blocos: [
        'Você pode cancelar a qualquer momento em Minha assinatura, sem multa. O acesso aos recursos pagos continua até o fim do ciclo já pago; não há reembolso proporcional fora do prazo de arrependimento.',
        'Podemos suspender ou encerrar a conta, após aviso, em caso de falta de pagamento, violação destes Termos ou da Política de Uso Aceitável, ou por ordem de autoridade. Em violação grave (fraude, spam, conteúdo ilícito) a suspensão pode ser imediata.',
        'Após o término, seus dados seguem a Política de Retenção e Descarte. Você pode pedir a exportação dos seus dados antes da exclusão.',
      ] },
      { id: 'alteracoes', titulo: '11. Alterações destes Termos', blocos: [
        'Mudanças relevantes serão avisadas com 15 dias de antecedência pelo painel ou por e-mail. Se você não concordar, pode cancelar sem custo antes da vigência. A versão e a data de cada documento ficam no rodapé.',
      ] },
      { id: 'foro', titulo: '12. Lei aplicável e foro', blocos: [
        'Aplica-se a lei brasileira.',
        `Consumidores pessoa física podem propor ação no foro do próprio domicílio (CDC, art. 101, I). Para clientes pessoa jurídica fica eleito o foro da comarca de ${foro()}.`,
      ] },
    ],
  },

  /* ------------------------------------------------------------- PRIVACIDADE */
  {
    slug: 'privacidade',
    titulo: 'Política de Privacidade',
    resumo: 'Quais dados tratamos, por quê, com qual base legal, com quem compartilhamos, por quanto tempo e como você exerce seus direitos.',
    base: 'Lei 13.709/2018 (LGPD), Lei 12.965/2014 (Marco Civil), Res. CD/ANPD 2/2022 e 19/2024.',
    secoes: [
      { id: 'controlador', titulo: '1. Quem é o controlador', blocos: [
        `O controlador dos dados da sua conta é ${identificacao()}.`,
        `Encarregado pelo tratamento de dados (LGPD, art. 41): ${E.encarregadoNome || 'o próprio responsável pelo Radar'}. Canal exclusivo: ${contato}.`,
        'Para os dados de terceiros que passam pela sua conta (participantes dos seus grupos, mensagens dos grupos de origem), você é o controlador e nós atuamos como operador, seguindo suas instruções (ver Aditivo de Tratamento de Dados).',
      ] },
      { id: 'dados', titulo: '2. Dados que tratamos, finalidade e base legal', blocos: [
        { tabela: { cabecalho: ['Dado', 'Para quê', 'Base legal (LGPD)'], linhas: [
          ['Nome, e-mail e senha (guardada só como hash)', 'Criar e manter sua conta, login e comunicação sobre o serviço', 'Execução de contrato (art. 7º, V)'],
          ['Registro do aceite dos termos (data, hora, versão)', 'Provar a contratação e o aceite', 'Exercício regular de direitos (art. 7º, VI)'],
          ['Registros de acesso (IP, data e hora, navegador)', 'Segurança e guarda obrigatória por 6 meses', 'Obrigação legal (art. 7º, II; Marco Civil, art. 15)'],
          ['Número e nome do WhatsApp conectado, lista e nomes dos grupos', 'Monitorar a origem e publicar nos destinos que você escolhe', 'Execução de contrato (art. 7º, V)'],
          ['Mensagens recebidas nos grupos de origem', 'Extrair ofertas, converter links e montar sua publicação', 'Execução de contrato (art. 7º, V); você é o controlador desses dados'],
          ['IDs e chaves de programas de afiliados', 'Gerar seus links de afiliado e ler suas vendas', 'Execução de contrato (art. 7º, V)'],
          ['Cliques nos links /r/ (data, hora, origem, navegador; sem IP)', 'Mostrar estatísticas de desempenho', 'Legítimo interesse (art. 7º, IX), com dados mínimos'],
          ['Dados de pagamento (plano, valor, status, identificadores do Mercado Pago)', 'Cobrar, emitir comprovantes, cumprir obrigações fiscais', 'Execução de contrato e obrigação legal (art. 7º, II e V)'],
          ['Pedidos ao Encarregado e escolhas de cookies', 'Atender direitos do titular e comprovar o atendimento', 'Obrigação legal e exercício regular de direitos (art. 7º, II e VI)'],
        ] } },
        'Não coletamos dados pessoais sensíveis (art. 5º, II), não fazemos perfilamento para decisões automatizadas sobre você e não vendemos dados.',
        'Os números completos de cartão ficam somente com o Mercado Pago. Nós não recebemos nem guardamos esses dados.',
      ] },
      { id: 'compartilhamento', titulo: '3. Com quem compartilhamos', blocos: [
        'Compartilhamos apenas o necessário com os operadores abaixo, contratados com cláusulas de proteção de dados. Alguns ficam fora do Brasil; nesses casos a transferência segue o art. 33 da LGPD e as cláusulas-padrão da Res. CD/ANPD 19/2024.',
        { tabela: { cabecalho: ['Operador', 'Função', 'Local', 'Garantia da transferência'], linhas: SUBOPERADORES } },
        'Também enviamos dados aos serviços que você mesmo conecta (WhatsApp, Telegram, Instagram, lojas e programas de afiliados) quando você manda publicar ou consultar. Esses serviços têm políticas próprias.',
        'Podemos fornecer dados a autoridades mediante ordem judicial ou requisição legal (Marco Civil, art. 10, §1º).',
      ] },
      { id: 'retencao', titulo: '4. Por quanto tempo guardamos', blocos: [
        'Os prazos por tipo de dado estão na Política de Retenção e Descarte. Em resumo: dados da conta enquanto ela existir, registros de acesso por 6 meses, dados de pagamento por 5 anos (obrigação fiscal), e eliminação ou anonimização após o encerramento, salvo as exceções do art. 16 da LGPD.',
      ] },
      { id: 'direitos', titulo: '5. Seus direitos e como exercê-los', blocos: [
        'Você pode pedir a qualquer momento (LGPD, art. 18): confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; eliminação dos dados tratados com consentimento; informação sobre compartilhamentos; revogação do consentimento; e revisão de decisões automatizadas.',
        `Como pedir: na página Central de Privacidade (/legal) ou pelo e-mail ${contato}. Cada pedido recebe um número de protocolo. Respondemos de forma simplificada imediatamente e com a declaração completa em até 15 dias (art. 19, II).`,
        'Podemos pedir uma confirmação de identidade para proteger sua conta. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (www.gov.br/anpd).',
      ] },
      { id: 'seguranca', titulo: '6. Segurança', blocos: [
        'Adotamos as medidas descritas na Política de Segurança (LGPD, art. 46). Em caso de incidente com risco relevante, comunicamos a ANPD e os titulares afetados no prazo do Regulamento de Comunicação de Incidente (Res. CD/ANPD 15/2024).',
      ] },
      { id: 'criancas', titulo: '7. Crianças e adolescentes', blocos: [
        'O serviço não é destinado a menores de 18 anos e não tratamos intencionalmente dados de crianças ou adolescentes.',
      ] },
      { id: 'mudancas', titulo: '8. Mudanças nesta política', blocos: [
        'Avisaremos mudanças relevantes pelo painel ou por e-mail. A data da versão em vigor fica no rodapé desta página.',
      ] },
    ],
  },

  /* ------------------------------------------------------------------ COOKIES */
  {
    slug: 'cookies',
    titulo: 'Política de Cookies',
    resumo: 'Quais cookies e armazenamentos usamos, quais são essenciais e como você escolhe os opcionais.',
    base: 'LGPD (arts. 7º e 8º) e Guia Orientativo de Cookies da ANPD.',
    secoes: [
      { id: 'o-que', titulo: '1. O que são', blocos: [
        'Cookies e o armazenamento local do navegador são pequenos arquivos guardados no seu aparelho. Usamos o mínimo necessário para o painel funcionar.',
      ] },
      { id: 'lista', titulo: '2. O que usamos hoje', blocos: [
        { tabela: { cabecalho: ['Nome', 'Tipo', 'Finalidade', 'Duração'], linhas: [
          ['radar_session', 'Essencial (cookie)', 'Manter você conectado com segurança', 'Até 7 dias ou até sair'],
          ['sb-* (Supabase)', 'Essencial (cookie)', 'Autenticação da conta', 'Duração da sessão'],
          ['radar-consentimento-v1', 'Essencial (armazenamento local)', 'Lembrar sua escolha sobre cookies opcionais', '12 meses'],
          ['radar_draft_*, radar_custom_templates, radar-conta-*', 'Funcional (armazenamento local)', 'Rascunhos, modelos e o avatar que você monta; ficam só no seu aparelho e não são enviados para nós', 'Até você apagar'],
        ] } },
        'Não usamos cookies de publicidade, de redes sociais nem de análise de terceiros. Se um dia passarmos a usar, eles só serão ativados depois do seu aceite.',
      ] },
      { id: 'escolha', titulo: '3. Como você escolhe', blocos: [
        'Cookies essenciais não dependem de consentimento porque sem eles o serviço não funciona. Para os opcionais, mostramos um aviso com os botões "Aceitar" e "Recusar" no mesmo destaque. Recusar é tão fácil quanto aceitar e não limita o uso do painel.',
        'Você pode mudar a escolha a qualquer momento no link "Preferências de cookies" no rodapé. Registramos a escolha (data, hora, versão e opção) para comprovar o consentimento.',
        'Também é possível apagar cookies nas configurações do navegador; isso desconecta você do painel.',
      ] },
    ],
  },

  /* ---------------------------------------------------------------- SEGURANÇA */
  {
    slug: 'seguranca',
    titulo: 'Política de Segurança da Informação',
    resumo: 'As medidas técnicas e administrativas que protegem os dados e como agimos em incidentes.',
    base: 'LGPD (arts. 46 a 49), Res. CD/ANPD 15/2024 (comunicação de incidentes) e Res. CD/ANPD 2/2022.',
    secoes: [
      { id: 'tecnicas', titulo: '1. Medidas técnicas', blocos: [
        { lista: [
          'Criptografia em trânsito: todo acesso ao site e às APIs usa HTTPS (TLS).',
          'Criptografia em repouso: banco de dados e arquivos ficam em provedores com discos criptografados; chaves de integração guardadas pelo Radar são cifradas com AES-256-GCM e chave própria do servidor.',
          'Senhas nunca são guardadas em texto: o provedor de autenticação armazena apenas o hash.',
          'Isolamento por conta: cada cliente só acessa os próprios dados, com regras de acesso por linha no banco (Row Level Security).',
          'Segredos de produção (chaves de API, tokens) ficam em variáveis de ambiente protegidas, fora do código.',
          'Registros de acesso e trilha de auditoria de ações sensíveis (login, cancelamento, pedidos de titular), guardados por 6 meses.',
          'Avisos automáticos ao responsável quando uma integração de loja ou o WhatsApp se desconecta.',
        ] },
      ] },
      { id: 'acesso', titulo: '2. Controle de acesso', blocos: [
        { lista: [
          'Perfis por função (RBAC): titular da conta e administrador da plataforma, cada um com permissões próprias; o titular só enxerga os dados da própria conta.',
          'Menor privilégio: chaves de serviço com acesso amplo só existem no servidor e nunca no navegador.',
          'Autenticação em dois fatores (MFA) obrigatória nas contas administrativas dos provedores (hospedagem, banco, repositório de código e pagamentos).',
          'Revisão trimestral de quem tem acesso administrativo e revogação imediata quando alguém deixa de precisar.',
        ] },
      ] },
      { id: 'incidentes', titulo: '3. Gestão de incidentes', blocos: [
        'Seguimos um plano de resposta com classificação de severidade, contenção, investigação e registro de cada incidente.',
        'Quando um incidente puder causar risco ou dano relevante aos titulares, comunicamos a ANPD e os titulares afetados em até 3 dias úteis contados do conhecimento do incidente (Res. CD/ANPD 15/2024, art. 6º), informando a natureza dos dados, os titulares envolvidos, as medidas adotadas e os riscos.',
        'Mantemos registro de todos os incidentes, inclusive dos que não exigem comunicação, por no mínimo 5 anos.',
      ] },
      { id: 'reportar', titulo: '4. Como reportar uma vulnerabilidade', blocos: [
        `Encontrou uma falha? Escreva para ${contato} com o assunto "Segurança". Não acesse dados de outras pessoas nem degrade o serviço durante o teste. Responderemos em até 2 dias úteis.`,
      ] },
    ],
  },

  /* ---------------------------------------------------------------- RETENÇÃO */
  {
    slug: 'retencao',
    titulo: 'Política de Retenção e Descarte',
    resumo: 'Por quanto tempo cada tipo de dado fica guardado e o que acontece depois do cancelamento.',
    base: 'LGPD (arts. 15 e 16), Marco Civil (art. 15), Código Tributário Nacional (art. 173), CDC (art. 27).',
    secoes: [
      { id: 'prazos', titulo: '1. Prazos por tipo de dado', blocos: [
        { tabela: { cabecalho: ['Dado', 'Prazo', 'Depois do prazo', 'Fundamento'], linhas: [
          ['Conta (nome, e-mail, configurações, conexões, regras, ofertas, cliques)', 'Enquanto a conta existir; após o encerramento, 30 dias para reativação', 'Eliminação ou anonimização', 'LGPD, art. 15 e 16'],
          ['Chaves de integração e sessão do WhatsApp', 'Até a desconexão ou o encerramento da conta', 'Eliminação imediata', 'LGPD, art. 15'],
          ['Registros de acesso (IP, data e hora)', '6 meses', 'Eliminação automática', 'Marco Civil, art. 15'],
          ['Pagamentos e comprovantes', '5 anos a partir do exercício seguinte', 'Eliminação', 'CTN, art. 173; LGPD, art. 16, I'],
          ['Aceite dos termos, escolhas de cookies e pedidos de titular', '5 anos após o encerramento', 'Eliminação', 'CDC, art. 27; LGPD, art. 7º, VI e 16, I'],
          ['Cópias de segurança (backups)', 'Ciclo de backup do provedor', 'Sobrescritas automaticamente', 'LGPD, art. 46'],
        ] } },
      ] },
      { id: 'cancelamento', titulo: '2. Depois do cancelamento', blocos: [
        'Cancelar a assinatura não apaga sua conta: você continua podendo entrar e assinar de novo. Para encerrar a conta e apagar os dados, faça o pedido na Central de Privacidade (/legal).',
        'Após o pedido de encerramento, desconectamos as integrações imediatamente e eliminamos ou anonimizamos os dados em até 30 dias, mantendo apenas o que a lei manda guardar (tabela acima), com acesso restrito.',
      ] },
      { id: 'excecoes', titulo: '3. Exceções legais', blocos: [
        'Podemos manter dados além dos prazos para cumprir obrigação legal ou regulatória, para o exercício regular de direitos em processo, ou mediante ordem judicial (LGPD, art. 16).',
      ] },
    ],
  },

  /* ------------------------------------------------------------ USO ACEITÁVEL */
  {
    slug: 'uso-aceitavel',
    titulo: 'Política de Uso Aceitável',
    resumo: 'O que pode e o que não pode ser publicado com o Radar e como denunciar conteúdo.',
    base: 'Marco Civil (arts. 19 e 21), CDC, Lei 9.610/1998 e regras dos canais conectados.',
    secoes: [
      { id: 'permitido', titulo: '1. Uso permitido', blocos: [
        'Divulgar ofertas reais de produtos e serviços lícitos, com seus links de afiliado, nos seus próprios canais e para pessoas que aceitaram participar deles.',
      ] },
      { id: 'proibido', titulo: '2. É proibido', blocos: [
        { lista: [
          'Spam: enviar para pessoas ou grupos que não consentiram, comprar listas ou adicionar pessoas sem autorização.',
          'Propaganda enganosa: preços falsos, descontos inexistentes ou promessas que a loja não cumpre (CDC, art. 37).',
          'Produtos ilegais, falsificados, armas, drogas, medicamentos sem registro, conteúdo sexual explícito, discurso de ódio ou golpes.',
          'Violar direitos autorais ou de marca (por exemplo, usar fotos ou marcas sem autorização).',
          'Copiar conteúdo de grupos aos quais você não tem acesso legítimo ou contra as regras do grupo.',
          'Tentar burlar limites do sistema, acessar contas de terceiros, fazer engenharia reversa ou atacar o serviço.',
        ] },
      ] },
      { id: 'denuncia', titulo: '3. Denúncia e remoção (notificação e takedown)', blocos: [
        `Qualquer pessoa pode denunciar conteúdo publicado em uma página pública do Radar escrevendo para ${contato} com o endereço da página, o conteúdo e o motivo.`,
        'Analisamos em até 2 dias úteis. Conteúdo claramente ilícito é retirado do ar e o cliente responsável é avisado, com direito de resposta. Imagens íntimas divulgadas sem autorização são retiradas após notificação da vítima (Marco Civil, art. 21).',
        'Nos demais casos, respondemos por conteúdo de terceiros somente se descumprirmos ordem judicial específica (Marco Civil, art. 19).',
      ] },
      { id: 'consequencias', titulo: '4. Consequências', blocos: [
        'Violações podem levar a aviso, remoção do conteúdo, suspensão ou encerramento da conta, sem reembolso do período em curso quando a violação for grave, e à comunicação às autoridades quando houver indício de crime.',
      ] },
    ],
  },

  /* --------------------------------------------------------------------- DPA */
  {
    slug: 'aditivo-dados',
    titulo: 'Aditivo de Tratamento de Dados (DPA)',
    resumo: 'As regras para os dados de terceiros que passam pela sua conta, em que você é o controlador e o Radar é o operador.',
    base: 'LGPD (arts. 5º, VI e VII, 37, 39, 42 e 46) e Res. CD/ANPD 19/2024.',
    secoes: [
      { id: 'papeis', titulo: '1. Papéis', blocos: [
        'Este aditivo integra os Termos de Uso. Para os dados pessoais de terceiros que você coloca no Radar (participantes e mensagens dos grupos, contatos que recebem suas publicações), você é o controlador e o Radar é o operador (LGPD, art. 5º, VI e VII).',
      ] },
      { id: 'instrucoes', titulo: '2. Instruções de tratamento', blocos: [
        'Tratamos esses dados somente para executar o que você configura no painel (copiar, converter, publicar, medir) e para cumprir obrigação legal (art. 39). Não usamos esses dados para finalidade própria, publicidade ou treinamento de modelos.',
        'Você garante que tem base legal para tratar esses dados e para nos dar essas instruções.',
      ] },
      { id: 'confidencialidade', titulo: '3. Confidencialidade', blocos: [
        'Quem tem acesso aos dados no Radar fica sujeito a dever de sigilo e só acessa o necessário para dar suporte ou resolver incidentes.',
      ] },
      { id: 'suboperadores', titulo: '4. Suboperadores', blocos: [
        'Você autoriza o uso dos suboperadores listados abaixo. Avisaremos com 15 dias de antecedência a inclusão de um novo suboperador; se você discordar, pode encerrar o contrato sem custo.',
        { tabela: { cabecalho: ['Suboperador', 'Função', 'Local', 'Garantia'], linhas: SUBOPERADORES } },
      ] },
      { id: 'seguranca', titulo: '5. Segurança e incidentes', blocos: [
        'Aplicamos as medidas da Política de Segurança (art. 46). Avisaremos você sem demora indevida, e em até 2 dias úteis, sobre incidente que afete os dados que você controla, com as informações necessárias para você cumprir suas próprias obrigações perante a ANPD (art. 48).',
      ] },
      { id: 'auditoria', titulo: '6. Cooperação e auditoria', blocos: [
        'Ajudamos você a atender pedidos de titulares e a demonstrar conformidade. Mediante pedido justificado, com 30 dias de aviso e no máximo uma vez por ano, fornecemos as informações razoáveis para auditoria, preservando segredos comerciais e dados de outros clientes.',
      ] },
      { id: 'fim', titulo: '7. Fim do tratamento', blocos: [
        'No encerramento, você pode exportar seus dados. Em seguida eliminamos ou devolvemos os dados em até 30 dias, salvo guarda exigida por lei (art. 16).',
      ] },
      { id: 'responsabilidade', titulo: '8. Responsabilidade', blocos: [
        'Cada parte responde pelos danos que causar em violação à LGPD. O operador responde solidariamente quando descumprir a lei ou as instruções lícitas do controlador (art. 42, §1º, I).',
      ] },
    ],
  },
];

export const DOC = (slug: string) => DOCUMENTOS.find(doc => doc.slug === slug);

/**
 * Dados de identificação do prestador, usados em todos os documentos legais.
 * O Decreto 7.962/2013 (art. 2º) exige nome e CPF/CNPJ e endereço visíveis em quem vende pela internet.
 * Enquanto `responsavelNome` estiver vazio, as páginas mostram um aviso de dados pendentes.
 */
export const EMPRESA = {
  marca: 'Radar de Ofertas',
  /** Nome completo da pessoa física responsável (ou razão social quando houver CNPJ). */
  responsavelNome: 'Michel Henrique Cardoso Callejas Costa (MEI)',
  /** CPF ou CNPJ. Exigido pelo Decreto 7.962/2013 para venda pela internet. */
  documento: '66.337.433/0001-45',
  /** Endereço físico ou eletrônico para contato (Decreto 7.962/2013, art. 2º, II). */
  endereco: 'Rua Coronel José Leopoldino, 213, Centro',
  cidade: 'Divinolândia',
  uf: 'SP',
  emailPrivacidade: 'rd.of00@gmail.com',
  emailSuporte: 'rd.of00@gmail.com',
  site: 'https://radarofertasbr.vercel.app',
  /** O dono atua como Encarregado (LGPD, art. 41). */
  encarregadoNome: 'Michel Henrique Cardoso Callejas Costa',
  versaoDocumentos: '2026-11-17',
  vigenciaDesde: '17 de novembro de 2026',
} as const;

export const dadosPendentes = (): boolean => !EMPRESA.responsavelNome || !EMPRESA.cidade || !EMPRESA.uf;

export const identificacao = (): string =>
  EMPRESA.responsavelNome
    ? `${EMPRESA.responsavelNome}${EMPRESA.documento ? `, inscrito(a) no CNPJ sob o nº ${EMPRESA.documento}` : ''}${EMPRESA.cidade ? `, com sede em ${EMPRESA.endereco ? `${EMPRESA.endereco}, ` : ''}${EMPRESA.cidade}/${EMPRESA.uf}` : ''}`
    : 'quem administra o Radar de Ofertas (identificação completa em atualização)';

export const foro = (): string => (EMPRESA.cidade ? `${EMPRESA.cidade}/${EMPRESA.uf}` : 'domicílio do prestador');

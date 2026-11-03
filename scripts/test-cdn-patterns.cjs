const { getHighResCandidateUrls } = require('../src/lib/server/product-image-optimizer.ts');
// Como product-image-optimizer é TypeScript, vamos criar um script de teste em cjs para validar os patterns
const tests = [
  {
    store: 'Mercado Livre (-V.webp miniatura)',
    input: 'https://http2.mlstatic.com/D_NQ_NP_676510-MLB70498132049_072023-V.webp',
    expectedCandidates: [
      'https://http2.mlstatic.com/D_NQ_NP_2X_676510-MLB70498132049_072023-F.jpg',
      'https://http2.mlstatic.com/D_NQ_NP_2X_676510-MLB70498132049_072023-O.jpg',
      'https://http2.mlstatic.com/D_NQ_NP_676510-MLB70498132049_072023-F.jpg',
      'https://http2.mlstatic.com/D_NQ_NP_676510-MLB70498132049_072023-O.jpg',
    ]
  },
  {
    store: 'Shopee (_tn miniatura)',
    input: 'https://down-br.img.susercontent.com/file/br-11134207-7r98o-xxx_tn',
    expectedClean: 'https://down-br.img.susercontent.com/file/br-11134207-7r98o-xxx'
  },
  {
    store: 'Amazon (._AC_SX679_.jpg)',
    input: 'https://m.media-amazon.com/images/I/71xyz123._AC_SX679_.jpg',
    expectedClean: 'https://m.media-amazon.com/images/I/71xyz123._AC_SL1500_.jpg'
  },
  {
    store: 'Netshoes (/detalhe/)',
    input: 'https://static.netshoes.com.br/produtos/tenis-xyz/06/detalhe/tenis-xyz_detalhe.jpg',
    expectedClean: 'https://static.netshoes.com.br/produtos/tenis-xyz/06/zoom/tenis-xyz_zoom.jpg'
  }
];

console.log('Validação de padrões de e-commerce pronta.');


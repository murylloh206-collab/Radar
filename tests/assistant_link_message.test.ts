import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReply, cleanLabel, extractLinks, isPrivateChat, MAX_LINKS_PER_MESSAGE } from '../src/lib/server/assistant/link-message';

test('acha os links com o nome da linha anterior (formato que o dono mandou)', () => {
  const text = [
    'Oferta: Shampoo TRESemmé Hidratação Profunda, 650ml | Hidratação profunda tamanho grande',
    'https://a.co/d/01V5NMGT',
    'TRESemmé Condicionador Hidratação Profunda Frasco 650Ml | Hidratação profunda tamanho grande',
    'https://a.co/d/0f6Sjxij',
  ].join('\n');
  assert.deepEqual(extractLinks(text), [
    { url: 'https://a.co/d/01V5NMGT', label: 'Shampoo TRESemmé Hidratação Profunda, 650ml' },
    { url: 'https://a.co/d/0f6Sjxij', label: 'TRESemmé Condicionador Hidratação Profunda Frasco 650Ml' },
  ]);
});

test('link sozinho, com pontuação no fim, repetido e na mesma linha do texto', () => {
  assert.deepEqual(extractLinks('https://br.shp.ee/Q86LUGmo'), [{ url: 'https://br.shp.ee/Q86LUGmo', label: null }]);
  assert.deepEqual(extractLinks('olha esse: https://meli.la/1yA4x5o.'), [{ url: 'https://meli.la/1yA4x5o', label: 'olha esse' }]);
  assert.equal(extractLinks('https://a.co/d/x1\nhttps://a.co/d/x1').length, 1);
  assert.deepEqual(extractLinks('oi, tudo bem?'), []);
});

test('no máximo 10 links por mensagem', () => {
  const many = Array.from({ length: 14 }, (_, i) => `https://a.co/d/item${i}`).join('\n');
  assert.equal(extractLinks(many).length, MAX_LINKS_PER_MESSAGE);
});

test('nome limpo: sem "Oferta:", sem asteriscos, curto', () => {
  assert.equal(cleanLabel('*Oferta: Fone JBL Tune 520*'), 'Fone JBL Tune 520');
  assert.equal(cleanLabel('🔥🔥 Air Fryer Mondial'), 'Air Fryer Mondial');
  assert.equal(cleanLabel('ok'), null);
  assert.ok((cleanLabel('x'.repeat(200)) || '').length <= 80);
});

test('resposta lista os links convertidos e avisa os que falharam, sem devolver o link original', () => {
  const reply = buildReply([
    { label: 'Shampoo', url: 'https://a.co/d/1', affiliateUrl: 'https://www.amazon.com.br/dp/B0CF479SWM?tag=radardeofe00a-20' },
    { label: 'Condicionador', url: 'https://a.co/d/2', affiliateUrl: 'https://www.amazon.com.br/dp/B0CF497793?tag=radardeofe00a-20' },
    { label: 'Tênis', url: 'https://loja-desconhecida.com/p/1', error: 'loja não suportada' },
  ]);
  assert.match(reply, /Aqui estão os seus 2 links/);
  assert.match(reply, /\*1\. Shampoo\*\nhttps:\/\/www\.amazon\.com\.br\/dp\/B0CF479SWM\?tag=radardeofe00a-20/);
  assert.match(reply, /Não consegui preparar este link:\n• Tênis: loja não suportada/);
  assert.doesNotMatch(reply, /loja-desconhecida\.com/);
});

test('só responde no privado (nunca grupo, status ou broadcast)', () => {
  assert.ok(isPrivateChat('5511999999999@s.whatsapp.net'));
  assert.ok(isPrivateChat('123456789012345@lid'));
  assert.ok(!isPrivateChat('120363025246125486@g.us'));
  assert.ok(!isPrivateChat('status@broadcast'));
  assert.ok(!isPrivateChat(undefined));
});

import { isAssistantOwner } from '../src/lib/server/assistant/access';
import { ADMIN_UUID } from '../src/lib/server/auth';
import { PLANS_CONFIG } from '../src/lib/plans-config';

test('assistente é exclusivo da conta dona e não aparece em nenhum plano', () => {
  assert.equal(isAssistantOwner(ADMIN_UUID), true);
  assert.equal(isAssistantOwner('11111111-2222-3333-4444-555555555555'), false);
  assert.equal(isAssistantOwner(null), false);
  assert.doesNotMatch(JSON.stringify(PLANS_CONFIG), /assistant|Assistente/i);
});

import { replyWithoutLink } from '../src/lib/server/assistant/link-message';

test('sem link: responde ao que a pessoa disse e pede o link', () => {
  assert.match(replyWithoutLink('tudo bem?'), /^Tudo sim.*link do produto/);
  assert.match(replyWithoutLink('Bom diaaa'), /^Bom dia/);
  assert.match(replyWithoutLink('obrigado!!'), /^De nada/);
  assert.match(replyWithoutLink('Olá'), /^Oi!/);
  assert.match(replyWithoutLink('tem cupom?'), /cupom/);
  assert.match(replyWithoutLink('quero uma air fryer'), /link do produto/);
});

import { ASK_LINK_TEXT, groupInviteText, formatTodayCoupons, formatTodayOffers, HELP_TEXT, MENU_TEXT, parseGroupOffer, parseMenuChoice } from '../src/lib/server/assistant/link-message';

test('menu: números, emojis de número e "menu"', () => {
  assert.equal(parseMenuChoice('1'), 'link');
  assert.equal(parseMenuChoice('2️⃣'), 'ofertas');
  assert.equal(parseMenuChoice('opção 3'), 'cupons');
  assert.equal(parseMenuChoice(' 4. '), 'busca');
  assert.equal(parseMenuChoice('Menu'), 'menu');
  assert.equal(parseMenuChoice('0'), 'menu');
  assert.equal(parseMenuChoice('5️⃣'), 'grupo');
  for (const t of ['grupo', 'Link do grupo?', 'quero entrar no grupo', 'me manda o link do grupo']) assert.equal(parseMenuChoice(t), 'grupo', t);
  assert.equal(parseMenuChoice('vi no grupo uma air fryer'), null);
  assert.equal(parseMenuChoice('6'), null);
  assert.match(MENU_TEXT, /5️⃣ Entrar no grupo/);
  assert.match(groupInviteText('https://chat.whatsapp.com/abc'), /chat\.whatsapp\.com\/abc[\s\S]*opcional/);
  assert.equal(parseMenuChoice('quero 2 air fryers'), null);
  assert.match(MENU_TEXT, /1️⃣[\s\S]*2️⃣[\s\S]*3️⃣[\s\S]*4️⃣/);
  assert.match(MENU_TEXT, /1️⃣ Procurar cupom pro seu produto \(cole o link\)/);
  assert.match(MENU_TEXT, /4️⃣ Buscar um produto nas lojas/);
  assert.doesNotMatch(MENU_TEXT, /Shopee|Transformar/);
  assert.match(ASK_LINK_TEXT, /Cola aqui o link do produto que eu procuro cupom pra ele 🎟️/);
  assert.match(HELP_TEXT, /procuro cupom/);
  assert.match(replyWithoutLink('tem cupom?'), /procuro cupom pra ele/);
});

const GTA = "OFERTA ESPECIAL EM GAMES! 🎮\n\n*Grand Theft Auto VI PlayStation 5*\n\nDe: ~R$ 499,00~\n🔥 *Por R$ 371,00* (26% OFF)\n'🎟️ Cupom: *DIADATECH*'\n\n🛒 *Compre aqui com segurança:*\nhttps://meli.la/1yA4x5o\n\n🎯 *Radar de Ofertas*";

test('lê título, preço, cupom e link da mensagem real do grupo', () => {
  assert.deepEqual(parseGroupOffer(GTA, 'https://meli.la/1yA4x5o'),
    { title: 'Grand Theft Auto VI PlayStation 5', price: '371,00', coupon: 'DIADATECH', link: 'https://meli.la/1yA4x5o' });
  assert.equal(parseGroupOffer('sem nada', null), null);
});

test('ofertas e cupons de hoje: listas curtas, aviso de cupom e mensagem quando não há', () => {
  const gta = parseGroupOffer(GTA, null)!;
  assert.match(formatTodayOffers([gta]), /\*1\. Grand Theft Auto VI PlayStation 5\* — R\$ 371,00\nhttps:\/\/meli\.la\/1yA4x5o/);
  assert.match(formatTodayCoupons([gta]), /Cupom: \*DIADATECH\*[\s\S]*pode esgotar/);
  assert.match(formatTodayOffers([]), /ainda não saiu oferta/);
  assert.match(formatTodayCoupons([{ ...gta, coupon: null }]), /ainda não saiu oferta com cupom/);
});

test('"Cupom: ATIVE" não é código de cupom', () => {
  const msg = "*Kit 2 Regata Alcinha Urban*\n\n🔥 *Por R$ 61,00*\n🎟️ Cupom: *ATIVE*\n\nhttps://meli.la/1k6csqZ";
  assert.equal(parseGroupOffer(msg, null)?.coupon, null);
});

import { mercadoLivreVerificationTarget } from '../src/lib/server/url-resolver';
import { countLinks, shortLinkName } from '../src/lib/server/assistant/link-message';

test('verificação do Mercado Livre: usa o produto escrito em go=, só se for do próprio ML', () => {
  const v = 'https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2Fwww.mercadolivre.com.br%2Fp%2FMLB45892583%3Fmatt_tool%3D38524122&tid=x';
  assert.equal(mercadoLivreVerificationTarget(v), 'https://www.mercadolivre.com.br/p/MLB45892583?matt_tool=38524122');
  assert.equal(mercadoLivreVerificationTarget('https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2Fevil.com%2Fx'), null);
  assert.equal(mercadoLivreVerificationTarget('https://evil.com/gz/account-verification?go=https%3A%2F%2Fwww.mercadolivre.com.br%2Fp%2FMLB1'), null);
  assert.equal(mercadoLivreVerificationTarget('https://www.mercadolivre.com.br/p/MLB1'), null);
});

test('bot: nome curto quando não há nome do produto e contagem para o aviso de limite', () => {
  assert.equal(shortLinkName('https://meli.la/2nXEGmW'), 'meli.la/2nXEGmW');
  const many = Array.from({ length: 18 }, (_, i) => `https://meli.la/x${i}`).join('\n');
  assert.equal(countLinks(many), 18);
  const reply = buildReply([{ label: null, url: 'https://meli.la/2nXEGmW', affiliateUrl: 'https://meli.la/2YaPc2L' }], { extraLinksIgnored: true });
  assert.match(reply, /\*meli\.la\/2nXEGmW\*\nhttps:\/\/meli\.la\/2YaPc2L/);
  assert.match(reply, /Preparei os 10 primeiros/);
});

import { linkCaption, productKey } from '../src/lib/server/assistant/link-message';

test('legenda: link, cupom e preço da oferta real; sem preço quando não há; aviso quando não achou', () => {
  assert.equal(linkCaption('https://meli.la/2HxK54D', 'DESCONTOSMELI', '1.108,00'),
    '🔗 https://meli.la/2HxK54D\n🎟️ Cupom: *DESCONTOSMELI* · R$ 1.108,00 com o cupom\nAplique no carrinho (pode esgotar).');
  assert.equal(linkCaption('https://meli.la/2YaPc2L', 'OFFHOJEML'), '🔗 https://meli.la/2YaPc2L\n🎟️ Cupom: *OFFHOJEML*\nAplique no carrinho (pode esgotar).');
  assert.equal(linkCaption('https://meli.la/2YaPc2L', null, '10,00'),
    '🔗 https://meli.la/2YaPc2L\n🎟️ Não achei cupom pra este produto agora. Digite *3* pra ver os cupons de hoje.');
});

test('código do produto para achar a mesma oferta nos grupos', () => {
  assert.equal(productKey('https://www.mercadolivre.com.br/p/MLB45892583'), 'MLB45892583');
  assert.equal(productKey('https://www.mercadolivre.com.br/x/up/MLBU3944258888'), 'MLBU3944258888');
  assert.equal(productKey('https://produto.mercadolivre.com.br/MLB-4043765471-tenis'), 'MLB4043765471');
  assert.equal(productKey('https://shopee.com.br/product/1633043208/22694547254'), '22694547254');
  assert.equal(productKey('https://shopee.com.br/Fone-i.447393034.18899613340'), '18899613340');
  assert.equal(productKey('https://www.amazon.com.br/dp/B0CF479SWM?tag=x'), 'B0CF479SWM');
  assert.equal(productKey('https://www.netshoes.com.br/p/tenis-adidas-barreda-masculino-FBA-7432-855'), 'FBA-7432-855');
  assert.equal(productKey('https://exemplo.com'), null);
});

import { matchGroupOffer, offersFromRows, sameTitle, titleFromUrl, type GroupRow } from '../src/lib/server/assistant/group-match';

// Linhas como estão no banco (24/11): o endereço com MLB vem do payload e o link recebido era de outro afiliado.
const A17_URL = 'https://www.mercadolivre.com.br/smartphone-samsung-galaxy-a17-5g-a17-256gb-cinza-cinza/p/MLB54961626';
const row = (title: string, price: string, coupon: string | null, over: Partial<GroupRow> = {}): GroupRow => ({
  messageText: `OPORTUNIDADE! 📲\n\n*${title}*\n\n🔥 *Por R$ ${price}*\n${coupon ? `'🎟️ Cupom: *${coupon}*'\n` : ''}\n🛒 *Compre aqui com segurança:*\nhttps://meli.la/2HxK54D`,
  affiliateUrl: 'https://meli.la/2HxK54D', cleanUrl: A17_URL, originalUrl: 'https://meli.la/1MrSNLg', mediaUrl: 'https://cdn/a17.jpg',
  inboxId: 'i1', store: 'mercadolivre', title, verified: true, ...over,
});
const A17 = row('Samsung Galaxy A17 5G 256GB', '1.108,00', 'DESCONTOSMELI');
const WHEY = row('Whey Protein Concentrado 900g Dux Nutrition', '182,00', 'BEMESTAR', { affiliateUrl: 'https://meli.la/2RG6c9Y', inboxId: 'i2',
  cleanUrl: 'https://www.mercadolivre.com.br/whey-protein-concentrado-900g-dux-nutrition-sabor-sem-sabor/p/MLB53799992' });

test('cupom achado pelo mesmo link de afiliado', () => {
  const m = matchGroupOffer([WHEY, A17], { affiliateUrl: 'https://meli.la/2HxK54D' });
  assert.deepEqual([m?.by, m?.coupon, m?.price], ['link', 'DESCONTOSMELI', '1.108,00']);
  assert.equal(matchGroupOffer([WHEY, A17], { affiliateUrl: 'https://meli.la/NOVO', sourceUrl: 'https://meli.la/2RG6c9Y/?x=1' })?.coupon, 'BEMESTAR');
});

test('cupom achado pelo MLB: no endereço do produto, no link recebido e no wid do anúncio', () => {
  assert.equal(matchGroupOffer([WHEY, A17], { affiliateUrl: 'https://meli.la/OUTRO', cleanUrl: 'https://www.mercadolivre.com.br/p/MLB54961626' })?.coupon, 'DESCONTOSMELI');
  assert.equal(matchGroupOffer([{ ...A17, cleanUrl: null, originalUrl: A17_URL }], { cleanUrl: A17_URL })?.by, 'produto');
  const item = { ...A17, cleanUrl: 'https://produto.mercadolivre.com.br/MLB-4043765471-galaxy-_JM' };
  assert.equal(matchGroupOffer([item], { sourceUrl: 'https://www.mercadolivre.com.br/x/p/MLB111111111#wid=MLB4043765471&sid=x' })?.by, 'produto');
  // começo igual não é o mesmo produto
  assert.equal(matchGroupOffer([A17], { cleanUrl: 'https://www.mercadolivre.com.br/p/MLB549616' }), null);
});

test('título é o último recurso: mesmo produto, mesma loja, sem o preço do outro anúncio', () => {
  const other = 'https://www.mercadolivre.com.br/smartphone-samsung-galaxy-a17-256gb-5g-preto/p/MLB99999999';
  const m = matchGroupOffer([A17], { cleanUrl: other, store: 'mercadolivre' });
  assert.deepEqual([m?.by, m?.coupon, m?.price, m?.mediaUrl], ['titulo', 'DESCONTOSMELI', null, null]);
  assert.equal(matchGroupOffer([A17], { cleanUrl: other, store: 'amazon' }), null);
  assert.equal(sameTitle('Samsung Galaxy A17 5G 256GB', 'smartphone samsung galaxy a17 5g 128gb'), false);
  assert.equal(sameTitle('iPhone 16 Apple 128GB', 'apple iphone 16 pro 128gb'), false);
  assert.equal(titleFromUrl('https://www.mercadolivre.com.br/p/MLB54961626'), null);
});

test('link e lista "cupons de hoje" concordam para todas as ofertas', () => {
  const rows = [WHEY, A17, { ...A17, inboxId: 'i0', messageText: A17.messageText.replace('DESCONTOSMELI', 'ANTIGO') }];
  for (const offer of offersFromRows(rows).filter(o => o.coupon)) {
    const m = matchGroupOffer(rows, { affiliateUrl: offer.link });
    assert.deepEqual([m?.coupon, m?.price], [offer.coupon, offer.price]);
  }
});

import { acceptConversion, groupHits, handleAssistantEntry } from '../src/lib/server/assistant/runtime';

test('link do próprio afiliado é aceito; link não confirmado continua recusado', () => {
  const own = 'https://meli.la/2HxK54D';
  assert.equal(acceptConversion({ store: 'mercadolivre', affiliateUrl: own, isAutoDispatchAllowed: true, cleanUrl: A17_URL }, own).affiliateUrl, own);
  assert.match(acceptConversion({ store: 'amazon', affiliateUrl: 'https://x', isAutoDispatchAllowed: false }, 'https://x').error || '', /confirmar/);
  assert.match(acceptConversion({ store: null }, 'https://x').error || '', /não suportada/);
  assert.equal(typeof handleAssistantEntry, 'function');
});

import { formatSearch, isAccessory, isRelevant, pickHits, searchAttempts, searchProducts, trustedHits, withoutOutliers, type SearchHit } from '../src/lib/server/assistant/product-search';

const hit = (title: string, price: number, over: Partial<SearchHit> = {}): SearchHit =>
  ({ title, price, rating: 4.9, sold: 500, link: `https://l/${encodeURIComponent(title)}`, store: 'Shopee', ...over });

test('acessórios ficam de fora, a não ser que a pessoa peça (títulos reais da Shopee)', () => {
  const out: Array<[string, string]> = [
    ['Forma de Silicone Quadrada para Airfryer 19cm Fritadeira Elétrica 4~6 Litros', 'air fryer 4 litros'],
    ['Capa Capinha Anti Impacto Para Galaxy A17 + Película 3D Vidro Temperado', 'galaxy a17'],
    ['Galaxy A17 Capa Anti Impacto', 'galaxy a17'],
    ['Extensão Grossa 20A Cabo PP 2X4mm | Air Fryer, Aquecedor, Forno', 'air fryer'],
    ['Ejetor tênis nike', 'tenis nike'],
    ['Pururuca Listrada OU LISA Pellet para Fritar | Óleo, Air Fryer e Microondas', 'air fryer'],
    ['Desengordurante Spray Potente Multiuso Cozinha Fogão e Air Fryer 300ml', 'air fryer'],
    ['Para Samsung Galaxy A57 A37 A17 A07 A56', 'galaxy a17'],
    ['Luxo Macaron Cor Magnética Caso Para Samsung Galaxy A17 A37 A57', 'galaxy a17'],
  ];
  for (const [title, query] of out) assert.equal(isRelevant(title, query), false, title);
  assert.equal(isRelevant('Fritadeira Air Fryer Britânia BFR36A 4,2 Litros Preto 1500W', 'air fryer 4 litros'), true);
  assert.equal(isRelevant('Smartphone Samsung Galaxy A17 5G 128GB com capa e película', 'galaxy a17'), true);
  assert.equal(isRelevant('Capinha Galaxy A17 Aveludada', 'capinha galaxy a17'), true);
  assert.equal(isAccessory('Forma de Silicone para Airfryer', 'forma de silicone airfryer'), false);
  assert.equal(isRelevant('Fritadeira Air Fryer Family Oven Elgin 12 Litros', 'air fryer 4 litros'), false);
  assert.equal(isRelevant('Panela de Pressão Elétrica 4 Litros', 'air fryer 4 litros'), false);
  assert.equal(isRelevant('Galaxy A17 128GB', 'galaxy a17 256gb'), false);
  assert.equal(isRelevant('Smart TV Hisense 40" FHD', 'smart tv 50 polegadas'), false);
  assert.equal(isRelevant('Smart TV LG 50” 4K', 'smart tv 50 polegadas'), true);
});

test('qualidade: descarta nota ou venda baixa informada, mas não a que a loja não informa; ordem por preço', () => {
  const hits = trustedHits([
    hit('A', 300), hit('B poucas vendas', 90, { sold: 20 }), hit('C', 250, { rating: 4.6, sold: 150 }),
    hit('D nota baixa', 100, { rating: 4.1 }), hit('E do grupo', 270, { rating: null, sold: null, store: 'Mercado Livre' }),
  ]);
  assert.deepEqual(hits.map(h => h.title), ['C', 'E do grupo', 'A']);
});

test('preço muito abaixo do resto não entra (amostra, peça)', () => {
  assert.deepEqual(withoutOutliers([hit('dose', 13), hit('a', 90), hit('b', 110), hit('c', 120)]).map(h => h.title), ['a', 'b', 'c']);
  assert.equal(withoutOutliers([hit('a', 10), hit('b', 100)]).length, 2);
});

test('texto da busca mostra a loja e não inventa nota nem vendas', () => {
  const items = pickHits([hit('Air Fryer X', 219.9, { store: 'Mercado Livre', rating: null, sold: null, coupon: 'CASA10' }), hit('Air Fryer Y', 250, { rating: 4.6, sold: 150 })]);
  const text = formatSearch('air fryer', { items });
  assert.match(text, /Mercado Livre · R\$ 219,90 com o cupom \*CASA10\*\nhttps/);
  assert.match(text, /Shopee · R\$ 250,00 · ⭐ 4,6 · 150 vendidos/);
  assert.match(formatSearch('xyz', { items: [] }), /Não achei nas lojas/);
});

test('mesmo modelo em lojas diferentes mostra os dois preços; outra loja entra quando houver', () => {
  const twin = pickHits([hit('Air Fryer Wap WAOD4 11l', 420), hit('WAP Airfryer Oven 11 Litros WAOD4', 450, { store: 'Amazon' })]);
  assert.equal(twin.length, 1);
  assert.match(formatSearch('air fryer wap', { items: twin }), /Shopee · R\$ 420,00[\s\S]*Também em: Amazon · R\$ 450,00/);
  const a17 = pickHits([hit('Galaxy A17 4G 128gb, 256gb', 1060), hit('Samsung Galaxy A17 5G 256GB', 1108, { store: 'Mercado Livre' })]);
  assert.equal(a17.length, 2);
  const mixed = pickHits([hit('a', 1), hit('b', 2), hit('c', 3), hit('d', 4, { store: 'Netshoes' })]);
  assert.deepEqual(mixed.map(h => h.store), ['Shopee', 'Shopee', 'Netshoes']);
});

test('se a busca exata não achar, tenta com menos palavras e avisa', async () => {
  assert.deepEqual(searchAttempts('Air Fryer Oven WAP 11 litros'), ['Air Fryer Oven WAP 11 litros', 'air fryer oven wap', 'air fryer wap']);
  const asked: string[] = [];
  const outcome = await searchProducts('Air Fryer Oven WAP 11 litros', async q => { asked.push(q); return { hits: q === 'air fryer wap' ? [hit('Air Fryer Wap Barbecue Flame 10L', 789)] : [] }; });
  assert.equal(asked.length, 3);
  const down = await searchProducts('xyz', async () => ({ hits: [], unavailable: true }));
  assert.match(formatSearch('xyz', down), /instável/);
  assert.match(formatSearch('Air Fryer Oven WAP 11 litros', outcome), /Não achei exatamente[\s\S]*air fryer wap/);
});

test('ofertas do grupo entram na busca só com link verificado, preço real e nome da loja', () => {
  const hits = groupHits([A17, { ...WHEY, verified: false }, { ...A17 }]);
  assert.deepEqual(hits, [{ title: 'Samsung Galaxy A17 5G 256GB', price: 1108, rating: null, sold: null, link: 'https://meli.la/2HxK54D', store: 'Mercado Livre', coupon: 'DESCONTOSMELI' }]);
});

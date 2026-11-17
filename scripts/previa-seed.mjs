// Dados de DEMONSTRAÇÃO da prévia local (.previa/radar_db.json). Nada aqui é real.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const file = path.join(root, '.previa', 'radar_db.json');
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
const U = '00000000-0000-0000-0000-000000000001';
const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const id = () => crypto.randomUUID();

const imgDir = path.join(root, 'public', 'previa');
fs.mkdirSync(imgDir, { recursive: true });
const items = [
  ['Fone Bluetooth Pulse X2 (demo)', 'shopee', 199.9, 129.9, 4.8, 3120, '#2f6f8f', 'Fone'],
  ['Air Fryer 5L Forno Digital (demo)', 'mercadolivre', 599, 379.9, 4.7, 8421, '#8f5a2f', 'Air Fryer'],
  ['Tênis Corrida Stride 3 (demo)', 'netshoes', 409, 227.9, 4.6, 1290, '#3f7f5a', 'Tênis'],
  ['Creatina 300g Pura (demo)', 'amazon', 119.9, 74.9, 4.9, 15230, '#6b4f9a', 'Creatina'],
  ['Smartwatch Fit Band 9 (demo)', 'shopee', 349, 189.9, 4.5, 2210, '#8f2f4f', 'Relógio'],
  ['Kit 3 Camisetas Oversized (demo)', 'mercadolivre', 189.9, 99.9, 4.7, 640, '#4a5560', 'Camisetas'],
  ['Cafeteira Expresso Compacta (demo)', 'amazon', 899, 549, 4.6, 980, '#7a6a2f', 'Cafeteira'],
  ['Mochila Urbana 25L (demo)', 'shopee', 159.9, 89.9, 4.8, 4310, '#2f4f8f', 'Mochila'],
];
db.products = items.map(([title, store, from, price, rating, sales, color, short], i) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#eef1f3"/><circle cx="300" cy="270" r="150" fill="${color}"/><text x="300" y="285" font-family="Arial" font-size="44" font-weight="700" fill="#fff" text-anchor="middle">${short}</text><text x="300" y="520" font-family="Arial" font-size="26" fill="#5b6770" text-anchor="middle">imagem de demonstração</text></svg>`;
  fs.writeFileSync(path.join(imgDir, `produto-${i + 1}.svg`), svg);
  return { id: id(), userId: U, storeName: store, externalId: `DEMO${1000 + i}`, title, originalPrice: from, currentPrice: price,
    discountPct: Math.round((1 - price / from) * 100), rating, reviewsCount: Math.round(sales / 6), salesCount: sales,
    commissionRate: 8 + (i % 4) * 2, estimatedCommission: +(price * (0.08 + (i % 4) * 0.02)).toFixed(2), imageUrl: `/previa/produto-${i + 1}.svg`,
    productUrl: `https://exemplo.com/produto/${i + 1}`, affiliateUrl: `https://exemplo.com/a/${i + 1}`, category: 'Demonstração', inStock: true, lastCheckedAt: iso(30 + i * 7) };
});

const conn = db.connections[0];
Object.assign(conn, { status: 'connected', phoneNumber: '5511900000000', profileName: 'Radar Demo', ownerJid: '5511900000000@s.whatsapp.net', lastPingAt: iso(1) });
Object.assign(db.whatsapp, { status: 'connected', phoneNumber: '5511900000000', profileName: 'Radar Demo' });
const g = (jid, name, n, o, d) => ({ id: `${conn.id}:${jid}`, userId: U, connectionId: conn.id, groupJid: jid, name, participantCount: n,
  isAdmin: d, canPost: d, permissionStatus: d ? 'verified_admin' : 'verified_member', isOrigin: o, isDestination: d, lastSyncedAt: iso(3) });
db.groups = [
  g('120363000000000001@g.us', 'Achados do Dia (origem demo)', 812, true, false),
  g('120363000000000014@g.us', 'Radar de Ofertas #14', 486, false, true),
  g('120363000000000015@g.us', 'Radar de Ofertas #15', 231, false, true),
  g('120363000000000016@g.us', 'Radar de Ofertas #16', 58, false, true),
];
const sourceId = id();
db.sources = [{ id: sourceId, userId: U, connectionId: conn.id, groupJid: db.groups[0].groupJid, name: 'Cópia: Achados do Dia', isActive: true,
  autoApprove: true, minDiscountPct: 10, templateName: 'Oferta essencial', is24Hours: true, startTime: '00:00', endTime: '00:00',
  dispatchOrder: 'sequencial', imageMode: 'cenario_automatico', convertAffiliateLinks: true, isDemo: true, updatedAt: iso(90) }];
db.destinations = db.groups.filter(x => x.isDestination).map(x => ({ id: id(), sourceId, groupJid: x.groupJid, name: x.name, canPost: true, isActive: true }));

const statuses = ['enviado', 'enviado', 'enviado', 'enviado', 'enviado', 'agendado', 'agendado', 'aguardando_aprovacao', 'aguardando_aprovacao', 'falha'];
db.jobs = []; db.incomingMessages = [];
statuses.forEach((status, i) => {
  const p = db.products[i % db.products.length];
  const inbox = id();
  db.incomingMessages.push({ id: inbox, userId: U, connectionId: conn.id, messageId: `DEMO-${i}`, instanceName: conn.instanceName, remoteJid: db.groups[0].groupJid,
    senderName: 'Grupo de origem (demo)', rawText: `${p.title} por R$ ${p.currentPrice}`, extractedUrls: [p.productUrl], extractedStore: p.storeName,
    affiliateUrl: p.affiliateUrl, status: 'processada', originGroupName: db.groups[0].name, receivedAt: iso(40 + i * 55) });
  const targets = status === 'aguardando_aprovacao' ? db.destinations.slice(0, 1) : db.destinations;
  targets.forEach((t, k) => db.jobs.push({ id: id(), userId: U, connectionId: conn.id, originType: 'copiador', sourceId, incomingMessageId: inbox, runtimeInboxId: inbox, productId: p.id,
    targetJid: t.groupJid, targetName: t.name,
    messageText: `🔥 *${p.title}*\n\nDe R$ ${p.originalPrice.toFixed(2).replace('.', ',')} | Por *R$ ${p.currentPrice.toFixed(2).replace('.', ',')}*\n\n👉 ${p.affiliateUrl}`,
    mediaUrl: p.imageUrl, mediaType: 'image', originalUrl: p.productUrl, cleanUrl: p.productUrl, affiliateUrl: p.affiliateUrl, status,
    scheduledFor: status === 'agendado' ? new Date(now + (20 + i * 15 + k) * 60000).toISOString() : iso(38 + i * 55 - k),
    sentAt: status === 'enviado' ? iso(37 + i * 55 - k) : undefined, attempts: status === 'falha' ? 3 : status === 'enviado' ? 1 : 0, maxAttempts: 3,
    errorDetails: status === 'falha' ? 'O link de afiliado não pôde ser confirmado (demonstração).' : undefined, linkVerified: status !== 'falha', isDemo: true,
    socialOffer: { title: p.title, imageUrl: p.imageUrl, currentPrice: p.currentPrice, originalPrice: p.originalPrice, discountPct: p.discountPct, store: p.storeName },
    createdAt: iso(40 + i * 55), updatedAt: iso(37 + i * 55) }));
});
fs.writeFileSync(file, JSON.stringify(db, null, 2));
console.log('demo: produtos', db.products.length, 'grupos', db.groups.length, 'envios', db.jobs.length);

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, pickShowcase } from '../src/lib/group-showcase-pick';

const o = (title: string, priceCurrent: number, over = {}) => ({ title, priceCurrent, imageUrl: 'https://x/a.jpg', store: 'amazon', ...over });

test('maiores valores, sem repetir tipo, sem preço absurdo, sem foto ou loja desconhecida', () => {
  const r = pickShowcase([
    o('Smart TV 50"', 2000), o('Samsung Smart TV 70', 3799), o('iPhone 16e', 2789), o('Geladeira Midea', 3142),
    o('Notebook Erro', 99999), o('Console PS5', 3500, { imageUrl: null }), o('Cadeira', 500, { store: null }), o('Tênis Nike', 296), o('Whey', 100),
  ]);
  assert.deepEqual(r.map(x => x.title), ['Samsung Smart TV 70', 'Geladeira Midea', 'iPhone 16e', 'Tênis Nike']);
  assert.equal(r[0].price, 'R$ 3.799,00');
  assert.equal(r[0].store, 'Amazon');
});

test('menos de 3 ofertas: não mostra a vitrine; título sem códigos HTML', () => {
  assert.deepEqual(pickShowcase([o('TV', 10), o('Fone', 5)]), []);
  assert.equal(cleanTitle('TV 70&quot; A&amp;B'), 'TV 70" A&B');
});

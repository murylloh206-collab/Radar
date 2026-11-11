import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession } from '../src/lib/server/auth';
import { resolveCurrentUserId } from '../src/lib/server/plan-guard';
import { getBrandSettings, saveBrandSettings } from '../src/lib/server/brand-settings';
import { registerTrackedLink, listClickEvents } from '../src/lib/server/click-tracker';
import { getSafeVaultStatus, saveStoreCredentials } from '../src/lib/server/credentials-vault';
import { loadPublicStorefrontConfig, savePublicStorefrontConfig } from '../src/lib/server/public-storefront';

test('Fase 5 (Isolamento Multiusuário): Usuário A não lê nem altera dados do Usuário B', async () => {
  const userA = '11111111-1111-4111-a111-111111111111';
  const userB = '22222222-2222-4222-b222-222222222222';

  // 1. ISOLAMENTO DE COFRE DE CREDENCIAIS (credentials-vault)
  await saveStoreCredentials(userA, {
    storeName: 'shopee',
    appId: 'shopee-app-user-a',
    affiliateTag: 'tag-user-a',
    appSecret: 'secret-a',
  });

  await saveStoreCredentials(userB, {
    storeName: 'shopee',
    appId: 'shopee-app-user-b',
    affiliateTag: 'tag-user-b',
    appSecret: 'secret-b',
  });

  const vaultA = await getSafeVaultStatus(userA);
  const vaultB = await getSafeVaultStatus(userB);

  const shopeeA = vaultA.find((s) => s.storeName === 'shopee');
  const shopeeB = vaultB.find((s) => s.storeName === 'shopee');

  assert.equal(shopeeA?.affiliateTag, 'tag-user-a', 'Usuário A deve ver apenas sua tag');
  assert.equal(shopeeB?.affiliateTag, 'tag-user-b', 'Usuário B deve ver apenas sua tag');
  assert.notEqual(shopeeA?.affiliateTag, shopeeB?.affiliateTag);

  // 2. ISOLAMENTO DE MARCA D\'ÁGUA E IDENTIDADE (brand-settings)
  await saveBrandSettings(userA, {
    watermarkHandle: '@canal.do.usuario.a',
    watermarkPosition: 'top-left',
  });

  await saveBrandSettings(userB, {
    watermarkHandle: '@canal.do.usuario.b',
    watermarkPosition: 'bottom-right',
  });

  const brandA = await getBrandSettings(userA);
  const brandB = await getBrandSettings(userB);

  assert.equal(brandA.watermarkHandle, '@canal.do.usuario.a');
  assert.equal(brandB.watermarkHandle, '@canal.do.usuario.b');
  assert.equal(brandA.watermarkPosition, 'top-left');
  assert.equal(brandB.watermarkPosition, 'bottom-right');

  // 3. ISOLAMENTO DE VITRINE PÚBLICA (public-storefront)
  await savePublicStorefrontConfig(userA, {
    slug: 'slug-user-a',
    title: 'Loja do Afiliado A',
    bio: 'Bio do Afiliado A',
  });

  await savePublicStorefrontConfig(userB, {
    slug: 'slug-user-b',
    title: 'Loja do Afiliado B',
    bio: 'Bio do Afiliado B',
  });

  const storefrontA = await loadPublicStorefrontConfig(userA);
  const storefrontB = await loadPublicStorefrontConfig(userB);

  assert.equal(storefrontA.title, 'Loja do Afiliado A');
  assert.equal(storefrontB.title, 'Loja do Afiliado B');
  assert.notEqual(storefrontA.slug, storefrontB.slug);

  // 4. ISOLAMENTO DE LINKS E EVENTOS DE CLIQUE (click-tracker)
  const linkA = await registerTrackedLink({
    userId: userA,
    destinationUrl: 'https://shopee.com.br/product/123',
    originDefault: 'whatsapp',
  });

  const linkB = await registerTrackedLink({
    userId: userB,
    destinationUrl: 'https://mercadolivre.com.br/MLB-456',
    originDefault: 'telegram',
  });

  const eventsA = await listClickEvents({ userId: userA });
  const eventsB = await listClickEvents({ userId: userB });

  assert.ok(linkA.code);
  assert.ok(linkB.code);
  assert.notEqual(linkA.code, linkB.code);
  assert.equal(linkA.userId, userA);
  assert.equal(linkB.userId, userB);

  // 5. ISOLAMENTO DE REQUISIÇÃO VIA RESOLVE_CURRENT_USER_ID
  const tokenA = signSession({ userId: userA, email: 'a@exemplo.com', role: 'user' });
  const tokenB = signSession({ userId: userB, email: 'b@exemplo.com', role: 'user' });

  const reqA = new Request('http://localhost:3000/api/brand-settings', {
    headers: { cookie: `radar_session=${tokenA}` },
  });
  const reqB = new Request('http://localhost:3000/api/brand-settings', {
    headers: { cookie: `radar_session=${tokenB}` },
  });

  assert.equal(resolveCurrentUserId(reqA), userA);
  assert.equal(resolveCurrentUserId(reqB), userB);
});

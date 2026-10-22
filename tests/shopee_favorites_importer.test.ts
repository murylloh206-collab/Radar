import test from "node:test";
import assert from "node:assert/strict";
import { extractShopeeIds, syncShopeeBookmarksFromSession } from "../src/lib/server/favorites-importer";
import { saveEncryptedSession, loadDecryptedSession, clearSession } from "../src/lib/server/session-vault";

test("Shopee Favoritos: Extração de IDs de URLs em múltiplos formatos", () => {
  // Formato canônico com -i.shopId.itemId
  const r1 = extractShopeeIds("https://shopee.com.br/Fone-Bluetooth-Sem-Fio-TWS-i.314159.265358979");
  assert.equal(r1.shopId, "314159");
  assert.equal(r1.itemId, "265358979");

  // Formato /product/shopId/itemId
  const r2 = extractShopeeIds("https://shopee.com.br/product/998877/11223344");
  assert.equal(r2.shopId, "998877");
  assert.equal(r2.itemId, "11223344");

  // Formato com query params
  const r3 = extractShopeeIds("https://shopee.com.br/item?itemid=554433&shopid=221100");
  assert.equal(r3.shopId, "221100");
  assert.equal(r3.itemId, "554433");

  // URL inválida
  const r4 = extractShopeeIds("https://shopee.com.br/categoria-geral");
  assert.equal(r4.itemId, null);
  assert.equal(r4.shopId, null);
});

test("Shopee Favoritos: Falha amigável quando não há cookies nem links", async () => {
  await clearSession("shopee");
  await assert.rejects(
    async () => {
      await syncShopeeBookmarksFromSession({ customCookie: "", urls: [] });
    },
    {
      message: /Nenhuma sessão ou cookie da Shopee encontrado no cofre/,
    }
  );
});

test("Shopee Favoritos: Cofre criptografado AES-256-GCM para sessão da Shopee", async () => {
  const mockCookie = "SPC_EC=dummy_token_12345; SPC_ST=sec_dummy_6789; SPC_F=fprint_abc;";
  const now = new Date().toISOString();

  await saveEncryptedSession("shopee", {
    rawCookie: mockCookie,
    savedAt: now,
    isValid: true,
  });

  const loaded = await loadDecryptedSession("shopee");
  assert.ok(loaded);
  assert.equal(loaded?.rawCookie, mockCookie);
  assert.equal(loaded?.isValid, true);

  await clearSession("shopee");
});

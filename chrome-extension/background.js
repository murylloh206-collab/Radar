/* ==============================================================================
   RADAR DE OFERTAS — BACKGROUND SERVICE WORKER (MANIFEST V3)
   Envio seguro sem bloqueio de CORS para a Vercel e Localhost
   ============================================================================== */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['mlConnection'], (res) => {
    if (!res.mlConnection) {
      chrome.storage.local.set({
        mlConnection: {
          status: 'desconectado',
          affiliateTag: 'michelhenrique1',
          appId: '77625408',
          daysRemaining: 30,
          installedAt: new Date().toISOString(),
        },
      });
    }
  });
});

// Listener para chamadas de rede sem restrições de CORS
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SYNC_TO_RADAR') {
    (async () => {
      try {
        const { targetUrl, payload } = request;
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true; // async
  }
});

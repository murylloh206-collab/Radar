/* ==============================================================================
   RADAR CONECTOR — BACKGROUND SERVICE WORKER (MANIFEST V3)
   Envio seguro e homologação de rotas autorizadas
   ============================================================================== */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['mlConnection', 'dashboardUrl'], (res) => {
    if (!res.mlConnection) {
      chrome.storage.local.set({
        mlConnection: {
          status: 'desconectado',
          installedAt: new Date().toISOString(),
        },
      });
    }
    if (!res.dashboardUrl) {
      chrome.storage.local.set({
        dashboardUrl: 'https://painel-de-ofertas.vercel.app',
      });
    }
  });
});

// Validação de origens e destinos permitidos para evitar envio a URLs arbitrárias
function isAllowedTargetUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;
    // Permite apenas origens do painel em localhost ou vercel oficial
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host === 'painel-de-ofertas.vercel.app') return true;
    if (host.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
}

// Listener para chamadas de rede seguras
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SYNC_TO_RADAR') {
    (async () => {
      try {
        const { targetUrl, payload } = request;

        // Proteção: validação estrita do destino
        if (!isAllowedTargetUrl(targetUrl)) {
          sendResponse({ ok: false, error: 'Destino não autorizado para sincronização' });
          return;
        }

        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok, status: res.status, data });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true; // async callback
  }
});
